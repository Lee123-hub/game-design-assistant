# 07-script-contract 脚本契约

## 一、目录

- scripts/ 放在 `skills/scene-skill/scripts/*.py` (少数 `.js`)

## script 分两类: backend-facing vs agent-facing

同样在 `scripts/` 下, 契约区别很大, 先判断你要写哪种.

### backend-facing (通过 actions.json script handler 触发)

- 入口: `def main(args) -> dict`
- 契约: args.payload / args.input / args.context; return `{"success": bool, "data": {...}}`
- 沙箱严格: 禁 `requests` / `urllib` / `subprocess` / `openpyxl.Workbook.save` / `os.system`
- 允许: `pandas` / `numpy` / `json` / `re` / `datetime` / `itertools` / `collections`
- 由 backend **预读** input 文件 (dict / str / bytes), script 通过 `args.input[k]` 直接拿对象
  (机制见 `04-pipeline.md` §四 handler.input backend preload); **agent 沙箱模式**下 script
  同样通过 `args.input[k]` 取值但拿到的是路径字符串, 用下文 §二 `load_input` helper
  统一两种模式的语义
- 例子: `run_allocate.py` / `equilibrium.py` / `identify_dimensions.py`
- 全部规则 (docstring 三段 / main block / 边界 / 反例) 见下文 二 ~ 六 节

### agent-facing (agent 沙箱 CLI, 手动跑测试或工具)

- 入口: `if __name__ == '__main__':` block + argparse 或 stdin JSON
- 契约松: agent 沙箱可以调 `subprocess` (跑其他 script) / `urllib` (读项目层数据) / `openpyxl` (写到 `artifacts/`)
- 用途: 调试 / 数据探查 / 生成一次性 xlsx 产物
- 关键: **不在 actions.json 里注册** (backend 不会调), 只 agent chat 里手动跑
- 例子: `query.py` (agent 查 state 用) / `rule_crud.py` (agent 直接改项目层规则)

### 判断树: 我该写哪种?

- action 里被自动触发 (actions.json handler.type=script) → **backend-facing** (严 `main(args)` 契约)
- agent 手动跑, 不出现在 actions.json → **agent-facing** (松 CLI 契约)

`check_script_contract` 目标只校验 backend-facing. **当前实现尚未区分**, 会把 agent-facing 脚本 (如 `query.py` / `rule_crud.py`) 也按严契约报 warn/fail. 应对办法:

- 短期: agent-facing 脚本的 `script:doc_missing_*` / `script:no_main_block` warn/fail 可 **人工判断跳过** (agent 手动核对该 py 不在 actions.json 里)
- 长期: check_script_contract 会加"读 actions.json 抽 script handler.path 集合, 只校验命中的 py"逻辑

## 二、双入口 + args.input 兼容 helper (关键)

一个 py 文件同时支持两种调用:

**入口 1: agent 沙箱 stdin/stdout** (agent 手动调试, 或主对话链路里 agent 需要
自己跑一次同样的算法)
- 读 stdin JSON → 处理 → 写 stdout 单行 JSON → exit 0
- 错误: stderr 写 `[error-code]` 前缀 + exit 非 0
- 由 `if __name__ == '__main__':` block 承接
- **`args.input[k]` 传的是文件路径字符串** (agent 沙箱能直接 open, 无 preload)

**入口 2: backend script handler `main(args)`** (actions.json 里 `handler.type=script` 触发)
- Jupyter kernel 里跑
- backend 调 `main(args)`, args 是 dict `{payload, input, context}`
- return dict `{success: bool, data: {...}}`
- **`args.input[k]` 是 backend 按扩展名 preload 后的对象** (`.json→dict`, `.txt/.md→str`,
  其他→bytes; 见 `04-pipeline.md` §四)

### 两个入口 `args.input` 语义不同, 用 `load_input` helper 统一

在 script 顶部内嵌以下 helper, 对 `args.input[k]` 每次取值都过一遍, 两种模式下拿到
的对象类型都一致 (`.json → dict`, `.txt/.md → str`, 其他 → bytes):

```python
def load_input(v):
    """兼容 backend preload 与 agent 沙箱路径两种模式.

    backend 模式: args.input[k] 已是 dict / str / bytes / None → 原样返回.
    agent 模式:   args.input[k] 是路径字符串, 本函数按扩展名读并 parse,
                  语义与 backend `_fetch_input_by_ext` 完全对齐.

    判定歧义 (backend 的 .txt/.md 返回 str vs agent 的路径 str) 用
    `Path.exists()` 兜底: 存在的路径当路径读, 否则当 str 内容原样返回.
    """
    if not isinstance(v, str) or not v:
        return v
    from pathlib import Path
    p = Path(v)
    if not p.is_file():
        return v  # backend 的 .txt/.md 已解码内容, 或空串 / 无效路径 / 目录名
    raw = p.read_bytes()
    ext = p.suffix.lstrip(".").lower() if p.suffix else ""
    if ext == "json":
        import json as _j
        return _j.loads(raw.decode("utf-8-sig"))
    if ext in ("txt", "md"):
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("gbk", errors="replace")
    return raw  # csv / xlsx / xls / 其他 → bytes
```

用法:

```python
def main(args):
    slot3_bytes = load_input(args["input"].get("slot3"))    # 两种模式都拿到 bytes
    state = load_input(args["input"].get("state"))          # 两种模式都拿到 dict
    ...
```

**约束**: script 作者必须清楚每个 input 是"文件路径"还是"文本内容", 别混用一个 key
既传路径又传字面文本 (helper 会用 `Path.exists()` 判定但语义模糊).

## 三、头 30 行 docstring 三段 (强制)

```python
"""
契约:
  args.payload: { threshold: float }
  args.input: {
    "x_state": <dict from state-mirror/x_state.json>,
    "workbook": <bytes from xlsx file>,
  }
  return: {"success": True, "data": {"result_x": {...}, "diff_summary": [...]}}

原意:
  对应 actions.json: component-x.action-y 的 script handler.
  用户在 X 界面调整 threshold 后, 触发重新计算.

沙箱:
  - Jupyter kernel 内跑 (backend) 或 agent stdin 跑
  - 依赖: pandas / numpy (白名单内)
  - 0 IO / 0 网络 / 0 subprocess
"""
```

三段:
1. **契约段** — I/O JSON schema (输入 payload/input/context, 返 success+data) [check_script_contract.py]
2. **原意段** — 对应 actions.json 里哪个 `componentId.actionType.handler` [check_script_contract.py]
3. **沙箱段** — 副作用声明 (0 IO / 0 网络 / 0 subprocess, 或列白名单依赖 pandas/numpy) [check_script_contract.py]

## script handler timeout

backend 跑 script 有**默认 60s timeout**, 可通过 actions.json 里 `handler.timeout` 秒数覆盖:

| 场景 | 建议 timeout | 例子 |
|---|---|---|
| 简单派生 (仅 dict 转换) | 15 | `derive_last_month_cache` |
| 中等算法 (单 CSV pandas 计算) | 60 (默认) | `identify_dimensions` |
| 复杂算法 (多 CSV + 迭代求解) | 90 | `compute_tier_targets` |
| 长跑算法 (大 xlsx 生成 / 深度迭代) | 180 | `run_allocate` / `equilibrium` |

超过 180 应该**拆分 script** (先派生中间 state → 后续 handler 消费), 而非无限拉长 timeout.

## 四、结尾**必须**有 main block

```python
if __name__ == '__main__':
    import sys, json
    args = json.load(sys.stdin)
    result = main(args)
    print(json.dumps(result, ensure_ascii=False))
```

无 main block → 拦 [check_script_contract.py]

## 五、边界规则 (什么不能进 script)

- **不能** `import requests` / `import pymysql` / `import httpx` → 违反沙箱, 应拆到 backend `call` handler [check_be_algo_leak.py, 未来加]
- **不能** `open(..., 'w')` 写文件 / `os.system()` / `subprocess.run()` → 沙箱禁止
- **可以** import `pandas` / `numpy` / `json` / `re` / `datetime` / `collections` / `itertools` 等纯计算库
- **读文件走 `load_input`** (§二), 不要自己 `open()` — backend 场景下 args.input 是 preload
  的对象没有路径可 open; agent 场景下 helper 会代 read. 强行 `open('/path/xxx.csv')`
  两种场景都不安全

## 六、反例

1. script 里 `import requests` 拉 API → 应拆到 backend call handler
2. script 无 `if __name__ == '__main__':` → 拦
3. docstring 头无 `契约:` / `沙箱:` 关键字 → warn
4. script `open('/tmp/xxx', 'w')` 写日志 → 拦 (沙箱禁止)
5. return `{data: ...}` 缺 `success` 字段 → warn (backend 会当失败)
6. `pd.read_csv(args.input["slot3"])` 直接把 args.input 值当路径塞 pandas →
   backend 场景下 args.input 是 bytes, pandas 抛 `TypeError: Expected file path name`
   (或类似). 正确写法: `pd.read_csv(io.BytesIO(load_input(args.input["slot3"])))`

# 04-pipeline

一个 action 的 handlers 数组顺序执行, 后 handler 可通过 `value_from` 引用前一个 handler 的返回. 本文档定义 pipeline 执行模型 / handler.id 命名 / value_from 语法 / template 插值语法.

## 一、pipeline 定义

- 一个 action 就是一条 pipeline: `{validators?, handlers: [...], userMessage, agentPrompt, allowWhen?}`
- **validators 先跑**, 全部通过才进 handlers, 任一失败直接 422 return, handlers 不执行
- **handlers 顺序执行**, 上一个的返回写进 `results_by_id[handler.id]`, 下一个 handler 通过 `value_from` 引用
- 全部 handler 完毕后, backend resolve `userMessage` + `agentPrompt` 里的 `{results.xxx}` / `{payload.xxx}` / `{context.xxx}` 占位, 拼回 `{userMessage, agentPrompt}` 返给前端

## 二、handler.id 命名

- **只有需要被后续 value_from 引用的 handler 才必须写 id**, 纯副作用 handler (如 write_state 落盘) 可以省
- 建议 snake_case (`s1` / `s2` / `s3` / `agg` / `sync`)
- 同 action 内 **id 唯一** (两个 handler 撞 id 会 warn + 后覆盖前的 results 桶) [check_pipeline_refs.py]

## 三、value_from 语法

- 格式: `"results.<id>.response.<key>"` 或 `"results.<id>.data.<key>"` 或 `"payload.<key>"` / `"context.<key>"`
- 语义: 从 audit context 拿 `handler.id=<id>` 的返回结构, `response` 层是 handler 输出的 raw dict, 支持任意深度 dot-path
- 出现在 `write_state.value_from` / `patch_state.value_from` / script handler 的 `payload.xxx` 模板 `{results.<id>.<path>}` 里

## 四、template 插值语法 (通用)

`handler.target` / `handler.input` / `handler.params` / `handler.value` / `userMessage` / `agentPrompt` 均支持:

- `{context.data_root}` — 活期 `uploads/_draft/{month}` 或 sealed `archive/months/{month}/tasks/{id}`
- `{context.month}` / `{context.month_name}` / `{context.dialogue_id}` / `{context.project_id}`
- `{payload.xxx}` — 组件传的 payload 字段, 支持嵌套 `{payload.form.field1}`
- `{results.<id>.<path>}` — 引用前面 handler 结果, 与 value_from 语义一致

### handler.input 特殊语义 (backend 预读, script 不 open)

`handler.type=script` 时, `input` 字段是**声明** "这个 script 需要预读哪些文件":

```json
{
  "type": "script", "id": "compute",
  "path": "scripts/compute_x.py",
  "input": {
    "state": "{context.data_root}/state-mirror/x_state.json",
    "raw": "{context.data_root}/slots/slot_1.csv",
    "workbook": "{context.data_root}/data_input.xlsx"
  }
}
```

**执行时**:
- backend 按 input 字段值 (路径) 预读文件
- 按扩展名 auto-parse: `.json → dict/list`, `.txt/.md → str` (utf-8 优先 gbk fallback),
  其他 (`.csv/.xlsx/.xls/`任意二进制) → **原样 bytes** (script 自己 `pd.read_csv(io.BytesIO(...))`
  / `pd.read_excel(io.BytesIO(...))`; CSV 不预 parse 因为 encoding/dialect/headers 场景各异)
- 塞进 `args.input`: `args.input["state"]` = 已 parse 的 dict, `args.input["slot3"]` = bytes,
  `args.input["workbook"]` = bytes
- **script 不 open() 文件**, 通过 `args.input` + `load_input` helper 取值
  (helper 见 `07-script-contract.md` §二, 兼容 backend preload 与 agent 沙箱两种模式)

**为什么**: 沙箱禁止 script 网络/文件 IO. backend 预读 = 沙箱内看似能读, 实际由 backend 代劳. 见 references/07-script-contract.md.

### patch_state.key 支持模板变量

patch_state 的 key (dot-path 定位) **也支持 template 插值**, 可以按 payload 动态定位:

```json
{
  "type": "patch_state",
  "target": "{context.data_root}/state-mirror/config.json",
  "key": "overrides.{payload.dimColumn}.{payload.key}",
  "value_from": "payload.newValue"
}
```

例如 payload = `{dimColumn: "region", key: "threshold", newValue: 0.8}`, 会 patch 到 `overrides.region.threshold = 0.8`.

**用法**: agent 想让**同一个 action 支持多字段编辑**时, key 用动态模板 + `value_from: payload.newValue`, 一个 action 覆盖 N 个字段.

## 五、示例 (component-x.action-y, 5 handler pipeline)

```json
{
  "handlers": [
    {"type": "write_state", "target": "{context.data_root}/state-mirror/checkpoint_a.json"},
    {"type": "script", "id": "s1", "path": "scripts/compute_x.py",
     "payload": {"month": "{context.month}"},
     "input": {"slot_1": "{context.data_root}/slots/slot_1.csv"}},
    {"type": "script", "id": "s2", "path": "scripts/compute_y.py",
     "payload": {"selectedItems": "{payload.selectedItems}"},
     "input": {"slot_2": "{context.data_root}/slots/slot_2.csv"}},
    {"type": "write_state", "target": "{context.data_root}/state-mirror/y_state.json",
     "value_from": "results.s2.response"},
    {"type": "write_state", "target": "{context.data_root}/state-mirror/x_cache.json",
     "value_from": "results.s1.response"}
  ],
  "userMessage": "全部数据已就绪, 正在计算...",
  "agentPrompt": "[TRIGGER:DO_SOMETHING to=stage-b]"
}
```

顺序: 落 checkpoint 快照 → 跑 s1 → 跑 s2 → 把 s2.response 落到 y_state → 把 s1.response 落到 x_cache. `write_state` 靠 `value_from` 拿到 script handler 的输出.

### 高级 pattern: read_state → script 整对象转喂

某些 action 需要先拉多个 state, 交给 script 一次消费. read_state 用具名 sources 拉多 mirror JSON, 后续 script.payload 直接引用整个 response. read_state 完整字段规范见 `references/02-actions-shape.md` §三 read_state 段, state-mirror 目录约定见 `references/10-state-mirror.md`.

```json
{
  "handlers": [
    {
      "type": "call", "id": "read_state", "method": "read_state",
      "params": {
        "sources": {
          "config": "{context.data_root}/state-mirror/config.json",
          "allocation": "{context.data_root}/state-mirror/allocation_latest.json",
          "rules": "{context.data_root}/state-mirror/rules.json"
        }
      }
    },
    {
      "type": "script", "id": "equil", "path": "scripts/equilibrium.py",
      "timeout": 180,
      "payload": {
        "stateBefore": "{results.read_state.response}",
        "threshold": "{payload.threshold}"
      },
      "input": {
        "workbook": "{context.data_root}/data.xlsx"
      }
    },
    {"type": "patch_state", "target": "{context.data_root}/state-mirror/allocation_latest.json", "key": "by_station", "value_from": "results.equil.response.by_station"},
    {"type": "patch_state", "target": "{context.data_root}/state-mirror/allocation_latest.json", "key": "summary", "value_from": "results.equil.response.summary"}
  ],
  "userMessage": "均衡完成", "agentPrompt": "[TRIGGER:REFRESH_X]"
}
```

**关键**: script.payload 里 `"{results.read_state.response}"` **不是路径**, 而是完整对象注入; script 内 `args.payload["stateBefore"]` 拿到 dict `{config: {...}, allocation: {...}, rules: {...}}`. 同一个 payload dict 里可以混用 `{results.X.response}` (整对象) + `{payload.threshold}` (前端传来的).

### marker 用例 (write_state 无 value 字段)

写"已确认"标记, 不带 payload, backend 落 `{}` + 服务端 mtime:

```json
{"type": "write_state", "target": "{context.data_root}/state-mirror/checklist_confirmed.json"}
```

命名规范 `<anchor>_confirmed.json` (`<anchor>` = stage-id 或业务对象名), 项目内统一即可. 详见 references/02-actions-shape.md write_state 段 + references/10-state-mirror.md.

**marker vs `value: {}` 清零**: 两种写法磁盘都是空 dict, 但语义不同 (marker = "第一次确认", `value: {}` = "重置到初值"). 详见 references/02-actions-shape.md.

## 六、handlerResults 与 demo.json mock 规则的结构对齐 (rev25)

一个 action 真实跑完 pipeline 后, backend 会把每个 handler 的执行结果按顺序组装成
`response.data.handlerResults` 数组返给前端; 组件 `demo.json` 里同 actionType 的 mock
规则的 `response.data.handlerResults` **必须是同一份结构的"假装执行完"版本**, 这样组件
渲染代码不用区分数据是真实拉来的还是预览态 mock 拦截返回的. 对齐规则:

- **数组长度/顺序对齐 pipeline 里 `handlers[]` 的条数/顺序**: actions.json 该 action 有
  几个 handler, mock 里 `handlerResults` 就该有几项 (纯落盘无返回消费需求的 handler 也可以
  精简, 但**前端会读的 handler 必须有对应项**)
  - 例外: `parallel` handler 在真实 pipeline 里对应一个 gather 后的聚合结果, mock 时按同样
    的聚合形状给一项即可, 不用展开成多项
- **每项结构 `{type, id?, response}`**: `type` / `id` 照抄 actions.json 里对应 handler 的
  声明 (帮助排查是哪个 handler 的产出), `response` 是这个 handler "假装返回"的业务数据
- **`response` 内容按 handler.type 惯例填**, 与真实 handler 返回的形状保持一致:
  - `type: "call"` (如 `read_state`) → 真实返回是 `{method, response: {...}}`, mock 照抄这个壳
  - `type: "script"` → 真实返回是 script `main()` 里 `{"success": true, "data": {...}}` 的
    `data` 部分, mock 直接给这个 `data` 该有的示例值
  - `type: "write_state"` / `type: "upload_file"` / `type: "patch_state"` → 真实返回通常是
    纯落盘确认, 前端一般不消费其 response body, mock 给 `{success: true}` 占位即可
- **`userMessage` / `agentPrompt` 对齐 actions.json 同 action 的同名字段**: 有值时逐字抄,
  这样预览态也能验证 toast 文案 / `[TRIGGER:...]` 触发词联动是否符合预期
- **组件渲染代码只应该消费 `handlerResults` 这一份结构**, 不应该对"是不是 mock 数据"做任何
  分支判断 — 这正是 rev25 架构的核心收益 (预览态和线上态走同一条渲染路径), 详见
  `references/06-component.md` §〇 / §六

完整字段规则 + 反例见 `references/06-component.md` §六.

## 七、规则

- **id 唯一** (同 action 内) [check_pipeline_refs.py]
- **value_from 引用的 id 必须在同 pipeline 前面某个 handler 声明过** [check_pipeline_refs.py]
- **不能引用后面还没跑的 handler** (前向依赖) [check_pipeline_refs.py]
- **parallel 里的 children 也可以有 id**, 引用规则相同 (parallel 整体也可以有一个 id, 拿到的是 gather 后的聚合 dict) [check_pipeline_refs.py]
- **value_from resolve 到 None 时**, write_state / patch_state 会 skip 写入并 warn, 不报错 (保护性行为)

## 八、反例

- `value_from: "results.script1.data"` 但前面无 `id=script1` → 拦 (悬空引用)
- 两个 handler 都 `id: "s1"` → 重复, 拦 (后覆盖前)
- 引用后面还没跑的 handler → 拦 (前向依赖)
- `value_from: "results.script1"` 少 `.response` 层 → warn (拿到的是 wrapper `{type, response}` 不是业务数据)
- 忘写 id 就在下游 `value_from` 引用 → 拦 (未声明)

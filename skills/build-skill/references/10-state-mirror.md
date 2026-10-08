# 10-state-mirror

state-mirror 是 backend 落 project 运行时状态的目录, 通过 write_state / patch_state / read_state 三个 handler 读写. 本文档定义目录位置 / 命名规范 / 拆分维度 / write vs patch 判断 / **对话过程产出数据的落盘路径 (§六)** / 生命周期 / agent 读法.

## 一、定义与位置

state-mirror 存 backend/handler 通过 write_state/patch_state 写入的**运行时数据**, 位于 `{context.data_root}/state-mirror/`:

- **活期** (task active): `uploads/_draft/{month}/state-mirror/`
- **封存** (task sealed): `archive/months/{month}/tasks/{taskId}/state-mirror/`
- **场景预览** (preview mode): `scene-builder/uploads/_draft/{month}/state-mirror/`

**关键区分**: state-mirror 里是**运行时状态**, 不是 skills/scene-skill/** 里的 skill 配置 (那些是 agent 编辑对象, 在 white-list 内 agent 可读写); state-mirror 里的 JSON 由 handler pipeline 触发写入, agent 不能直接 Read (uploads/_draft 不在 SCENE_BUILDER_PATHS).

## 二、命名规范

- **业务对象一 JSON**: `state-mirror/<business_object>.json` (如 `<object_a>_latest.json` / `<object_b>_state.json` / `<object_c>_cache.json` / `<object_d>_snapshot.json` / `rules.json`)
- **确认 marker**: `state-mirror/<anchor>_confirmed.json` (无 value, 空 dict, 靠**文件存在 + mtime** 判定). `<anchor>` = **stage-id** (如 `stage-a_confirmed.json`) 或 **业务对象名** (如 `checklist_confirmed.json` / `coefficients_confirmed.json` — 一个 stage 内多个独立确认动作时用), 二者择一, 项目内统一即可
- **不要**用日期后缀 (backend 单一 state, 覆盖式 write, 历史通过封存目录归档)
- **不要**跨 task 共享 (每 task 独立 state-mirror 目录, 隔离于 taskId)

参考实现里典型的 9 个 state 文件 (业务对象抽象化):

- `<object_a>_latest.json` — 主业务对象最新态
- `<object_b>_state.json` — 维度/切片状态
- `<object_c>_cache.json` — 前期缓存 (跨 task 依赖 last-N 时用)
- `<object_d>_snapshot.json` — 环比/同比等对比快照
- `<object_e>.json` — 权重/参数
- `rules.json` — 规则集 (含 `_version` 字段)
- `<stage-a>_confirmed.json` — 按 stage-id 命名的确认 marker
- `<object_a>_confirmed.json` — 按业务对象命名的确认 marker (如 `checklist_confirmed.json` — 一个 stage 内多个独立确认动作时用)

## 三、拆分维度: 按业务对象, 不按 stage

**推荐**: 每个业务对象一 JSON. 好处:

- **原子性**: 单文件 write, 一个 handler 只改一个对象
- **选择性 read**: read_state 能只拉相关部分, 前端 rehydrate 不用全量
- **版本独立演进**: rules 加字段不动 <object_a>_latest 的结构

**反例**: `stage_data_prep.json` / `stage_confirm.json` — 跨对象混一起, 一个 stage 涉及多种业务对象就得整块 write, 边界糊, 不推荐.

## 四、write_state 复合初值 (seed data)

有的对象**首次创建**需要预置结构 (不能空 dict), 用 write_state.value 内联复合 dict:

```json
{
  "type": "write_state",
  "target": "{context.data_root}/state-mirror/rules.json",
  "value": {
    "_version": "v1",
    "custom_rules": [
      {"id": "R1", "type": "threshold_check", "threshold": 0.8}
    ]
  }
}
```

典型场景: agent 进 review stage 时, seed rules.json 预置 2 条默认规则, 后续用户编辑走 patch_state 改单条 (见 §五 判断树).

## 五、write_state vs patch_state 判断树

| 场景 | 用哪个 |
|---|---|
| 首次 seed 新对象 (含预置字段) | `write_state` + 复合 value |
| 全量覆盖已有对象 (如重跑主流程) | `write_state` + `value_from: results.<id>.response` |
| 只改对象里一个字段 (如改 threshold) | `patch_state` + 静态 key |
| 只改对象里 N 个字段 (如编辑一行) | `patch_state` + 动态 `{payload.xxx}` key (见 04-pipeline §四 template 插值) |
| 打确认 marker (首次记录 "X 已确认") | `write_state` 无 `value` 字段 (空 dict 落盘, 靠 `.exists()+mtime` 判定) |
| 清空对象 (重置到初值) | `write_state` + `value: {}` (**显式**空 dict; 磁盘与 marker 相同但语义不同, 见 02-actions-shape write_state 段) |

value_from 语法 / template 插值 / results 桶引用规则见 04-pipeline §三 §四.

## 六、对话过程产出数据的落盘路径 (rev25 关键: 不能靠 agent "记住"传给下一个组件)

**场景**: 某个 stage 里, 数据不是用户填表单 / 点按钮直接产生的, 而是 agent 在对话中调
LLM 推理 / 跑分析脚本"算出来"的 (如 AI 生成的优化建议、维度识别结果、异常归因结论),
**下一个组件需要消费这份数据**.

**错误做法** ❌: agent 把算出来的内容放进对话上下文或者直接拼进下一个组件的
`compile.py --data` / demo.json 里传递. 这在 rev25 架构下是反模式 — 组件不再接受
外部注入的业务 data (见 `references/06-component.md` §〇), 且"靠对话记忆传递"没有
持久化, 用户刷新页面 / 换 task 就丢失, 也没法通过 `get_init_data` 重新拉到.

**正确做法** ✅: 和用户点按钮触发的数据一样, **agent 算出来的数据也必须落到
`state-mirror/*.json`**, 下一个组件 mount 时统一走 `get_init_data` →
`read_state` 拉取. 具体落盘方式看数据是"谁触发计算"的:

### 方式 A (推荐): 计算本身就是某个 action 的 script handler

如果这份"对话过程数据"的计算逻辑可以沉淀成一个 `scripts/*.py` (backend-facing,
见 `references/07-script-contract.md`), 就把它注册成正常的 script handler pipeline,
`script` 后接一个 `write_state` / `patch_state` (`value_from: results.<id>.response`)
落盘, 整条链路走标准 handler pipeline, **不需要 agent 手动写文件**:

```json
{
  "handlers": [
    {"type": "script", "id": "analyze", "path": "scripts/suggest_optimization.py",
     "payload": {"month": "{context.month}"},
     "input": {"alloc": "{context.data_root}/state-mirror/allocation_latest.json"}},
    {"type": "write_state", "target": "{context.data_root}/state-mirror/suggestions.json",
     "value_from": "results.analyze.response"}
  ],
  "userMessage": "AI 分析完成",
  "agentPrompt": "[TRIGGER:GOTO to=stage-next]"
}
```

这份 action 通常挂在**触发这次分析的那个按钮**上 (如上一个组件的"生成 AI 建议"按钮),
`agentPrompt` 走正常的 `[TRIGGER:...]` 通知 agent 该渲下一个组件了, agent **不需要**
自己解析 / 转存分析结果, 因为 backend 已经落盘, 下一个组件自己 `get_init_data` 会读到.

### 方式 B: 计算依赖 agent 的 LLM 推理能力, script 做不了

如果这份数据必须靠 agent 在对话里做语义推理 (不是纯计算, script 里放不下 LLM 调用),
agent 算完结论后, **让当前渲染的组件提供一个"提交 AI 结论"的 actionType**, 组件把
agent 给的结论当 payload 发起 `callAction`, 走正常 `write_state`/`patch_state` 落盘:

```json
{
  "confirm_ai_suggestion": {
    "handlers": [
      {"type": "write_state", "target": "{context.data_root}/state-mirror/suggestions.json",
       "value_from": "payload.suggestion"}
    ],
    "userMessage": "建议已保存",
    "agentPrompt": "[TRIGGER:GOTO to=stage-next]"
  }
}
```

agent 侧的动作是: 推理出结论 → 引导用户在当前组件里触发这个 action (或组件收到
agent 的对话消息后自动带着结论调 `callAction`) → backend 落盘 → 下一个组件
`get_init_data` 读到. **agent 本身不直接读写 state-mirror 文件** (§九 已强调 agent
不在白名单内看不到 uploads/_draft), 落盘动作必须经过 handler pipeline.

### 反例

- agent 把分析结论塞进 `compile.py --data` 传给下一个组件 → ❌ rev25 架构下组件不接受
  外部注入业务 data, 且这条路径不经过 state-mirror, 刷新即丢失
- agent 自己 `open('state-mirror/xxx.json', 'w')` 写文件 → ❌ 沙箱越权, 也绕过了
  actions.json 声明的契约, `check_no_forbidden_ui` / 沙箱边界规则会拦
- 下一个组件的 template.html 指望从 `window.__COMPONENT_DATA__.props` 或 URL query
  里拿到"上一步 AI 算的结果" → ❌ 违反 §〇 组件自包含拉取原则, 应该改成
  `get_init_data` 里带上这份 state

## 八、生命周期

- **创建时机**: 首次 handler write_state 触发 (agent 不预建目录, backend lazy 创建 dir)
- **read 时机**: 通过 `type: call, method: read_state` handler 拉 (paths / sources 两种模式详见 `references/02-actions-shape.md` §三 read_state 段); 或前端 `SceneFrame.callAction("get_init_data")` 触发一条 read_state pipeline (见 05-flow 的 stage 挂载惯例)
- **清空时机**: `write_state` + `value: {}` 显式清 (如 `clear_slots` action)
- **task 封存**: backend 自动搬 `uploads/_draft/{month}/state-mirror/` → `archive/months/{month}/tasks/{taskId}/state-mirror/`, state 与 slots / artifacts 一起归档
- **preview**: `scene-builder/uploads/_draft/{month}/state-mirror/` 独立于线上活期, agent 预览验证走这条路径, 不污染线上 state

## 九、agent 读 state 的方式

**不推荐**: agent 直接 Read `uploads/_draft/{month}/state-mirror/xxx.json` (运行时数据, 在工作副本根之外) — 这些**不在 white-list 内, agent 看不到**.

**推荐**: agent 通过 skill 层封装 (project 根 CLAUDE.md 提供 state-query 子域, agent 说"读 <object_b>_state" → agent 用 `Bash python3 scripts/query.py --kind <object_b>_state`), 让 backend 代读 → 输出 JSON 给 agent.

**关键区分**:

- `skills/scene-skill/scripts/` = **agent 编辑对象** (在白名单内, agent 可读写, 见 07-script-contract)
- `uploads/_draft/{month}/state-mirror/` = **backend 运行时状态** (agent 看不到, 通过 script/read_state handler 间接读)

诊断"state 里没值 / 数据不对"类症状走 09-diagnosis §四 数据异常树.

## 十、_version 字段建议

对**结构可能演进**的 state (如 rules), 建议在 value 里加 `_version` 字段:

```json
{"_version": "v2", "custom_rules": [...]}
```

read handler 侧可以判 `_version` 决定用 v1 还是 v2 逻辑. 简单业务不需要 (直接改结构 + backend 同步升级即可), 避免过度设计.

## 十一、并发写入

backend script / write_state / patch_state handler **顺序执行** (pipeline 内, 04-pipeline §一), 单 action 无并发. 但**跨 action** 并发 (用户狂点按钮) 目前**无 lock**, 依赖:

- 每 action pipeline 短 (< 30s)
- 用户按钮之间的**自然序列**
- `allowWhen` 拦截 (uploading 时禁点其他 action, 见 02-actions-shape 的 allowWhen 段)

若并发严重 (多用户同 task), 需要 backend 加 lock, **不是 agent/规范职责**, agent 侧只需保证单 pipeline 内 handler 顺序正确.

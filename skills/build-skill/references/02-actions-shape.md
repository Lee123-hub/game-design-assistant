# 02 · actions.json 字段规范

`actions.json` 是 scene-skill 的行为契约: 前端按 `{componentId}.{actionType}` 触发, Lion 取到 config 后按顺序跑 pipeline. 本文档只讲字段形状, pipeline 细节看 `04-pipeline.md`, 触发词看 `03-agent-prompt.md`.

## 一、总体结构

```json
{
  "<componentId>": { "<actionType>": { ...config } },
  "_meta": { "projectId": "...", "template_from": "..." }
}
```

- 顶层 = `componentId → actionType → config` 两层字典 + 一个 `_meta` 段
- `_meta.projectId` 是**来源标记 (clone 时的原 pid)**, 不是当前 pid; 例: 新建 project `<new-pid>` 里 `_meta.projectId = <source-pid>` 表示这份 actions.json 是从 `<source-pid>` clone 过来的
- `_meta.template_from` 记录更早的模板来源 (可能与 projectId 形成 clone 链)
- 每个 action 可加 `_comment` 字段, 只做人读注释, 后端忽略

### 文档级注释: `_comment` / `_note` 字段

action config 里可加 `_comment` (或 `_note`) 字段, 值是字符串或数组, 记录:

- 该 action 前端契约细节 (payload 结构说明)
- 疑难 handler 语义解释
- 历史决策 (为啥要 4 handler pipeline 而不是拆 2 action)

例:

```json
{
  "handlers": [],
  "userMessage": "...",
  "_comment": "前端 payload.editId 必须来自 review-verify.rows[].editId; backend 用它做谓词索引"
}
```

backend 忽略下划线前缀字段 (`_meta` / `_comment` / `_note`), 只有 agent / 开发者读.

## 二、action config 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `handlers` | array | 否 | pipeline, 顺序执行; 可空数组 `[]` 表示纯通知类 action (04-pipeline.md) |
| `userMessage` | string | 否 | 前端 toast 展示 (~79% action 有), 空串等同不弹 |
| `agentPrompt` | string | 否 | `""` 或 `[TRIGGER:NAME k=v ...]` (03-agent-prompt.md, ~24% 有) |
| `allowWhen` | array | 否 | 项目 seal 状态白名单, ⊆ `{sealed, pending, uploading}` (~47% 有) |
| `validators` | array | 否 | 通常空, backend 硬编码 file_headers 等 |
| `_comment` | string | 否 | 人读注释, 后端忽略 |

必填字段: **无**. 允许所有可选字段全省略, 但至少要有 `handlers` / `userMessage` / `agentPrompt` 其中一个 (04-warn 规则).

## 三、handler.type 白名单

| type | 关键字段 | 语义 |
|---|---|---|
| `upload_file` | `target` | 前端 multipart 落到 `target` 模板路径 (支持 `{context.data_root}` / `{payload.slotId}`) |
| `write_state` | `target`, `value` / `value_from` | 全量替换 state-mirror/*.json |
| `patch_state` | `target`, `key`, `value` / `value_from` | 按 dot-path 增量修改 |
| `patch_excel` | `filePath`, `sheetName`, `edits` | 修改 uploads 里已有的 Excel 文件 (通常紧接 `upload_file` 后): `edits` 是 `{row, col, value}` 数组, 或走 append 模式追加行. `filePath` 支持模板变量 |
| `script` | `path`, `id?`, `input?`, `payload?`, `timeout?` | 跑 `scripts/*.py`, stdout 返 `{success, data}`, `id` 用于后续 `value_from: "results.<id>.response"` |
| `call` | `method`, `params?` | 调 backend 注册的方法 (通用 method: `read_state`; 其他 method 因 project 部署契约而异, 按需查 `/budget-chat/api/dev/available-methods`) |
| `parallel` | `children: []`, `failMode?` | 并发跑子 handler; `failMode` = `continue` (默认) / `abort` |

**write_state 特殊用法 — marker (无 value 字段)**:

```json
{"type": "write_state", "target": "{context.data_root}/state-mirror/checklist_confirmed.json"}
```

无 `value` / `value_from` 字段, backend 落 `{}` + 服务端 mtime. **agent/前端**通过检查此文件存在 + mtime 判定 "已确认".

**命名规范**: marker 文件用 `<anchor>_confirmed.json` 后缀, `<anchor>` 是 **stage-id** (如 `stage-a_confirmed.json`) 或 **业务对象名** (如 `checklist_confirmed.json` / `coefficients_confirmed.json` — 一个 stage 内多个独立确认动作时用), 二者择一, 项目内统一即可. 见 references/10-state-mirror.md.

**marker vs `value: {}` 清零**: 两者磁盘产物都是空 dict, 语义不同:

- **marker (无 value)**: "第一次确认 X" 语义. 依赖 `.exists() + mtime` 判定. 首次写 = 触发时机.
- **`value: {}` 清零**: "重置 X 到初值" 语义. 依赖 dict 内容 = `{}` 判定. 用于 `clear_slots` / `reset_config` 等回退动作.

标杆项目里同一 target (如 `checklist_confirmed.json`) 在 `confirm_ready` action 用 marker 写, 在 `clear_slots` action 用 `value: {}` 清零, 是**惯用组合**.

### call handler 常用 method: read_state (pipeline 头拉多 mirror JSON)

`read_state` 是 backend 内置最常用的 `call` method, 有两种用法:

**Mode 1: paths 数组 (简单)**

```json
{
  "type": "call", "method": "read_state",
  "params": {
    "paths": [
      "{context.data_root}/state-mirror/allocation_latest.json",
      "{context.data_root}/state-mirror/config.json"
    ]
  }
}
```

返: `{allocation_latest: {...}, config: {...}}` (dict keyed by 文件名).

**Mode 2: sources 具名 dict (推荐)**

```json
{
  "type": "call", "method": "read_state", "id": "read_state",
  "params": {
    "sources": {
      "alloc": "{context.data_root}/state-mirror/allocation_latest.json",
      "cfg": "{context.data_root}/state-mirror/config.json"
    }
  }
}
```

返: `{alloc: {...}, cfg: {...}}` (dict keyed by alias). **后续 handler 用 `{results.read_state.response.alloc}` 引用** (见 04-pipeline.md `value_from` 语义).

### "pipeline 头拉多 state 供 rehydrate" 定式

用户点组件 UI 时, 前端往往需要**首屏拉多个 state** (allocation + config + rules) 完成 rehydrate. 常见 pipeline:

```json
{
  "handlers": [
    {"type": "call", "id": "read_state", "method": "read_state", "params": {"sources": {"alloc": "...", "cfg": "...", "rules": "..."}}}
  ],
  "userMessage": "",
  "agentPrompt": ""
}
```

**关键**: 这类 action 通常空 `userMessage` / `agentPrompt`, 只用于**前端 fetch 拉数据**, backend 返 `handlerResults` 给前端 map, 无需 agent 续渲. 例子: `<component-x>.get_init_data`.

### get_init_data 惯例 (rev25: 组件自拉数据的标准入口)

**每个组件都应该在 `actions.json` 里注册一个 `get_init_data` action** (或组件专属的等价拉取
actionType), 作为 `template.html` mount 时 `SceneFrame.callAction('get_init_data', {})`
的落地目标. 这是 rev25 架构 (组件 = 自包含 UI 骨架 + 接口自拉数据, 见
`references/06-component.md` §〇) 里组件"有数据可渲染"的**唯一正规入口**, 不再靠
compile.py 把业务 data 静态注入.

- **handlers 通常是 `read_state` 单 handler pipeline** (见上方"pipeline 头拉多 state 供
  rehydrate"惯例), 也可以是 `script` 拉取聚合后的数据, 视组件复杂度而定
- **`userMessage` / `agentPrompt` 通常留空**, 因为这是被动拉取, 不需要 toast 或触发 agent
- 该 action 的响应结构 (`handlerResults`) 决定了同组件目录下 `schema.json` 要校验什么、
  `demo.json` 要 mock 什么, 三者是同一份契约的三个视角 (actions.json = 真实 pipeline
  定义, schema.json = 响应体契约, demo.json = 预览态固定响应), 详见 `references/06-component.md` §六
- `demo.json` 里 `match.actionType == "get_init_data"` 的那条规则**必须给真实、完整、
  不含占位符的示例值**, 因为这是组件在预览 / demo 态下渲染画面的唯一数据来源
  (`check_component_triad.py` 会拦 `handlerResults` 为空的情况)

### 空 handlers action (agent-辐射型)

action 的 `handlers` 可以是空数组, 只用 `userMessage` + `agentPrompt` 触发 agent:

```json
{
  "handlers": [],
  "userMessage": "已收到反馈, 让 AI 帮你分析",
  "agentPrompt": "[TRIGGER:APPLY_SUGGESTIONS]"
}
```

场景: 前端**只需要触发 agent 续渲**, 无需 backend 处理 (如 apply-chat 组件的 "反馈给 AI" 按钮). 前端点按钮 → backend 立即返 handlerResults 空 + userMessage + agentPrompt → 前端 toast + 发 agentPrompt 给 agent chat.

`check_action_shape` 会 warn 全空 action (无 handlers 无 userMessage 无 agentPrompt), 但**有 `agentPrompt` 或 `userMessage`** 就不算空, 合法.

规则:

- `handler.type` 必须在白名单内 `[check_action_shape.py 自动化]`
- `handler.id` 允许被同 pipeline 后续 `value_from` 引用 `[check_pipeline_refs.py 自动化]`
- `handlers` 必须是 array, 不能写成 object `[check_action_shape.py 自动化]`
- `allowWhen` 元素 ⊆ `{sealed, pending, uploading}` `[check_action_shape.py 自动化]`
- `validators.type` 目前只支持 `file_headers` `[check_action_shape.py 自动化]`
- `agentPrompt` 只能是空串或 `[TRIGGER:...]` 单行, 不许自由文本混排 `[check_agent_prompt.py 自动化]`

## 四、反例

```jsonc
// 1. type 不在白名单 → 拦
{ "handlers": [{ "type": "callback", "url": "/x" }] }

// 2. allowWhen 值越界 → 拦
{ "handlers": [], "allowWhen": ["editing"] }

// 3. handlers 写成对象 → 拦
{ "handlers": { "type": "call", "method": "read_state" } }

// 4. 全空 action → warn (无 handlers / userMessage / agentPrompt, 不产生任何效果)
{ }
```

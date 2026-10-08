# 05-flow

flow.json 描述场景的 stage 骨架 / stage 间跳转规则 / 文件-stage 关联. 由 backend 读, 前端 StageBar / artifacts 面板消费.

## 一、结构总览

顶层 5 段:

- `version`: int (schema 版本)
- `project_id`: str (可选, debug 用, 与 backend 侧 project 对齐)
- `stages`: 数组, 定义线性阶段 (每项 `{id, label, idx, componentIds}`)
- `transition`: `{kind: "trigger", actionTypeMap: {actionType: stageId}}` — 定义 actionType → stage 跳转
- `componentMeta`: `{cid: {label, dashboard?}}` (可选, 前端展示用中文名 + 看板 pin 标记)
- `fileMeta`: `{path: {label, role, stages, downloadable?}}` (可选, artifacts 面板筛选)

## 二、stages 规则

- 每个 stage:
  * `id` — snake_case, 全 flow 唯一 (如 `stage-a` / `stage-b` / `stage-c` / `stage-d` / `stage-e`)
  * `label` — 中文短名, 带序号 (如 `"1. 阶段A"`), StageBar 显示
  * `idx` — 递增整数, stage 排序依据
  * `componentIds` — 数组, 该 stage 会渲染的组件 id 列表
- **componentIds 必须都是 actions.json 顶层的 key** [check_component_registered.py 双向: flow.componentIds ⊆ actions.keys, actions.keys ⊆ ⋃flow.componentIds]
- **stages 线性排列** (idx 递增, 一般 1,2,3,...), 分叉走返回类触发词 (具体 NAME 见 project) 不改 flow.json
- 一个 stage 可以含多个组件 (如 `stage-c` 挂 `component-x` + `component-y`, 前者主展示, 后者是 AI 建议子面板)

## 三、transition.actionTypeMap 规则

- `kind`: 目前只支持 `"trigger"` (语义: 用户执行 actionType 后, backend 认为该跳 stage, 触发词由 handler 的 `agentPrompt` 承载, 具体 NAME 见 project CLAUDE.md)
- `actionTypeMap`: `{actionType: stageId}`
  * `actionType` 必须存在于 actions.json 至少一个组件的某个 action key [check_flow_transition.py]
  * `stageId` 必须是 `stages[].id` 之一 [check_flow_transition.py]
- 语义: 用户执行该 actionType 后, 自动跳到 stageId 对应的 stage. 前端 StageBar 高亮变更 / 后端 telemetry `next_stage` 打点
- 同一 actionType 若在多个组件都存在 (如 `get_init_data`), 跳转目标应一致 (map 只有一条)

## 三点五、componentMeta.dashboard 规则 (看板 pin)

用于声明某组件产出的 html artifact 上"看板视图"。

字段:

```json
"componentMeta": {
  "<cid>": {
    "label": "<中文名>",
    "dashboard": {
      "pin": true,          // 必填. true = 上看板; 缺省 = 不上
      "order": 1,           // 可选. 看板内排序, 数字升序; 缺省沉底
      "title": "<可选>"     // 可选. 覆盖 label 作看板标题
    }
  }
}
```

规则:

- `dashboard.pin === true` 才算 pin, 缺省 = 不 pin
- **⭐ 项目搭建必填: 全项目必须至少 1 个组件 `dashboard.pin=true`** — 否则看板视图始终空态; 生成 / 迭代 flow.json 时若发现 0 pin, agent 必须**主动引导用户选一个组件 pin**, 不允许静默产出 0 pin 的 flow.json
- **每个 stage 内最多 1 个组件** `dashboard.pin=true` (规范约束, warn 不 fail); 一般 pin 结果类主组件 (如提交下发 / 最终结果卡)
- sidecar 组件 (AI 建议 / 差异卡 / 记忆条 / 洞察卡) **不 pin** — 它们是临时/辅助的
- 未设 `dashboard` = 只在 chat 流内一次性展示, 不上看板
- 老 flow.json 无 `dashboard` 字段 = 全 0 pin, 前端看板 tab 显示空态, 不 crash (兼容存量, 新增/迭代必须补)

### 引导话术 (agent 检测到 0 pin 时使用)

```
检测到当前 flow.json 未指定任何组件 `dashboard.pin=true`, 看板视图会一直空态.

按规范每个项目至少 pin 1 个组件 (一般是**结果类**主组件, 展示最终产出).
候选组件 (从 componentMeta 挑):
- <结果类候选1>  (推荐, order=1)
- <结果类候选2>
- ...

要不要 pin 到 <推荐候选>? 或者你想 pin 别的组件?
```

Agent SOP:
1. 扫 `componentMeta` 找有"结果 / 下发 / 汇总 / 提交 / 最终"等语义的组件作**首选推荐**
2. 若识别不出结果类组件, 列出所有非 sidecar (即 label 不含"建议 / 卡片 / 记忆 / 侧栏 / 洞察"等) 让用户选
3. 用户确认后, 补 `"dashboard": {"pin": true, "order": 1}` 到该组件的 `componentMeta` 里
4. 用户明确说"不需要看板" → 加 `_meta.dashboard_optout: true` 到 flow.json 顶层记录该决定, 跳过引导 (避免每次都问)

## 四、fileMeta 规则

- `path` key 3 类:
  * `state-mirror/*.json` — 状态镜像文件 (role=`state`)
  * `slots/slot_*.csv` — 输入槽位 (role=`input`)
  * `user-uploads/**` — 用户上传原件 (role=`upload`) / glob 支持
  * 输出成品 (如 `data_output_*.xlsx`) — role=`output`
- `role`: 白名单 `state` | `input` | `output` | `upload`
- `stages`: 数组, 声明该文件涉及哪些 stage — artifacts 面板按当前 stage 过滤展示
- `downloadable`: bool (缺省 false), 右侧面板是否允许下载 (upload / output 常配 true)

## 五、灰度 gate 场景 (澄清双 flow 源)

- **白名单外 project** (backend config gate 未列入) 走 `backend/configs/stages/*.json` (老 flow, 硬编码 fallback)
- **白名单内 project** 走 `skills/scene-skill/flow.json` (权威源)
- 灰度内 **不回退到老 flow**, 拉不到 flow.json 静默 `return None` (前端隐藏 StageBar, 相当于降级但不切源)
- 迁移路径: 老 project 逐个进白名单 → 双源一致 → 老 configs 下线

## 六、反例

- `stages[0].componentIds: ["not-in-actions"]` → 拦 (双向映射失效, 组件渲染不出来)
- `transition.actionTypeMap.submit_x: "no-such-stage"` → 拦 (跳转目标不存在)
- stages 两个 stage `idx` 都是 1 → warn (排序歧义, StageBar 顺序不定)
- `fileMeta.role: "buffer"` → warn (非白名单 role, artifacts 面板不识别)
- actions.json 里定义了 `foo-component` 但 flow.stages 里没任何 stage 引用 → 拦 (孤儿组件, 无入口渲染)
- transition 的 actionType 在 actions.json 找不到 → 拦 (死跳转规则)
- 同一 stage 内 >1 个组件设置 `dashboard.pin=true` → warn (规范上应仅 1 个 pin, 一般 pin 主结果类组件)
- `dashboard: {pin: false}` 显式写 false → 冗余, 直接省略 `dashboard` 字段即可

## 七、最小可用示例

```json
{
  "version": 1,
  "project_id": "<pid>",

  "stages": [
    { "id": "stage-a", "label": "1. 阶段A", "idx": 1, "componentIds": ["component-a"] },
    { "id": "stage-b", "label": "2. 阶段B", "idx": 2, "componentIds": ["component-b", "component-b-sidecar"] },
    { "id": "stage-c", "label": "3. 阶段C", "idx": 3, "componentIds": ["component-c"] }
  ],

  "transition": {
    "kind": "trigger",
    "actionTypeMap": {
      "confirm_a":   "stage-b",
      "confirm_b":   "stage-c",
      "restart":     "stage-a"
    }
  },

  "componentMeta": {
    "component-a":         { "label": "阶段A组件" },
    "component-b":         { "label": "阶段B组件" },
    "component-b-sidecar": { "label": "AI 建议子面板" },
    "component-c":         { "label": "阶段C组件", "dashboard": { "pin": true, "order": 1 } }
  },

  "fileMeta": {
    "slots/slot_1.csv":                     { "label": "输入槽", "role": "input",  "stages": ["stage-a"] },
    "state-mirror/state_snapshot.json":     { "label": "状态快照", "role": "state",  "stages": ["stage-b", "stage-c"] },
    "user-uploads/**":                      { "label": "用户上传", "role": "upload", "downloadable": true },
    "data_output_*.xlsx":                   { "label": "产出表", "role": "output", "stages": ["stage-c"], "downloadable": true }
  }
}
```

## 八、设计原则 (Hard Rules)

1. **flow.json 只描述"骨架"** — stage 序 / 组件白名单 / 文件语义 / 跳转兜底表 / 看板 pin; **不做**业务逻辑判断
2. **条件路由不进 flow.json** — 由 backend handler 按 state 判断后 emit 显式 `[TRIGGER:*]`
3. **fork 新项目必改 `project_id`** — 与所在目录 `bc-xxxxx` 一致, 否则 skill cache / 灰度白名单会指错
4. **⭐ 项目搭建必须指定至少 1 个组件 `dashboard.pin=true`** — 生成/迭代 flow.json 时若发现 0 pin, agent 必须引导用户选; 用户明确说"不需要看板"再加 `_meta.dashboard_optout: true` 跳过
5. **每 stage 最多 1 个组件 pin 看板** — 规范约束; 一般 pin 结果类主组件, sidecar 不 pin
6. **stage id 全局唯一** 且必须与 `RENDER_NEXT_STAGE to=<id>` / `actionTypeMap` value 命中
7. **fileMeta path 用相对路径** — 自动去 `uploads/` + `_draft/<month>/` 前缀
8. **老字段兼容零负担** — 缺失 `componentMeta` / `fileMeta` / `dashboard` 时前端不 crash, 退回 fallback (componentId / None / 不上看板)

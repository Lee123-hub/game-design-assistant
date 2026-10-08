# 08 — scene-skill 模板起点 (template)

> **给谁看**: 场景搭建 agent 在 §S1.5 阶段判断"用户 project 骨架从哪来"用.
> **写给谁**: 已识别用户 project 骨架来源 (empty / minimal / typical / clone), 决定下一步是"引导创建"还是"增量修改".

场景 project 在 BA Agent 平台申请时, 后端会按用户勾选的模板拷一份骨架到
`skills/scene-skill/`. 常见模板起点有 3 档: **empty** / **minimal** /
**typical**. Agent 每次开始编辑前 (SKILL.md §S1.5) 必须先识别当前 project 走的是哪
一档, 决定后续 SOP.

---

## 一. 追溯来源: `_meta.template_from`

模板起点信息落在 `skills/scene-skill/actions.json._meta.template_from` 字段.
Agent 优先 Read 该字段判断.

```jsonc
{
  "_meta": {
    "projectId": "bc-xxxxxx",      // ← 当前 project id (每个 project 唯一)
    "template_from": "typical"      // ← 来源标记 (empty / minimal / typical / bc-xxxxx clone 源)
  },
  "<component-x>": { /* ... */ }
}
```

**语义澄清 (关键)**:
- `projectId` = **当前 pid** (回答"我是谁"), 平台注册时分配, 永不变
- `template_from` = **来源标记** (回答"我从哪来"), 骨架初始化时写入, 后续不改, 用于 agent SOP 分档

如果 `template_from` 为 `bc-xxxxx` 形式, 表示是从另一个既有 project 克隆的骨架
(不是从官方 template), agent 按 `typical` 档处理即可.

如果 `_meta.template_from` **不存在**, 说明用户是手写起步 (没走 template), agent 必须
询问用户"是从模板起步还是从 0 建", 不要贸然覆盖.

> ⚠️ **backend 现状注**: build-skill 用 `typical` 命名典型骨架, 但 backend
> `_ALLOWED_TEMPLATES` 目前仍是 `budget-chat` (历史命名遗留, 待重命名).
>
> Agent 读到 `_meta.template_from = "budget-chat"` 时按 `typical` 档处理.
> 未来 backend 重命名后, 本注释可删.

---

## 二. 三档模板骨架

### 2.1 empty — 完全空壳

**特征**: 只有最小识别文件, agent 引导用户从需求收集开始完整创建.

**文件清单**:
```
{workspace}/                        ← 工作副本根 (= agent CWD 根, 无需 mkdir)
├── CLAUDE.md                        (空模板, 只有标题占位)
└── skills/scene-skill/
    ├── SKILL.md                     (空模板, name + description 占位)
    └── actions.json                 ({"_meta": {"template_from": "empty"}})
```

**agent SOP**: 走 §S0 (需求收集) → §S1 (蓝图确认) → §S2-S6 全流程完整创建.

---

### 2.2 minimal — 1 stage + 1 component + 1 action

**特征**: 一个可跑通的最小骨架, 用户可基于此**增量**扩展 stage / component / action.

**文件清单**:
```
{workspace}/                        ← 工作副本根 (= agent CWD 根, 无需 mkdir)
├── CLAUDE.md                                        (含 stage 状态机段落, 只列 stage-a)
└── skills/scene-skill/
    ├── SKILL.md                                     (含 component-x / action-y 速查)
    ├── actions.json                                 (含 _meta + 1 action)
    ├── flow.json                                    (含 1 stage: stage-a)
    ├── compile.py                                   (通用编译器, 参考 frame/)
    ├── components/component-x/
    │   ├── template.html                            (含 action-y 触发按钮 + callAction 调用骨架)
    │   ├── schema.json                              (最小字段)
    │   └── demo.json                                (最小示例数据)
    ├── frame/                                       (从 build-skill/frame/ 拷)
    │   ├── scene-tokens.css
    │   ├── scene-frame.js
    │   └── _shared/
    └── scripts/
        └── run_action_y.py                          (标准 stdin/stdout 骨架, 无实际算法)
```

**actions.json 最小示例**:
```json
{
  "_meta": {
    "projectId": "bc-xxxxxx",
    "template_from": "minimal"
  },
  "component-x": {
    "action-y": {
      "handlers": [
        {
          "type": "script",
          "id": "run_action_y",
          "path": "scripts/run_action_y.py",
          "timeout": 60,
          "payload": {},
          "input": {}
        },
        {
          "type": "write_state",
          "target": "{context.data_root}/state-mirror/action_y_result.json",
          "value_from": "results.run_action_y.response"
        }
      ],
      "userMessage": "操作完成",
      "agentPrompt": "",
      "allowWhen": ["pending"]
    }
  }
}
```

**flow.json 最小示例**:
```json
{
  "version": 1,
  "stages": [
    { "id": "stage-a", "label": "1. Stage A", "idx": 1, "componentIds": ["component-x"] }
  ],
  "transition": { "kind": "trigger", "actionTypeMap": {} }
}
```

**agent SOP**: 跳过 §S2 骨架初始化, 直接从 §增量修改. 用户说"加一个 stage" / "加一个
component" 时, 在既有骨架上 append, **不覆盖** minimal 已有的 stage-a / component-x
(除非用户明确说 "把 component-x 改成 xxx").

---

### 2.3 typical — 5 stage + 6 component (完整场景骨架)

**特征**: 覆盖典型交互业务的**通用骨架** (数据输入 → 参数配置 → 预览 → 校验 → 应用 →
下发). 用户按需替换业务字段即可上线. 反推自 5-stage 完整场景 workspace.

**5 stage 通用骨架** (抽象命名):

| stage id  | label      | componentIds                        | 通用含义              |
| --------- | ---------- | ----------------------------------- | --------------------- |
| `stage-a` | 1. Stage A | `component-input`                   | 数据输入 / 上传槽位     |
| `stage-b` | 2. Stage B | `component-config`                  | 参数 / 维度配置         |
| `stage-c` | 3. Stage C | `component-preview`, `component-assist` | 结果预览 + 辅助交互 |
| `stage-d` | 4. Stage D | `component-validate`                | 校验 / 复核             |
| `stage-e` | 5. Stage E | `component-dispatch`                | 提交 / 下发             |

**6 component 通用骨架** (抽象命名, 每个组件均为 template.html + schema.json + demo.json 三件套):

| componentId          | 通用用途                                                  |
| -------------------- | --------------------------------------------------------- |
| `component-input`    | 多槽位数据上传 (文件 / SQL / 手动填) + 就绪状态展示         |
| `component-config`   | 表格 / 表单配置参数 (阈值 / 权重 / 开关等)                  |
| `component-preview`  | 结果预览 (表格 / 图表)                                     |
| `component-assist`   | AI / 辅助交互面板 (建议列表, 应用/忽略)                    |
| `component-validate` | 校验规则跑批 + 违规列表 + 一键修复                          |
| `component-dispatch` | 最终产物汇总 + 下发按钮 (导出 / 归档 / 重启)                |

**文件清单** (完整):
```
{workspace}/                        ← 工作副本根 (= agent CWD 根, 无需 mkdir)
├── CLAUDE.md                                          (含完整 stage 状态机 + 6 组件 × actionType 名单)
└── skills/scene-skill/
    ├── SKILL.md                                       (含 6 组件说明 + 全部 callAction 速查)
    ├── actions.json                                   (含 _meta + 5 stage × 若干 action, 完整可跑)
    ├── flow.json                                      (含 5 stage + transition.actionTypeMap)
    ├── compile.py
    ├── components/
    │   ├── component-input/     (三件套)
    │   ├── component-config/    (三件套)
    │   ├── component-preview/   (三件套)
    │   ├── component-assist/    (三件套)
    │   ├── component-validate/  (三件套)
    │   └── component-dispatch/  (三件套)
    ├── frame/                                         (tokens + frame.js + _shared/)
    ├── scripts/                                       (每个 stage 至少 1 个算法脚本)
    │   ├── run_prepare.py           (stage-a 预处理)
    │   ├── run_configure.py         (stage-b 参数落盘)
    │   ├── run_compute.py           (stage-c 主算法)
    │   ├── run_apply_assist.py      (stage-c 辅助建议应用)
    │   ├── run_validate.py          (stage-d 校验跑批)
    │   └── run_dispatch.py          (stage-e 产物打包)
    └── references/                                    (可选, 算法文档)
```

**agent SOP**: 跳过 §S0-S2, 直接进入 **§差异修改模式**. 常见场景:
- 用户说"改 component-preview 的表格列" → Read component-preview 三件套, Edit template.html + schema.json + demo.json
- 用户说"加一个 stage-f" → 在 flow.json append 新 stage + 新 component 三件套 + actions.json 加对应 action
- 用户说"我的业务只用 3 个 stage" → 询问要删哪 2 个, 逐一确认后从 flow.json / components/ / actions.json / scripts/ 一次性删干净, **不留孤儿文件**

---

## 三. clone 起点 (`template_from = "bc-xxxxx"`)

用户在平台"从既有 project 克隆"时, `template_from` 会填源 project 的 pid. 此档按
**typical** 处理, 但要注意:
- clone 出来的骨架**仍带源 project 的业务命名** (源 project 的 componentId / stage id
  可能带业务词汇). Agent 不要把这些当"通用模板", 要按用户新业务重命名 (或不动).
- **不要**把新 project 的 `projectId` 写成源 pid, 只有 `template_from` 保留源 pid 作为
  溯源痕迹.

---

## 四. 首次识别 checklist (agent 每次开新 chat 必跑)

1. Read `skills/scene-skill/actions.json`, 取 `_meta.template_from`
2. `ls skills/scene-skill/` 看现有目录结构
3. `ls skills/scene-skill/components/` 看现有 component 数量
4. 按下表决定 SOP:

| `template_from`    | agent SOP                                         |
| ------------------ | ------------------------------------------------- |
| `empty`            | §S0 需求收集 → §S1 蓝图 → §S2-S6 完整创建         |
| `minimal`          | 跳 §S2, 直接 §S3+ 增量扩展                        |
| `typical`          | 跳 §S0-S2, 直接 §差异修改                      |
| `bc-xxxxx` (clone) | 同 typical, 但注意源 project 命名残留             |
| 缺失               | **询问用户**"是从模板起步还是从 0 建", 不要贸然覆盖 |

**铁律**: 不覆盖已有骨架, 只做增量. 若必须重命名 / 删除既有 stage / component, 逐一
向用户确认后再动手.

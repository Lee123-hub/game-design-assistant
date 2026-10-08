---
name: build-skill
description: >
  场景生产参考 skill (场景搭建 agent 使用). 提供 agent 目录标准 + S0-S6 7 阶段
  流程 + scene-skill 各文件模板 (SKILL.md / actions.json / flow.json / scripts/ /
  components/{cid}/ 三件套) + project CLAUDE.md 模板. Agent 在
  skills/scene-skill/ 下 Write 文件时按本规范执行. 全程引导小白用户完成
  场景配置的生产, 并支持对已有场景进行细节调整.
  当用户说 "新建场景" / "帮我建个项目" / "新场景怎么弄" / "我要做一个 xxx 场景" /
  "帮我生成 scene-skill" / "场景配置怎么写" / "新增 action" / "改一下组件" 时 Read.
---

# build-skill — 场景生产参考

**规范来源**, 场景搭建 agent 生产 / 修改 project scene-skill 内容时的**参考文档**.
所有产出**直接 Write 到 `skills/scene-skill/**`**, 由 backend 自动保存同步为当前
工作副本 (测试对话 / 文件面板可见); 上传 / 发布 / 试跑等运维操作全部由用户在 UI
上点按钮完成 (agent 只写文件).

适合小白用户: 全程给出清晰引导, 每步确认后再推进.

---

## ⚠️ rev8 白名单 (务必读, 决定 Write 会不会生效)

只有以下 2 类路径 Write 会被 backend 保存同步, 用户在 UI 能看到:

- `CLAUDE.md`
- `skills/scene-skill/**`

**其他路径 Write 会怎样**?
- Backend 会 **skip** 该文件 (不入工作副本)
- SSE 发 `warning` event, 用户看到 "Agent 试图修改超范围文件, 已忽略: [xxx]" banner
- 工作副本内容不变, 相当于白干

因此本文档规范里出现的**任何非白名单路径** (如 `rules/`, `test-case/`, project 根
CLAUDE.md 之外的其他配置) 都**只是概念/未来规划**, agent 目前**不要 Write**. 若需要
agent 行为规则, 直接写在 `CLAUDE.md` 里.

---

## 目录标准（规范来源）

> ⚠️ 下面画的是**理想全景**, 其中 `rules/` / `test-case/` **不在 rev8 白名单里**,
> 目前你 Write 不生效 (见顶部白名单声明). 你只应该 Write ✅ 标记的路径.

```
bc-{id}-{name}/                     ← 项目根目录 (rev8 里已存在, 无需 mkdir)
│
├── CLAUDE.md                       ✅ agent 启动上下文 (可 Write, 会 sync)
│
├── skills/
│   └── scene-skill/                ✅ ★ 固定命名, 一个项目一个场景 skill
│       ├── SKILL.md                ✅ skill 元数据 + agent 调用指引
│       ├── actions.json            ✅ callAction 路由配置 (全量)
│       ├── flow.json               ✅ 流程步骤状态机配置
│       ├── compile.py              ✅ 组件编译器
│       ├── components/             ✅ ★ 组件内聚目录 (template + schema + demo 三件套)
│       │   └── {component-id}/
│       │       ├── template.html   ← UI 骨架 + 交互, mount 时自己 callAction 拉数据
│       │       ├── schema.json     ← 接口响应体 (demo.json 每条规则 response.data) 的 jsonschema 契约
│       │       └── demo.json       ← 该组件全部 actionType 的 mock 拦截规则数组 (见 references/06-component.md §六)
│       ├── frame/                  ✅ 运行时公共资源 (tokens + frame.js + _shared/)
│       ├── scripts/                ✅ 算数脚本 (唯一来源, 后端直接执行)
│       ├── references/             ✅ 算法文档、数据格式、指标目录
│       └── test-case/              ⚠️ 目前不 sync (rev8 白名单外, 未来放宽)
│
└── rules/                          ⚠️ 目前不 sync (rev8 白名单外; 若需要 agent 行为规则, 请写入 CLAUDE.md)
    ├── output-decision.md
    └── ...
```

---

## 场景生产流程（7 阶段）

| 阶段 | 名称 | 关键产出 |
|------|------|----------|
| **S0** | 需求收集 | 结构化需求清单 |
| **S1** | 蓝图确认 | 组件列表 + 流程状态机 + action 规格 |
| **S2** | 项目骨架 | 目录结构 + 基础文件 |
| **S3** | scene-skill 核心文件 | actions.json + flow.json + SKILL.md |
| **S4** | 组件模板 & schema | components/{cid}/（template.html + schema.json + demo.json） |
| **S5** | 算法脚本 | scripts/*.py |
| **S6** | project CLAUDE.md (rules 目前统一写这里) | 完整可上线配置 |

---

## 阶段 S0 — 需求收集

### 必须收集的信息

向用户逐一询问（允许用户一次性提供，但必须逐项核对）：

1. **业务名称** — 该场景的中文名和英文标识（用于目录命名）
2. **项目 ID** — 已在 BA Agent 平台申请的 `bc-xxxxxx` 编号（若未申请，提示用户先去平台申请）
3. **工作流步骤** — 用户完成一次完整业务操作的步骤，例如"上传数据 → 配置策略 → 确认 → 下发"
4. **每个步骤的组件需求** — 每步需要什么交互面板（文件上传 / 表格配置 / 确认弹窗 / 结果展示等）
5. **数据流转** — 上传哪些数据文件（槽位）、脚本计算什么、产出文件放哪里；**若某步数据是"对话过程中 agent 算出来的"且要给下一个组件用，同样要落 `state-mirror/*.json`, 不能靠 agent 记忆传递**（见 `references/10-state-mirror.md` §六）
6. **可调参数** — 用户可以在组件内编辑的参数（权重 / 阈值 / 开关等）
7. **校验规则** — 提交前需满足的业务校验（可后补）
8. **下发目标** — 最终产出文件的用途（导出到哪个系统 / 下载 xlsx 等）

### 追问原则

- **一次性列出所有缺失项**，不要逐条追问
- 有提供参考文档 / xlsx 时，先帮用户梳理再追问
- 明确标注哪些是必填，哪些可以后补

### 输出：结构化需求清单

```markdown
## 场景需求清单 — {业务名称}

- 项目 ID：bc-xxxxxx
- 业务名称：xxx
- 工作流步骤：步骤1 → 步骤2 → 步骤3
- 组件需求：
  - step1：{组件描述}
  - step2：{组件描述}
- 数据槽位：slot_1(xxx.csv) / slot_2(xxx.csv)
- 算法脚本：run_xxx.py（计算 xxx，输入 slot_1，输出 result.json）
- 可调参数：threshold(默认 0.8) / weight(默认 1.0)
- 下发目标：导出 xlsx 到用户下载
- [待确认]：{未明确项}
```

进入 S1 前用户必须确认需求清单。

---

## 阶段 S1 — 蓝图确认

### 产出内容

基于需求清单，输出**完整蓝图**，用户确认后才进入 S2：

1. **组件列表** — 每个 componentId 的用途说明
2. **flow.json 状态机草稿** — step 转移条件
3. **actions.json 规格草稿** — 每个 action 的 handler 类型和 payload
4. **scripts 清单** — 脚本名 + 输入 + 输出 + 算法简述
5. **⭐ 看板 pin 组件** — 从组件列表里指定 **1 个组件** 作为看板视图主展示 (`componentMeta.<cid>.dashboard.pin=true`); 一般选**结果类**组件 (下发 / 汇总 / 最终结果卡). 若用户明确"不需要看板"则改记 `_meta.dashboard_optout: true`, 跳过此项. 规范细则见 `references/05-flow.md` §三点五

### actions.json handler 类型说明

| type | 说明 |
|------|------|
| `upload_file` | 文件上传到指定路径（后端内置） |
| `write_state` | 整体写入状态文件（后端内置） |
| `patch_state` | 局部更新状态文件指定 key（后端内置） |
| `call` | 后端内置方法（read_state 等 export-related call method, 详见具体 project 部署契约） |
| `script` ★ | 直接执行 scene-skill/scripts/ 下的脚本（★ 新增，替代业务逻辑类 call） |

### script handler 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 相对 scene-skill 目录的脚本路径，如 `scripts/run_xxx.py` (.py 直跑 python3, 无需 runtime 字段) |
| `id` | string | 否 | pipeline 内唯一; 下游 `value_from: "results.<id>.response"` 引用时必填 |
| `payload` | object | 否 | 透传前端 callAction 的 payload，支持 `{payload.xxx}` / `{context.xxx}` / `{results.<id>.response}` 模板 |
| `input` | object | 否 | **声明** script 要预读哪些文件 (key → 路径), backend **代读** 后按扩展名 auto-parse (`.json→dict`, `.txt/.md→str`, 其余含 `.csv/.xlsx`→原样 bytes) 塞进 `args.input`; script 用 `load_input` helper 取值 (兼容 backend / agent 沙箱, 见 `references/07-script-contract.md` §二), **不 open() 文件** |
| `timeout` | number | 否 | 秒, 默认 60, 分级见 `references/07-script-contract.md` |

> ⚠️ **产物不通过 script handler 直接写文件**. script return `{"success": True, "data": {...}}` 后, 由**下游 `write_state` / `patch_state` handler** 通过 `value_from: "results.<id>.response.<key>"` 引用 script 输出并落到 state-mirror. 见 `references/04-pipeline.md`.

---

## 阶段 S1.5 — Template 起点识别 (rev18 新增, S1 后 S2 前必跑)

> ⚠️ 每次开始编辑前 (global CLAUDE.md 铁律 9), 你**先**判断当前 project 骨架从哪来,
> 再决定是走 §S2 骨架初始化, 还是跳到 §S3 增量修改. 覆盖已有骨架 = 灾难.

### 识别流程 (2 步)

1. **Read** `skills/scene-skill/actions.json`, 取 `_meta.template_from`
2. **ls** `skills/scene-skill/` + `components/`, 确认现有目录结构

### 4 种情况分档

| `_meta.template_from`   | 含义                       | agent SOP                                                   |
| ----------------------- | -------------------------- | ----------------------------------------------------------- |
| `"empty"`               | 用户从空白起步             | 走 §S0 需求收集 → §S1 蓝图 → §S2-S6 完整创建                |
| `"minimal"`             | 骨架已有 1 stage + 1 component + 1 action | **跳过 §S2 骨架初始化**, 直接从 §S3 增量扩展 (append 新 stage / component) |
| `"typical"`             | 骨架已含 5 stage + 6 component (通用完整场景) | **跳过 §S0-§S2**, 直接进入 §S3 **差异修改**模式 (改字段 / 加减 stage) |
| `"bc-xxxxxx"` (clone)   | 从既有 project 克隆         | 同 typical, 额外注意源 project 命名残留, 按新业务重命名     |
| **缺失**                | 未知起点 (手写或未标记)     | **询问用户** "是从模板起步 (empty / minimal / typical) 还是从 0 手写?"; 不要贸然覆盖已有文件 |

> backend 部分老 project 会返 legacy 值 (如 `"budget-chat"`), 语义等同 typical, 详见 `references/08-templates.md`.

### 关键区分: `_meta.projectId` vs `_meta.template_from`

- `projectId` = **当前 pid** (`bc-xxxxxx`, 每个 project 唯一, 永不变)
- `template_from` = **来源标记** (骨架初始化时写入, 后续不改, 用于 SOP 分档)

两者语义正交. clone 场景下, `projectId` = 新 project pid, `template_from` = 源 pid.

### 铁律

- **不覆盖已有骨架**. minimal / typical 已有的 stage-a / component-x / action-y **保留**,
  只 append 新的. 用户明确说 "把 component-x 改成 xxx" 才 Edit.
- **不新造模板档位**. 三档 (empty / minimal / typical) 之外的都当 "缺失" 处理, 询问用户.
- 详细文件清单 + 抽象命名规范见 `references/08-templates.md`.

---

## 阶段 S2 — 骨架文件

### 直接 Write 到工作副本根 (CWD 根)

确认蓝图后, 用 Write 工具在 `skills/scene-skill/` 下创建以下核心文件
(project 已经在平台申请好, 无需 `mkdir` 项目根; scene-skill 目录也无需 `mkdir`,
Write 时自动创建父目录). 所有路径相对**工作副本根** (= agent 当前 CWD 根):

```
{workspace}/                        ← 工作副本根 = agent CWD 根 (无需 mkdir)
├── CLAUDE.md                                       ← Write (project 工作指令, 见 §S6)
└── skills/scene-skill/
    ├── SKILL.md                                    ← Write (skill 元数据, 见 §S3.3)
    ├── actions.json                                ← Write (见 §S3.1)
    ├── flow.json                                   ← Write (见 §S3.2)
    ├── compile.py                                  ← Write (参考 .claude/skills/build-skill/frame/)
    ├── components/{componentId}/
    │   ├── template.html                           ← Write (见 §S4.1)
    │   ├── schema.json                             ← Write (见 §S4.2)
    │   └── demo.json                               ← Write (见 §S4.3)
    ├── frame/                                      ← Write (可从 .claude/skills/build-skill/frame/ 拷)
    │   ├── scene-tokens.css                        ← CSS 变量 (color / spacing / radius)
    │   ├── scene-frame.js                          ← runtime 支持
    │   └── _shared/                                ← topbar / footer-nav 公共片段
    ├── scripts/*.py                                ← Write (见 §S5)
    └── references/*.md                             ← 可选, 算法文档 / 数据格式说明
```

### frame/ + compile.py — 直接从标杆拷

`.claude/skills/build-skill/frame/` 是**跨 project 共享的运行时公共资源标杆**, 内容通用无业务耦合:

- `compile.py`                                     — 组件编译器 (contract: `--input/--output`)
- `scene-tokens.css`                               — CSS 变量
- `scene-frame.js`                                 — frame runtime
- `_shared/topbar.html`, `_shared/footer-nav.html` — 公共 HTML 片段

**严禁手写 compile.py** — backend `_run_compile` 与标杆是一套契约, 手写必错.

**做法**: 生成新 project 时, 从标杆 Read 后 Write 到 project:

```bash
Read .claude/skills/build-skill/frame/compile.py                  → Write skills/scene-skill/compile.py
Read .claude/skills/build-skill/frame/scene-tokens.css            → Write skills/scene-skill/frame/scene-tokens.css
Read .claude/skills/build-skill/frame/scene-frame.js              → Write skills/scene-skill/frame/scene-frame.js
Read .claude/skills/build-skill/frame/_shared/topbar.html         → Write skills/scene-skill/frame/_shared/topbar.html
Read .claude/skills/build-skill/frame/_shared/footer-nav.html     → Write skills/scene-skill/frame/_shared/footer-nav.html
```

或跑 auto-fix 一把梭 (缺失 / 老版 / hash-diff 全覆盖):

```bash
python3 .claude/skills/build-skill/scripts/check_frame_assets.py \
    --workspace . --auto-fix   # 在工作副本根 (= CWD) 下执行, --workspace 指向当前目录 .
```

**迭代场景** (project 已存在): 每次进 project 都跑一次 check (见 CLAUDE.md 铁律 10),
拦老版 compile.py / 老版 frame 资源. project 侧一律**不允许改** compile.py 内容,
业务差异通过 flow.json + components/{cid}/schema.json 表达.

### 注意事项

- 白名单 (rev8 paths): 只有 `CLAUDE.md` + `skills/scene-skill/**`
  会被 backend 保存同步. 其他路径 (如 `rules/`) 你 Write 了会被 skip
  + SSE warning.
- Write 之前先 Read 确认文件是否已存在, 已存在时用 Edit 而不是 Write 覆盖.

---

## 阶段 S3 — scene-skill 核心文件

### 3.1 actions.json 模板

```json
{
  "{componentId}": {
    "{actionType}": {
      "handlers": [
        {
          "type": "script",
          "id": "run_{name}",
          "path": "scripts/run_{name}.py",
          "timeout": 60,
          "payload": {
            "{paramKey}": "{payload.{paramKey}}"
          },
          "input": {
            "{inputKey}": "{context.data_root}/slots/{slotId}.csv"
          }
        },
        {
          "type": "write_state",
          "target": "{context.data_root}/state-mirror/{name}_result.json",
          "value_from": "results.run_{name}.response"
        }
      ],
      "userMessage": "{操作完成的提示文案}",
      "agentPrompt": "[TRIGGER:{TRIGGER_NAME} {k1}={v1} ...] {文字说明}",
      "allowWhen": ["pending", "uploading"]
    }
  }
}
```

### agentPrompt 触发器规则

build-skill **只校验 TRIGGER 语法** (`[TRIGGER:<NAME> k=v ...] <可选文字>`, NAME 全大写, 参数在 `]` 内, 单行), **具体 NAME 由 project 自维护** (见 project 的 `CLAUDE.md` 触发词章节, 即你写在工作副本根的根文件). 常见语义类别举例:

| triggerHint | agentPrompt 格式 (抽象举例, 具体 NAME 见 project) |
|-------------|--------------------------------------------------|
| `advance`   | `[TRIGGER:GOTO to=<stageId>] <文字>` |
| `back`      | `[TRIGGER:BACK to=<stageId>]` |
| `keep`      | `[TRIGGER:REFRESH reason=<原因>]` 或留空 |
| `none`      | 留空 |

### allowWhen 取值

只能是以下值的子集：`["sealed", "pending", "uploading"]`

### 3.2 flow.json 模板

```json
{
  "version": 1,
  "project_id": "{projectId}",
  "stages": [
    {"id": "stage-a", "label": "{阶段A名称}", "idx": 1, "componentIds": ["{componentId1}"]},
    {"id": "stage-b", "label": "{阶段B名称}", "idx": 2, "componentIds": ["{componentId2}"]}
  ],
  "transition": {
    "kind": "trigger",
    "actionTypeMap": {
      "{exitActionType}": "stage-b",
      "{exitActionType2}": "done",
      "go_back": "stage-a"
    }
  },
  "componentMeta": {
    "{componentId1}": {"label": "{组件1中文名}"},
    "{componentId2}": {"label": "{组件2中文名}", "dashboard": {"pin": true, "order": 1}}
  },
  "fileMeta": {
    "state-mirror/{name}_state.json": {"label": "{状态文件说明}", "role": "state", "stages": ["stage-b"]}
  }
}
```

字段说明:
- `version` — flow schema 版本号 (当前固定 `1`)
- `project_id` — 所属 project 标识, 用于校验部署位一致
- `stages[]` — 阶段列表; `id` 唯一, `idx` 从 1 递增决定顺序, `componentIds` 声明该阶段允许渲染的组件白名单
- `transition.kind` — 转移触发方式 (当前统一 `"trigger"`, 由 actions.json 的 exit actionType 驱动)
- `transition.actionTypeMap` — `actionType` → 目标 `stageId` 的直接映射 (取代旧结构里嵌套的 transitions 数组); 特殊目标 `"done"` 表示流程终止
- `componentMeta` (可选) — 组件维度补充信息 (label / 描述 / `dashboard.pin` 看板标记), 供前端展示或 review 阶段使用
- `componentMeta.<cid>.dashboard` (**项目搭建必填至少 1 个**) — `{pin: true, order?, title?}`; 该组件产出的 html artifact 上"看板视图"; 每 stage 最多 1 个 pin, 一般选结果类主组件; 规范 + 引导话术见 `references/05-flow.md` §三点五
- `fileMeta` (可选) — 状态镜像 / 中间产物文件的元信息, `role` 常见值 `state` / `artifact`, `stages` 声明与该文件关联的阶段

### 3.3 SKILL.md 模板（scene-skill 内）

```markdown
---
name: scene-skill
description: >
  {业务名称} 场景 skill。提供 {业务描述} 功能。
  支持：{功能1} / {功能2} / {功能3}。
---

# scene-skill — {业务名称}

## 组件列表

| componentId | 用途 | 所属步骤 |
|-------------|------|---------|
| {cid1} | {描述} | step1 |
| {cid2} | {描述} | step2 |

## 调用方式

compile.py 只编译 **UI 骨架** (不再合并业务 data, rev25):

```bash
python3 .claude/skills/scene-skill/compile.py \
  --component {cid} \
  --id <artifact-id>
```

组件业务数据由 template.html 自己 mount 时 `SceneFrame.callAction('get_init_data', {})`
向 backend 拉取, agent 不需要 (也不应该) 在编译前准备/传入业务 data. 预览态由平台 mock
层按组件 `demo.json` 拦截返回, 线上态真的打 backend. 详见
`.claude/skills/build-skill/references/06-component.md` §六/§八.

老版签名 `--input/--output` (整块 payload 含 data) 与更老的
`--component/--data/--id/--output-dir` 均已废弃. 若 project 里的 compile.py 仍是
老版, 跑 `check_frame_assets.py --auto-fix` 从标杆覆盖.

## 脚本列表

| 脚本 | 输入 | 输出 | 算法描述 |
|------|------|------|---------|
| scripts/run_{name}.py | {input} | {output} | {描述} |

## callAction 速查

| componentId | actionType | 触发条件 | handler |
|-------------|-----------|---------|---------|
| {cid} | {action} | {条件} | script: {script.py} |
```
```

---

## 阶段 S4 — 组件模板 & Schema

> ⚠️ rev25 核心思路: **组件 = 自包含 UI 骨架 + 固定配置, 动态业务数据一律走接口自拉取**.
> template.html **不**从 `__COMPONENT_DATA__.props` 读业务数据, 而是 mount 时自己
> `SceneFrame.callAction('get_init_data', {})` 向 backend 要; demo.json 从"渲染数据
> 骨架"变成"该组件全部 actionType 的 mock 接口响应规则表", 供平台预览态拦截请求用.
> 完整规范见 `references/06-component.md`.

### 4.1 template.html 基础结构

每个组件在 `components/{componentId}/template.html` 下（schema.json / demo.json 同目录）：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <!--
    ACTION INTERFACE
    ================
    get_init_data:
      payload: {}
      response.handlerResults: [...] — 组件渲染所需的全部业务数据
    {actionType2}:
      payload: { {field}: {type} }
  -->
  <style>
    /* 组件样式, 用 frame/scene-tokens.css 的 CSS 变量, 不写死色值 */
    .container { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; padding: 16px; }
    /* ... */
  </style>
</head>
<body>
  <div class="container" id="app">
    <!-- 组件内容由 JS 渲染, 初始可放 loading / skeleton 占位 -->
  </div>
  <script>
    // 渲染函数: 接收 get_init_data 返回的 handlerResults, 自己 map 成页面
    function render(handlerResults) {
      // TODO: 从 handlerResults 里找到需要的 handler.response, 渲染页面
    }

    // mount 时自拉数据 (预览态被平台 mock 层拦截返回 demo.json 里的规则, 线上态真的打 backend)
    function initFromAPI() {
      SceneFrame.loading.show();
      SceneFrame.callAction('get_init_data', {})
        .then(function (res) {
          render((res && res.handlerResults) || []);
        })
        .catch(function (e) {
          SceneFrame.toast.error('数据加载失败: ' + (e.message || e));
        })
        .finally(function () {
          SceneFrame.loading.hide();
        });
    }

    initFromAPI();
  </script>
</body>
</html>
```

### 4.2 schema.json 基础结构 (校验对象 = demo.json 每条规则的 response.data)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["code", "data"],
  "properties": {
    "code": { "const": 0 },
    "data": {
      "type": "object",
      "required": ["handlerResults"],
      "properties": {
        "userMessage": { "type": "string" },
        "agentPrompt": { "type": "string" },
        "handlerResults": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["type", "response"]
          }
        }
      }
    }
  }
}
```

### 4.3 demo.json（与 template.html 同目录, mock 拦截规则数组）

每个组件在 `components/{componentId}/demo.json`，内容是**该组件全部 actionType 的 mock 拦截规则数组**（不再是渲染 props 骨架），供平台预览态拦截 `SceneFrame.callAction` 请求：

```json
[
  {
    "url": "/budget-chat/api/component-action",
    "method": "POST",
    "name": "获取初始化数据",
    "match": { "actionType": "get_init_data" },
    "response": {
      "code": 0,
      "data": {
        "handlerResults": [
          { "type": "call", "id": "read_state", "response": { "method": "read_state", "response": { "{field}": "{真实示例值}" } } }
        ]
      }
    }
  },
  {
    "url": "/budget-chat/api/component-action",
    "method": "POST",
    "name": "{actionType2 中文描述}",
    "match": { "actionType": "{actionType2}" },
    "response": {
      "code": 0,
      "data": {
        "userMessage": "{与 actions.json 同 action 的 userMessage 一致}",
        "agentPrompt": "{与 actions.json 同 action 的 agentPrompt 一致}",
        "handlerResults": [
          { "type": "{handler.type}", "response": { "success": true } }
        ]
      }
    }
  }
]
```

**规则**: actions.json 里该组件的**每个 actionType** 都要在 demo.json 里有至少一条覆盖规则 (mock 全覆盖); `get_init_data` (或组件专属拉取 actionType) 的规则必须给**真实、完整、不含占位符**的示例值, 因为这是组件预览态唯一的数据来源. 完整字段规则见 `references/06-component.md` §六.

---

## 阶段 S5 — 算法脚本

### 脚本标准结构（scripts/*.py）

> 契约详情见 `references/07-script-contract.md`. 以下是 backend-facing script handler
> 模板 (actions.json 里 `handler.type=script` 触发), 双入口 (backend / agent 沙箱).
> args.input 在两种模式下语义不同 (backend = preload 对象, agent = 路径 str), 用
> `load_input` helper 统一 → script 主逻辑与运行模式解耦.

```python
"""
契约:
  args.payload: { {payload 字段} }
  args.input: {
    "{inputKey}": <load_input 后为 dict / str / bytes, 视扩展名而定>,
  }
  return: {"success": True, "data": {"{outputKey}": ...}}

原意:
  对应 actions.json: {componentId}.{actionType} 的 script handler.
  {业务触发描述}

沙箱:
  - Jupyter kernel 内跑 (backend) 或 agent stdin 跑
  - 依赖: pandas / numpy / json (白名单内)
  - 0 网络 / 0 subprocess (agent 沙箱允许通过 load_input 只读文件路径)
"""


def load_input(v):
    """兼容 backend preload 与 agent 沙箱路径两种模式.

    backend: v 已是 dict / str / bytes / None → 原样返回.
    agent:   v 是路径字符串, 按扩展名读并 parse (.json→dict, .txt/.md→str, 其余→bytes),
             对齐 backend `_fetch_input_by_ext` 行为.
    """
    if not isinstance(v, str) or not v:
        return v
    from pathlib import Path
    p = Path(v)
    if not p.is_file():
        return v
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
    return raw


def main(args: dict) -> dict:
    payload = args.get("payload", {})
    input_data = args.get("input", {})
    context = args.get("context", {})

    # 通过 load_input 取值, 两种模式下类型一致
    # x_state = load_input(input_data.get("x_state"))         # dict
    # workbook_bytes = load_input(input_data.get("workbook")) # bytes

    # TODO: 实现业务逻辑
    result = {}

    return {"success": True, "data": result}


if __name__ == "__main__":
    import sys, json
    args = json.load(sys.stdin)
    result = main(args)
    print(json.dumps(result, ensure_ascii=False))
```

### 脚本强约束

- **入口 `def main(args) -> dict`**: args 是 dict `{payload, input, context}`, return `{"success": bool, "data": {...}}`
- **input 走 `load_input`**: 两种运行模式下 `args.input[k]` 语义不同, 用 helper 统一.
  backend 模式 args.input[k] 是已 preload 的对象, agent 沙箱模式是路径 str; helper 内部
  用 `Path.exists()` 判定, 存在的路径去 read, 否则原样返回
- **沙箱纯计算**: 禁 `requests` / `urllib` / `subprocess` / `os.system` / `open(..., 'w')`; 允许 pandas / numpy / json / re / datetime / itertools / collections
- **双入口**: 结尾 `if __name__ == '__main__':` 从 stdin 读 JSON, 便于 agent 沙箱手动跑
- **数值守恒**: 涉及分配类计算时使用数值守恒函数（参考具体 project 部署契约）防浮点误差

> 另有 agent-facing 脚本 (agent 沙箱手动调试用, 不进 actions.json), 契约更松, 见 07-script-contract.md 「两类 script 契约」小节.

---

## 阶段 S6 — CLAUDE.md (rules/ 目前不 sync)

> ⚠️ rev8 白名单不含 `rules/`, agent 若 Write 会被 skip. **所有 agent 行为规则请
> 直接写在 `CLAUDE.md` 里**. 未来放宽白名单后再分离到 rules/ 子文档.

### CLAUDE.md 模板（项目根目录）

> 本模板产出为 project 工作副本根的 `CLAUDE.md` (产出物); 部署后即为主对话 agent
> 的工作指令 (运行时 CWD 布局见下方模板正文, scene-skill 挂 `.claude/skills/scene-skill/`)。

```markdown
# {业务名称} ({projectId}) chat agent 工作指令

## 0. 铁律（CRITICAL — 输出前必读）

1. **NEVER 用自由 markdown 模拟交互组件**
   所有交互面板必须通过 scene-skill 组件渲染。

2. **NEVER 输出前不跑三选一判定**
   每次回复前分类：① 纯解释 ② 组件渲染 ③ 数据写回（callAction 闭环）。

3. **NEVER 不读 demo 就造 mock**
   调 scene-skill 前必读 `.claude/skills/scene-skill/components/{componentId}/demo.json`
   （该组件全部 actionType 的 mock 拦截规则表，不是渲染数据）。

4. **NEVER 收到"不对"反馈直接打补丁**
   先逐字段比对 demo.json 里对应 actionType 规则的 `response.data`，明确根因后再修；
   业务数据由组件自己 `callAction('get_init_data', ...)` 拉取，不是 agent 传入的。

5. **NEVER 跨 step 选错组件**
   agent 必须维护当前 step，只从当前步骤白名单内选 componentId。

## 1. 你是谁 + skill 结构

你是 {业务名称} chat agent，负责 {业务描述} 工作流的交互组件渲染与用户引导。

**核心能力全部由 skill 提供**，agent 是中间编排者：

- 交互组件渲染 → `scene-skill`（`.claude/skills/scene-skill/`）
- 数据写回 → 组件内 `callAction` 触发 backend 闭环

## 2. Stage 状态机

| stageId | idx | 中文 | 当前任务 | 允许 componentId |
|---------|-----|------|---------|-----------------|
| `stage-a` | 1 | {阶段A名} | {阶段A描述} | `{componentId1}` |
| `stage-b` | 2 | {阶段B名} | {阶段B描述} | `{componentId2}` |

**actionType → stage 映射** (源 = `flow.json` `transition.actionTypeMap`):

| actionType | 目标 stageId |
|------------|--------------|
| `{exitActionType}` | `stage-b` |
| `{exitActionType2}` | `done` |
| `go_back` | `stage-a` |

## 3. 输出决策

### 三选一判定（输出前必跑）

| 类别 | 用户意图 | 输出形式 |
|------|---------|---------|
| **①** | 纯解释 / 流程说明 | chat 文字 |
| **②** | 工作流推进 | scene-skill 组件渲染 |
| **③** | 组件内 callAction | 等 backend agentPrompt 后推下一 step |

### 调用 scene-skill

```bash
# 编译 UI 骨架即可, 不需要组装业务 data (组件 mount 后自己 callAction 拉数据)
# ⚠️ 输出文件名必须是 {componentId}_<后缀>.html, 下划线分隔, 见下方铁律
python3 .claude/skills/scene-skill/compile.py \
  --component {componentId} \
  --output artifacts/{componentId}_$(date +%s%3N).html
```

### conclusion 输出格式（CRITICAL）

compile.py 成功后，最终 conclusion 的 content 必须且只能是一行纯 JSON：

```json
{"componentType":"html-component","content":"artifacts/{componentId}_<后缀>.html"}
```

**⚠️ artifact 文件名铁律**（前端「测试」对话检测到 html-component 后，**只靠文件名解析
componentId** 来联动中间预览跳到正确的步骤/组件，命名错误会导致跳转失效或跳错）：

- 文件名必须是 `{componentId}_<任意后缀>.html`，`{componentId}` 是本 project
  flow.json / actions.json 里注册的真实 componentId 原文（不缩写、不改写）
- componentId 与后缀之间**必须用下划线 `_`**（不能用 `-`，会导致解析歧义）
- 详见 `.claude/skills/build-skill/references/06-component.md` §九

## 4. 文件系统布局 (运行时视角, 主对话 agent 看到的)

> ⚠️ 以下是 **project 部署后, 主对话 agent 在生产环境的 CWD** (scene-skill 被挂载到
> `.claude/skills/scene-skill/**`, 只读). 而**你** (场景搭建编辑 agent, 正在写这份
> CLAUDE.md) 的 CWD 是**工作副本根**: 你在根下直接 Write `CLAUDE.md` +
> `skills/scene-skill/**` (白名单), 由 backend 保存为产出. 两者布局别混淆.

```
cwd/                            ← 主对话 agent 运行时 CWD
├── .claude/
│   ├── CLAUDE.md               ← 本文件 (主对话 agent 人设)
│   └── skills/
│       └── scene-skill/        ← 项目 skill (只读)
├── uploads/
│   └── _draft/{month}/         ← ⚠️ 占位, 项目维护者按实际部署契约填充
│       ├── state-mirror/       ← backend mirror 写入的状态文件 (常见位置)
│       └── slots/              ← 用户上传的原始文件 (常见位置)
└── artifacts/                  ← 编译后 HTML 输出
```

## 5. 组件 × actionType 名单

| componentId | 支持的 actionType |
|-------------|-----------------|
| `{cid1}` | `{action1}` / `{action2}` |
| `{cid2}` | `{action3}` |
```

### 行为规则怎么写 (rev8: 放 CLAUDE.md 里, 别单开 rules/)

若需要为主对话 agent 制定行为规则 (输出判断 / 降级处理 / 流程路由), rev8 白名单
不含 `rules/`, 请直接**追加到 project 的 `CLAUDE.md`** 里, 作为独立
段落. 例如:

```markdown
## 行为规则

### 输出判定
1. ...

### 降级处理
1. ...
```

未来 rev8 放宽白名单后可考虑抽离到 `rules/*.md` (届时更新本规范).

---

## 用户调整场景细节

当用户已有场景基础，需要微调时：

### 新增 action

1. 确认新 action 的 **8 字段**：componentId / actionType / 触发说明 / handler / userMessage / triggerHint / allowWhen / 前端行为
2. 在 `actions.json` 对应 componentId 下追加 action 配置
3. 同步更新 `SKILL.md` 里的 callAction 速查表
4. 同步更新 `CLAUDE.md` 里的组件 × actionType 名单
5. 若新 action 触发新 step 转移，同步更新 `flow.json`
6. 同步在同目录 `demo.json` 里补一条 `match.actionType` 对应该新 action 的 mock 规则 (否则预览态点这个按钮会真的打空 fetch)

### 修改组件模板

1. 只修改 `components/{componentId}/template.html` 里的 `<script>` 逻辑
2. 不改 CSS / HTML 结构（避免破坏布局）；样式使用 frame/scene-tokens.css CSS 变量，不写十六进制色值字面量
3. 若组件消费的接口字段有变 (新增/删减 `handlerResults` 里的字段) → 同步更新同目录的 `schema.json` (接口响应体契约) + `demo.json` (对应 mock 规则的 response)

### 新增算法脚本

1. 在 `scripts/` 下新建 `run_{name}.py`，遵循标准结构
2. 在 `actions.json` 里引用新脚本（type: "script", path: "scripts/run_{name}.py"）
3. 补充 `references/` 下的算法文档

---

## 上传 / 发布 / 试跑 (rev8: 全部走 UI, agent 不做)

场景文件 Write 到 `skills/scene-skill/**` 后, agent 的活就完了.
剩下的运维操作**由用户在 UI 上点按钮完成**, agent **不**去调 CLI / HTTP / SSOID:

| 用户想做           | UI 操作                                        | 说明                                    |
| ------------------ | ---------------------------------------------- | --------------------------------------- |
| 保存当前工作副本   | (自动)                                         | 编辑结果由 backend 自动持久化为产出, 测试对话/文件面板可见 |
| 打个快照备份       | 顶栏 **[打草稿]** → 填备注                     | 走 `POST /scene-builder/draft/create`   |
| 查看历史草稿       | 顶栏 **[草稿列表]**                            | 走 `GET /scene-builder/draft/list`      |
| 回退到某版本       | 抽屉内 **[恢复到工作副本]**                    | 走 `POST /scene-builder/draft/restore`  |
| 真机模拟主对话验证 | 切到 **🧪 测试** 对话面板                       | 独立挂 zone-mount, 不落 zone            |
| 发布到线上生产版   | 抽屉底部 **[发布当前工作副本到线上]** (owner)   | 走 `/gateway/promote/workspace` mirror  |

Agent 需要做的: **告诉用户去点哪个按钮**, 而不是自己去代做.

---

## Hard Rules

1. **目录结构严格遵守规范** — scene-skill 固定命名，不得随意创建其他 skill 目录
2. **actions.json 放 scene-skill 根目录** — 不放 config/，与现有旧项目结构区分
3. **script 类型替代 call 类型** — 业务算法统一走 script handler，不依赖后端内置 method
4. **CLAUDE.md 放项目根目录** — 不放 config/ 下
5. **一次只推进一个阶段** — 每个阶段产出物让用户确认后再进下一阶段
6. **不代替用户拍板** — 需求不明确时一次性追问，等用户确认才继续
7. **模板变量用 {占位符} 标注** — 产出的配置文件中未确定的字段用 `{描述}` 占位，明确说明需用户替换

---

## 规范细则 (references/) + 自动化校验 (scripts/)

场景搭建规范拆到 `references/` 10 篇细则文档 + `scripts/` 17 个校验脚本 + `run_all.py`
一键跑全套. **每次 Write / Edit 后都要自查**, 见 CLAUDE.md 铁律 8.

**backend 能力探测** (对齐 backend 最新可用 handler / method / validator): 不确定用
什么时先查 backend, 别照 references 硬猜, 详见 CLAUDE.md 铁律 12.

```bash
# handler.type / validator / 变量语法全清单
curl -s https://ba-ai.bi.test.sankuai.com/budget-chat/api/dev/config-capabilities | jq '.data'

# call handler 可用的 method 名 + params keys
curl -s https://ba-ai.bi.test.sankuai.com/budget-chat/api/dev/available-methods    | jq '.data.methods'
```

请求失败 (网络 / 5xx / jq 缺失) **不阻断流程**, 按 references 现有列表继续.

### references/ 10 篇细则

按需 Read (agent 遇到不确定时查):

| 文件                       | 涵盖规则                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| `01-scope.md`              | SCENE_BUILDER_PATHS 白名单 + paths-matcher 三档语义 + 目录布局    |
| `02-actions-shape.md`      | actions.json 字段规范 + handler.type 白名单 + allowWhen 白名单 + read_state / marker / 空 handlers |
| `03-agent-prompt.md`       | agentPrompt `[TRIGGER:NAME k=v ...]` 语法 (纯语法校验, NAME 由 project 自维护) |
| `04-pipeline.md`           | 多 handler pipeline + value_from 引用规则 + template 插值语法 + handler.input preload + patch_state 动态 key |
| `05-flow.md`               | flow.json stages / transition.actionTypeMap / fileMeta 规范      |
| `06-component.md`          | 三件套 + ACTION INTERFACE 注释块 + callAction 调用 + iframe 禁用 + SceneFrame API + compile.py SOP + artifact 命名铁律 (前端联动依据) |
| `07-script-contract.md`    | backend-facing vs agent-facing 双入口 + docstring 三段 + 沙箱边界 + timeout 分级 |
| `08-templates.md`          | scene-skill 模板起点 (empty / minimal / typical / clone) 分档 SOP |
| `09-diagnosis.md`          | 用户报问题的 3 类症状 + 固定排查路径 + 对应 check_*.py            |
| `10-state-mirror.md`       | state-mirror 目录约定 + 命名 + write vs patch 判断树 + **对话过程产出数据落盘路径** + 生命周期 |

### scripts/ 17 个校验 + run_all

跑单个 check:
```bash
python3 .claude/skills/build-skill/scripts/check_scope.py --workspace . [--json]   # 在工作副本根 (= CWD) 下执行
```

跑全套 (推荐 CI + Write 后自查用):
```bash
python3 .claude/skills/build-skill/scripts/run_all.py --workspace . [--json]   # 在工作副本根 (= CWD) 下执行
```

Exit code: 0=pass, 1=warn, 2=fail. `--fail-on warn` 让 warn 也 exit 2 (发布场景更严).

**17 个 check 分类**:

| 类别 | 脚本                                | 拦什么                                    |
| ---- | ----------------------------------- | ----------------------------------------- |
| A 结构 | check_scope                       | 文件超白名单 → warn                       |
|       | check_layout                        | 目录布局 (rev7 rules/agents/ 残留) → warn |
|       | check_meta                          | actions.json._meta.projectId 字段规范     |
|       | check_script_exists                 | script handler.path 存在 + 孤儿脚本 warn  |
|       | check_component_registered          | actions/flow/components 三方一致          |
|       | check_placeholders                  | 文件里 `{占位符}` 未替换 → warn            |
|       | check_project_claude                | project CLAUDE.md 结构 (铁律 / 状态机等)   |
|       | check_frame_assets                  | compile.py 老版 → fail; frame/*.css/js 缺失或与标杆 diff → warn; 支持 `--auto-fix` |
| B 内容 | check_action_shape                | handler.type / allowWhen / 必填字段       |
|       | check_agent_prompt                  | agentPrompt `[TRIGGER:...]` 语法 (纯语法, NAME 由 project 自维护) |
|       | check_pipeline_refs                 | value_from `results.<id>` 引用有效        |
|       | check_flow_transition               | flow.json 结构 + transition.actionTypeMap |
|       | check_state_ui_fanout               | write_state 无 UI 消费 → warn 死数据       |
| C 组件 | check_component_triad             | 三件套齐 + schema/demo 一致               |
|       | check_action_interface_super        | template ACTION INTERFACE ⊇ actions.json  |
|       | check_no_forbidden_ui               | alert/confirm/prompt/硬编码色/URL 禁用    |
|       | check_script_contract               | docstring 三段 + main block + 沙箱边界    |

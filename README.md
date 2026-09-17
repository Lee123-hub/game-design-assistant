# 游戏设计助手（Game Design Assistant）

本地运行的 AI 游戏设计工作台：接入 LLM（默认 DeepSeek，支持任意 Anthropic / OpenAI Responses 协议兼容端点），由 5 类专职 agent 按 SOP 引导你从一句想法走到一套可开发的策划文档包 + 可玩的 HTML 原型。

> [!WARNING]
> **本项目仍在积极开发中**：功能、配置格式与数据结构可能随时变更，不保证向后兼容；可能存在未发现的 bug。请勿在生产环境使用，欢迎提交 Issue / PR。

## 功能特性

### 流程与编排

- **SOP 流程编排**：5 个专职 agent 按依赖自动解锁 —— **引导收集 → HTML 原型 → 详细设计 → 数值分析 → 玩家评估**；每个步骤可独立运行、重跑、终止，重跑互不干扰
- **依赖解锁 + 并行**：步骤间用 `dependsOn` 声明解锁门控；玩家画像各步骤之间无依赖，多画像评估可并行执行
- **断线与并发可控**：服务端持有运行注册表（按项目隔离），最大并发运行数可配置

### 引导收集

- **对话式访谈**：围绕概念 / 竞品 / 目标用户 / 核心循环 / 商业模式逐项提问，回答自动落盘为访谈记录
- **不替用户作答**：访谈中 agent 只给建议、保留决策权，绝不代拟用户答复（提示词约束 + 引擎级兜底 + 输出清洗三层保障）
- **联网竞品调研**：竞品步骤自带 WebSearch，现场检索公开资料并产出分析报告
- **一页纸概念案**：汇总全部访谈，生成 One-pager 作为下游统一输入

### 原型与设计

- **HTML 可玩原型**：直接产出单文件 HTML 游戏，在 `sandbox` iframe 内嵌试玩；**全屏预览支持 ← / → 键盘切换**该步骤的历史版本（含 `n / N` 位置指示，切换时保持全屏）
- **模块详细设计**：玩法逻辑 / 交互 / 音频表现等逐模块展开，可选用子 agent 做逻辑闭环与可读性复查
- **模块 UI 原型**：逐模块产出静态展示 HTML，面板内按模块分组、版本递增管理
- **CSV 配置表**：属性与数值配置表，应用内渲染为可编辑表格（枚举列下拉、数字列直填）

### 数值与评估

- **数值定性访谈**：先确认目标体验 / 节奏 / 付费深度等口径，再进入定量计算
- **脚本化数值计算**：经济模型与养成曲线的核心数字必须在工作区 `scripts/` 写零依赖 node 脚本计算，文档数字与脚本输出保持一致
- **玩家画像评估**：内置预设画像 + 自定义画像，可粘贴竞品资料注入上下文；最后汇总为一份玩家总结报告

### 产物与交付

- **版本化产物**：每次生成的产物按「名称 + 时间戳」落盘，最新一个即当前版本，历史版本可回溯查看
- **重跑安全**：重跑生成类 / 访谈类步骤前自动备份当前产物到 `.backups/<stepKey>/<时间戳>/`，确认弹窗会提示上次耗时
- **一键交付包**：把各步骤最新版本产物打包为 zip 下载；**中文文件名安全** —— 下载文件名用 RFC 5987 双 `filename` / `filename*`，zip 条目名全部 ASCII 化，并在包内 `README.md` 给中文原名 ↔ 条目名对照表

### 体验与配置

- **实时流式 UI**：token 级流式输出（按输出段分块）、思考与工具调用活动指示、SSE 断线重连自动恢复快照；步骤卡片展示上次耗时与 token 消耗
- **双引擎可切换**：`anthropic` = Claude Agent SDK（Claude Code CLI 子进程）；`openai-responses` = OpenAI Responses 协议（Codex SDK 子进程）
- **细粒度可配置**：全局默认模型 + 按步骤覆盖（模型 / 系统提示词 / 可用工具集 / maxTurns）；默认禁用 Agent 工具
- **外挂技能包**：上传 zip 形式的技能包，可按 agent 级或步骤级挂载
- **项目管理**：侧栏搜索、进度概览、项目级玩家画像与交付包入口

## 技术栈

- **Server**：Node.js 20.19+ / TypeScript / Express 5 / `@anthropic-ai/claude-agent-sdk` + `@openai/codex-sdk`（双引擎）/ archiver（zip 打包）
- **Web**：React 19 + Vite + zustand + react-markdown
- **共享类型**：npm workspaces 单仓三包（`packages/shared`）

## 快速开始

```bash
npm install

# 配置 API Key（也可启动后在设置页填写，保存于 data/settings.json，权限 0600）
# DeepSeek 平台申请：https://platform.deepseek.com

npm run build
npm start
# 打开 http://localhost:8787
```

一键脚本（macOS / Linux 用 `./start.sh`，Windows 用 `start.cmd`）会自动检查 Node、安装依赖、构建前端并启动。

开发模式（前端热更 + 服务端 tsx）：

```bash
npm run dev
```

> 注意：`npm start` 由 8787 托管**已构建**的 `web/dist`，改动 `web/src/**` 后需重新 `npm run build` 才能在 8787 生效；开发模式请用 5173。

## 项目结构

```
├─ packages/shared/src/       # 三端共享类型
│  ├─ step.ts                 # StepState / StepMode / OutputKind / StepRecord / StepRunStat
│  ├─ registry.ts             # AgentDef、StepDef、PROMPT_FILES
│  ├─ project.ts              # 项目元数据与玩家画像
│  ├─ settings.ts             # 设置、提供方、协议格式、工具候选清单
│  ├─ sse.ts / api.ts         # SSE 事件协议与 HTTP 接口类型
│  ├─ intent.ts               # 提问 / 生成意图判断（提问走回答模式）
│  └─ moduleUi.ts             # 模块 UI 原型文件名解析
├─ server/src/
│  ├─ index.ts                # 服务入口（监听 8787）
│  ├─ config.ts               # 端口与 data/ 目录常量
│  ├─ http/                   # Express 应用
│  │  ├─ app.ts               # 中间件 + 托管 web/dist
│  │  ├─ sse.ts               # 项目事件流端点
│  │  └─ routes/              # projects / steps / agents / settings / skills / prototype / deliverables
│  ├─ orchestrator/           # 编排层
│  │  ├─ orchestrator.ts      # runStep 主线（生成 / 访谈两条路径、落盘、备份）
│  │  ├─ runner.ts            # 运行注册表与步骤状态持久化
│  │  ├─ contextBuilder.ts    # dependsOn / contextDeps 上游产物注入
│  │  ├─ workspace.ts         # 工作区简报、CLAUDE.md、产物写入要求、意图判断
│  │  ├─ eventBus.ts          # 按项目的事件总线
│  │  └─ semaphore.ts         # 并发限流
│  ├─ registry/index.ts       # agent 与 step 注册表（SOP 定义）
│  ├─ sdk/                    # LLM 引擎封装
│  │  ├─ client.ts            # Anthropic 引擎（claude-agent-sdk）
│  │  ├─ codexClient.ts       # OpenAI Responses 引擎（codex-sdk）
│  │  ├─ engineTypes.ts       # 引擎统一返回类型
│  │  ├─ env.ts / inputQueue.ts / usage.ts
│  ├─ store/                  # 持久化（落在 data/）
│  │  ├─ projectStore.ts / projectMutations.ts
│  │  ├─ artifactStore.ts     # 版本化产物读写、重跑备份、文件清单
│  │  ├─ exportStore.ts       # 交付 zip 打包（中文名适配）
│  │  ├─ sessionStore.ts      # 访谈会话记录
│  │  ├─ settingsStore.ts / skillStore.ts / promptStore.ts / runLog.ts
│  │  └─ paths.ts
│  ├─ prompts/*.md            # 各步骤内置提示词与硬性约束（UI 规范、数值 SOP 等）
│  └─ util/                   # fs / text 辅助
├─ web/src/                   # React 前端
│  ├─ App.tsx                 # 侧栏 + 项目列表 + 全局弹窗 / toast
│  ├─ components/
│  │  ├─ ProjectView.tsx      # 阶段栏 → 步骤 chips → 聊天工作区
│  │  ├─ StepChat.tsx         # 对话流、预置 query、重跑确认、消耗统计
│  │  ├─ ArtifactViewer.tsx   # 产物查看（markdown / html / csv）
│  │  ├─ ModuleUiPanel.tsx    # 模块 UI 原型分组与预览
│  │  ├─ CsvTable.tsx         # CSV 可编辑表格
│  │  ├─ PlayersPanel.tsx     # 玩家画像管理
│  │  ├─ DeliverablesPanel.tsx# 交付包下载
│  │  ├─ SettingsDialog.tsx / ConfirmDialog.tsx / icons.tsx
│  ├─ store/useAppStore.ts    # zustand 全局状态
│  ├─ api/                    # HTTP 客户端 + SSE 连接
│  └─ theme.ts / styles.css
├─ data/                      # 运行数据（gitignored，含密钥）
│  ├─ settings.json           # 设置（含 API Key，0600）
│  ├─ skills/<name>/          # 上传的外挂技能包
│  ├─ codex-home/             # Codex 引擎的 CLI home（openai-responses 协议时使用）
│  └─ projects/<id>/          # 单个项目工作区（见下）
├─ start.sh / start.cmd       # 一键安装 + 构建 + 启动
└─ package.json               # workspaces 根（dev / build / start / typecheck）
```

### 单个项目工作区（`data/projects/<id>/`）

```
project.json                             # 项目元数据：名称、想法、各 step 状态、玩家画像、竞品资料（程序管理）
CLAUDE.md                                # 给 agent 的项目文档说明（各 agent 共同维护）
steps/<agentId>/<stepId>.<时间戳>.md      # 各步骤产物（markdown；CSV 步骤另有 config-tables*.csv + 说明.md），按时间倒序「最新一个即当前版本」
prototypes/<stepId>.<时间戳>.html         # HTML 可玩原型版本文件
prototypes/ui/<模块名>-v<N>-<时间戳>.html  # 模块 UI 原型（每模块一页，版本递增）
deliverables/                            # 历史遗留交付文档（旧流程产出；现交付包由程序直接打包下载）
scripts/                                 # 数值计算脚本（node 工作文件，非产物）
runs/<runId>.jsonl                       # 每次运行的原始日志（程序管理）
sessions/<agentId>__<stepId>.json        # 访谈会话记录（程序管理）
.backups/<stepKey>/<时间戳>/             # 重跑前自动备份的上一版产物
```

## 安全说明

- `data/`（含 `settings.json` 中的 API Key、项目数据、技能包）已被 `.gitignore` 排除，不会进入版本库
- 服务端日志与 SSE 事件均不含密钥；设置接口返回时对 apiKey 脱敏
- HTML 原型在 `sandbox="allow-scripts"` iframe 中运行，无法访问父页面

## License

[MIT](./LICENSE)

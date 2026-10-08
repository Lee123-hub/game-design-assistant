# MIGRATION — 从 Web 应用到技能集合

**版本**：v2.0
**日期**：2026-10-08

---

## 一句话说明

v1.x 是一个本地 Web 应用（AI 游戏设计工作台），v2.0 把它拆成**纯技能集合**：移除全部运行时代码，只保留可被任意 Agent 加载的 SKILL.md + 参考文档。

原应用完整保留在 `main-backup` 分支。

---

## 为什么做这次改造

| 维度 | v1.x Web 应用 | v2.0 技能集合 |
|---|---|---|
| **分发** | 需要 clone + `npm install` + 起服务（Node 依赖树 11994 个文件） | clone 即用，或直接拷 `skills/` 目录 |
| **入口** | 只能通过 http://localhost:8787 的 Web UI | 任意支持 SKILL.md 的 Agent（Claude Code / Cursor / WorkBuddy / Codex） |
| **引擎绑定** | 双引擎（Anthropic Agent SDK / OpenAI Responses），需配置 API 端点 | 无 —— 由宿主 Agent 决定 |
| **成本** | 常驻进程 + LLM token 消耗 | 零常驻成本，用到哪个技能加载哪个 |
| **可审计** | 流程藏在 `registry/index.ts` 的编排代码里 | 流程与门禁写在 `game-design-workflow/SKILL.md`，人可直接读 |

**核心判断**：这套流程的真正资产是**方法论**（访谈铁律、数值 SOP、UI 文案规范、模块详设模板），而不是编排界面。把方法论锁在一个 Web 应用里，等于把可复用的知识变成了单一产品的私有实现。

---

## 移除的内容

共 88 个版本控制文件：

| 路径 | 说明 |
|---|---|
| `server/` | Express 服务、5 类 agent 编排、步骤注册表、产物存储、双引擎 SDK 封装（36 个 TS 文件） |
| `web/` | React 前端：项目侧栏、步骤卡片、全屏原型预览器、设置面板（12 个 TSX/TS 文件） |
| `packages/shared/` | 前后端共享类型（registry / project / step / settings 等 10 个 TS 文件） |
| `package.json` `package-lock.json` `tsconfig.base.json` | 构建与依赖配置 |
| `start.sh` `start.cmd` | 启动脚本 |

依赖树（`node_modules/`，11994 个文件）随之移除 —— 这是 v1.x 最大的负担来源。

---

## 保留与重塑的内容

### 13 个 prompt 文件 → 8 个技能

原来的 prompt 是「注入给 LLM 的系统提示词」，与编排代码耦合。改造时按游戏设计模块重新聚合，每份 prompt 的知识内容**全部保留**，但重写为 Agent 可直接执行的技能指令。

| 原 prompt | 归入技能 | 处理方式 |
|---|---|---|
| `guide-conversational.md` | `concept-interview` | 拆出 5 个访谈主题；「竞品特别要求」独立成节 |
| `guide-one-pager.md` | `concept-interview` | 保留输出模板，补自检清单 |
| `prototype-html.md` | `html-prototype` | 全文保留，补验证结论要求 |
| `design-module.md` | `module-design` | 全文保留，补覆盖度自检 + 上下游衔接约定 |
| `numeric-interview.md` | `numeric-balance` | 合并进「第一步：口径访谈」 |
| `numeric-sop.md` | `numeric-balance/references/` | **全文 222 行原样保留**，作为方法论 references |
| `numeric-economy.md` | `numeric-balance` | 合并进「第二步」 |
| `numeric-progression.md` | `numeric-balance` | 合并进「第三步」 |
| `ui-design-constraints.md` | `ui-design/references/` | **全文 231 行原样保留**，作为硬性规范 references |
| `module-ui.md` | `ui-design` | 全文保留，模块清单提取规则强化 |
| `design-config-tables.md` | `config-tables` | 全文保留，补表拆分原则 |
| `player-eval.md` | `player-review/references/` | 原样保留为评估模板 |
| `player-summary.md` | `player-review/references/` | 原样保留为总结模板 |

### 新增：总控技能

`registry/index.ts` 里的阶段依赖、上下文注入、解锁门控逻辑，是 v1.x 编排的核心价值。v2.0 把它重写为**人可读、可审计的文档**：`game-design-workflow/SKILL.md` 里的阶段依赖表、推进判断、7 道质量门禁。

原代码里的隐性知识也一并显式化，例如：

- 「原型必须早于详设」的理由（原为代码里的 `dependsOn` 顺序）
- 跳过各阶段的后果对照表（原隐含在编排顺序中）
- 常见用户说法 → 走哪个阶段的分发表（原为 UI 侧栏）

### 新增：通用铁律

原代码中分散在各处的硬约束（不代答三层保障、口径冲突处理、数字自洽、版本化命名）被提炼为 `game-design-workflow/SKILL.md` 的「通用铁律」7 条，**优先级高于任何阶段技能**。

### 迁入的既有技能

| 技能 | 来源 |
|---|---|
| `roguelike-design-architect` | `data/skills/`（原未纳入版本控制） |
| `build-skill` | `data/skills/`（原未纳入版本控制，含 20 个 Python 校验脚本） |
| `kenney-ui-art-replacer` | `skill-build/`（含 2 个抓取脚本） |

---

## 一处行为变更：数值计算的落地方式

**v1.x**：`numeric-balance` 步骤要求「在工作区写零依赖 node 脚本计算」（硬性要求，产出 `scripts/*.mjs`）。

**v2.0**：保留「核心数字必须脚本计算」的要求，但**不附带脚本**。使用者按 `references/numeric-design-sop.md` 的公式（TTK、Source/Sink 流量、Marginal/Growth、敏感性分析）在自己的项目里写脚本即可。

这样处理的原因：技能集合不应假定宿主环境有 Node 运行时，也不该把一次性的计算脚本固化在仓库里。**方法论（公式与 SOP）比脚本更需要被保留。**

---

## 使用方式的变化

| | v1.x | v2.0 |
|---|---|---|
| 启动 | `./start.sh` 或 `npm run dev` | 无需启动 |
| 操作 | 打开 http://localhost:8787 | 直接对 Agent 说需求 |
| 配置模型 | 设置面板配 API 端点 | 用宿主 Agent 自己的模型 |
| 产物位置 | `data/projects/<pid>/` | `specs/<project>/`（自定） |
| 版本回溯 | 应用内切换历史版本 | 文件名 `-v<N>` + git |

原路径 `data/projects/<pid>/steps/<agentId>/` 的版本化命名规则，已在 `game-design-workflow/SKILL.md` 的「产物落盘约定」中以 `名称-v<N>.<ext>` 的形式保留。

---

## 回滚方式

需要回到 Web 应用形态：

```bash
git checkout main-backup
```

或从远程拉取：

```bash
git fetch origin main-backup
git checkout main-backup
```

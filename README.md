# 游戏设计技能集合（Game Design Skills）

一套面向 AI 编码 Agent 的**游戏设计技能集合**。用 Spec-Kit 风格的项目文档串联能力，把一句模糊想法推进到一套可开发的策划文档包 + 可玩原型。

技能可被 Claude Code、Cursor、WorkBuddy、Codex 等任意支持 SKILL.md 约定的 Agent 直接加载，**不依赖任何运行时代码或后端服务**。

---

## 快速开始

1. 把 `skills/` 目录安装到你的 Agent 技能目录（见下方「安装」）。
2. 在项目中准备一个设计目录，约定为 `specs/<project-name>/`。
3. 对 Agent 说「用 game-design-workflow 帮我做一款 XX 游戏」，总控技能会判断当前阶段并调度对应阶段技能。

也可以跳过总控，直接调用任一阶段技能（如「用 numeric-balance 定数值」）。

---

## 技能总览

### 主干：游戏设计流程（7 个）

| # | 技能 | 做什么 | 核心产物 |
|---|---|---|---|
| 00 | **game-design-workflow** | 总控：阶段判断、依赖门禁、质量校验、产物落盘约定 | 流程编排 |
| 01 | **concept-interview** | 一问一答访谈收集概念/竞品/用户/循环/商业模式 | 访谈记录、一页纸概念案 |
| 02 | **html-prototype** | 单文件 HTML 可玩原型，验证核心循环成立 | `prototype.html` |
| 03 | **module-design** | 模块详细设计（逻辑/交互/音频/异常）+ 子 agent 复查 | `module-design.md` |
| 04 | **numeric-balance** | 数值口径访谈 → 经济模型 → 养成曲线 | 经济数值模型、养成曲线 |
| 05 | **ui-design** | 逐模块静态 UI 原型 + UI 文案硬性规范 | `<模块名>-v<N>.html` |
| 06 | **config-tables** | CSV 属性数值配置表 + 说明文档 | `*.csv`、`config-tables.md` |
| 07 | **player-review** | 多 persona 玩家评估 + 横向归并总结 | 各画像评估、总结报告 |

### 专项：领域与工具（4 个）

| 技能 | 做什么 |
|---|---|
| **roguelike-design-architect** | 肉鸽/Roguelite 的九层设计模型：构筑身份、受控随机、风险回报循环 |
| **build-skill** | Web 场景生产规范：S0-S6 七阶段流程、场景 skill 文件模板、20 个校验脚本 |
| **kenney-ui-art-replacer** | Godot 项目 UI/美术素材替换：风格解析 → Kenney CC0 选材 → 原地替换 |
| **canvas-design** | 海报 / 单张视觉产出（Python + PIL 程序化绘制） |

---

## 流程依赖

```
① concept-interview  概念与立项
        │  访谈记录、一页纸概念案
        ▼
② html-prototype     核心循环可玩原型
        │  单文件 HTML 原型
        ▼
③ module-design      模块详细设计
        │  模块详细设计文档
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
④ numeric-balance  ⑤ ui-design   ⑥ config-tables
   经济数值模型      模块 UI 原型     CSV 配置表
        │              │              │
        └──────────────┴──────┬───────┘
                               ▼
                    ⑦ player-review  玩家视角评估
                               │
                               ▼
              玩家总结报告 → 修订清单 → 回流 ③④
```

**为什么不能跳阶段：** 每个阶段都对应一类「事后补救成本远高于事前验证」的失败模式。

| 跳过 | 后果 |
|---|---|
| 跳过 ① | 大量设计决策建立在未确认的假设上 |
| 跳过 ② | 核心循环不成立时，详设越详细浪费越大 |
| 跳过 ⑥ | 数值模型失去口径来源，全靠拍脑袋 |
| 跳过 ⑦ | 没人从玩家视角挑毛病 |

每个阶段的详细依赖与门禁清单见 `skills/game-design-workflow/SKILL.md`。

---

## 通用铁律

以下规则在所有阶段生效，**优先级高于任何阶段技能里的要求**：

1. **不替用户作答** —— 访谈中严禁虚构或补全用户的回答（详见 `concept-interview`）
2. **数字必须能算出来** —— 不接受「大概」「感觉」，给出计算过程
3. **口径冲突必须显式指出** —— 不静默选一个，要指出冲突并给取舍建议
4. **不虚构外部事实** —— 竞品与市场数据必须实际检索并注明来源
5. **一次只问一个问题** —— 附 2~3 个示例选项降低回答难度
6. **产物写文件，不贴聊天框** —— 聊天回复只给一句话完成说明
7. **全程中文** —— 术语非必要不用英文

---

## 项目文档约定

产物统一落盘，与对话上下文分离：

```
specs/<project-name>/
├── 01-concept/     访谈记录、一页纸概念案
├── 02-prototype/   可玩原型
├── 03-design/      模块详细设计、数值模型、养成曲线
├── 04-ui/          逐模块 UI 原型
├── 05-data/        配置表 CSV + 说明文档
└── 06-review/      玩家评估 + 总结报告
```

同名产物多次生成时用 `名称-v<N>.<ext>` 递增，最新版本即当前版本，历史版本保留以便回溯对比。

---

## 安装

### Claude Code / WorkBuddy

将整个仓库的 `skills/` 子目录内容拷入项目的技能目录，或使用软链接：

```bash
ln -s /path/to/game-design-assistant/skills ./skills
```

### Cursor

把需要的技能目录放进 `.cursor/rules/` 或项目技能目录，Cursor 会在匹配描述时自动加载。

### 通用 Agent（任意支持 SKILL.md 约定）

把 `skills/<skill-name>/` 作为技能包注册即可。技能目录结构：

```
skills/<skill-name>/
├── SKILL.md        技能定义（YAML frontmatter: name / description）
├── references/     参考文档（按需读取，不占常驻上下文）
├── scripts/        可执行脚本（可选）
└── frame/          模板 / 素材（可选）
```

**为什么用 `references/` 分层**：SKILL.md 保持精简，详细方法论、数据表、规范全文放在 references，Agent 按需读取，避免每次都把全部文档塞进上下文。

---

## 目录结构

```
.
├── skills/                       技能集合
│   ├── game-design-workflow/     00 总控编排
│   ├── concept-interview/        01 概念与立项
│   ├── html-prototype/           02 可玩原型
│   ├── module-design/            03 模块详细设计
│   ├── numeric-balance/          04 数值与平衡
│   │   └── references/
│   │       └── numeric-design-sop.md    数值 SOP 全文（六关键词：目标/锚点/预算/分布/反馈/迭代）
│   ├── ui-design/                05 UI 设计与文案
│   │   └── references/
│   │       └── ui-copy-constraints.md   UI 文案硬性规范全文
│   ├── config-tables/            06 CSV 配置表
│   ├── player-review/            07 玩家视角评估
│   │   └── references/
│   │       ├── persona-eval-template.md
│   │       └── summary-report-template.md
│   ├── roguelike-design-architect/   专项：肉鸽设计
│   ├── build-skill/                  专项：Web 场景生产
│   └── kenney-ui-art-replacer/       专项：Godot 素材替换
├── docs/                         设计文档
│   └── godot-art-replacer-design.md   素材替换 skill 设计稿
├── examples/                     示例项目
├── LICENSE
└── README.md
```

---

## 演进

本仓库 v1.x 是一个本地运行的 Web 应用（AI 游戏设计工作台，含 `server` / `web` / `packages` 三包，共 88 个源文件）。**v2.0 起移除全部运行时代码**，只保留技能集合 —— 因为这套流程的价值在方法论，不在编排界面。迁移细节见 `docs/MIGRATION.md`。

原 Web 应用形态完整保留在 `main-backup` 分支。

## License

MIT，见 [LICENSE](LICENSE)。

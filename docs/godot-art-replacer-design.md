# Godot 几何体占位符 → AI 素材一键替换 Skill 设计文档

版本：v0.1（设计稿，待评审）
日期：2026-09-18
状态：**设计阶段，未实现**

---

## 1. 背景与目标

### 1.1 用户既定工作流

```
几何原型阶段                     素材替换阶段
──────────────                   ──────────────
ColorRect / Panel / _draw()  →   真实贴图 / 主题 / 动效
PlaceholderTexture2D             九宫格 / SpriteFrames
Label 硬编码文案                 自绘资源 / 粒子
   ↓ 玩法与布局验证通过               ↑ 本 skill 的起点
```

原型期**刻意不使用任何图片素材**，全部用 Godot 原生几何体表达。玩法、布局、交互确认无误后，才进入素材替换。当前这一步是纯手工的，且项目里已经积累了 334 个 `art_source/` 文件，说明手工流程已经跑过很多轮——这正是要被自动化的对象。

### 1.2 目标

提供一个**本地运行的、AI 托管的** skill，实现：

1. **扫描**项目，识别所有几何体占位符与文案占位符
2. **分类**为可替换资产（图标 / 立绘 / 背景 / 面板贴图 / 特效 / 文案）
3. **按语义生成**生图提示词，调用可切换的生图 provider 出图
4. **后处理**为 Godot 可用格式（尺寸、九宫格边界、透明通道、图集）
5. **原地替换**节点类型并把场景写回
6. **可回退**——任何一步失败或效果不满意都能整体撤销

### 1.3 明确的非目标

- **不做**玩法逻辑生成
- **不做** UI 布局设计（布局已在原型期确定，本 skill 只换皮）
- **不做**美术风格的最终判定（用户定方向，AI 只执行）
- 首版**不支持 3D**（3D 的占位方案与 2D 差异过大，另立需求）

---

## 2. 现状勘察结论（基于 xiaJ8tou 实测）

> 实测样本：`~/Desktop/godotProject/xiaJ8tou`，440 个 `.gd`，`scenes/` 下大量独立 UI 场景

### 2.1 节点类型分布（全项目 tscn 统计）

| 节点类型 | 数量 | 在替换流程中的角色 |
|---|---:|---|
| `Label` | 843 | **文案占位**主要载体（如 `text = "需求占位"`） |
| `HBoxContainer` / `VBoxContainer` | 791 | 布局容器，**不替换** |
| `Control` | 193 | 抽象容器，**不替换** |
| `Button` | 165 | 主题换皮对象（非贴图） |
| `TextureRect` | 151 | **已是贴图**，多为图标位 |
| `PanelContainer` | 106 | 主题换皮对象 |
| `NinePatchRect` | 38 | **九宫格**，替换重点 |
| `ColorRect` | **18** | **纯色占位块**，替换重点 |
| `Sprite2D` | 10 | 世界空间精灵 |
| `TextureButton` | 3 | 贴图按钮 |

**关键洞察**：`ColorRect` 只有 18 个，但 `Label` 有 843 个。这意味着**这个项目的"占位"主要不是色块，而是文案与缺失贴图**。如果只盯着 `ColorRect` 做替换，会漏掉绝大多数实际工作量。

### 2.2 已存在的语义化命名约定（重要发现）

项目已经自发形成了**可被机器识别的占位命名**，这是自动化的直接抓手：

| 命名模式 | 实例 | 可推断的资产语义 |
|---|---|---|
| `*Placeholder` | `IllustrationPlaceholder` | 明确占位容器 |
| `BackgroundShade` | 出现在 7+ 个 `dice_tray_*.tscn` | 全屏遮罩 → 可换半透明贴图或背景图 |
| `EffectBeam` / `SkillBeam` | `combat_battlefield.tscn` 等 | 特效横条 → 光束贴图 |
| `InkPaper` | `flow_art_backdrop.tscn` | 美术底纹 → 纸张纹理 |
| `Vignette` | `clocktower_lower_environment.tscn` | 暗角 → 渐变压暗贴图 |
| `GroundProjection` | 同上 | 地面投影贴图 |
| `Base` | 同上 | 环境基底 |
| `text = "XX占位"` | `需求占位`/`效果占位`/`事件描述占位`/`经验进度占位` | 文案待填 → 需人工或按规则生成 |

### 2.3 已存在的资源寻址体系（双轨，设计难点）

**轨道 A — 直接引用**（占多数）
```
[node name="Icon" type="TextureRect" parent="..."]
texture = ExtResource("2")
```
tscn 内直接写 `ExtResource`，指向 `res://assets/...`。

**轨道 B — 资源库间接引用**
`resources/ui/dicehero/game_art.tres` 配合 8 行的 `scripts/ui/game_art_library.gd`：
```
[resource]
script = ExtResource("1")
icons = Dictionary[StringName, Texture2D]({
&"normal": ExtResource("2"),
&"portrait": ExtResource("18"),
...
```

**设计含义**：替换器必须**同时理解两条轨道**。只改 tscn 会漏掉资源库；只改资源库则无法覆盖直接引用。且轨道 B 是"语义键 → 贴图"的映射，**是自动生成的理想接口**——因为键名（`normal`/`elite`/`boss`/`portrait`）本身就是极好的生图提示词。

### 2.4 已有的目录约定

```
art_source/                    ← 素材"来源"层（AI 生成物、参考图）
├── imagegen/                  ← AI 生成结果（按主题+版本分目录）
│   ├── characters/  combat_ui_v2/  comic_flow_v2/  dice_faces_v3/
│   ├── hero_select_v6/  menu_v5/  level_01_clocktower/  ...
│   └── （目录名含 _v2/_v3/_v5/_v6 → 说明存在多轮迭代）
├── references/american_comic/ ← 风格参考（含 .svg + _preview.png 配对）
└── enemy_factions/{v1,female_v2}/

assets/                        ← 素材"落地"层（引擎实际加载）
├── art/{ui, dicehero, characters, environments, level_01_clocktower}/
└── icons/{comic, game-icons}/
```

**关键洞察**：`art_source/` → `assets/` 的搬运与命名（`v1`/`v2` 版本、`icon_256.png` 尺寸后缀）**目前是手工完成的**。skill 必须接管这一段，否则等于"生成了图但还要人工归位"，价值大打折扣。

### 2.5 主题资源现状

已存在 20+ 个 `.tres`，分两类：
- **主题类**：`comic_theme.tres`、`skill_card_theme.tres`、`comic_combat_theme.tres`、`flow_theme.tres`
- **样式类**：`panel_paper.tres`、`button_gold.tres`、`button_teal.tres`、`panel_dark.tres`（这些是 `StyleBox` 本体）

这说明 UI 换皮有两条路径：**改 StyleBox**（纯色→贴图）与**改 TextureRect**（空→图）。两者都要覆盖。

---

## 3. 架构设计

### 3.1 总体流程

```
┌────────────────────────────────────────────────────────────┐
│ Phase 0  基线快照                                            │
│   skill run --init  →  记录 git HEAD / 生成 .artbak 快照     │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ Phase 1  扫描（scan）                                        │
│   遍历 .tscn / .tres / .gd                                   │
│   → 识别占位符（几何体 + 命名模式 + 文案）                     │
│   → 解析双轨资源引用                                          │
│   → 输出 art-manifest.json（唯一真相源）                      │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ Phase 2  语义归类与提示词编排（plan）                          │
│   按 场景上下文 + 节点名 + 尺寸 + 相邻文案 → 推断资产语义       │
│   → 绑定 provider（local-comfyui / 云端 / 平台内置）           │
│   → 生成 prompt + 负向 prompt + 尺寸 + 九宫格边界             │
│   → 人工复核点 ★（可跳过，见 3.5）                            │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ Phase 3  生成（generate）                                    │
│   Provider 抽象层 → 批量出图                                 │
│   → 落地 art_source/imagegen/<topic>_<vN>/                  │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ Phase 4  后处理（postprocess）                                │
│   缩放 / 九宫格边界计算 / 透明通道 / 图集打包 / 去背景          │
│   → 落地 assets/...（含版本与尺寸后缀）                       │
│   → 生成 .import 配置（filter / mipmap / 九宫格）             │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ Phase 5  替换（apply）★ 核心                                 │
│   原地替换节点类型 + 写回 tscn/tres                           │
│   → 逐场景原子写入，可单独回退                                 │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│ Phase 6  验证（verify）                                      │
│   静态校验：tscn 语法 / 资源存在 / 无悬空 ExtResource          │
│   视觉校验：截图 → 对照 rubric 打分（复用 agent-vision 思路）   │
│   → 输出 report.md                                          │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
                    rollback（任意阶段可回退）
```

### 3.2 替换策略：原地替换节点类型（已确认）

**规则表**（`apply` 阶段的核心决策依据）：

| 原节点 | 目标节点 | 保留属性 | 说明 |
|---|---|---|---|
| `ColorRect` | `TextureRect` | `anchors` / `offset_*` / `layout_mode` / `mouse_filter` | 纯色块 → 贴图 |
| `ColorRect`（遮罩类：`*Shade`） | `TextureRect`（半透明 PNG） | 同上 | 或保留 `ColorRect` 仅调 alpha |
| `Polygon2D` | `Sprite2D` | `position` / `z_index` / `modulate` | 2D 形状 → 精灵 |
| `TextureRect`（空 texture） | `TextureRect`（填 texture） | 全部属性不变 | **最安全的替换** |
| `NinePatchRect` | `NinePatchRect`（填 texture + 边界） | 全部属性 + `patch_margin_*` | 补九宫格边界 |
| `Label`（文案占位） | ⚠️ 不换类型 | — | 只替换 `text` 内容 |
| `Button` / `PanelContainer` | ⚠️ 不换类型 | — | 改 `theme_override` 或全局主题 |

**原地替换的三个技术约束**（必须实现）：

1. **`unique_id` 必须保留** — 场景里已有 `unique_id=167593178` 这类字段（Godot 4.4+ 的场景唯一标识）。丢失会导致 `%NodeName` 引用与信号连接失效。
2. **脚本中的类型假设要检查** — 若 `some_node.gd` 里有 `@onready var bg: ColorRect = $BackgroundShade`，换成 `TextureRect` 会**运行时类型错误**。扫描阶段必须建立"节点路径 → 脚本引用"的反向索引，命中即标记为**需人工确认**。
3. **`ExtResource` id 分配** — 新增贴图引用要分配未被占用的 `id`（如 `id="7_abc12"` 风格），并与现有 id 去重。

### 3.3 双轨资源寻址的处理

```
扫描阶段建立统一视图：

  manifest.entries[] = {
    id,                        // 稳定标识
    kind: "geometry|texture_slot|text_placeholder|stylebox",
    target: {
      file, node_path,         // 直接引用轨道
      unique_id,
      resource_key,            // 资源库轨道（如 &"portrait"）
      library_file,            // game_art.tres
    },
    current: { type, texture|text|color, size },
    inferred: { semantics, prompt, size, provider },
    status: "pending|generated|applied|skipped|manual"
  }
```

**两条轨道的写入规则**：
- 轨道 A（tscn 直接引用）→ 改 `[ext_resource]` 段 + 节点属性
- 轨道 B（资源库）→ 改 `.tres` 的 `icons = Dictionary[...]` 对应键
- **同一语义键被多处引用时**，只改资源库一次（轨道 B 的优势）

### 3.4 Provider 抽象层（已确认：本地 ComfyUI + 可切换）

```python
class ArtProvider(Protocol):
    name: str
    def capabilities(self) -> ProviderCaps: ...   # 是否支持 transparency / 图集 / 参考图 / LoRA
    def generate(self, req: GenRequest) -> GenResult: ...

# 实现
LocalComfyUIProvider    # 接 PurlieuStudios/comfyui-mcp 或直接 HTTP :8188
CloudAPIProvider        # DALL·E / Replicate / fal.ai
PlatformProvider        # WorkBuddy 内置 ImageGen（零配置兜底）
```

**路由策略**（按需求自动选择，可强制覆盖）：

| 资产类型 | 首选 | 理由 |
|---|---|---|
| 图标 / 道具（需透明） | 本地 ComfyUI + 抠图 | 便宜、量大、可控 |
| UI 面板 / 九宫格 | 本地 ComfyUI | 需精确尺寸与可平铺边缘 |
| 立绘 / 关键美术 | 云端 API | 质量优先 |
| 风格探索 / 概念图 | 平台内置 | 零配置快速试 |
| 批量变体（10+） | 本地 ComfyUI | 成本 |

**风格一致性方案**：沿用已验证的 LoRA 思路——用 `art_source/references/american_comic/` 作为风格锚，生成时统一注入风格提示词前缀 + 同一 seed 基值 + LoRA 权重。项目已是 **美漫风格**，提示词模板应固化为：

```
正向: {style_prefix}, {asset_semantic}, {composition_hint}, clean silhouette, transparent background
负向: text, watermark, signature, blurry, jpeg artifacts, photorealistic, 3d render
其中 style_prefix = "american comic book style, bold ink lines, halftone shading, flat vivid colors"
```

### 3.5 AI 托管与人工复核边界

**AI 全自动的部分**：
- 扫描、分类、提示词生成、provider 调度、后处理、tscn 写入、静态校验

**必须人工介入的三个点**（不可省，否则质量不可控）：
1. **风格方向确认**（Phase 2 末尾）— 生成 3-5 张风格样张，选定后锁定
2. **类型冲突裁决** — 3.2 约束 2 命中的节点，需人工确认可换类型
3. **成品验收**（Phase 6）— 视觉 rubric 分数低于阈值时人工定夺

**"一键"的准确含义**：`scan → plan → generate → postprocess → apply → verify` 是一条命令跑完，但**中间有一次风格确认的暂停**。可加 `--yolo` 跳过（用默认风格），此时才是真正的零交互。

---

## 4. Manifest 格式（核心契约）

`art-manifest.json` —— 全流程唯一真相源，人可读可编辑。

```json
{
  "version": "0.1",
  "project": "/path/to/project",
  "baseline": {
    "git_head": "abc1234",
    "snapshot_dir": ".artbak/20260918-2210/",
    "created_at": "2026-09-18T22:10:00+08:00"
  },
  "style": {
    "profile": "american_comic",
    "prefix": "american comic book style, bold ink lines, halftone shading",
    "negative": "text, watermark, blurry, photorealistic",
    "lora": { "name": "comic_v2", "weight": 0.8 },
    "seed_base": 42000
  },
  "entries": [
    {
      "id": "combat_enemy_panel::BackgroundShade",
      "kind": "geometry",
      "file": "scenes/ui/combat/combat_enemy_panel.tscn",
      "node_path": "BattleMargin/WorldSpace/EffectBeam",
      "unique_id": 400942390,
      "current": { "type": "ColorRect", "color": [0.1, 0.1, 0.15, 0.8], "size": [420, 8] },
      "inferred": {
        "semantics": "horizontal light beam effect, energy trail",
        "asset_type": "fx_beam",
        "prompt": "{style}, horizontal energy beam, glowing core, soft falloff",
        "size": [420, 8],
        "nine_patch": null,
        "needs_transparency": true,
        "provider": "local-comfyui"
      },
      "replace_plan": { "from": "ColorRect", "to": "TextureRect", "risk": "low" },
      "script_refs": [],
      "status": "pending"
    },
    {
      "id": "game_art::portrait",
      "kind": "resource_library",
      "library_file": "resources/ui/dicehero/game_art.tres",
      "resource_key": "portrait",
      "current": { "texture": "res://assets/art/dicehero/portraits/vanguard/v1/portrait_256.png" },
      "inferred": {
        "semantics": "character portrait icon, comic style",
        "asset_type": "icon_256",
        "provider": "cloud-api"
      },
      "status": "pending"
    },
    {
      "id": "route_build_page::CostText",
      "kind": "text_placeholder",
      "file": "scenes/ui/comic_flow/route_build_page.tscn",
      "node_path": "Content/Editor/Content/Columns/Details/DetailScroll/Text/CostText",
      "current": { "text": "需求占位" },
      "inferred": { "action": "fill_from_data_or_flag_for_human" },
      "status": "skipped"
    }
  ],
  "stats": { "total": 0, "geometry": 0, "texture_slot": 0, "text_placeholder": 0 }
}
```

**设计要点**：
- `status` 是流程状态机：`pending → generated → applied / skipped / manual / failed`
- 用户**可以手改 `inferred.prompt`** 后再执行——这是把 AI 从"黑箱"变成"可控"的关键
- `script_refs` 非空 = 高风险替换，apply 阶段默认拒绝，除非显式 `--force`

---

## 5. Skill 命令设计

```
godot-art-replacer
├── scan      [--project PATH] [--include GLOB] [--exclude GLOB]
│              → 产出 art-manifest.json + 人读版 preview.md
├── plan      [--manifest FILE] [--style PROFILE] [--provider NAME]
│              → 填充 inferred 字段；可选 --sample 出风格样张
├── generate  [--manifest FILE] [--only ID...] [--dry-run]
│              → 批量出图 → art_source/imagegen/<topic>_<vN>/
├── postprocess [--manifest FILE]
│              → 尺寸/九宫格/透明/图集 → assets/... + .import
├── apply     [--manifest FILE] [--scene FILE] [--force]
│              → 原地替换 + 写回；逐场景原子提交
├── verify    [--manifest FILE] [--screenshot]
│              → 静态校验 + 可选截图打分 → report.md
├── rollback  [--to SNAPSHOT | --scene FILE]
│              → 回退到基线或指定快照
└── run       [--project PATH] [--yolo]
               → 串起全流程（Phase 0→6）
```

**幂等性要求**：`scan` 重跑必须得到相同 id；`apply` 重跑不产生重复节点；`rollback` 后可立即重跑 `run`。

---

## 6. 安全与回退机制

鉴于"原地替换 + 批量写场景"属于高危操作，强制以下保护：

1. **基线快照**（Phase 0 强制）
   - 记录 `git HEAD`；若工作区不干净，**拒绝执行**并提示先提交
   - 额外生成 `.artbak/<timestamp>/` 副本（仅覆盖待改文件，非全量）
2. **逐场景原子写入** — 先写 `.tmp`，校验通过后 `rename`；单场景失败不影响其他
3. **替换前静态校验** — 新 tscn 必须能被解析、所有 `ExtResource` 路径存在、`unique_id` 无重复
4. **`--dry-run` 全局支持** — 任何写操作都可预览 diff
5. **`rollback` 粒度** — 支持全量回退到基线、单场景回退、单条目回退
6. **风险分级**
   - `low`：`TextureRect` 填空 texture、资源库换图 → 可自动执行
   - `medium`：`ColorRect` → `TextureRect` → 自动执行但记录
   - `high`：类型替换 + `script_refs` 非空 → **默认不执行**，需 `--force`

---

## 7. 已知风险与未决问题

| # | 风险 | 影响 | 建议对策 |
|---|---|---|---|
| R1 | `.tscn` 手写解析脆弱（格式含 `SubResource`、内联资源、`unique_id`） | 写坏场景 | 优先用 Godot **headless CLI**（`--headless --script`）调用引擎 API 做读写；纯文本解析仅作扫描 |
| R2 | 九宫格边界无法自动推断 | 面板拉伸变形 | 用启发式（边缘纯色检测）+ 人工确认；或生成时就按 3×3 布局约束 |
| R3 | 文案占位（843 个 Label 中的"占位"项）本质需要产品决策 | AI 无法代劳 | 首版**只列出不替换**，输出待填清单交人工 |
| R4 | 风格一致性在批量生成下漂移 | 观感不统一 | 固定 seed 基值 + LoRA + 一致提示词前缀；生成后做色板聚类校验 |
| R5 | 替换后布局尺寸变化导致溢出 | 需重调布局 | 保持 `anchors`/`offset_*` 不变；尺寸不符时**缩放到原包围盒** |
| R6 | 项目已有 334 个 `art_source` 文件与多版本目录（`_v6`） | 新生成物命名冲突 | 接管版本号递增规则，沿用既有 `<topic>_vN` 约定 |
| R7 | 3D 场景（`clocktower_lower_environment` 等） | 首版覆盖不到 | 明确排除，文档标注 |

**未决问题（需你决策）**：
- Q1：`Label` 文案占位是否纳入首版？（当前设计为"只列不换"）
- Q2：是否需要 Godot headless 依赖？（更安全，但要求本地装了 Godot 且版本匹配）
- Q3：风格样张确认环节是否保留？（保留=更可控，去掉=更"一键"）
- Q4：`assets/` 的目录与命名规则是否完全沿用现有约定？（建议沿用，便于 diff）

---

## 8. 分期交付建议

| 期 | 内容 | 交付物 | 验证方式 |
|---|---|---|---|
| **P0** | 扫描器 + manifest | `scan` 命令、`preview.md` | 在 xiaJ8tou 跑，人工核对识别准确率 |
| **P1** | 纯贴图填空（零类型替换） | `postprocess` + `apply`（仅 `TextureRect`） | 挑 3 个场景，验证零风险路径 |
| **P2** | 类型替换引擎 | `ColorRect→TextureRect` 等 | 单场景验证 + rollback 验证 |
| **P3** | Provider 抽象 + ComfyUI 接入 | 本地批量出图 | 生成 20 张图标，检查风格一致性 |
| **P4** | 视觉校验闭环 | `verify --screenshot` | 截图 → rubric 打分 → report.md |
| **P5** | 一键串联 | `run --yolo` | 全流程端到端 |

**建议从 P0 开始**：先只做扫描器，用真实项目验证识别准确率。如果扫描阶段就漏掉大量占位符，后续所有投入都会落空——这是**投入产出比最高的第一个验证点**。

---

## 附录 A：识别规则草案

```
geometry_placeholder:
  - type == "ColorRect"                          # 纯色块
  - type == "Polygon2D" and not has_texture      # 2D 形状
  - type == "Sprite2D" and texture is null       # 空精灵
  - type == "TextureRect" and texture is null    # 空贴图槽
  - type == "Panel" and stylebox is StyleBoxFlat with plain color only

naming_patterns:  # 命名即语义（用于推断 prompt）
  "*Placeholder" | "PlaceHolder"      → 直接占位
  "*Shade"                            → 遮罩层
  "*Beam" | "*Trail"                  → 特效条
  "*Backdrop" | "*Backdrop*"          → 背景底纹
  "Vignette"                          → 暗角
  "*Projection"                       → 投影
  "Ink*" | "*Paper"                   → 纸张/纹理
  "Icon" | "Portrait" | "Avatar"      → 图标/立绘
  "Slot"                              → 槽位

text_placeholder:
  - text matches /占位|待填|TODO|TBD|placeholder|xxx|XXX/  (不区分大小写)

skipped_types:  # 永不触碰
  - 所有 *Container
  - CanvasLayer / Node / Node2D
  - HSeparator / VSeparator
  - 带 script 且 script_refs 命中的节点（标记为 high risk）
```

## 附录 B：实测数据快照

```
项目: ~/Desktop/godotProject/xiaJ8tou
grep 统计: Label 843 / HBoxContainer 464 / VBoxContainer 327 / Control 193
           Button 165 / TextureRect 151 / PanelContainer 106 / HSeparator 106
           MarginContainer 99 / ColorRect 18 / NinePatchRect 38 / Sprite2D 10
             
文件: .gd 440 个 / .tscn 大量（scenes/ui 下按功能分子目录）
     .tres 20+ / art_source 334 个文件 / assets 已分层
```

---

*文档结束。本文档为设计稿，实际实现需经 P0 扫描器验证后再定稿。*

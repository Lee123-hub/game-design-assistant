---
name: kenney-ui-art-replacer
description: 为 Godot 项目做 UI 与游戏美术的风格化素材替换。当用户要求「给游戏换素材」「填充美术」「替换占位符」「找 Kenney 素材」「统一美术风格」「做 UI 换皮」，或需要先理解游戏风格再下载并替换素材时使用。流程为：解析游戏风格 → 提取设计规范 → 在 Kenney 查看预览图选素材 → 下载 CC0 素材 → 原地替换进 Godot 项目。
license: MIT
compatibility: 需要网络访问 kenney.nl；需要 Python 3.8+（仅用标准库，无需第三方依赖）；Godot 4.x 项目
metadata:
  author: workbuddy
  version: "1.0"
  domain: gamedev
  engine: godot
  asset_source: kenney-cc0
---

# Kenney UI 与美术素材替换

在 Godot 项目上完成「理解风格 → 确立规范 → 挑选素材 → 下载 → 替换」的完整链路。

**核心原则：先理解风格，再动手替换。** 跳过风格分析的替换必然导致素材与项目气质冲突，产出的东西不可用。

---

## 何时使用

**使用**：
- 用户要给 Godot 游戏换素材、填美术、替换占位符
- 用户要统一项目美术风格
- 需要从 Kenney 挑选并下载 CC0 素材接入项目
- 项目已有几何体原型（`ColorRect` / `Panel` / 空 `TextureRect`），要做素材替换

**不使用**：
- 需要定制风格（Kenney 是通用卡通风，不匹配写实 / 特定 IP 风格）
- 3D 项目为主（Kenney 3D 包有限）
- 用户明确要求 AI 生图（改用生图管线，不走 Kenney）

---

## 前置检查

执行前必须确认：

1. **项目路径**：存在 `project.godot`。用 `Glob` 查找，不要猜。
2. **网络可达**：Kenney 需要能访问。先跑连通性检查：
   ```bash
   curl -sL -o /dev/null -w "HTTP:%{http_code}\n" --max-time 20 https://kenney.nl/assets
   ```
   返回 `200` 才能继续。**注意：`itch.io` 在很多网络环境下不可达（DNS 可解析但 TCP 被阻断），本 skill 只依赖 Kenney。**
3. **Godot 版本**：读 `project.godot` 的 `config/features`，确认是 4.x。

---

## 阶段 1 · 理解游戏风格（不可跳过）

**这一步的产出决定后续所有选择。** 必须实际读文件，不能靠推测。

### 1.1 读取风格线索

```bash
# 风格参考锚（若存在）
ls -R art_source/references/ 2>/dev/null

# 已有素材目录分层
ls -R art_source/imagegen/ 2>/dev/null | head -40

# 主题资源（UI 换皮的落点）
find . -name "*.tres" -not -path "./.godot/*" | head -30

# 关键：读一份主题或资源库，看实际在用的颜色与结构
cat resources/ui/*/game_art.tres 2>/dev/null | head -40
```

**重点读三类文件**：

| 文件 | 能读出什么 |
|---|---|
| `art_source/references/**` | 风格锚（美漫 / 像素 / 卡通） |
| `*.tres` 主题文件 | 实际在用的调色板、字号、StyleBox 参数 |
| `.tscn` 中的 `theme_override_colors` | 硬编码的色值，反映真实视觉 |

### 1.2 风格判定输出

必须明确写出以下五项，作为后续所有决策的依据：

```
风格判定
├─ 流派：美漫 / 像素 / 卡通矢量 / 写实 / 手绘
├─ 视觉特征：线条粗细、阴影方式（网点 / 渐变 / 无）、色彩饱和
├─ 主色板：（从 .tres 与 theme_override 提取的实际色值）
├─ 分辨率基准：如 16x16 / 32x32 / 64x64 像素基准
└─ 是否像素风：决定 import 的 filter 设置（nearest vs linear）
```

**若风格判定为「美漫风」**：Kenney 的卡通矢量包与之**不匹配**。此时必须向用户说明冲突，并给出选项：
- 用 Kenney 作**占位素材**（明确标注，非最终素材）
- 改走 AI 生图管线
- 由用户指定其他素材源

**严禁**静默用不匹配风格的素材替换。

---

## 阶段 2 · 提取设计规范

从已有素材反向提取，而非凭空书写。这比写一份"理想规范"有效。

### 2.1 规范五要素

| 项 | 提取方法 |
|---|---|
| **调色板** | 统计 `.tres` 与 `theme_override_colors` 里的色值频次，取 top 12–24 |
| **字形层级** | 收集所有 `theme_override_font_sizes/font_size`，归纳阶梯 |
| **间距基准** | 统计 `theme_override_constants/separation` 与 `MarginContainer` 边距，找公约数（多为 4 或 8） |
| **九宫格边界** | 找 `NinePatchRect` 的 `patch_margin_*`，确认现有拉伸区规则 |
| **尺寸规格** | 统计图标类贴图尺寸（如普遍 `256`、`16`），确定生成/选取基准 |

### 2.2 优先级

1. 项目已有的规范（读文件得出）**优先于**任何通用建议
2. 有矛盾时以**最近修改的**文件为准（用 `ls -lt` 判断）
3. 无法从文件确定的项，**在报告中标为"待确认"**，不要编造

---

## 阶段 3 · 在 Kenney 挑选素材

### 3.1 定位候选包

Kenney 的**列表页是 JS 渲染的，直接抓列表页无效**（`/assets/category:2D` 返回的 HTML 里没有素材条目链接）。必须走素材详情页。

搜索候选包用 WebSearch：
```
查询模式：kenney.nl <你需要的素材类型> asset pack
例：kenney.nl UI pack buttons panels asset pack
```

或直接访问已知包：
```
https://kenney.nl/assets/<package-slug>
```

**常用包速查**：

| 需求 | 包名 |
|---|---|
| UI 套件（按钮/面板） | `ui-pack` / `ui-pack-pixel-adventure` |
| 像素平台游戏 | `pixel-platformer` |
| 角色姿势（含肢体拼接） | `platformer-characters` |
| 输入提示图标 | `input-prompts` |
| 图标集 | `game-icons` / `board-game-icons` |
| 2D 通用 | `new-platformer-pack` / `tiny-town` |

### 3.2 查看预览图（关键步骤）

**必须实际下载预览图并查看**，不能凭包名猜测内容。

**预览图 URL 提取规则**（已实测）：

```
1. curl 素材页 HTML
2. 从 HTML 正则提取：https://kenney\.nl/media/pages/assets/([^/]+)/[^"']+\.(png|jpg)
3. 【关键陷阱】必须用「包名精确相等」过滤，不能用包含匹配
```

**为什么必须精确匹配**：素材页的"你可能也喜欢"区块会混入**其他包的预览图**。实测 `pixel-platformer` 页面里出现了 5 个包的图：

```
页内包名: ['pixel-platformer', 'pixel-platformer-blocks',
          'pixel-platformer-farm-expansion', 'pixel-platformer-food-expansion',
          'pixel-platformer-industrial-expansion']

精确匹配 'pixel-platformer' → 只得到 1 个 ✓
包含匹配 'pixel-platformer' → 得到 5 个 ✗ 错误
```

用 `scripts/fetch-preview.py` 自动处理这个规则。

**查看预览图后，必须确认**：
- 素材内容是否符合需求（是按钮还是角色？是 UI 还是场景？）
- 风格是否与阶段 1 判定的风格兼容
- 是否真的是帧序列 / 图集（**很多包是「姿势集合」而非时间序列**——例如 `platformer-characters` 的 `walk` 只有 2 帧，不构成循环）

### 3.3 授权确认（强制）

Kenney **全站 CC0**，但仍需逐包验证：

```bash
# 素材页应包含 CC0 字样
curl -sL "https://kenney.nl/assets/<pkg>" | grep -o "CC0" | head -1
```

下载后包内应有 `License.txt`。**保留该文件**，作为合规追溯依据。

---

## 阶段 4 · 下载与解压

用 `scripts/fetch-package.py` 完成，或手动：

```bash
# ZIP 直链规则
# https://kenney.nl/media/pages/assets/<pkg>/<hash>-<timestamp>/kenney_<pkg>.zip
curl -sL "<素材页中提取的 zip 链接>" -o kenney_<pkg>.zip

# 解压前先核对内容清单
unzip -l kenney_<pkg>.zip | head -40

# 解压
unzip -o kenney_<pkg>.zip -d <目标目录>
```

**下载后强制核对**：
1. 包内存在 `License.txt` 且含 `CC0`
2. 预览图与解压内容一致（防止下错包）
3. 记录 SHA-256，便于追溯

---

## 阶段 5 · 替换进项目

### 5.1 替换策略

**默认：原地替换节点类型**（保持场景结构不变，最小侵入）。

| 原节点 | 目标 | 必须保留的属性 |
|---|---|---|
| `ColorRect` | `TextureRect` | `anchors` / `offset_*` / `layout_mode` / `mouse_filter` |
| `Polygon2D` | `Sprite2D` | `position` / `z_index` / `modulate` |
| `TextureRect`（空 texture） | 填 `texture` | 全部属性不变（**最安全**） |
| `NinePatchRect` | 填 `texture` + `patch_margin_*` | 全部属性 |
| `Label`（文案占位） | **不换类型**，只替换 `text` | — |
| `Button` / `PanelContainer` | **不换类型**，改主题 | — |

### 5.2 三个硬约束（必须遵守）

**① 保留 `unique_id`**
Godot 4.4+ 的场景节点带 `unique_id=<数字>`。丢失会导致 `%NodeName` 引用与信号连接失效。替换时必须保留原值。

**② 检查脚本的类型假设**
```bash
# 替换前，搜索是否有脚本按原类型声明了该节点
grep -rn "@onready var.*: ColorRect" --include="*.gd" .
```
若 `some_node.gd` 里有 `@onready var bg: ColorRect = $BackgroundShade`，把它换成 `TextureRect` 会**运行时类型错误**。命中即标记为**需人工确认**，默认不替换。

**③ 检查双轨资源寻址**
项目可能同时存在两种引用方式：
- **轨道 A**：`.tscn` 内直接 `ExtResource("id")`
- **轨道 B**：资源库 `.tres` 的字典，形如 `icons = Dictionary[StringName, Texture2D]({ &"normal": ExtResource("2") })`

**两条都要处理。** 只改其一会导致部分素材不生效。

### 5.3 安全要求（强制）

1. **先备份**：替换前 `cp` 一份待改文件，或确认 git 工作区干净
2. **逐场景原子写入**：先写 `.tmp`，校验后 `rename`；单场景失败不影响其他
3. **`--dry-run` 支持**：所有写操作先输出 diff 供确认
4. **风险分级**：
   - `low`（`TextureRect` 填空 texture）→ 可直接执行
   - `medium`（`ColorRect` → `TextureRect`）→ 执行但记录
   - `high`（脚本类型假设命中）→ **默认拒绝**，需用户显式确认

### 5.4 导入配置

像素风素材必须在 `.import` 中设置：
```
filter=false          # 关闭插值，保持像素锐利
mipmaps/generate=false
```
非像素风用 `filter=true` + 按需开启 mipmap。

---

## 阶段 6 · 验证

1. **静态校验**：`.tscn` 能被解析、所有 `ExtResource` 路径存在、`unique_id` 无重复
2. **视觉校验**：截图对比替换前后，检查尺寸与布局是否溢出
3. **输出报告**：列出已替换项、跳过项、待人工确认项

---

## 参考文件

- `references/kenney-catalog.md` — Kenney 常用包速查与下载规则
- `references/godot-replace-rules.md` — Godot 节点替换与 `.import` 详细规则
- `scripts/fetch-preview.py` — 提取并下载指定包的预览图（含精确匹配规则）
- `scripts/fetch-package.py` — 下载并解压素材包，附授权校验

---

## 反模式（禁止）

- ❌ **跳过风格分析直接下载替换** —— 素材与项目气质冲突，全部白做
- ❌ **用包含匹配提取预览图** —— 会把其他包的图混进来
- ❌ **把 Kenney 卡通风静默用于美漫风项目** —— 必须显式告知冲突
- ❌ **替换时丢失 `unique_id`** —— 破坏 `%NodeName` 引用与信号
- ❌ **忽略脚本中的类型声明** —— 导致运行时崩溃
- ❌ **只改一条资源寻址轨道** —— 部分素材不生效
- ❌ **把「姿势集合」当「帧序列动画」用** —— 帧数不足，动画不成立
- ❌ **不保留 `License.txt`** —— 失去合规追溯依据
- ❌ **一次性大规模替换** —— 应分批，每批后验证

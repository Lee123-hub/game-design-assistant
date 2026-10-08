# Kenney 素材包速查

全站授权：**CC0 1.0 Universal**（可商用、可修改、无需署名）。
署名非必需但被欢迎：`Kenney` 或 `www.kenney.nl`。

---

## 常用包（Godot 2D 项目）

| 需求 | slug | 说明 |
|---|---|---|
| **UI 套件** | `ui-pack` | 按钮、面板、滑块、勾选框，九宫格友好 |
| **像素 UI** | `ui-pack-pixel-adventure` | 像素风 UI，含 16/32 基准 |
| **像素平台游戏** | `pixel-platformer` | **含完整帧动画**（推荐做动画） |
| 像素平台扩展 | `pixel-platformer-food-expansion` 等 | 主题扩展包 |
| **角色姿势库** | `platformer-characters` | 5 角色 × 24 姿势 + 肢体部件 + SVG 源 |
| 输入提示图标 | `input-prompts` | 键鼠手柄提示图标（多平台） |
| 图标集 | `game-icons` | 通用游戏图标 |
| 棋盘类图标 | `board-game-icons` | 卡牌 / 桌游向 |
| 2D 通用素材 | `new-platformer-pack` | 平台跳跃全套 |
| 微型场景 | `tiny-town` / `tiny-farm` / `tiny-factory` | 微缩建筑与地块 |
| 十字准星 | `crosshair-pack` | FPS 准星 |
| 旗帜 | `flag-pack` | 国旗图标 |
| 光罩 | `light-masks` | 2D 光照遮罩 |

---

## 重要区分：姿势库 ≠ 帧序列动画

**这是最高频的误用点。**

| 包 | 实际内容 | 能否直接做循环动画 |
|---|---|---|
| `platformer-characters` | **姿势集合**（`walk1`/`walk2` 仅 2 帧） | ❌ 否，帧数不足 |
| `pixel-platformer` | **完整帧序列** | ✓ 是 |
| `roguelike-characters` | 图集（静态） | ❌ 否 |

`platformer-characters` 的正确用法：
- 骨骼/肢体拼接（`Limbs/` + SVG 矢量源）
- 静帧姿势库（UI、立绘、状态图示）
- 风格参考锚

**判断方法**：查看 `Poses/` 或帧目录，若同一动作只有 2 帧（如 `walk1`/`walk2`），即为姿势集合。

---

## 下载 URL 规则（已实测）

### 素材详情页
```
https://kenney.nl/assets/<slug>
```

页面 HTML 内含（需从源码正则提取，页面不直接渲染链接）：
```
预览图：https://kenney.nl/media/pages/assets/<pkg>/<hash>-<ts>/<name>.png
ZIP   ：https://kenney.nl/media/pages/assets/<pkg>/<hash>-<ts>/kenney_<pkg>.zip
```

`<hash>-<ts>` 会随素材更新变化，**不可硬编码**，必须每次从页面提取。

### 【关键陷阱】包名精确匹配

素材页的「你可能也喜欢」区块会混入**其他包的预览图**。实测 `pixel-platformer` 页面内出现：

```
pixel-platformer
pixel-platformer-blocks
pixel-platformer-farm-expansion
pixel-platformer-food-expansion
pixel-platformer-industrial-expansion
```

- 精确匹配 `== "pixel-platformer"` → 1 个 ✓
- 包含匹配 `in` → 5 个 ✗ **错误**

### 列表页不可用

`/assets/category:2D`、`/assets/tag:pixel` 等列表页均为 **JS 渲染**，抓取的 HTML 内**没有任何素材条目链接**。搜索结果数恒为 0。

**必须走素材详情页，或用 WebSearch 定位 slug。**

---

## 连通性检查

```bash
curl -sL -o /dev/null -w "HTTP:%{http_code}\n" --max-time 20 https://kenney.nl/assets
# 期望 200
```

**itch.io 在多数网络环境下不可达**——DNS 可解析但 TCP 握手被阻断（`curl` 返回 `HTTP:000`，超时 40s+）。不要依赖 itch.io，Kenney 是稳定可达源。

---

## 工具脚本

```bash
# 查看并下载预览图（含精确匹配）
python3 scripts/fetch-preview.py pixel-platformer --out ./previews

# 只看包内容清单，不解压
python3 scripts/fetch-package.py pixel-platformer --list-only

# 下载并解压
python3 scripts/fetch-package.py pixel-platformer --out ./assets-download
```

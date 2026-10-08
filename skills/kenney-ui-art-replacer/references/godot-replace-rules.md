# Godot 素材替换规则

针对 Godot 4.x 的节点替换、资源寻址与导入配置规则。

---

## 一、节点替换映射表

**原则：保持场景结构不变，最小侵入。**

| 原节点 | 目标节点 | 必须保留的属性 |
|---|---|---|
| `ColorRect` | `TextureRect` | `anchors_preset` / `offset_left/top/right/bottom` / `layout_mode` / `mouse_filter` / `z_index` |
| `Polygon2D` | `Sprite2D` | `position` / `scale` / `rotation` / `z_index` / `modulate` |
| `TextureRect`（空 texture） | `TextureRect` | **全部不变**，仅赋 `texture`（最安全路径） |
| `NinePatchRect` | `NinePatchRect` | 全部 + 设置 `patch_margin_left/top/right/bottom` |
| `Sprite2D`（空 texture） | `Sprite2D` | 全部不变，仅赋 `texture` |
| `Label`（文案占位） | **不换类型** | 仅替换 `text` |
| `Button` | **不换类型** | 改主题或 `theme_override_*` |
| `PanelContainer` / `Panel` | **不换类型** | 改 `theme_override_styles/panel` |
| 任何 `*Container` | **永不触碰** | 布局容器 |

**不建议替换的类型**：
- `CenterContainer` / `MarginContainer` / `HBoxContainer` 等 —— 它们是布局骨架
- 带脚本且脚本按原类型声明的节点（见第三节）

---

## 二、`.tscn` 写回格式

### 节点声明
```
[node name="Icon" type="TextureRect" parent="Panel/VBox"]
unique_id=1234567890
layout_mode = 2
texture = ExtResource("3_abc12")
expand_mode = 1
stretch_mode = 5
```

### 资源引用段（文件头部）
```
[ext_resource type="Texture2D" path="res://assets/ui/icon_shop.png" id="3_abc12"]
```

### 新增资源引用的 id 分配规则
- **必须**与现有 id 去重。Godot 的 id 形如 `"2"`、`"3_abc12"`（带随机后缀）
- 安全做法：扫描全文所有 `id="..."`，选一个未占用的
- 建议格式：`<递增数字>_<随机5位小写字母数字>`

### 【强制】保留 `unique_id`
Godot 4.4+ 的场景节点带 `unique_id=<数字>`。这是场景内的稳定标识。

**丢失的后果**：
- `%NodeName` 引用失效（场景唯一名语法）
- 依赖该节点的信号连接断裂
- 可能触发场景重新加载时的属性丢失

**规则**：替换节点类型时，`unique_id` 必须原样保留。

---

## 三、脚本类型假设检查（高风险）

替换节点类型前，**必须**搜索脚本中是否有按原类型声明的引用：

```bash
# 搜索按类型声明的 onready 引用
grep -rnE '@onready var .*: *(ColorRect|Polygon2D|NinePatchRect)' --include="*.gd" .

# 搜索类型判断
grep -rnE 'is ColorRect|as ColorRect|is Polygon2D|as Polygon2D' --include="*.gd" .

# 搜索强类型参数/返回
grep -rnE 'func .*\(.*: ColorRect|-> *ColorRect' --include="*.gd" .
```

**示例风险**：
```gdscript
# some_panel.gd
@onready var bg: ColorRect = $BackgroundShade
```
若把 `$BackgroundShade` 从 `ColorRect` 改成 `TextureRect`，此行立即**运行时类型错误**（GDScript 强类型）。

**处理规则**：
- 命中即标记为 **high risk**
- **默认不替换**，需用户显式确认
- 可行方案：同时修改脚本的类型声明（需一并告知用户）

---

## 四、双轨资源寻址

Godot 项目中可能同时存在两种贴图引用方式，**两条都要处理**。

### 轨道 A：`.tscn` 直接引用（多数）
```
[ext_resource type="Texture2D" path="res://assets/icon.png" id="2"]
...
[node name="Icon" type="TextureRect" parent="."]
texture = ExtResource("2")
```
**处理**：改 `[ext_resource]` 的 `path`，或新增引用并改节点属性。

### 轨道 B：资源库间接引用
```
# resources/ui/game_art.tres
[resource]
script = ExtResource("1")
icons = Dictionary[StringName, Texture2D]({
&"normal": ExtResource("2"),
&"portrait": ExtResource("18"),
})
```
配合一个极简的脚本（如 `game_art_library.gd`）做访问层。

**处理**：改 `.tres` 中对应键的 `ExtResource` 指向。

**为什么两条都要处理**：只改其一，会导致部分素材不生效，且难以排查（代码路径与场景路径走的是不同引用）。

**轨道 B 的优势**：同一语义键被多处引用时，**只需改一次**。

**额外注意**：轨道 B 的**键名本身是极好的语义标签**（如 `portrait`、`boss`、`status_damage_up`），可用于推断该位置需要什么素材。

---

## 五、`.import` 配置

### 像素风素材（必须）
```ini
[params]
filter=false
mipmaps/generate=false
```
`filter=false` 关闭插值，保持像素锐利。像素风若开启插值会模糊，是高频错误。

### 非像素风
```ini
[params]
filter=true
mipmaps/generate=true     # 若会被缩放显示
```

### 九宫格贴图
在 `NinePatchRect` 节点上设置边界，**不是**在 `.import` 里：
```
[node name="Panel" type="NinePatchRect" parent="."]
texture = ExtResource("3")
patch_margin_left = 12
patch_margin_top = 12
patch_margin_right = 12
patch_margin_bottom = 12
```

**边界确定方法**：找到贴图中"可平铺区域"的起止像素。通常是四角装饰的宽度/高度。无法自动推断时，需人工确认。

---

## 六、安全操作流程

1. **备份**
   ```bash
   cp file.tscn file.tscn.bak
   # 或确认 git 工作区干净
   git status --porcelain
   ```

2. **原子写入**
   ```bash
   # 先写临时文件，校验后替换
   write file.tscn.tmp
   # 校验：能被解析、ExtResource 路径都存在、unique_id 无重复
   mv file.tscn.tmp file.tscn
   ```

3. **风险分级**

   | 级别 | 场景 | 处理 |
   |---|---|---|
   | low | `TextureRect` 填空 texture | 可直接执行 |
   | medium | `ColorRect` → `TextureRect` | 执行并记录 |
   | high | 脚本类型假设命中 / 批量跨场景 | **默认拒绝**，需确认 |

4. **分批执行**：不要一次性替换全部。每批（建议 ≤10 个文件）后验证。

---

## 七、验证清单

替换完成后逐项检查：

- [ ] `.tscn` 能被 Godot 正常打开（无解析错误）
- [ ] 所有 `ExtResource` 指向的文件真实存在
- [ ] `unique_id` 无重复、无丢失
- [ ] 无脚本类型错误（跑一次场景）
- [ ] 布局未溢出（贴图尺寸与原包围盒一致或已缩放）
- [ ] 像素风素材已设 `filter=false`
- [ ] `License.txt` 随素材保留
- [ ] 生成替换报告（已替换 / 已跳过 / 待确认）

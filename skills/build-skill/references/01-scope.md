# 01-scope.md — Path Scope 白名单

## 一、定义

- **SCENE_BUILDER_PATHS**: backend 权威常量, 定义 scene-builder **工作副本根允许写入的相对路径白名单** (路径相对 agent CWD 根, 即写 `CLAUDE.md` / `skills/scene-skill/**`, 无 `edit-target/` 这类挂载前缀). 所有 agent Write 到根下的文件, backend 保存时会按此白名单校验, 白名单外的路径**静默 skip** 并回填 `outOfScope` 数组.

  ```json
  ["CLAUDE.md", "skills/scene-skill/**"]
  ```

- **paths_matcher.matches_any** 三档语义 (`backend/src/utils/paths_matcher.py`):
  * **精确匹配**: `"CLAUDE.md"` — 仅匹配 workspace 根下的 `CLAUDE.md` 文件本身.
  * **前缀通配 `prefix/**`**: `"skills/scene-skill/**"` — 匹配该前缀下**任意深度**的所有文件.
  * **单层通配 `dir/*.ext`**: `"skills/*.md"` — 仅匹配 `skills/` **一级**下的 `.md` 文件, 不递归.

- **不支持** `**/*.py` 这类中间层穿透语义, 中间的 `**` 不会跨越目录层级展开, 写了也不会生效.

## 二、规则

- workspace 根**只允许** `CLAUDE.md` + `skills/scene-skill/` 子树两类内容存在. `[check_layout.py 自动化]`
- `skills/` 下**只能有** `scene-skill/` 一个子目录, 不允许并列添加 `other-skill/` / `my-skill/` 等. `[check_layout.py 自动化]`
- 组件必须落在 `skills/scene-skill/components/{cid}/` 下, 三件套齐全: `template.html` + `schema.json` + `demo.json`. `[check_layout.py 自动化]`
- 脚本必须在 `skills/scene-skill/scripts/` 下, 不允许散落到 workspace 根或其他子目录. `[check_layout.py 自动化]`
- `skills/scene-skill/references/` 与 `skills/scene-skill/frame/` 是允许的补充目录. `[check_layout.py 自动化]`
- 白名单外文件被 backend save filter 拒收, 响应体带 `outOfScope: [...]` 数组返回, 前端可提示. `[check_scope.py 自动化]`
- agent 使用 Write 工具时若目标路径落在白名单外, backend commit 阶段会 skip 该文件并推送 SSE `warning` event, agent 需在收到事件后**主动改路径或放弃**. `[agent 判断]`
- workspace 根**不该出现** `rules/` / `agents/` / `test-case/` / `templates/` 等目录 (rev7 老残留), save 会**静默 filter 掉**, 不报错但也不落盘. `[check_layout.py 自动化]`

## 三、反例 & 修法

1. **想在 workspace 根加 `test-case/`**
   - 拦: 不在 `SCENE_BUILDER_PATHS`.
   - 修: 挪到 `skills/scene-skill/references/test-case/`, 或直接跳过 (test-case 不属于 skill 交付物).

2. **想加 `skills/my-skill/`**
   - 拦: `skills/**` 虽在白名单, 但 `check_layout.py` 只允许 `scene-skill/` 一个子目录.
   - 修: 当前架构只有单 skill, 内容合并到 `scene-skill/` 内; 需要拆分请先改架构常量.

3. **agent 想写 `uploads/xxx.csv`**
   - 拦: `uploads/` 不在白名单, save filter 直接 skip.
   - 修: 数据文件走前端 UI 上传按钮, 不由 agent Write.

4. **既有 workspace 里遗留的 `rules/` 目录 (rev7 迁 rev8 常见残留)**
   - 现状: rev7 历史残留, save 时被静默 filter, 磁盘上虽在但**不会被 backend 同步/加载**.
   - 修: agent 不能引用它作为规则来源; 把 `rules/*.md` 内容合并到 `CLAUDE.md` 或 `skills/scene-skill/references/` 下的对应文件.

   ```bash
   # 迁移示例 (在工作副本根 = CWD 下执行)
   cat rules/xx.md >> CLAUDE.md
   rm -r rules/
   ```

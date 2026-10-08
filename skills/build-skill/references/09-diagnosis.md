# 09 · 诊断决策树

用户在 chat 里报的问题基本落在 3 类症状 · 每类都有固定排查路径 · 不要凭猜跳步 · 不确定就 Read 具体文件 + 跑对应 `check_*.py`.

---

## 一、诊断入口

| 症状关键词 | 走哪棵树 |
|---|---|
| "报 500" / "handler fail" / "接口错" | §二 接口异常 |
| "点了没反应" / "stage 不跳" / "刷新才生效" | §三 交互异常 |
| "数据不对" / "缺字段" / "白屏" / "state 里没值" | §四 数据异常 |

先让用户贴 **具体报错信息** (stack trace / console error / response body / 组件截图), 没有就先 `Read skills/scene-skill/actions.json` 确认组件 + actionType 是否存在, 再走树.

---

## 二、决策树 1: 接口异常

```
Step 1 · Read skills/scene-skill/actions.json, 找 componentId.actionType 条目
  - 找不到 → 用户描述的组件名 / actionType 错, 或未注册
  - 找到    → Step 2

Step 2 · 看 handler.type
  - script       → Read skills/scene-skill/scripts/{path}.py 头 docstring 契约段
                   跑 check_script_contract.py 看 declared 契约与真实 IO 是否一致
  - call         → 后端 method, 本地无法跑, 让用户提供 backend log
  - upload_file  → target 模板变量 (如 {context.data_root}) 是否解析
  - write_state /
    patch_state  → target + value/value_from 是否指向真实 key

Step 3 · pipeline 多 handler 场景
  - 跑 check_pipeline_refs.py 确认 value_from 引用的 handler.id 存在且顺序在前
  - 前一步 fail 是否导致后一步拿不到 results.{id}

Step 4 · allowWhen 状态守卫
  - 用户是不是在 sealed / pending / uploading 状态点了不允许的按钮
  - 前端表现: HTTP 403 或 423, 不是 500

Step 5 · backend log
  - 关键行: `[component-action] componentId=X actionType=Y ...` 后的 traceback
```

**常见根因**
- handler.type 拼错 (`patchState` vs `patch_state`) — check_action_shape.py 应拦但可能漏配
- script 里 `import requests / subprocess / os.system` 触沙箱 → 直接 crash
- allowWhen 忘加 `sealed` 场景 → 封存后所有 action 都 403
- template payload 结构与 script docstring 契约段声明不匹配 → script 收不到期望字段

---

## 三、决策树 2: 交互异常

```
Step 1 · Read skills/scene-skill/components/{cid}/template.html
  - 是否用 window.SceneFrame.callAction(...) (而不是裸 fetch)
  - actionType 字面是否与 actions.json 完全一致 (大小写 / 连字符)

Step 2 · 检查 ACTION INTERFACE 注释块
  - template 顶部注释块是否声明该 actionType
  - 跑 check_action_interface_super.py, 确认 template ⊇ actions.json 声明集

Step 3 · postMessage 回传
  - handler 返回体是否含 userMessage / agentPrompt
  - agentPrompt 为空 → 前端只更新 state, 不会再走 agent 二次续渲

Step 4 · stage 跳转 (若期望换 stage)
  - agentPrompt 是否含 `[TRIGGER:NAME k=v ...]` (语法合法; NAME 由 project CLAUDE.md 触发词章节维护, build-skill 只校验语法)
  - Read flow.json, transition.actionTypeMap 是否有该 actionType → 目标 stageId 映射
  - 跑 check_agent_prompt.py + check_flow_transition.py

Step 5 · iframe sandbox 拦截
  - template 里是否用了 alert() / confirm() / prompt() / window.open()
  - 跑 check_no_forbidden_ui.py
```

**常见根因**
- template ACTION INTERFACE 与 actions.json 名字不一致 (`upload-file` vs `upload_file`)
- agentPrompt 里 TRIGGER 名 project 侧未定义 (拼错 / 旧残留, 见 project CLAUDE.md 触发词章节)
- 用了 alert() / confirm(), iframe sandbox 静默拦, 用户观感就是"没反应"
- flow.transition.actionTypeMap 忘加映射 — 接口跑通了但 stage 不动

---

## 四、决策树 3: 数据异常

```
Step 1 · 数据源在哪
  - 用户上传原始文件路径 (运行时 CWD `uploads/_draft/{month}/slots/*.csv`)
  - script 里 handler.input 引用的路径是否真存在 (context 变量展开后)

Step 2 · Read script 头部 docstring
  - 契约段: 输入/输出 dict 结构
  - 沙箱段: 依赖是否越白名单 (pandas / numpy 允许, requests / subprocess 禁)
  - 跑 check_script_contract.py

Step 3 · state-mirror 写入路径
  - write_state / patch_state 的 target 拼写
  - value_from 引用的前置 handler.id 是否真存在
  - 跑 check_state_ui_fanout.py: 是否死写 (写 state 但无组件消费)

Step 4 · 三件套一致性
  - schema.json required 字段是否都在 demo.json
  - template 里访问的字段是否在 schema 中声明
  - 跑 check_component_triad.py

Step 5 · 白屏专用
  - Read template.html 里 <script> 块, 找 undefined 引用
  - SceneFrame.callAction 参数结构是否对
  - 是否依赖 window.INJECTED_DATA 但 backend/preview 未注入 mock
```

**常见根因**
- script docstring 声明输入是 `dict`, 实际收到 `str` — backend 序列化不一致
- template 访问 `data.props.slots[0].value` 但 demo.json / schema 里没该字段
- state-mirror target 拼错 或 {context.data_root} 变量未展开 → 写到 literal 路径
- preview 模式下 INJECTED_DATA 未 mock → 组件初始化 throw → 白屏

---

## 五、通用建议

- **先跑全量**: `python3 .claude/skills/build-skill/scripts/run_all.py --workspace .` 看 warn/fail 汇总 (在工作副本根 = CWD 下执行)
- **让用户贴细节**: stack trace / DevTools console / response body / 截图, 缺一样都容易误诊
- **不猜就 Read**: 每一步都对应一个具体文件, 打开看比推理靠谱
- **改完复跑**: 每一步的 check_*.py 修完后必须重跑, 确认不再报
- **cross-check**: actions.json ↔ template ACTION INTERFACE ↔ flow.transition.actionTypeMap ↔ script docstring, 四处一致才算修好

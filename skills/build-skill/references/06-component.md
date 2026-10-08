# 06-component 组件规范

## 〇、核心思路 (rev25 变更 — 必读)

**组件 = 自包含 UI 骨架 + 固定配置, 动态业务数据一律走接口自拉取, 不再由 compile.py 静态注入.**

- template.html **mount 时必须主动 `SceneFrame.callAction('get_init_data', {})`** (或项目内统一的等价 actionType) 拉取自己的业务数据, 拿到 `handlerResults` 后自行渲染. 组件不再依赖 `--data` / `--auto-inject` 把整块业务数据提前拼进 `__COMPONENT_DATA__`.
- compile.py 只负责拼 **UI 骨架**: 展开 `@include` partial + 注入 `frame/scene-tokens.css` + `frame/scene-frame.js` + 极少量**渲染态元信息** (`meta.componentId` / `meta.stepLabel` / `meta.sealed` 等, 见 §八). **不再**把 demo.json 当"渲染数据骨架"合并进 `data`.
- **demo.json 语义整体切换**: 不再是"组件渲染用的示例 props", 而是**该组件全部 actionType 的 mock 接口响应规则表**, 供平台的请求拦截层在预览 / demo 模式下拦截 `SceneFrame.callAction` 发出的请求, 直接返回预置响应 (不真的打 backend). 结构与规则见 §六.
- **schema.json 校验对象随之改变**: 不再校验"渲染用 data 长什么样", 而是校验 demo.json 里**每条 mock 规则的 response.data 形状** (即接口响应体契约), 见 §六.

> 为什么这么改: 老思路下 compile.py 把 demo.json 整块塞进 `__COMPONENT_DATA__` 渲染, 组件预览态和真实态数据来源不一致 (预览读 demo 骨架, 线上读 state-mirror), 容易出现"demo 能跑, 线上炸"或反过来. 新思路下**预览和线上走同一条路径** (都是组件 mount 后 `callAction` 拉数据), 唯一区别是预览态请求被平台 mock 层拦截返回 demo.json 里声明的固定响应, 线上态请求真的打到 backend. 组件代码本身不用区分环境.

> **跨组件数据传递怎么办**: 若某组件需要的数据不是自己 stage 产生的, 而是**上一步 (甚至是 agent 在对话中算出来) 的产出**, 也**不能**靠 agent 把内容塞进 `--data` / 对话上下文传递 — 正规做法是上游落到 `state-mirror/*.json`, 下游组件用同一套 `get_init_data` → `read_state` 机制去读, 与本 stage 自己的数据同源同路径. 完整落盘方式 (含"agent 对话推理结论"这类没有用户点击动作的场景) 见 `references/10-state-mirror.md` §六.

## 一、目录布局

- 每个组件放 `skills/scene-skill/components/{cid}/`
- 三件套 (三者缺一 warn):
  - `template.html` — UI 骨架 + 交互逻辑; **mount 时自己 `callAction('get_init_data', ...)` 拉全部业务数据**, 不依赖外部注入
  - `schema.json` — **接口响应体契约** (对 demo.json 里每条规则的 `response.data` 做 jsonschema 校验), 不再是"渲染 data 契约"
  - `demo.json` — **该组件全部 actionType 的 mock 拦截规则数组** (`url` + `match.actionType` + `response`), 供平台预览态拦截 `callAction` 请求用, 见 §六

## 二、template.html 头部 ACTION INTERFACE 注释块

**必须**有, 结构如下:

```html
<!--
  ACTION INTERFACE
  ================
  upload_file:
    payload: { slotId: string, fileName: string }
    file: File (multipart)
  submit_x:
    payload: { slotId: string, content: string }
  ...
-->
```

规则:
- 列出**所有** actionType (可以含 actions.json 没有的纯前端行为, 如 `open_dialog` / `download_template`) [check_component_triad.py]
- template ACTION INTERFACE 的 actionType 集合 ⊇ actions.json 该组件的 keys (前端可比 backend 多, 不能反过来) [check_action_interface_super.py]

## 三、callAction 调用规范

- 必须用 `window.SceneFrame.callAction(type, payload, file?)` (`frame/scene-frame.js` 提供)
- **不能**直接 `fetch('/api/component-action')`, SceneFrame 已封装 (加 auth / dialogueId 注入 / postMessage 回父页; backend URL 由宿主页注入 `window.__SCENE_BACKEND_URL__`, 默认 `/api`)
- multipart 场景第 3 参传 File 对象

## 四、禁用行为 (iframe sandbox 会拦, 必须自定义 modal)

- `alert()` / `confirm()` / `prompt()` [check_no_forbidden_ui.py]
- 硬编码色值 (`#ff0000`) → 用 CSS token (`var(--sc-color-primary)`, 见 `frame/scene-tokens.css`) [check_no_forbidden_ui.py]
- 硬编码 URL / 外网 CDN 依赖 → 全走 callAction [check_no_forbidden_ui.py]

**禁用 → 用 SceneFrame.modal API 替代** (定义在 `frame/scene-frame.js`, 均返回 Promise):

- `alert(msg)` → `await SceneFrame.modal.alert(msg, { title?, okText? })`
- `confirm(msg)` → `if (await SceneFrame.modal.confirm(msg, { title?, okText?, cancelText? })) { ... }`
- `prompt(msg, def)` → `const val = await SceneFrame.modal.prompt(msg, def, { title?, placeholder?, okText?, cancelText? }); if (val !== null) { ... }`

Modal HTML 片段: `frame/_shared/modal.html`, 可选 `<!-- @include _shared/modal.html -->` 到组件 `<body>` 末尾 (使用 scene-tokens CSS 变量, 视觉统一). 未 include 时 `SceneFrame.modal.*` 会兜底动态注入极简版 DOM (功能相同, 样式内联).

### `_shared/` 通用 partials 一览

`frame/_shared/` 提供 7 个视觉/交互统一的 HTML 片段, agent 写 template 时**按需 include**, 语法: `<!-- @include _shared/<name>.html -->` (compile.py 在编译时展开).

| partial | 用途 | 组件端交互 API |
|---|---|---|
| `modal.html` | alert/confirm/prompt 对话框 | `SceneFrame.modal.*` (兜底自动注入, 可不 include) |
| `topbar.html` | 组件顶栏 (业务名 + 步骤 label) | 组件 JS 里赋值 `SceneFrame.meta.stepLabel` 触发填充 |
| `footer-nav.html` | 底部 [返回] [下一步] 双按钮 | `SceneFrame.FooterNav.render({back, next, hint})` |
| `table.html` | 通用表格骨架 (sticky thead + 斑马纹) | 纯 CSS + HTML, 组件自渲染 tbody |
| `kpi-grid.html` | 3-6 列 KPI 数字看板 | 纯 CSS + HTML, 组件自填数字 |
| `empty-state.html` | 无数据占位 (icon + 文案 + CTA) | 组件 JS toggle `display:none` 显隐 |
| `form-field.html` | label + input/textarea/select + hint + error | 组件 JS toggle `.has-error` 显错 |

**判断 include 与否**:

- 组件里**没有**该交互 → 不 include
- 组件里**有该交互** → include, 沿用 scene-tokens 视觉, 避免每个组件各写一版样式
- 每个 partial 顶部有 `<!-- @shared ... -->` 注释块说明 config / API, agent 读该注释再用

**⚠️ 写 `_shared/*.html` / 组件 template 头部注释时的雷区**: HTML 注释以**第一个**出现的
`-->` 结束, 若在注释正文里举例写 `<!-- @include xxx.html -->` 这类**带尖括号的完整标签**,
会导致注释在举例处提前截断, 后半段说明文字变成裸文本直接渲染到页面上 (compile.py
`_process_includes` 用 `<!--\s*@shared[\s\S]*?-->` 非贪婪匹配去皮时也会被这个提前的
`-->` 坑到, 只删掉半个注释)。举例引用 `@include` 语法时改用不含尖括号的写法, 如
`"@include _shared/xxx.html"` 或反引号包裹, 不要在注释体内写出完整的 `<!-- ... -->`。

## 五、SceneFrame 完整 API

`frame/scene-frame.js` 提供的 `window.SceneFrame` 全部 API 一览 (agent 写组件时直接调, 不要重复实现):

### 通信

- **`SceneFrame.callAction(type, payload, file?)`** — 发起 component-action, 走 fetch 到 backend
  * `type`: string, 对应 `actions.json` 里的 actionType
  * `payload`: object, 传给 backend handler
  * `file`: File 对象, 有时走 FormData 上传
  * 返回: `Promise<{userMessage, agentPrompt, handlerResults, nextStage}>`

### Toast (顶部飘窗提示)

- **`SceneFrame.toast.success(msg, {duration?}=3000)`** — 绿色成功
- **`SceneFrame.toast.error(msg, {duration?}=5000)`** — 红色错误
- **`SceneFrame.toast.info(msg, {duration?}=3000)`** — 灰色信息

### Loading (加载遮罩)

- **`SceneFrame.loading.show(text?='加载中...')`** — 全屏遮罩 + 转圈
- **`SceneFrame.loading.hide()`** — 关闭

### Modal (对话框, 替代 alert/confirm/prompt)

- **`SceneFrame.modal.alert(msg, {title?, okText?}) → Promise<void>`** — 只 OK 按钮
- **`SceneFrame.modal.confirm(msg, {title?, okText?, cancelText?}) → Promise<boolean>`** — OK/取消, resolve `true`/`false`
- **`SceneFrame.modal.prompt(msg, defaultValue?='', {title?}) → Promise<string|null>`** — 输入框, resolve string 或 `null` (取消)

### 历史回放

- **`SceneFrame.restoreHistory(componentType, historyData)`** — 从 `__COMPONENT_DATA_MOCK__` 恢复组件已触发的操作状态
  * agent 一般不用, 是组件模板自身处理的

### 工具

- **`SceneFrame.meta`** — `{ taskId, messageId, projectId, ... }` 当前上下文
- **`SceneFrame.esc(str)`** — HTML 转义, 防 XSS
- **`SceneFrame.fmt(num, digits?=2)`** — 数字格式化, 加千分位 + 小数位

### 反模式 (禁止)

- 直接 `fetch('<backend>/component-action')` → 用 `SceneFrame.callAction`
- `alert()` / `confirm()` / `prompt()` → 用 `SceneFrame.modal.*`
- 自己写 toast/loading → 用 `SceneFrame.toast` / `SceneFrame.loading`
- 硬编码色值 → 用 CSS token (`var(--brand)` 等)

## 六、demo.json 结构 + mock 拦截规则规范 (rev25)

### 6.1 顶层结构

`demo.json` 是一个**数组**, 每项是一条独立的 mock 拦截规则, 对应组件的一个 `actionType`:

```json
[
  {
    "url": "/budget-chat/api/component-action",
    "method": "POST",
    "name": "<中文可读名, 描述这条规则做什么>",
    "match": { "actionType": "<actionType>" },
    "response": {
      "code": 0,
      "data": {
        "userMessage": "<可选, 对齐 actions.json 该 action 的 userMessage>",
        "agentPrompt": "<可选, 对齐 actions.json 该 action 的 agentPrompt>",
        "handlerResults": [
          { "type": "<handler.type>", "id": "<handler.id, 若有>", "response": { ... } }
        ]
      }
    }
  }
]
```

字段规则:

- `url` — 固定 `/budget-chat/api/component-action` (与 `frame/scene-frame.js` 的 `_COMPONENT_ACTION_URL` 一致), **不要**每条规则各写各的, 统一抄这个值
- `method` — 固定 `"POST"`
- `name` — 中文短描述, 人读, 不参与匹配
- `match.actionType` — 必须是该组件在 `actions.json` 里注册的 actionType 之一, **或**是纯前端行为 actionType (template ACTION INTERFACE 里声明但 actions.json 没有的那种, 见 §二); **每个 actionType 至少一条规则**, 多条也允许 (如同一 actionType 按 payload 细分多种 mock 场景, 此时 `match` 可以额外加 payload 维度的匹配键, 具体匹配算法由平台拦截层决定, 本规范只约束 `actionType` 这一必填维度)
- `response.code` — 固定 `0` (成功态). 需要 mock 失败态时, 平台约定另行声明 (当前规范只覆盖成功态 mock)
- `response.data.handlerResults` — **结构对齐 actions.json 该 action 的 `handlers[]` pipeline**: 每个 handler 一条 `{type, id?, response}`, `type` 与 `id` 抄 actions.json 对应 handler 的声明, `response` 是这个 handler 在 mock 场景下"假装返回"的数据 (通常按 handler.type 惯例):
  - `type: "call"` (如 `read_state`) → `response: {method: "read_state", response: {...}}`
  - `type: "script"` → `response: {...script 的 data 字段内容...}` (对齐 `{"success": true, "data": {...}}` 里的 `data`)
  - `type: "write_state"` / `type: "upload_file"` → `response: {success: true, ...}` 纯占位, 前端一般不消费其 response body
- `response.data.userMessage` / `agentPrompt` — 有值时应与 `actions.json` 里该 action 的**同名字段完全一致** (mock 态也要能验证 toast 文案 / 触发词联动), 该 action 在 actions.json 里为空则省略或留空串

### 6.2 get_init_data (或组件专属拉取 action) 的 mock 规则是重中之重

每个组件的 `demo.json` **必须包含** mount 时自拉取用的那个 actionType (项目统一叫 `get_init_data`, 或组件自定义拉取 actionType) 的 mock 规则, 这是组件在预览模式下"有数据可看"的唯一来源. 其 `handlerResults` 应尽量覆盖组件渲染需要的**全部字段**, 给出真实、能直接看的示例值 (不含占位符), 而不是空 dict.

### 6.3 schema.json 校验对象 = 接口响应体, 不是渲染 data

`schema.json` 不再对"渲染用的 props/data" 做校验, 而是对 **demo.json 数组里每一项的 `response.data`** 做校验 (jsonschema draft-07):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["code", "data"],
  "properties": {
    "code": { "const": 0 },
    "data": {
      "type": "object",
      "properties": {
        "handlerResults": { "type": "array", "minItems": 1 }
      },
      "required": ["handlerResults"]
    }
  }
}
```

业务字段的强约束 (如 `handlerResults[0].response.slots 必须非空数组`) 按 11-13 铁律的写法下钻到 `properties.data.properties.handlerResults.items...`, 不写死在 compile.py.

### 6.4 规则

- demo.json 每条规则的 `match.actionType` 必须能在 actions.json 该组件的 keys 里找到, **或**在 template ACTION INTERFACE 里声明为纯前端 actionType [check_component_triad.py]
- actions.json 该组件的每个 actionType, demo.json 里至少有一条规则覆盖 (mock 全覆盖, 不能漏) [check_component_triad.py]
- demo.json 每条规则的 `response` 必须能通过 schema.json 校验 [check_component_triad.py]
- 组件 mount 自拉取用的 actionType 必须在 demo.json 里有对应规则, 且 `handlerResults` 非空 [check_component_triad.py]

## 七、反例

1. template 里 `alert('提交成功')` → 拦
2. template 里 `background: #007acc` → warn (应用 token)
3. template ACTION INTERFACE 缺 `upload_file`, actions.json 却有 → 拦 (前端超集不成立)
4. actions.json 组件下有 `confirm_ready` action, demo.json 里没有任何 `match.actionType == "confirm_ready"` 的规则 → 拦 (mock 覆盖不全, 预览会真的打空 fetch)
5. template 里 `fetch('/api/component-action')` 直接调 → warn (应用 `SceneFrame.callAction`)
6. demo.json 里 `response.data.handlerResults` 为空数组或缺失, 但该 action 在 actions.json 里配了非空 `handlers[]` → 拦 (mock 数据是空壳, 预览态组件会白屏)
7. template mount 时不调任何 `callAction` 自拉取数据, 而是期待外部注入 `__COMPONENT_DATA__.props.xxx` → warn (违反 §〇 核心思路, 组件应自包含拉取逻辑)

## 八、compile.py 组件渲染 SOP (rev25 — UI 骨架渲染, 不再合并业务数据)

`skills/scene-skill/compile.py` 是组件编译器, 负责把 template.html 编译成完整可运行 HTML (展开 `@include` partial + 注入 `frame/scene-tokens.css` + `frame/scene-frame.js` + 极少量渲染态 `meta` 信息), 由 agent 在 chat 里跑, 输出 conclusion JSON 指向 `artifacts/*.html`. **不再**读 demo.json 拼渲染数据 — 组件业务数据全部由组件自己 mount 后 `callAction('get_init_data', ...)` 向 backend (或预览态的 mock 拦截层) 要.

### 唯一运行模式: 骨架编译

```bash
python3 compile.py --component <componentId> --id <artifact-id>
```

- `--component` 决定读哪个 `components/{cid}/template.html`
- 不再需要 `--data` / `--auto-inject` (旧版这两个参数用于把业务数据塞进 `__COMPONENT_DATA__`, 新架构下组件自己拉, 无需 agent/compile.py 代劳)
- `--batch` 仍保留, 用于打包发布场景下批量出骨架 HTML (见旧版语义, 逻辑不变, 只是每个骨架不再带业务 data)

### 数据从哪来: 统一走 callAction, 环境靠平台 mock 层区分

组件 template.html 里**不区分预览态 / 线上态**, 统一在 mount 时:

```js
SceneFrame.callAction('get_init_data', {}).then(function (res) {
  // res.handlerResults 里取业务数据, 渲染页面
});
```

- **线上态**: 请求真的打到 backend `/component-action`, backend 按 `actions.json` 的 pipeline 跑 `handlers[]`, 返回真实 `handlerResults`
- **预览 / demo 态**: 平台请求拦截层读组件 `demo.json`, 按 `match.actionType == 'get_init_data'` 命中规则, 直接返回该规则声明的 `response`, **不打 backend**

agent 侧因此**不需要**在渲染前额外准备业务数据 (不调 `read_state` / `query.py` 提前拉), 组件自己会拉. agent 只管编译骨架 + 输出 conclusion.

### conclusion 输出格式

compile.py stdout 输出单行 JSON:

```json
{"artifact_path": "artifacts/{componentId}_<hash>.html", "kind": "spend_alloc_component", "id": "<hash>", "size_bytes": 12345}
```

agent 拿到 `artifact_path` 后在 chat 里输出 `{"componentType": "html-component", "content": "artifacts/{componentId}_<hash>.html"}` conclusion, 前端渲 iframe 展示.

**详细见** project CLAUDE.md 里的 "组件渲染" 章节 (每 project 自己维护渲染命令速查表).

### 九、⚠️ artifact 命名铁律 (前端「测试」对话联动中间预览步骤/组件的唯一依据)

**背景**: 「测试」模式对话产出 html-component 后, 前端只靠 conclusion 的
`content` 文件名**解析出 componentId**, 据此驱动中间预览自动跳到正确的
stage / 组件 tab (`budget-chat/frontend/src/lib/sceneBuilderTrigger.js`
`extractComponentIdFromArtifactPath`)。命名不规范 = 联动跳转失效/跳错。

**硬性规则**:

```
artifacts/{componentId}_{任意后缀}.html
```

- `{componentId}` 必须是 **flow.json / actions.json 里注册的真实 componentId 原文**
  (kebab-case, 如 `budget-input` / `dimension-strategy`), 不做任何缩写或改写
- `componentId` 与后缀之间**必须用下划线 `_` 分隔** (不能用 `-`, 因为 componentId
  自身含 `-`, 用 `-` 分隔会导致前端正则无法唯一切分)
- `{任意后缀}` (时间戳 / hash / 随机串) 内部允许包含 `-`, 不影响解析 (正则只认
  第一个 `_` 之前的部分为 componentId)
- **标杆 `frame/compile.py` 已按此规则生成文件名** (`{componentId}_{artifact_id}.html`),
  project 侧**不允许手写 compile.py** 覆盖这个逻辑 (见 §八 "严禁手写 compile.py")
- 若 agent 用 `--output <path>` 显式指定输出路径 (跳过 compile.py 内置命名逻辑),
  **必须手动遵守同一规则**: `artifacts/{componentId}_$(date +%s%3N).html`

**正确示例**:

```
artifacts/budget-input_1785400379648.html
artifacts/dimension-strategy_a3f7c2.html
```

**错误示例** (会导致前端联动跳转失败):

```
artifacts/component-budget-input-1785400379648.html   ← 用 `-` 分隔, 无法唯一解析
artifacts/spend_alloc-1785400379648.html               ← 前缀不是真实 componentId
artifacts/1785400379648.html                           ← 完全没有 componentId
```

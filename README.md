# 游戏设计助手（Game Design Assistant）

本地运行的 AI 游戏设计工作台：接入 LLM（默认 DeepSeek，支持自定义 OpenAI 兼容端点），由 7 类专职 agent 按 SOP 引导你从一句想法走到一套可开发的策划文档包 + 可玩的 HTML 原型。

## 功能特性

- **SOP 流程编排**：引导收集 → 竞品分析 → HTML 可玩原型 → 数值分析 → 技术原型 → 玩家评估 → 交付整合，每步独立生成、可重跑、可终止
- **对话式访谈**：引导 agent 围绕概念/竞品/目标用户/核心循环/商业模式逐项提问，回答自动落盘
- **HTML 可玩原型**：原型 agent 直接产出单文件 HTML 游戏，iframe 沙箱内嵌试玩，支持全屏
- **玩家画像评估**：内置预设画像 + 自定义画像，按画像生成评估报告；支持粘贴竞品资料注入上下文
- **交付包**：一致性检查 → GDD → 索引，输出到 `deliverables/`
- **实时流式 UI**：token 级流式输出（按输出段分块展示）、思考/工具调用活动指示、断线重连自动恢复快照
- **每 agent 可配置**：模型、系统提示词、可用工具集、外挂 skill zip 包、maxTurns 均可在设置中按 agent 调整；默认禁用 Agent 工具
- **供应商可切换**：DeepSeek（预设）或自定义 baseUrl + 模型的 OpenAI 兼容端点

## 技术栈

- **Server**：Node.js 20.19+ / TypeScript / Express 5 / `@anthropic-ai/claude-agent-sdk`（经 ANTHROPIC 兼容层接入 DeepSeek）
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

开发模式（前端热更 + 服务端 tsx）：

```bash
npm run dev
```

## 项目结构

```
├─ packages/shared/src/   # 共享类型（project / step / settings / registry / sse / api）
├─ server/src/
│  ├─ store/              # 项目 / 设置 / 产物 / 运行日志持久化（data/ 目录）
│  ├─ registry/           # 7 类 agent 的 step 注册表
│  ├─ prompts/            # 内置提示词模板
│  ├─ sdk/                # Agent SDK 封装（env 注入、流式、输入队列）
│  ├─ orchestrator/       # 编排：上下文组装、并发信号量、事件总线、运行器
│  └─ http/               # Express 路由 + SSE
├─ web/src/               # React 前端（项目列表 / 流程看板 / 步骤聊天 / 产物查看 / 设置）
└─ data/                  # 运行数据（gitignored，含密钥，勿提交）
```

## 安全说明

- `data/`（含 `settings.json` 中的 API Key、项目数据、技能包）已被 `.gitignore` 排除，不会进入版本库
- 服务端日志与 SSE 事件均不含密钥；设置接口返回时对 apiKey 脱敏
- HTML 原型在 `sandbox="allow-scripts"` iframe 中运行，无法访问父页面

## License

[MIT](./LICENSE)

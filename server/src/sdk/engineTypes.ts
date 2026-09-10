/**
 * 引擎契约：所有引擎（claude-agent-sdk / Codex）共用的类型与错误。
 * 下游（orchestrator / routes）只依赖这里的内容，不感知具体引擎。
 */

export interface StreamHandlers {
  /** 增量文本（Claude 引擎逐字；Codex 引擎按整条消息到达） */
  onDelta?: (text: string) => void;
  /** 思考增量/摘要（可能不存在） */
  onThinking?: (text: string) => void;
  /** 引擎开始调用一个工具（UI 显示「正在使用xxx工具...」） */
  onToolUse?: (tool: string) => void;
  /** 一轮 assistant 回复完整结束（对话模式每轮触发一次） */
  onAssistantTurn?: (text: string, sessionId: string) => void;
  /** 原始引擎事件（写入 run 日志，便于事后排查） */
  onRawMessage?: (msg: unknown) => void;
}

/**
 * 引擎无关的用户消息最小结构。
 * content 放宽为 unknown：SDKUserMessage 的 content 允许 string | 内容块数组，
 * 而本项目对话链路只投递纯文本，各引擎自行取文本。
 */
export interface EngineUserMessage {
  message: { content: unknown };
}

export interface QueryRunOptions {
  settings: import('@gda/shared').Settings;
  model: string;
  systemPrompt: string;
  /** 字符串 = 单次生成；AsyncIterable = 对话模式（先 push 首条，再按用户回复逐条 push，end() 结束） */
  prompt: string | AsyncIterable<EngineUserMessage>;
  abortController: AbortController;
  maxTurns: number;
  /** 允许使用的联网/系统工具（如 ['WebSearch']）；默认全部禁用 */
  allowedTools?: string[];
  /** 工作目录（项目数据目录）。设置后启用文件工具并施加 cwd 写保护 */
  cwd?: string;
  /** 外挂技能插件目录（绝对路径）。仅 Claude 引擎支持，Codex 引擎忽略 */
  plugins?: string[];
  handlers?: StreamHandlers;
}

export interface QueryRunResult {
  finalText: string;
  sessionId: string;
  costUsd: number;
}

export class QueryRunError extends Error {
  constructor(
    public code: 'aborted' | 'provider' | 'max_turns' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}

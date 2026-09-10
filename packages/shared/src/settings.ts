export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';

/** DeepSeek OpenAI Responses 协议端点（Codex 引擎用；DeepSeek 官方为 Codex 专门提供） */
export const DEEPSEEK_BASE_URL_OPENAI = 'https://api.deepseek.com';

/** 提供方：deepseek=官方网关（baseUrl 固定）；custom=自定义网关 */

export type ProviderKind = 'deepseek' | 'custom';

/**
 * 协议格式即引擎选择：
 * - anthropic：claude-agent-sdk（Claude Code CLI 子进程），baseUrl 需为 Anthropic 兼容端点
 * - openai-responses：@openai/codex-sdk（Codex CLI 子进程），baseUrl 需为 OpenAI Responses 兼容端点
 */
export type ProtocolKind = 'anthropic' | 'openai-responses';

/** agent 可配置的全部工具（设置 UI 的候选清单） */
export const AGENT_TOOL_OPTIONS = [
  'Read',
  'Glob',
  'Grep',
  'Write',
  'Edit',
  'WebSearch',
  'WebFetch',
  'NotebookEdit',
  'TodoWrite',
  'Agent',
  'Bash',
] as const;

/** 默认工具集 = 全量去掉 Agent 工具（用户要求：默认不可使用 agent 工具） */
export const DEFAULT_AGENT_TOOLS: string[] = AGENT_TOOL_OPTIONS.filter((t) => t !== 'Agent');

export interface AgentOverride {
  model?: string; // undefined → settings.defaultModel
  systemPrompt?: string; // undefined/'' → 内置默认模板
  allowedTools?: string[]; // undefined → DEFAULT_AGENT_TOOLS（不含 Agent）
  skills?: string[]; // 已上传技能包名列表；undefined/[] → 不加载任何外挂技能
  maxTurns?: number; // undefined → 内置默认（按 step 类型；html 原型更高）
}

/** GET /api/skills 返回的技能包条目 */
export interface SkillEntry {
  name: string;
  description: string;
}

/** 技能包（以本地插件布局存于 data/skills/<name>/） */
export interface SkillPackage {
  name: string;
  skills: SkillEntry[];
}

export interface Settings {
  provider: ProviderKind;
  /** 协议格式（即引擎）：anthropic=claude-agent-sdk；openai-responses=Codex */
  protocol: ProtocolKind;
  apiKey: string;
  baseUrl: string;
  /** 默认模型名，自由输入（两家网关都不再内置候选集合，模型名由用户按当前实际名称填写）；必填，保存时拒绝空值 */
  defaultModel: string;
  maxConcurrentRuns: number; // 默认 3
  /** 按 stepKey（"agentId:stepId"）粒度的步骤覆盖；玩家画像 step 不开放单独配置 */
  agentOverrides: Record<string, AgentOverride>;
  /** agent 级技能挂载（agentId → 技能包名），对该 agent 全部步骤生效，与步骤级挂载合并 */
  agentSkillMounts: Record<string, string[]>;
}

/** GET /api/settings 返回的脱敏视图 */
export interface SettingsView {
  provider: ProviderKind;
  protocol: ProtocolKind;
  baseUrl: string;
  defaultModel: string;
  maxConcurrentRuns: number;
  hasApiKey: boolean;
  agentOverrides: Settings['agentOverrides'];
  agentSkillMounts: Settings['agentSkillMounts'];
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'deepseek',
  protocol: 'anthropic',
  apiKey: '',
  baseUrl: DEEPSEEK_BASE_URL,
  // 初始为空，用户必须填写（模型名由服务方随时变更，内置默认值会静默失效）；保存时空值被拒绝
  defaultModel: '',
  maxConcurrentRuns: 3,
  agentOverrides: {},
  agentSkillMounts: {},
};

import type { AgentId } from './step.js';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';
export const DEEPSEEK_MODELS = [
  'deepseek-chat',
  'deepseek-reasoner',
  'deepseek-v4-flash-vision-exp',
] as const;
export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[number];

/** 提供方：deepseek=官方网关（baseUrl/模型固定枚举）；custom=自定义网关（自由输入） */
export type ProviderKind = 'deepseek' | 'custom';

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
  apiKey: string;
  baseUrl: string;
  defaultModel: string; // deepseek 时为 DEEPSEEK_MODELS 之一，custom 时自由输入
  maxConcurrentRuns: number; // 默认 3
  agentOverrides: Partial<Record<AgentId, AgentOverride>>;
}

/** GET /api/settings 返回的脱敏视图 */
export interface SettingsView {
  provider: ProviderKind;
  baseUrl: string;
  defaultModel: string;
  maxConcurrentRuns: number;
  hasApiKey: boolean;
  agentOverrides: Settings['agentOverrides'];
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: DEEPSEEK_BASE_URL,
  defaultModel: 'deepseek-chat',
  maxConcurrentRuns: 3,
  agentOverrides: {},
};

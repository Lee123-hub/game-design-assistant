// Step / agent 相关共享类型

export type AgentId =
  | 'guide'
  | 'competitor'
  | 'prototype'
  | 'numeric'
  | 'tech'
  | 'player'
  | 'assemble';

export const AGENT_IDS: AgentId[] = [
  'guide',
  'competitor',
  'prototype',
  'numeric',
  'tech',
  'player',
  'assemble',
];

export const AGENT_LABELS: Record<AgentId, string> = {
  guide: '引导收集',
  competitor: '竞品分析',
  prototype: 'HTML 原型',
  numeric: '数值分析',
  tech: '技术原型',
  player: '玩家评估',
  assemble: '交付整合',
};

/** step 运行状态。waiting_input 仅 conversational step 在等用户回答时出现 */
export type StepState = 'pending' | 'running' | 'waiting_input' | 'done' | 'error' | 'canceled';

/** `${agentId}:${stepId}`，如 "guide:concept"、"player:custom-abc" */
export type StepKey = string;

export interface StepError {
  code: 'aborted' | 'interrupted' | 'provider' | 'max_turns' | 'invalid_output' | 'unknown';
  message: string;
}

export interface StepRecord {
  stepKey: StepKey;
  runId: string | null;
  state: StepState;
  startedAt?: string;
  finishedAt?: string;
  error?: StepError;
  /** SDK sessionId，用于对话式 step 续聊 / 调试 */
  sessionId?: string;
  /** 相对项目目录的产物路径 */
  artifactPath?: string;
  outputKind?: OutputKind;
}

export type OutputKind = 'markdown' | 'html';

export type StepMode = 'generative' | 'conversational';

// Step / agent 相关共享类型

export type AgentId = 'guide' | 'prototype' | 'design' | 'numeric' | 'player';

export const AGENT_IDS: AgentId[] = ['guide', 'prototype', 'design', 'numeric', 'player'];

export const AGENT_LABELS: Record<AgentId, string> = {
  guide: '引导收集',
  prototype: 'HTML 原型',
  design: '详细设计',
  numeric: '数值分析',
  player: '玩家评估',
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

/**
 * 产物形态：
 * - markdown：单份 md 文档
 * - html：单文件可玩原型
 * - csv：1~N 份 csv 配置表 + 1 份说明 md（详细设计·配置表节点）
 * - html-modules：每个模块一个静态展示 HTML（详细设计·模块 UI 原型节点），
 *   存放于 prototypes/ui/，文件名 `<模块名>-v<N>-<YYYYMMDD-HHMMSS>.html`
 */
export type OutputKind = 'markdown' | 'html' | 'csv' | 'html-modules';

export type StepMode = 'generative' | 'conversational';

import type { AgentId, OutputKind, StepKey, StepMode } from './step.js';

/**
 * step 声明（不含服务端函数，跨端共享）。
 * contextBuilder 在服务端按 dependsOn 解析上游产物，不需要进 StepDef。
 */
export interface StepDef {
  agentId: AgentId;
  stepId: string;
  title: string;
  mode: StepMode;
  outputKind: OutputKind;
  /** 上游产物注入为上下文 */
  dependsOn: StepKey[];
  /** 允许该 step 使用 WebSearch 工具（agent 自行联网调研） */
  useWebSearch?: boolean;
  /** prompts/ 下的内置默认提示词文件名 */
  promptFile: string;
  /** 默认 maxTurns，generative 一般 1-2 */
  maxTurns: number;
  /** 完成后同步复制到 deliverables/ 的文件名（assemble 步骤用） */
  deliverableFile?: string;
  /** 聊天输入框上方预置的可点击 query（点击即作为消息发起） */
  presetQueries?: string[];
  /** 访谈步骤注入为上下文的上游产物（不参与解锁门控） */
  contextDeps?: StepKey[];
}

export interface AgentDef {
  agentId: AgentId;
  title: string;
  description: string;
  steps: StepDef[];
}

/** promptFile 引用的内置提示词 */
export const PROMPT_FILES = {
  guideConversational: 'guide-conversational.md',
  guideOnePager: 'guide-one-pager.md',
  competitorAnalysis: 'competitor-analysis.md',
  prototypeHtml: 'prototype-html.md',
  numericEconomy: 'numeric-economy.md',
  numericProgression: 'numeric-progression.md',
  techStack: 'tech-stack.md',
  techRisks: 'tech-risks.md',
  playerEval: 'player-eval.md',
  assembleConsistency: 'assemble-consistency.md',
  assembleGdd: 'assemble-gdd.md',
  assembleIndex: 'assemble-index.md',
} as const;

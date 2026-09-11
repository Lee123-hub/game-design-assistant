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
  /** 上游产物注入为上下文；同时是解锁门控（全部 done 才解锁） */
  dependsOn: StepKey[];
  /** 允许该 step 使用 WebSearch 工具（agent 自行联网调研） */
  useWebSearch?: boolean;
  /** prompts/ 下的内置默认提示词文件名 */
  promptFile: string;
  /**
   * 追加到系统提示词末尾的内置约束文件（prompts/ 下文件名）。
   * 在 resolveSystemPrompt 内追加，因此用户覆盖提示词时同样生效。
   */
  promptExtras?: string[];
  /** 默认 maxTurns，generative 一般 1-2 */
  maxTurns: number;
  /** 用户未配置 maxTurns 时使用的轮数上限；不写 = 99（基本不限制） */
  maxTurnsHint?: number;
  /** step 的默认工具集（缺省 = DEFAULT_AGENT_TOOLS，不含 Agent） */
  defaultTools?: string[];
  /** 完成后同步复制到 deliverables/ 的文件名（已废弃，保留字段兼容旧 project.json） */
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
  prototypeHtml: 'prototype-html.md',
  designModule: 'design-module.md',
  moduleUi: 'module-ui.md',
  uiConstraints: 'ui-design-constraints.md',
  designConfigTables: 'design-config-tables.md',
  numericInterview: 'numeric-interview.md',
  numericSop: 'numeric-sop.md',
  numericEconomy: 'numeric-economy.md',
  numericProgression: 'numeric-progression.md',
  playerEval: 'player-eval.md',
  playerSummary: 'player-summary.md',
} as const;

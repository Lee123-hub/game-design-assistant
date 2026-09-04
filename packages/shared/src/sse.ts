import type { Project } from './project.js';
import type { StepError, StepKey, StepState } from './step.js';

export interface GuideTurn {
  role: 'assistant' | 'user';
  text: string;
}

/** SSE 事件（event: <type> / id: seq / data: json） */
export type ServerEvent =
  | {
      type: 'snapshot';
      project: Project;
      /** 存活中的对话式 step 轮次（重连恢复用） */
      guideTurns?: Record<StepKey, GuideTurn[]>;
    }
  | { type: 'step_state'; stepKey: StepKey; state: StepState; runId?: string; error?: StepError }
  | { type: 'delta'; stepKey: StepKey; runId: string; text: string }
  | { type: 'thinking'; stepKey: StepKey; runId: string; text: string }
  | { type: 'tool_use'; stepKey: StepKey; runId: string; tool: string }
  | {
      type: 'guide_turn';
      stepKey: StepKey;
      runId: string;
      question: string;
    }
  | { type: 'step_done'; stepKey: StepKey; runId: string; artifactPath: string }
  | { type: 'step_error'; stepKey: StepKey; runId: string; error: StepError }
  | { type: 'ping' };

export const SSE_EVENT_TYPES = [
  'snapshot',
  'step_state',
  'delta',
  'thinking',
  'tool_use',
  'guide_turn',
  'step_done',
  'step_error',
  'ping',
] as const;

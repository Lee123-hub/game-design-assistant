import type { OutputKind, StepKey, StepMode } from './step.js';
import type { Project, ProjectSummary } from './project.js';
import type { SettingsView, DeepSeekModel } from './settings.js';
import type { AgentDef, StepDef } from './registry.js';

// ---------- Settings ----------

/** 单个 step 的运行配置快照（设置 UI 按 stepKey 粒度编辑） */
export interface StepInfo
  extends Pick<StepDef, 'stepId' | 'title' | 'mode' | 'dependsOn' | 'presetQueries'> {
  stepKey: string;
  outputKind: OutputKind;
  defaultTools: string[];
  promptFile: string;
  defaultPrompt: string;
  overridden: boolean;
  model: string;
  /** 玩家画像 step 不开放单独配置 */
  configurable: boolean;
}

export interface AgentInfo {
  agentId: string;
  title: string;
  description: string;
  steps: StepInfo[];
}

export interface SettingsTestResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

// ---------- Projects ----------

export interface CreateProjectBody {
  name: string;
  idea: string;
}

export interface ProjectDetail {
  project: Project;
  registry: AgentInfo[];
}

export interface ArtifactInfo {
  stepKey: StepKey;
  artifactPath: string;
  outputKind: OutputKind;
  updatedAt: string;
}

export interface ArtifactContent {
  content: string;
  outputKind: OutputKind;
  updatedAt: string;
}

/** step 产物版本文件信息（列表按生成时间倒序，最新一个即当前版本） */
export interface StepFileInfo {
  name: string;
  updatedAt: string;
}

// ---------- Steps ----------

export interface RunStepResult {
  runId: string;
  queued: boolean;
}

export interface AddPersonaBody {
  name: string;
  description: string;
}

// ---------- re-exports for web convenience ----------

export type { Project, ProjectSummary };
export type { SettingsView, DeepSeekModel };
export type { AgentDef, StepDef };
export type { StepKey, StepMode, OutputKind };

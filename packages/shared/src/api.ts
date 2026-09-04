import type { OutputKind, StepKey, StepMode } from './step.js';
import type { Project, ProjectSummary } from './project.js';
import type { SettingsView, DeepSeekModel } from './settings.js';
import type { AgentDef, StepDef } from './registry.js';

// ---------- Settings ----------

export interface AgentInfo {
  agentId: string;
  title: string;
  description: string;
  steps: Array<Pick<StepDef, 'stepId' | 'title' | 'mode' | 'dependsOn' | 'presetQueries'>>;
  defaultPrompt: string;
  overridden: boolean;
  overrideModel?: string;
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

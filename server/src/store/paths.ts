import path from 'node:path';
import { PROJECTS_DIR } from '../config.js';
import { isSafeSegment } from '../util/fs.js';

export function projectDir(projectId: string): string {
  if (!isSafeSegment(projectId)) throw new Error(`非法项目 id: ${projectId}`);
  return path.join(PROJECTS_DIR, projectId);
}

export function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), 'project.json');
}

/** steps/<agentId>/<stepId>.md（历史遗留主文件路径，兼容旧数据） */
export function stepArtifactFile(projectId: string, stepKey: string): string {
  const [agentId, stepId] = stepKey.split(':');
  if (!agentId || !stepId || !isSafeSegment(agentId) || !isSafeSegment(stepId)) {
    throw new Error(`非法 stepKey: ${stepKey}`);
  }
  return path.join(projectDir(projectId), 'steps', agentId, `${stepId}.md`);
}

/** steps/<agentId>/ 目录（agent 写产物文件的目标目录） */
export function stepArtifactDir(projectId: string, agentId: string): string {
  if (!isSafeSegment(agentId)) throw new Error(`非法 agentId: ${agentId}`);
  return path.join(projectDir(projectId), 'steps', agentId);
}

/** prototypes/ 目录 */
export function prototypeDir(projectId: string): string {
  return path.join(projectDir(projectId), 'prototypes');
}

/** prototypes/<stepId>.html */
export function prototypeFile(projectId: string, stepId: string): string {
  if (!isSafeSegment(stepId)) throw new Error(`非法 stepId: ${stepId}`);
  return path.join(projectDir(projectId), 'prototypes', `${stepId}.html`);
}

/** prototypes/ui/ 目录（模块 UI 原型：每个模块一个 html 文件） */
export function prototypeUiDir(projectId: string): string {
  return path.join(projectDir(projectId), 'prototypes', 'ui');
}

export function deliverablesDir(projectId: string): string {
  return path.join(projectDir(projectId), 'deliverables');
}

/** runs/<runId>.jsonl */
export function runLogFile(projectId: string, runId: string): string {
  if (!isSafeSegment(runId)) throw new Error(`非法 runId: ${runId}`);
  return path.join(projectDir(projectId), 'runs', `${runId}.jsonl`);
}

/** sessions/<agentId>__<stepId>.json（每个 step 的独立聊天 session） */
export function sessionFile(projectId: string, stepKey: string): string {
  const [agentId, stepId] = stepKey.split(':');
  if (!agentId || !stepId || !isSafeSegment(agentId) || !isSafeSegment(stepId)) {
    throw new Error(`非法 stepKey: ${stepKey}`);
  }
  return path.join(projectDir(projectId), 'sessions', `${agentId}__${stepId}.json`);
}

/** 相对项目目录的产物路径（存进 StepRecord.artifactPath） */
export function relativeArtifactPath(absolute: string, projectId: string): string {
  return path.relative(projectDir(projectId), absolute);
}

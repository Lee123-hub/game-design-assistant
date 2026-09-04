import fs from 'node:fs/promises';
import { AGENT_IDS, PRESET_PERSONAS, type Project, type StepRecord } from '@gda/shared';
import { PROJECTS_DIR } from '../config.js';
import { atomicWriteFile, ensureDir, fileExists } from '../util/fs.js';
import { buildRegistry } from '../registry/index.js';
import { projectDir, projectFile } from './paths.js';

const writeQueues = new Map<string, Promise<void>>();

/** 同一 project.json 的写操作串行化，避免并发重生成时互相覆盖 */
function enqueueWrite<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(projectId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeQueues.set(
    projectId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export async function listProjectIds(): Promise<string[]> {
  await ensureDir(PROJECTS_DIR);
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** 仅读盘，不做迁移（供写队列内部使用，避免队列内再入队造成死锁） */
async function readProjectRaw(projectId: string): Promise<Project | null> {
  const file = projectFile(projectId);
  if (!(await fileExists(file))) return null;
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as Project;
}

export async function loadProject(projectId: string): Promise<Project | null> {
  const project = await readProjectRaw(projectId);
  if (!project) return null;
  // 读取即迁移：注册表变化（如新流程步骤）后，老项目在首次加载时自动补齐/清理并落盘一次
  if (materializeSteps(project)) {
    await saveProject(project);
  }
  return project;
}

export async function saveProject(project: Project): Promise<void> {
  project.updatedAt = new Date().toISOString();
  return enqueueWrite(project.id, () =>
    atomicWriteFile(projectFile(project.id), JSON.stringify(project, null, 2)),
  );
}

/** 对 project.json 做读-改-写（写与其他写串行） */
export async function updateProject(
  projectId: string,
  mutate: (p: Project) => void | Promise<void>,
): Promise<Project> {
  return enqueueWrite(projectId, async () => {
    const project = await readProjectRaw(projectId);
    if (!project) throw new Error(`项目不存在: ${projectId}`);
    await mutate(project);
    project.updatedAt = new Date().toISOString();
    await atomicWriteFile(projectFile(projectId), JSON.stringify(project, null, 2));
    return project;
  });
}

export async function createProject(name: string, idea: string): Promise<Project> {
  const id = `p-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const project: Project = {
    id,
    name,
    idea,
    createdAt: now,
    updatedAt: now,
    steps: {},
    personas: PRESET_PERSONAS.map((p) => ({ ...p })),
  };
  materializeSteps(project);
  await ensureDir(projectDir(id));
  await atomicWriteFile(projectFile(id), JSON.stringify(project, null, 2));
  return project;
}

export async function deleteProject(projectId: string): Promise<void> {
  await fs.rm(projectDir(projectId), { recursive: true, force: true });
}

/**
 * 按当前注册表把缺失的 step 物化进 project.steps（幂等）。
 * 新增 persona / 注册表变化后调用即可补齐。返回是否有变更。
 */
export function materializeSteps(project: Project): boolean {
  const registry = buildRegistry(project.personas);
  let changed = false;
  for (const step of registry.flatMap((a) => a.steps)) {
    const key = `${step.agentId}:${step.stepId}`;
    if (!project.steps[key]) {
      const record: StepRecord = { stepKey: key, runId: null, state: 'pending' };
      if (step.outputKind) record.outputKind = step.outputKind;
      project.steps[key] = record;
      changed = true;
    }
  }
  // 清理已不存在的 step（例如删除了 persona / 注册表移除了旧步骤）
  const validKeys = new Set(registry.flatMap((a) => a.steps).map((s) => `${s.agentId}:${s.stepId}`));
  for (const key of Object.keys(project.steps)) {
    if (!validKeys.has(key)) {
      delete project.steps[key];
      changed = true;
    }
  }
  return changed;
}

export async function listProjects(): Promise<Project[]> {
  const ids = await listProjectIds();
  const projects = await Promise.all(ids.map((id) => loadProject(id)));
  return projects
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export { AGENT_IDS };

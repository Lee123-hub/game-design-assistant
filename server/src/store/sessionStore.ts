import fs from 'node:fs/promises';
import type { GuideTurn } from '@gda/shared';
import { atomicWriteFile, fileExists } from '../util/fs.js';
import { sessionFile } from './paths.js';

/** 读取某个 step 的聊天 session（不存在返回空数组） */
export async function readSession(projectId: string, stepKey: string): Promise<GuideTurn[]> {
  const file = sessionFile(projectId, stepKey);
  if (!(await fileExists(file))) return [];
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** 覆盖写入某个 step 的聊天 session */
export async function writeSession(
  projectId: string,
  stepKey: string,
  turns: GuideTurn[],
): Promise<void> {
  await atomicWriteFile(sessionFile(projectId, stepKey), JSON.stringify(turns, null, 2));
}

/** 追加轮次到某个 step 的聊天 session */
export async function appendSession(
  projectId: string,
  stepKey: string,
  ...newTurns: GuideTurn[]
): Promise<void> {
  if (newTurns.length === 0) return;
  const turns = [...(await readSession(projectId, stepKey)), ...newTurns];
  await writeSession(projectId, stepKey, turns);
}

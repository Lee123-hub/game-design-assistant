import fs from 'node:fs/promises';
import path from 'node:path';
import { runLogFile } from './paths.js';
import { ensureDir } from '../util/fs.js';

const ensured = new Set<string>();

/** 每次 run 的原始 SDK 消息追加写入 runs/<runId>.jsonl，便于事后排查 */
export async function appendRunLog(
  projectId: string,
  runId: string,
  message: unknown,
): Promise<void> {
  const file = runLogFile(projectId, runId);
  try {
    const dir = path.dirname(file);
    if (!ensured.has(dir)) {
      await ensureDir(dir);
      ensured.add(dir);
    }
    await fs.appendFile(file, JSON.stringify(message) + '\n', 'utf8');
  } catch {
    // 日志失败不影响主流程
  }
}

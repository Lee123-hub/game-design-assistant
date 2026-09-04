import fs from 'node:fs/promises';
import path from 'node:path';

/** 原子写：tmp + rename，进程被杀不会留下半截文件 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 合法项目 id / step id：防路径穿越 */
export function isSafeSegment(seg: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg);
}

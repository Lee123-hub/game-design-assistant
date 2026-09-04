import fs from 'node:fs/promises';
import path from 'node:path';
import type { OutputKind } from '@gda/shared';
import { atomicWriteFile, fileExists } from '../util/fs.js';
import {
  deliverablesDir,
  prototypeDir,
  prototypeFile,
  stepArtifactDir,
  stepArtifactFile,
} from './paths.js';

/** 版本文件时间戳后缀：economy.20260903-193000-123.md */
export function versionStamp(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}

export interface StepFileInfo {
  name: string;
  /** 创建时间（ISO，取 mtime） */
  updatedAt: string;
}

interface ArtifactLocation {
  /** 产物所在目录 */
  dir: string;
  /** 文件基名（stepId / prototype stepId） */
  base: string;
  /** 写入产物用的扩展名（含点） */
  ext: string;
  /** 参与版本识别的全部扩展名（csv 步骤同时容纳 csv 与说明 md） */
  exts: string[];
}

export function artifactLocation(projectId: string, stepKey: string, kind: OutputKind): ArtifactLocation {
  if (kind === 'html') {
    const stepId = stepKey.split(':')[1];
    return { dir: prototypeDir(projectId), base: stepId, ext: '.html', exts: ['.html'] };
  }
  const [agentId, stepId] = stepKey.split(':');
  if (kind === 'csv') {
    return {
      dir: stepArtifactDir(projectId, agentId),
      base: stepId,
      ext: '.csv',
      exts: ['.csv', '.md'],
    };
  }
  return { dir: stepArtifactDir(projectId, agentId), base: stepId, ext: '.md', exts: ['.md'] };
}

/** 版本文件名规范：<base>.<YYYYMMDD-HHMMSS-iii><ext> */
export function versionFileName(base: string, ext: string, stamp = versionStamp()): string {
  return `${base}.${stamp}${ext}`;
}

/** 历史遗留主文件名（无时间戳） */
function legacyMainName(loc: ArtifactLocation): string {
  return `${loc.base}${loc.ext}`;
}

function isVersionName(loc: ArtifactLocation, name: string): boolean {
  const extAlt = loc.exts.map((e) => e.replace('.', '\\.')).join('|');
  return (
    new RegExp(`^${loc.base}(-[A-Za-z0-9_-]+)?\\.\\d{8}-\\d{6}-\\d{3}(${extAlt})$`).test(name) ||
    name === legacyMainName(loc)
  );
}

/**
 * 写入 step 产物（版本化）：内容写入 `<base>.<时间戳><ext>` 新文件，
 * 不覆盖任何已有文件。列表按创建时间倒序，最新一个即当前版本。
 */
export async function writeStepArtifact(
  projectId: string,
  stepKey: string,
  content: string,
  kind: OutputKind,
): Promise<string> {
  const loc = artifactLocation(projectId, stepKey, kind);
  await fs.mkdir(loc.dir, { recursive: true });
  const file = path.join(loc.dir, versionFileName(loc.base, loc.ext));
  await atomicWriteFile(file, content);
  return file;
}

/** 列出某 step 的全部产物版本文件，按创建时间倒序（最新在前） */
export async function listStepFiles(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
): Promise<StepFileInfo[]> {
  const loc = artifactLocation(projectId, stepKey, kind);
  let entries: string[];
  try {
    entries = await fs.readdir(loc.dir);
  } catch {
    return [];
  }
  const files: StepFileInfo[] = [];
  for (const name of entries) {
    if (name.endsWith('.tmp') || !isVersionName(loc, name)) continue;
    try {
      const st = await fs.stat(path.join(loc.dir, name));
      files.push({ name, updatedAt: st.mtime.toISOString() });
    } catch {
      // 文件刚被删除等竞态：跳过
    }
  }
  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return files;
}

/** 当前版本（最新一个版本文件）的绝对路径；无产物返回 null */
export async function latestArtifactFile(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
): Promise<string | null> {
  const files = await listStepFiles(projectId, stepKey, kind);
  if (files.length === 0) return null;
  const loc = artifactLocation(projectId, stepKey, kind);
  return path.join(loc.dir, files[0].name);
}

/**
 * 运行期间轮询：返回产物目录里新出现的版本文件（按创建时间倒序，最新在前）。
 * known = 运行前已存在的文件名集合。
 */
export async function listNewArtifactFiles(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
  known: Set<string>,
): Promise<string[]> {
  const loc = artifactLocation(projectId, stepKey, kind);
  let entries: string[];
  try {
    entries = await fs.readdir(loc.dir);
  } catch {
    return [];
  }
  const fresh: Array<{ name: string; mtime: string }> = [];
  for (const name of entries) {
    if (name.endsWith('.tmp') || known.has(name) || !isVersionName(loc, name)) continue;
    if (name === legacyMainName(loc)) continue; // agent 不应写遗留主文件名
    try {
      const st = await fs.stat(path.join(loc.dir, name));
      fresh.push({ name, mtime: st.mtime.toISOString() });
    } catch {
      // 刚被删除
    }
  }
  // 按 mtime 倒序（agent 可能自拟时间戳，文件名顺序不可信）
  return fresh.sort((a, b) => b.mtime.localeCompare(a.mtime)).map((f) => f.name);
}

/**
 * 归一化 agent 写入的产物文件名：不符合「名称+时间戳」规范时改名为规范版本名，返回最终绝对路径。
 */
export async function normalizeArtifactName(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
  absPath: string,
): Promise<string> {
  const loc = artifactLocation(projectId, stepKey, kind);
  const name = path.basename(absPath);
  const extAlt = loc.exts.map((e) => e.replace('.', '\\.')).join('|');
  if (new RegExp(`^${loc.base}(-[A-Za-z0-9_-]+)?\\.\\d{8}-\\d{6}-\\d{3}(${extAlt})$`).test(name)) {
    return absPath;
  }
  // 保留原扩展名（csv 步骤目录内说明 md 不应被改名为 csv）
  const srcExt = path.extname(name);
  const ext = loc.exts.includes(srcExt) ? srcExt : loc.ext;
  const target = path.join(loc.dir, versionFileName(loc.base, ext));
  try {
    await fs.rename(absPath, target);
  } catch {
    return absPath; // rename 失败（跨目录等）就沿用原路径
  }
  return target;
}

/**
 * 最新版本组：以最新一个版本文件为锚，返回与其同文件名时间戳、
 * 或 mtime 相近（±5s，同一轮运行写出的 csv + 说明 md）的文件绝对路径列表。
 */
export async function latestVersionGroup(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
): Promise<string[]> {
  const files = await listStepFiles(projectId, stepKey, kind);
  if (files.length === 0) return [];
  const loc = artifactLocation(projectId, stepKey, kind);
  const newest = files[0];
  const stampMatch = newest.name.match(/\.(\d{8}-\d{6}-\d{3})\.[^.]+$/);
  const stamp = stampMatch?.[1];
  const anchor = new Date(newest.updatedAt).getTime();
  const picked = files.filter((f) => {
    if (stamp && f.name.includes(`.${stamp}.`)) return true;
    return Math.abs(new Date(f.updatedAt).getTime() - anchor) <= 5_000;
  });
  return picked.map((f) => path.join(loc.dir, f.name));
}

/** 原地保存用户对某版本文件的编辑（应用内表格编辑器用）；返回新的更新时间 */
export async function saveStepFile(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
  fileName: string,
  content: string,
): Promise<{ updatedAt: string }> {
  if (!validStepFileName(fileName)) throw new Error(`非法文件名: ${fileName}`);
  const loc = artifactLocation(projectId, stepKey, kind);
  const abs = path.join(loc.dir, fileName);
  if (!isVersionName(loc, fileName) || !(await fileExists(abs))) {
    throw new Error('文件不存在');
  }
  await atomicWriteFile(abs, content);
  return { updatedAt: await artifactUpdatedAt(abs) };
}

/** 读取某 step 的指定版本文件内容（文件名已做白名单校验） */
export async function readStepFile(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
  fileName: string,
): Promise<{ content: string; updatedAt: string } | null> {
  if (!validStepFileName(fileName)) return null;
  const loc = artifactLocation(projectId, stepKey, kind);
  const abs = path.join(loc.dir, fileName);
  if (!(await fileExists(abs))) return null;
  return { content: await fs.readFile(abs, 'utf8'), updatedAt: await artifactUpdatedAt(abs) };
}

function validStepFileName(fileName: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName) && !fileName.includes('..');
}

/** 删除某 step 的一个版本文件；返回剩余文件数 */
export async function deleteStepFile(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
  fileName: string,
): Promise<{ remaining: number }> {
  if (!validStepFileName(fileName)) throw new Error(`非法文件名: ${fileName}`);
  const loc = artifactLocation(projectId, stepKey, kind);
  const target = path.join(loc.dir, fileName);
  if (!(await fileExists(target))) throw new Error('文件不存在');
  await fs.rm(target);
  const remaining = (await listStepFiles(projectId, stepKey, kind)).length;
  return { remaining };
}

/** 读取当前版本产物内容；无产物返回 null */
export async function readLatestStepArtifact(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
): Promise<string | null> {
  const file = await latestArtifactFile(projectId, stepKey, kind);
  if (!file) return null;
  return fs.readFile(file, 'utf8');
}

export async function readArtifactAt(absPath: string): Promise<string | null> {
  if (!(await fileExists(absPath))) return null;
  return fs.readFile(absPath, 'utf8');
}

export async function artifactUpdatedAt(absPath: string): Promise<string> {
  try {
    const st = await fs.stat(absPath);
    return st.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/** deliverables/ 写入（assemble 用），返回相对路径 */
export async function writeDeliverable(
  projectId: string,
  fileName: string,
  content: string,
): Promise<string> {
  // 允许 Unicode 字母/数字（支持中文文件名），禁止路径分隔符与控制字符
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._ -]*$/u.test(fileName) || /[/\\]/.test(fileName)) {
    throw new Error(`非法文件名: ${fileName}`);
  }
  const file = path.join(deliverablesDir(projectId), fileName);
  await atomicWriteFile(file, content);
  return path.join('deliverables', fileName);
}

export async function listDeliverables(projectId: string): Promise<string[]> {
  const dir = deliverablesDir(projectId);
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => !e.endsWith('.tmp')).sort();
  } catch {
    return [];
  }
}

export async function readDeliverable(
  projectId: string,
  fileName: string,
): Promise<string | null> {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._ -]*$/u.test(fileName) || /[/\\]/.test(fileName)) return null;
  const file = path.join(deliverablesDir(projectId), fileName);
  if (!(await fileExists(file))) return null;
  return fs.readFile(file, 'utf8');
}

// 兼容旧引用：遗留主文件路径（history projects 仍可能存在该文件）
export { stepArtifactFile, prototypeFile };

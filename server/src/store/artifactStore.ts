import fs from 'node:fs/promises';
import path from 'node:path';
import type { OutputKind } from '@gda/shared';
import { MODULE_UI_FILE_RE, moduleUiFileName, parseModuleUiFileName, sanitizeModuleName } from '@gda/shared';
import { atomicWriteFile, fileExists } from '../util/fs.js';
import {
  deliverablesDir,
  prototypeDir,
  prototypeFile,
  prototypeUiDir,
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

/** 模块 UI 原型的时间戳（到秒）：20260910-120000 */
export function moduleUiStamp(): string {
  return versionStamp().replace(/-\d{3}$/, '');
}

/** 模块 UI 原型：是否为该形态的产物 */
function isModuleUiKind(kind: OutputKind): boolean {
  return kind === 'html-modules';
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
  if (kind === 'html-modules') {
    // 模块 UI 原型：目录固定 prototypes/ui/，文件名由模块名决定（不参与名称正则匹配）
    return { dir: prototypeUiDir(projectId), base: 'module-ui', ext: '.html', exts: ['.html'] };
  }
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
  // 模块 UI 原型：名称由模块名 + 版本号 + 时间戳组成，用共享正则匹配
  // （不能把模块名插进 RegExp，中文与正则元字符都会破坏模式）
  if (loc.ext === '.html' && loc.base === 'module-ui') {
    return MODULE_UI_FILE_RE.test(name) || name === legacyMainName(loc);
  }
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

/** 模块 UI 原型文件信息（含解析出的模块名与版本号） */
export interface ModuleUiFile extends StepFileInfo {
  /** 解析出的模块名；文件名不符合规范时为空串 */
  module: string;
  /** 解析出的版本号；不符合规范时为 0 */
  version: number;
}

/**
 * 扫描 prototypes/ui/ 下的全部 html 文件（含不符合命名规范的，供前端归入「其他文件」
 * 并让运行期 known 集合完整，避免同一份文件被反复识别为「本次新产物」）。
 */
export async function listModuleUiEntries(projectId: string): Promise<ModuleUiFile[]> {
  const dir = prototypeUiDir(projectId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files: ModuleUiFile[] = [];
  for (const name of entries) {
    if (name.endsWith('.tmp') || !name.toLowerCase().endsWith('.html')) continue;
    try {
      const st = await fs.stat(path.join(dir, name));
      const parsed = parseModuleUiFileName(name);
      files.push({
        name,
        updatedAt: st.mtime.toISOString(),
        module: parsed?.module ?? '',
        version: parsed?.version ?? 0,
      });
    } catch {
      // 文件刚被删除等竞态：跳过
    }
  }
  // 规范文件在前：按模块名分组、组内版本倒序；不符合规范的最后按时间倒序
  files.sort((a, b) => {
    const aOk = a.version > 0;
    const bOk = b.version > 0;
    if (aOk !== bOk) return aOk ? -1 : 1;
    if (aOk && bOk) {
      const byModule = a.module.localeCompare(b.module, 'zh-Hans-CN');
      if (byModule !== 0) return byModule;
      if (a.version !== b.version) return b.version - a.version;
    }
    const byTime = b.updatedAt.localeCompare(a.updatedAt);
    return byTime !== 0 ? byTime : a.name.localeCompare(b.name);
  });
  return files;
}

/** 列出某 step 的全部产物版本文件，按创建时间倒序（最新在前） */
export async function listStepFiles(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
): Promise<StepFileInfo[]> {
  if (isModuleUiKind(kind)) return listModuleUiEntries(projectId);
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
  // mtime 相同（同一秒内写出的多个文件）时用文件名决胜，保证顺序稳定
  files.sort((a, b) => {
    const byTime = b.updatedAt.localeCompare(a.updatedAt);
    return byTime !== 0 ? byTime : a.name.localeCompare(b.name);
  });
  return files;
}

/** 每个模块的最新版本号（模块名 → 版本号）；目录为空返回 {} */
export async function latestModuleUiVersions(projectId: string): Promise<Record<string, number>> {
  const versions: Record<string, number> = {};
  for (const f of await listModuleUiEntries(projectId)) {
    if (!f.module) continue;
    if ((versions[f.module] ?? 0) < f.version) versions[f.module] = f.version;
  }
  return versions;
}

/**
 * 当前版本组：每个模块的最新文件绝对路径列表（供上下文注入与交付包使用）。
 * 「最新」按版本号判定（版本号随每次重生成单调递增）。
 */
export async function latestModuleUiGroup(projectId: string): Promise<string[]> {
  const dir = prototypeUiDir(projectId);
  const newest = new Map<string, ModuleUiFile>();
  for (const f of await listModuleUiEntries(projectId)) {
    if (!f.module) continue;
    const prev = newest.get(f.module);
    if (!prev || f.version > prev.version) newest.set(f.module, f);
  }
  return [...newest.values()].map((f) => path.join(dir, f.name));
}

/** 从不符合规范的文件名里尽量推断模块名 */
function inferModuleName(fileName: string): string {
  let stem = fileName.replace(/\.html$/i, '');
  // 去掉可能残留的「名称.时间戳」版本后缀
  stem = stem.replace(/\.\d{8}-\d{6}(-\d{3})?$/, '');
  // 去掉 agent 可能加的前缀
  stem = stem.replace(/^(module-ui|config-tables)[-_.]/, '');
  // 去掉尾部版本号（-v2 / _v2 / .v2 等写法都容忍）
  stem = stem.replace(/[-_.]\s*v\d{1,3}$/i, '');
  return sanitizeModuleName(stem);
}

/**
 * 归一化 agent 写入的模块 UI 原型文件名：不符合 `<模块名>-v<N>-<时间戳>.html` 时
 * 推断模块名、取该模块下一版本号改名，返回最终绝对路径。
 */
export async function normalizeModuleUiName(projectId: string, absPath: string): Promise<string> {
  const dir = prototypeUiDir(projectId);
  const name = path.basename(absPath);
  if (MODULE_UI_FILE_RE.test(name)) return absPath;

  const module = inferModuleName(name);
  const versions = await latestModuleUiVersions(projectId);
  const stamp = moduleUiStamp();
  let version = (versions[module] ?? 0) + 1;
  let target = path.join(dir, moduleUiFileName(module, version, stamp));
  // 同一轮里多份文件推断到同一模块时递增版本号，避免互相覆盖
  while (version < 1000 && (await fileExists(target))) {
    version += 1;
    target = path.join(dir, moduleUiFileName(module, version, stamp));
  }
  try {
    await fs.rename(absPath, target);
  } catch {
    return absPath; // rename 失败（跨目录等）就沿用原路径
  }
  return target;
}

/** 当前版本（最新一个版本文件）的绝对路径；无产物返回 null */
export async function latestArtifactFile(
  projectId: string,
  stepKey: string,
  kind: OutputKind,
): Promise<string | null> {
  const loc = artifactLocation(projectId, stepKey, kind);
  if (isModuleUiKind(kind)) {
    // 多文件形态：返回最近一次写入的那个文件（按 mtime）
    const files = await listModuleUiEntries(projectId);
    if (files.length === 0) return null;
    const newest = [...files].sort((a, b) => {
      const byTime = b.updatedAt.localeCompare(a.updatedAt);
      return byTime !== 0 ? byTime : a.name.localeCompare(b.name);
    })[0];
    return path.join(loc.dir, newest.name);
  }
  const files = await listStepFiles(projectId, stepKey, kind);
  if (files.length === 0) return null;
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
  const moduleUi = isModuleUiKind(kind);
  let entries: string[];
  try {
    entries = await fs.readdir(loc.dir);
  } catch {
    return [];
  }
  const fresh: Array<{ name: string; mtime: string }> = [];
  for (const name of entries) {
    if (name.endsWith('.tmp') || known.has(name)) continue;
    // 模块 UI 原型：不要求 agent 一次写对命名，任何新增 html 都先收进来再归一化改名
    if (moduleUi ? !name.toLowerCase().endsWith('.html') : !isVersionName(loc, name)) continue;
    // 非模块形态：agent 不应写遗留主文件名（模块形态写错名同样收进来改名，不静默丢弃）
    if (!moduleUi && name === legacyMainName(loc)) continue;
    try {
      const st = await fs.stat(path.join(loc.dir, name));
      fresh.push({ name, mtime: st.mtime.toISOString() });
    } catch {
      // 刚被删除
    }
  }
  // 按 mtime 倒序（agent 可能自拟时间戳，文件名顺序不可信）；同秒写入时用文件名决胜
  return fresh
    .sort((a, b) => {
      const byTime = b.mtime.localeCompare(a.mtime);
      return byTime !== 0 ? byTime : a.name.localeCompare(b.name);
    })
    .map((f) => f.name);
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
  if (isModuleUiKind(kind)) return normalizeModuleUiName(projectId, absPath);
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
  if (isModuleUiKind(kind)) return latestModuleUiGroup(projectId);
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
  // 用黑名单而不是白名单：模块 UI 原型的文件名逐字取自模块设计文档的标题，
  // 真实标题里带中文标点（`｜` `（` `）` `·` 等），白名单会把合法产物一并拒掉。
  // 只挡真正会越界的部分：路径分隔符、路径穿越、控制字符 —— 有这三条，
  // path.join(固定目录, fileName) 就必然落在目录内。
  if (!fileName || fileName.length > 200) return false;
  if (/[/\\]/.test(fileName)) return false;
  if (/[\u0000-\u001f\u007f]/.test(fileName)) return false;
  if (fileName.includes('..')) return false;
  return true;
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

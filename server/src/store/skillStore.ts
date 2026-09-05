import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { DATA_DIR } from '../config.js';

/**
 * 外挂技能包：以 Claude Code「本地插件」布局存放在 data/skills/<pkg>/ 下
 *
 *   data/skills/<pkg>/
 *     .claude-plugin/plugin.json   ← 程序合成（SDK 要求）
 *     skills/<skill-name>/SKILL.md ← 从 zip 提取（保留目录内相对结构）
 *
 * 运行时按 agent 覆盖配置把对应插件目录以 plugins:[{type:'local',path}] 注入 SDK，
 * skills:'all' 只会发现本 agent 已启用插件内的技能，天然按 agent 隔离。
 */

export const SKILLS_DIR = path.join(DATA_DIR, 'skills');

export interface SkillEntry {
  /** SKILL.md frontmatter 的 name（缺省用目录名） */
  name: string;
  description: string;
}

export interface SkillPackage {
  name: string;
  skills: SkillEntry[];
}

const PKG_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function safeJoin(base: string, rel: string): string {
  const target = path.resolve(base, rel);
  const b = path.resolve(base);
  if (target !== b && !target.startsWith(b + path.sep)) {
    throw new Error(`zip 内含非法路径条目：${rel}`);
  }
  return target;
}

/** 解析 SKILL.md 的 YAML frontmatter 中 name/description 两个粗略字段 */
function parseSkillMeta(dirName: string, md: string): SkillEntry {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? '';
  const pick = (key: string) =>
    new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  return {
    name: pick('name') || dirName,
    description: pick('description'),
  };
}

/** zip 内条目的公共一层包装目录（若有则剥离） */
function stripWrapper(entries: string[]): string | null {
  const tops = new Set(entries.map((e) => e.split('/')[0]));
  if (tops.size === 1 && entries.some((e) => e.includes('/'))) {
    return [...tops][0] + '/';
  }
  return null;
}

/**
 * 把 zip 内相对路径规整为「<skill-dir>/<文件>」：
 * - 插件布局（skills/<name>/SKILL.md）：去掉顶层 skills/ 前缀
 * - 常规布局（<skill-dir>/SKILL.md）：原样保留
 * - 根目录裸 SKILL.md：归入以包名命名的技能目录
 */
function remapSkillPath(rel: string, pkgName: string): string {
  const parts = rel.split('/');
  if (parts[0] === 'skills' && parts.length >= 3) {
    return parts.slice(1).join('/');
  }
  if (parts.length === 1) {
    return path.join(pkgName, rel);
  }
  return rel;
}

/** 上传（覆盖同名包）：解压 → 规整为插件布局 → 合成 plugin.json */
export async function uploadSkillPackage(rawName: string, zipBuffer: Buffer): Promise<SkillPackage> {
  const name = rawName.trim();
  if (!PKG_NAME_RE.test(name)) {
    throw new Error('技能包名只能包含字母、数字、-、_，且以字母或数字开头');
  }
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length === 0) throw new Error('zip 包为空');

  const wrapper = stripWrapper(entries.map((e) => e.entryName));
  const fileMap: Array<{ rel: string; data: Buffer }> = [];
  for (const e of entries) {
    let rel = e.entryName;
    if (wrapper && rel.startsWith(wrapper)) rel = rel.slice(wrapper.length);
    if (!rel || rel.endsWith('/')) continue;
    if (rel.startsWith('.claude-plugin/')) continue; // 清单由程序合成
    fileMap.push({ rel, data: e.getData() });
  }

  // 至少一个 SKILL.md（顶层或任意子目录）
  const skillMds = fileMap.filter((f) => f.rel.split('/').pop() === 'SKILL.md');
  if (skillMds.length === 0) {
    throw new Error('zip 中未找到 SKILL.md：技能包需包含至少一个 SKILL.md（Claude Code 技能格式）');
  }

  const pkgDir = safeJoin(SKILLS_DIR, name);
  await fs.rm(pkgDir, { recursive: true, force: true });
  for (const f of fileMap) {
    const dest = safeJoin(pkgDir, path.join('skills', remapSkillPath(f.rel, name)));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, f.data);
  }
  const manifestDir = path.join(pkgDir, '.claude-plugin');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'plugin.json'),
    JSON.stringify({ name, version: '1.0.0' }, null, 2),
  );
  return getSkillPackage(name);
}

export async function getSkillPackage(name: string): Promise<SkillPackage> {
  const pkgDir = safeJoin(SKILLS_DIR, name);
  const skillsDir = path.join(pkgDir, 'skills');
  const skillDirs = (await fs.readdir(skillsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const skills: SkillEntry[] = [];
  for (const dir of skillDirs) {
    try {
      const md = await fs.readFile(path.join(skillsDir, dir, 'SKILL.md'), 'utf8');
      skills.push(parseSkillMeta(dir, md));
    } catch {
      // 无 SKILL.md 的目录跳过
    }
  }
  return { name, skills };
}

export async function listSkillPackages(): Promise<SkillPackage[]> {
  try {
    const dirs = (await fs.readdir(SKILLS_DIR, { withFileTypes: true })).filter((d) =>
      d.isDirectory(),
    );
    const out: SkillPackage[] = [];
    for (const d of dirs) {
      try {
        out.push(await getSkillPackage(d.name));
      } catch {
        // 布局不完整的包跳过
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function deleteSkillPackage(name: string): Promise<void> {
  const pkgDir = safeJoin(SKILLS_DIR, name);
  await fs.rm(pkgDir, { recursive: true, force: true });
}

/** agent 覆盖配置 → SDK plugins 参数（绝对路径的本地插件目录） */
export function skillPluginPaths(names: string[] | undefined): string[] {
  if (!names || names.length === 0) return [];
  return names
    .filter((n) => PKG_NAME_RE.test(n))
    .map((n) => path.join(SKILLS_DIR, n));
}

/** agent 级挂载 + 步骤级挂载合并（去重）→ SDK plugins 参数 */
export function mergedSkillPluginPaths(
  agentMounts: string[] | undefined,
  stepSkills: string[] | undefined,
): string[] {
  const all = [...new Set([...(agentMounts ?? []), ...(stepSkills ?? [])])];
  return skillPluginPaths(all);
}

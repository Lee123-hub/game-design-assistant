import fs from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import type { OutputKind, PlayerPersona } from '@gda/shared';
import { stripModuleUiVersion } from '@gda/shared';
import { buildRegistry } from '../registry/index.js';
import {
  latestArtifactFile,
  latestVersionGroup,
  listDeliverables,
} from './artifactStore.js';
import { projectDir, prototypeFile, stepArtifactFile } from './paths.js';
import { fileExists } from '../util/fs.js';

/** zip 条目 */
interface ZipEntry {
  /** zip 内路径（保证纯 ASCII，避免解压端编码不一致导致乱码） */
  name: string;
  /** 磁盘绝对路径 */
  abs: string;
  /** 原始（可能含中文）名称；与 name 不同时才需要写进索引 */
  orig?: string;
}

/** 去掉版本文件名中的时间戳：module-design.20260903-193000-123.md → module-design.md */
function stripStamp(name: string): string {
  return name.replace(/\.\d{8}-\d{6}-\d{3}(\.[^.]+)$/, '$1');
}

/**
 * 把条目名转成纯 ASCII。
 *
 * 为什么：zip 规范对文件名编码没有强制约定，UTF-8 标志位并非所有解压端都识别
 * （Windows 资源管理器、命令行 unzip 等会按本地码表解，中文条目名显示为乱码）。
 * 折中方案：条目名用 ASCII，zip 根目录附一份 README.md 记录「中文原名 → 条目名」对照。
 */
function asciiZipName(name: string, used: Set<string>): string {
  const ext = (name.match(/\.[^./\\]+$/) ?? [''])[0];
  // 只看文件名部分（目录名通常是 ASCII，不能拿它判断）
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const dirPrefix = slash >= 0 ? name.slice(0, slash + 1) : '';
  const filePart = slash >= 0 ? name.slice(slash + 1) : name;
  const baseFile = ext ? filePart.slice(0, -ext.length) : filePart;
  let out: string;
  if (!/[A-Za-z0-9]/.test(baseFile)) {
    out = `${dirPrefix}item-${used.size + 1}${ext}`;
  } else {
    out = name.replace(/[^\x20-\x7E]/g, '-').replace(/-{2,}/g, '-').replace(/\s+/g, '_');
  }
  if (used.has(out)) {
    const dot = out.lastIndexOf('.');
    let i = 2;
    const make = (n: number) =>
      dot > 0 ? `${out.slice(0, dot)}-${n}${out.slice(dot)}` : `${out}-${n}`;
    while (used.has(make(i))) i += 1;
    out = make(i);
  }
  used.add(out);
  return out;
}

/** 收集一个项目「交付包」的全部文件：每个 step 只取最新版本组 + 遗留 deliverables/ */
export async function collectExportEntries(
  projectId: string,
  personas: PlayerPersona[],
): Promise<ZipEntry[]> {
  const registry = buildRegistry(personas);
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  const usedNames = new Set<string>();

  const push = (name: string, abs: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const zipName = asciiZipName(name, usedNames);
    // 只有被改写过的名字才需要写进索引
    entries.push({ name: zipName, abs, orig: zipName === name ? undefined : name });
  };

  for (const agent of registry) {
    for (const def of agent.steps) {
      const stepKey = `${def.agentId}:${def.stepId}`;
      const kind: OutputKind = def.outputKind;

      if (kind === 'csv') {
        // csv 步骤：打包同一轮写出的整组文件（多张 csv + 说明 md）
        const group = await latestVersionGroup(projectId, stepKey, kind);
        for (const abs of group) {
          push(`steps/${def.agentId}/${stripStamp(path.basename(abs))}`, abs);
        }
        continue;
      }

      if (kind === 'html-modules') {
        // 模块 UI 原型：每个模块只取最新版本，去掉版本号与时间戳
        const group = await latestVersionGroup(projectId, stepKey, kind);
        for (const abs of group) {
          const base = path.basename(abs);
          push(`prototypes/ui/${stripModuleUiVersion(base)}`, abs);
        }
        continue;
      }

      const latest = await latestArtifactFile(projectId, stepKey, kind);
      if (latest) {
        const ext = kind === 'html' ? '.html' : '.md';
        push(`steps/${def.agentId}/${def.stepId}${ext}`, latest);
        continue;
      }

      // 旧项目兜底：遗留主文件（无时间戳命名）
      const legacy =
        kind === 'html' ? prototypeFile(projectId, def.stepId) : stepArtifactFile(projectId, stepKey);
      if (await fileExists(legacy)) {
        push(`steps/${def.agentId}/${def.stepId}${kind === 'html' ? '.html' : '.md'}`, legacy);
      }
    }
  }

  // 历史遗留 deliverables/（旧版本流程的产出），存在则一并打包
  for (const name of await listDeliverables(projectId)) {
    push(`deliverables/${name}`, path.join(projectDir(projectId), 'deliverables', name));
  }

  return entries;
}

/** 生成 zip 根目录的索引说明（含中文原名 → ASCII 条目名对照） */
function buildIndexReadme(projectName: string, entries: ZipEntry[]): string {
  const renamed = entries.filter((e) => e.orig);
  const lines: string[] = [
    `# ${projectName} · 交付包`,
    '',
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    `文件数量：${entries.length}`,
    '',
    '## 说明',
    '',
    '为保证在 Windows / macOS / 命令行等各类解压工具下都不出现乱码，',
    'zip 内文件名统一使用 ASCII 字符；原名含中文的文件在下方列出对照表。',
    '',
  ];
  if (renamed.length > 0) {
    lines.push('## 中文原名对照表', '', '| zip 内文件 | 原始名称 |', '|---|---|');
    for (const e of renamed) lines.push(`| ${e.name} | ${e.orig} |`);
    lines.push('');
  }
  lines.push('## 文件清单', '');
  for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`- ${e.name}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** 生成 zip 并写入流；返回实际打包的条目数 */
export async function streamProjectZip(
  res: import('express').Response,
  projectId: string,
  personas: PlayerPersona[],
  zipName: string,
  projectName: string,
): Promise<number> {
  const entries = await collectExportEntries(projectId, personas);
  res.setHeader('Content-Type', 'application/zip');
  // 判据看「去掉扩展名后是否还有 ASCII 字母数字」：纯中文名（如「潮汐拾荒者.zip」）
  // 走通用兜底名，避免出现「____.zip」这种无意义文件名。
  const base = zipName.replace(/\.[^.]+$/, '');
  const hasMeaningfulAscii = /[A-Za-z0-9]/.test(base);
  const asciiFallback = hasMeaningfulAscii
    ? zipName.replace(/[^\x20-\x7E]/g, '_').replace(/\s+/g, '_')
    : `gda-deliverables-${projectId.slice(0, 8)}.zip`;
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
  );
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  // 索引放最前面：解压后一眼能看到中文对照表
  archive.append(buildIndexReadme(projectName, entries), { name: 'README.md' });
  for (const entry of entries) {
    // stat 先确认存在，避免 agent 刚删除导致整包失败
    try {
      await fs.access(entry.abs);
      archive.file(entry.abs, { name: entry.name });
    } catch {
      // 文件已消失：跳过
    }
  }
  await archive.finalize();
  return entries.length;
}

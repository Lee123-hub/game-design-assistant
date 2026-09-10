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
  /** zip 内路径 */
  name: string;
  /** 磁盘绝对路径 */
  abs: string;
}

/** 去掉版本文件名中的时间戳：module-design.20260903-193000-123.md → module-design.md */
function stripStamp(name: string): string {
  return name.replace(/\.\d{8}-\d{6}-\d{3}(\.[^.]+)$/, '$1');
}

/** 收集一个项目「交付包」的全部文件：每个 step 只取最新版本组 + 遗留 deliverables/ */
export async function collectExportEntries(
  projectId: string,
  personas: PlayerPersona[],
): Promise<ZipEntry[]> {
  const registry = buildRegistry(personas);
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();

  const push = (name: string, abs: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    entries.push({ name, abs });
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

/** 生成 zip 并写入流；返回实际打包的条目数 */
export async function streamProjectZip(
  res: import('express').Response,
  projectId: string,
  personas: PlayerPersona[],
  zipName: string,
): Promise<number> {
  const entries = await collectExportEntries(projectId, personas);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
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

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Settings, StepDef } from '@gda/shared';
import { ROOT_DIR } from '../config.js';

const PROMPTS_DIR = path.join(ROOT_DIR, 'server', 'src', 'prompts');
const promptCache = new Map<string, string>();

export async function loadPromptTemplate(fileName: string): Promise<string> {
  const cached = promptCache.get(fileName);
  if (cached) return cached;
  const content = await fs.readFile(path.join(PROMPTS_DIR, fileName), 'utf8');
  promptCache.set(fileName, content);
  return content;
}

/**
 * 解析最终系统提示词：用户覆盖 > 内置默认，最后固定追加 `promptExtras`。
 * 覆盖按 stepKey 粒度（settings.agentOverrides["agentId:stepId"]）。
 *
 * extras 在覆盖之后追加，因此用户即使重写了提示词，程序约束（如 UI 设计约束）依然生效。
 */
export async function resolveSystemPrompt(
  settings: Settings,
  stepKey: string,
  def: Pick<StepDef, 'promptFile' | 'promptExtras'>,
): Promise<string> {
  const override = settings.agentOverrides[stepKey];
  const base =
    override?.systemPrompt && override.systemPrompt.trim()
      ? override.systemPrompt
      : await loadPromptTemplate(def.promptFile);

  const extras = def.promptExtras ?? [];
  if (extras.length === 0) return base;

  const blocks: string[] = [];
  for (const file of extras) blocks.push(await loadPromptTemplate(file));
  return [base, ...blocks].join('\n\n---\n\n');
}

/** 读取 step 的固定约束文件正文（设置页只读展示用） */
export async function loadPromptExtras(files: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const file of files) {
    try {
      out.push(await loadPromptTemplate(file));
    } catch {
      out.push(`（无法加载约束文件 ${file}）`);
    }
  }
  return out;
}

/** 解析 step 的最终模型：step 覆盖 > settings.defaultModel（模型名自由输入） */
export function resolveModel(settings: Settings, stepKey: string): string {
  const override = settings.agentOverrides[stepKey];
  if (override?.model?.trim()) return override.model.trim();
  return settings.defaultModel;
}

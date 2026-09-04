import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Settings } from '@gda/shared';
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
 * 解析最终系统提示词：用户覆盖 > 内置默认。
 * 覆盖按 stepKey 粒度（settings.agentOverrides["agentId:stepId"]）。
 */
export async function resolveSystemPrompt(
  settings: Settings,
  stepKey: string,
  promptFile: string,
): Promise<string> {
  const override = settings.agentOverrides[stepKey];
  if (override?.systemPrompt && override.systemPrompt.trim()) {
    return override.systemPrompt;
  }
  return loadPromptTemplate(promptFile);
}

/** 解析 step 的最终模型：step 覆盖 > settings.defaultModel（模型名自由输入） */
export function resolveModel(settings: Settings, stepKey: string): string {
  const override = settings.agentOverrides[stepKey];
  if (override?.model?.trim()) return override.model.trim();
  return settings.defaultModel;
}

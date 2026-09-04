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

/** 解析最终系统提示词：用户覆盖 > 内置默认 */
export async function resolveSystemPrompt(
  settings: Settings,
  agentId: string,
  promptFile: string,
): Promise<string> {
  const override = settings.agentOverrides[agentId as keyof typeof settings.agentOverrides];
  if (override?.systemPrompt && override.systemPrompt.trim()) {
    return override.systemPrompt;
  }
  return loadPromptTemplate(promptFile);
}

/** 解析 agent 的最终模型：override > settings.defaultModel（模型名自由输入，不再枚举校验） */
export function resolveModel(settings: Settings, agentId: string): string {
  const override = settings.agentOverrides[agentId as keyof typeof settings.agentOverrides];
  if (override?.model?.trim()) return override.model.trim();
  return settings.defaultModel;
}

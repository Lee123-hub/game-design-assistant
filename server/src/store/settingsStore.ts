import fs from 'node:fs/promises';
import { DEFAULT_SETTINGS, type Settings, type SettingsView } from '@gda/shared';
import { DATA_DIR, SETTINGS_FILE } from '../config.js';
import { atomicWriteFile } from '../util/fs.js';

let cache: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Settings>;
    cache = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    agentOverrides: { ...parsed.agentOverrides },
    agentSkillMounts: { ...parsed.agentSkillMounts },
  };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  // 空字符串 apiKey = 保持现有
  const merged: Settings = { ...current, ...patch };
  if (patch.apiKey === '') merged.apiKey = current.apiKey;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await atomicWriteFile(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  try {
    await fs.chmod(SETTINGS_FILE, 0o600);
  } catch {
    // Windows 等场景 chmod 可能失败，忽略
  }
  cache = merged;
  return merged;
}

export function toSettingsView(s: Settings): SettingsView {
  return {
    provider: s.provider,
    protocol: s.protocol,
    baseUrl: s.baseUrl,
    defaultModel: s.defaultModel,
    maxConcurrentRuns: s.maxConcurrentRuns,
    hasApiKey: s.apiKey.length > 0,
    agentOverrides: s.agentOverrides,
    agentSkillMounts: s.agentSkillMounts,
  };
}

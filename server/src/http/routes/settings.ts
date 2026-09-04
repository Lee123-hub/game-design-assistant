import { Router } from 'express';
import { z } from 'zod';
import type { Settings } from '@gda/shared';
import { loadSettings, saveSettings, toSettingsView } from '../../store/settingsStore.js';
import { testProvider } from '../../sdk/client.js';

const patchSchema = z.object({
  provider: z.enum(['deepseek', 'custom']).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().trim().min(1).optional(),
  maxConcurrentRuns: z.number().int().min(1).max(10).optional(),
  agentOverrides: z
    .record(
      z.string(),
      z.object({
        model: z.string().optional(),
        systemPrompt: z.string().optional(),
        allowedTools: z.array(z.string()).optional(),
        skills: z.array(z.string()).optional(),
        maxTurns: z.number().int().min(1).max(100).optional(),
      }),
    )
    .optional(),
});

export function settingsRouter(): Router {
  const router = Router();

  router.get('/api/settings', async (_req, res) => {
    const settings = await loadSettings();
    res.json(toSettingsView(settings));
  });

  router.put('/api/settings', async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
      return;
    }
    const settings = await saveSettings(parsed.data as Partial<Settings>);
    res.json(toSettingsView(settings));
  });

  router.post('/api/settings/test', async (_req, res) => {
    const settings = await loadSettings();
    if (!settings.apiKey) {
      res
        .status(400)
        .json({ error: { code: 'no_api_key', message: '尚未配置 API Key' } });
      return;
    }
    const start = Date.now();
    try {
      await testProvider(settings);
      res.json({ ok: true, latencyMs: Date.now() - start });
    } catch (err) {
      res.json({
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}

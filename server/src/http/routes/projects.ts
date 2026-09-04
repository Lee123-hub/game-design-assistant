import { Router } from 'express';
import { z } from 'zod';
import type { ProjectSummary } from '@gda/shared';
import {
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
} from '../../store/projectStore.js';
import {
  addPersona,
  removePersona,
  updatePersona,
} from '../../store/projectMutations.js';
import { buildAgentInfos } from './agents.js';
import { loadSettings } from '../../store/settingsStore.js';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  idea: z.string().max(2000).optional().default(''),
});

export function projectsRouter(): Router {
  const router = Router();

  router.get('/api/projects', async (_req, res) => {
    const projects = await listProjects();
    const summaries: ProjectSummary[] = projects.map((p) => {
      const steps = Object.values(p.steps);
      return {
        id: p.id,
        name: p.name,
        idea: p.idea,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        progress: {
          done: steps.filter((s) => s.state === 'done').length,
          total: steps.length,
        },
      };
    });
    res.json(summaries);
  });

  router.post('/api/projects', async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
      return;
    }
    const project = await createProject(parsed.data.name, parsed.data.idea);
    res.status(201).json(project);
  });

  router.get('/api/projects/:id', async (req, res) => {
    const project = await loadProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: { code: 'not_found', message: '项目不存在' } });
      return;
    }
    const settings = await loadSettings();
    res.json({ project, registry: await buildAgentInfos(project.personas, settings) });
  });

  router.patch('/api/projects/:id', async (req, res) => {
    const parsed = createSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
      return;
    }
    const project = await loadProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: { code: 'not_found', message: '项目不存在' } });
      return;
    }
    if (parsed.data.name !== undefined) project.name = parsed.data.name;
    if (parsed.data.idea !== undefined) project.idea = parsed.data.idea;
    await saveProject(project);
    res.json(project);
  });

  router.delete('/api/projects/:id', async (req, res) => {
    await deleteProject(req.params.id);
    res.json({ ok: true });
  });

  // ---- 玩家画像 ----
  router.post('/api/projects/:id/players', async (req, res) => {
    const parsed = z
      .object({ name: z.string().min(1).max(50), description: z.string().min(1).max(4000) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
      return;
    }
    try {
      const project = await addPersona(req.params.id, parsed.data);
      res.status(201).json(project.personas);
    } catch (err) {
      res.status(404).json({ error: { code: 'not_found', message: String(err) } });
    }
  });

  router.put('/api/projects/:id/players/:personaId', async (req, res) => {
    const parsed = z
      .object({ name: z.string().min(1).max(50).optional(), description: z.string().min(1).max(4000).optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
      return;
    }
    try {
      const project = await updatePersona(req.params.id, req.params.personaId, parsed.data);
      res.json(project.personas);
    } catch (err) {
      res.status(404).json({ error: { code: 'not_found', message: String(err) } });
    }
  });

  router.delete('/api/projects/:id/players/:personaId', async (req, res) => {
    try {
      const project = await removePersona(req.params.id, req.params.personaId);
      res.json(project.personas);
    } catch (err) {
      res.status(400).json({ error: { code: 'invalid', message: String(err) } });
    }
  });

  // ---- 交付包列表在 deliverables.ts 中 ----
  return router;
}

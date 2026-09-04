import { Router } from 'express';
import { loadProject } from '../../store/projectStore.js';
import { listDeliverables, readDeliverable } from '../../store/artifactStore.js';

export function deliverablesRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/api/projects/:id/deliverables', async (req, res) => {
    const project = await loadProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: { code: 'not_found', message: '项目不存在' } });
      return;
    }
    res.json({ files: await listDeliverables(project.id) });
  });

  router.get('/api/projects/:id/deliverables/:file', async (req, res) => {
    const content = await readDeliverable(req.params.id, req.params.file);
    if (content === null) {
      res.status(404).json({ error: { code: 'not_found', message: '交付文件不存在' } });
      return;
    }
    res.json({ file: req.params.file, content });
  });

  return router;
}

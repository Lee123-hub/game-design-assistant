import { Router } from 'express';
import { loadProject } from '../../store/projectStore.js';
import { prototypeFile } from '../../store/paths.js';
import { readArtifactAt, artifactUpdatedAt } from '../../store/artifactStore.js';

export function prototypeRouter(): Router {
  const router = Router({ mergeParams: true });

  // 与 iframe sandbox="allow-scripts" 双保险：CSP 禁止外链 + 授予独立 origin
  router.get('/api/projects/:id/prototypes/:stepId.html', async (req, res) => {
    const project = await loadProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: { code: 'not_found', message: '项目不存在' } });
      return;
    }
    const abs = prototypeFile(project.id, req.params.stepId);
    const content = await readArtifactAt(abs);
    if (content === null) {
      res.status(404).json({ error: { code: 'not_found', message: '原型不存在' } });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'",
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.send(content);
  });

  // 元信息（是否存在 / 更新时间）
  router.get('/api/projects/:id/prototypes/:stepId/meta', async (req, res) => {
    const project = await loadProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: { code: 'not_found', message: '项目不存在' } });
      return;
    }
    const abs = prototypeFile(project.id, req.params.stepId);
    const content = await readArtifactAt(abs);
    if (content === null) {
      res.json({ exists: false });
      return;
    }
    res.json({ exists: true, updatedAt: await artifactUpdatedAt(abs) });
  });

  return router;
}

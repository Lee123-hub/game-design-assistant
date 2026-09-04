import { Router } from 'express';
import { loadProject } from '../../store/projectStore.js';
import { streamProjectZip } from '../../store/exportStore.js';

export function deliverablesRouter(): Router {
  const router = Router({ mergeParams: true });

  // 交付包：把每个 step 的最新版本产物（csv 步骤含整组文件）+ 遗留 deliverables/ 打包为 zip 下载
  router.get('/api/projects/:id/export.zip', async (req, res) => {
    const project = await loadProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: { code: 'not_found', message: '项目不存在' } });
      return;
    }
    try {
      await streamProjectZip(res, project.id, project.personas, `${project.name}.zip`);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'zip_failed', message: String(err) } });
      }
    }
  });

  return router;
}

import express from 'express';
import {
  deleteSkillPackage,
  listSkillPackages,
  uploadSkillPackage,
} from '../../store/skillStore.js';

/** 外挂技能包：zip 上传走 raw body（浏览器直接 fetch File blob），其他走 JSON */
export function skillsRouter(): express.Router {
  const router = express.Router();

  router.get('/api/skills', async (_req, res) => {
    res.json(await listSkillPackages());
  });

  router.post(
    '/api/skills',
    express.raw({ type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], limit: '25mb' }),
    async (req, res) => {
      const name = String(req.query.name ?? '');
      if (!name) {
        res.status(400).json({ error: { code: 'invalid_body', message: '缺少 name 查询参数' } });
        return;
      }
      const body = req.body as Buffer | undefined;
      if (!body || body.length === 0) {
        res.status(400).json({ error: { code: 'invalid_body', message: '请求体为空，需上传 zip 二进制' } });
        return;
      }
      try {
        const pkg = await uploadSkillPackage(name, body);
        res.json(pkg);
      } catch (err) {
        res.status(400).json({
          error: { code: 'invalid_skill', message: err instanceof Error ? err.message : String(err) },
        });
      }
    },
  );

  router.delete('/api/skills/:name', async (req, res) => {
    await deleteSkillPackage(req.params.name);
    res.json({ ok: true });
  });

  return router;
}

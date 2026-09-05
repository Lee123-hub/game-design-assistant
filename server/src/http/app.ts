import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../config.js';
import { settingsRouter } from './routes/settings.js';
import { agentsRouter } from './routes/agents.js';
import { projectsRouter } from './routes/projects.js';
import { stepsRouter } from './routes/steps.js';
import { prototypeRouter } from './routes/prototype.js';
import { deliverablesRouter } from './routes/deliverables.js';
import { skillsRouter } from './routes/skills.js';
import { handleProjectEvents } from './sse.js';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(settingsRouter());
  app.use(agentsRouter());
  app.use(projectsRouter());
  app.use(stepsRouter());
  app.use(prototypeRouter());
  app.use(deliverablesRouter());
  app.use(skillsRouter());
  app.get('/api/projects/:id/events', handleProjectEvents);

  // 生产模式：托管 web/dist 的构建产物（dev 下由 vite 代理提供前端）
  const distDir = path.join(ROOT_DIR, 'web', 'dist');
  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(distDir, {
        // html 每次协商缓存（保证新构建立即生效）；assets 带内容 hash 可长缓存
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    // SPA fallback：非 /api 路径全部回 index.html
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  return app;
}

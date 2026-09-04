import { createApp } from './http/app.js';
import { PORT } from './config.js';
import { listProjectIds, loadProject, updateProject } from './store/projectStore.js';
import { loadSettings } from './store/settingsStore.js';
import { runSemaphore } from './orchestrator/semaphore.js';
import { abortAll } from './orchestrator/orchestrator.js';

/** 启动时把上次进程退出残留的 running/waiting_input 降级为 error:interrupted */
async function downgradeInterruptedSteps(): Promise<void> {
  const ids = await listProjectIds();
  for (const id of ids) {
    const project = await loadProject(id);
    if (!project) continue;
    const stuck = Object.values(project.steps).filter(
      (s) => s.state === 'running' || s.state === 'waiting_input',
    );
    if (stuck.length === 0) continue;
    for (const s of stuck) {
      try {
        await updateProject(id, (p) => {
          const record = p.steps[s.stepKey];
          if (!record) return;
          record.state = 'error';
          record.runId = null;
          record.finishedAt = new Date().toISOString();
          record.error = { code: 'interrupted', message: '服务器重启导致任务中断，请重新运行' };
        });
      } catch (err) {
        console.error(`[gda] 降级 step 失败 ${id}/${s.stepKey}:`, err);
      }
    }
    console.log(`[gda] 项目 ${id} 有 ${stuck.length} 个残留 step 已降级为 interrupted`);
  }
}

async function main(): Promise<void> {
  // 应用并发上限设置
  const settings = await loadSettings();
  runSemaphore.setLimit(settings.maxConcurrentRuns);

  await downgradeInterruptedSteps();

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`[gda] server listening on http://localhost:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[gda] 收到 ${signal}，中止所有运行中的任务…`);
    await abortAll();
    server.close(() => process.exit(0));
    // 兜底强制退出
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[gda] 启动失败:', err);
  process.exit(1);
});

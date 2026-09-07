import type { Request, Response } from 'express';
import type { ServerEvent } from '@gda/shared';
import { loadProject } from '../store/projectStore.js';
import { getBus } from '../orchestrator/eventBus.js';
import { getGuideTurns, isGuideLive } from '../orchestrator/orchestrator.js';

/**
 * GET /api/projects/:id/events
 * - 连接即推 snapshot（project 现状 + 存活 guide 会话的轮次）
 * - Last-Event-ID 重放（EventBus ring buffer 内）
 * - 15s ping 心跳由 EventBus 负责
 */
export async function handleProjectEvents(req: Request, res: Response): Promise<void> {
  const projectId = String(req.params.id);
  const project = await loadProject(projectId);
  if (!project) {
    res.status(404).json({ error: { code: 'not_found', message: '项目不存在' } });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':connected\n\n');

  const bus = getBus(projectId);
  const write = (event: ServerEvent, seq: number): void => {
    res.write(`id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  // 重放：客户端带上次收到的 seq，ring buffer 里更新的事件先补发
  const lastEventIdRaw = req.headers['last-event-id'];
  const lastEventId = lastEventIdRaw ? Number(String(lastEventIdRaw)) : undefined;
  const unsubscribe = bus.subscribe(write, lastEventId);

  // snapshot：客户端用全量状态对齐（幂等覆盖本地）
  const guideTurns: Record<string, ReturnType<typeof getGuideTurns>> = {};
  for (const key of Object.keys(project.steps)) {
    if (isGuideLive(projectId, key)) guideTurns[key] = getGuideTurns(projectId, key);
  }
  bus.publish({
    type: 'snapshot',
    project,
    guideTurns: Object.keys(guideTurns).length > 0 ? guideTurns : undefined,
  });

  req.on('close', () => {
    unsubscribe();
  });
}

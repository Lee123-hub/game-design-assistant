import { Router } from 'express';
import { z } from 'zod';
import { loadProject } from '../../store/projectStore.js';
import { readSession } from '../../store/sessionStore.js';
import { FIELD_SENTINEL, setStepState } from '../../orchestrator/runner.js';
import {
  listStepFiles,
  readStepFile,
  saveStepFile,
  deleteStepFile,
} from '../../store/artifactStore.js';
import { buildRegistry, findStepDef } from '../../registry/index.js';
import {
  runGenerativeStep,
  runConversationalStep,
  answerGuide,
  abortStep,
  completeStep,
  getGuideTurns,
  HttpConflict,
} from '../../orchestrator/orchestrator.js';

const seedSchema = z.object({ seedAnswers: z.string().max(20_000).optional() });
const answerSchema = z.object({ text: z.string().min(1).max(20_000) });

function conflict(res: import('express').Response, message: string, code = 'conflict'): void {
  res.status(409).json({ error: { code, message } });
}

export function stepsRouter(): Router {
  const router = Router({ mergeParams: true });

  /** 解析项目 + step 定义；失败时已发送响应，返回 null */
  async function resolve(
    req: { params: Record<string, string> },
    res: import('express').Response,
  ) {
    const project = await loadProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: { code: 'not_found', message: '项目不存在' } });
      return null;
    }
    const registry = buildRegistry(project.personas);
    const def = findStepDef(registry, req.params.agentId, req.params.stepId);
    if (!def) {
      res.status(404).json({ error: { code: 'not_found', message: 'step 不存在' } });
      return null;
    }
    return { project, registry, def };
  }

  router.post('/api/projects/:id/steps/:agentId/:stepId/run', async (req, res) => {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const parsed = seedSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
      return;
    }
    try {
      const result =
        ctx.def.mode === 'conversational'
          ? await runConversationalStep(ctx.project, ctx.registry, ctx.def, parsed.data.seedAnswers)
          : await runGenerativeStep(ctx.project, ctx.registry, ctx.def, parsed.data.seedAnswers);
      res.json(result);
    } catch (err) {
      if (err instanceof HttpConflict) return conflict(res, err.message);
      throw err;
    }
  });

  router.post('/api/projects/:id/steps/:agentId/:stepId/answer', async (req, res) => {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const parsed = answerSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
      return;
    }
    try {
      await answerGuide(ctx.project.id, `${ctx.def.agentId}:${ctx.def.stepId}`, parsed.data.text);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof HttpConflict) return conflict(res, err.message);
      throw err;
    }
  });

  router.post('/api/projects/:id/steps/:agentId/:stepId/abort', async (req, res) => {
    const stepKey = `${req.params.agentId}:${req.params.stepId}`;
    const aborted = await abortStep(req.params.id, stepKey);
    res.json({ ok: aborted });
  });

  router.post('/api/projects/:id/steps/:agentId/:stepId/complete', async (req, res) => {
    const stepKey = `${req.params.agentId}:${req.params.stepId}`;
    try {
      const completed = await completeStep(req.params.id, stepKey);
      res.json({ ok: completed });
    } catch (err) {
      if (err instanceof HttpConflict) return conflict(res, err.message);
      throw err;
    }
  });

  // 产物版本文件：列表（按生成时间倒序）
  router.get('/api/projects/:id/steps/:agentId/:stepId/files', async (req, res) => {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const stepKey = `${ctx.def.agentId}:${ctx.def.stepId}`;
    res.json({ files: await listStepFiles(ctx.project.id, stepKey, ctx.def.outputKind) });
  });

  // 读取指定版本文件内容
  router.get('/api/projects/:id/steps/:agentId/:stepId/files/:name', async (req, res) => {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const stepKey = `${ctx.def.agentId}:${ctx.def.stepId}`;
    const file = await readStepFile(ctx.project.id, stepKey, ctx.def.outputKind, req.params.name);
    if (!file) {
      res.status(404).json({ error: { code: 'not_found', message: '文件不存在' } });
      return;
    }
    res.json({ content: file.content, outputKind: ctx.def.outputKind, updatedAt: file.updatedAt });
  });

  // 原地保存对某版本文件的编辑（csv 表格编辑器用）
  router.put('/api/projects/:id/steps/:agentId/:stepId/files/:name', async (req, res) => {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const parsed = z
      .object({ content: z.string().max(2_000_000) })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'invalid_body', message: parsed.error.message } });
      return;
    }
    const stepKey = `${ctx.def.agentId}:${ctx.def.stepId}`;
    try {
      const { updatedAt } = await saveStepFile(
        ctx.project.id,
        stepKey,
        ctx.def.outputKind,
        req.params.name,
        parsed.data.content,
      );
      res.json({ ok: true, updatedAt });
    } catch (err) {
      res.status(404).json({ error: { code: 'not_found', message: err instanceof Error ? err.message : String(err) } });
    }
  });

  // 删除指定版本文件；删除最新版时自动提升剩余最新文件为主文件
  router.delete('/api/projects/:id/steps/:agentId/:stepId/files/:name', async (req, res) => {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const stepKey = `${ctx.def.agentId}:${ctx.def.stepId}`;
    try {
      const { remaining } = await deleteStepFile(
        ctx.project.id,
        stepKey,
        ctx.def.outputKind,
        req.params.name,
      );
      if (remaining === 0 && ctx.project.steps[stepKey]?.artifactPath) {
        await setStepState(ctx.project.id, stepKey, ctx.project.steps[stepKey].state, {
          artifactPath: '',
        });
      }
      res.json({ ok: true, remaining });
    } catch (err) {
      res.status(404).json({ error: { code: 'not_found', message: err instanceof Error ? err.message : String(err) } });
    }
  });

  // 每个 step 的独立聊天 session（运行中优先返回内存里的实时轮次）
  router.get('/api/projects/:id/steps/:agentId/:stepId/turns', async (req, res) => {
    const ctx = await resolve(req, res);
    if (!ctx) return;
    const stepKey = `${ctx.def.agentId}:${ctx.def.stepId}`;
    const live = getGuideTurns(ctx.project.id, stepKey);
    const raw = live.length > 0 ? live : await readSession(ctx.project.id, stepKey);
    // 完成哨兵是内部协议，不展示给用户
    const turns = raw.map((t) => ({ ...t, text: t.text.replaceAll(FIELD_SENTINEL, '') }));
    res.json({ turns });
  });

  return router;
}

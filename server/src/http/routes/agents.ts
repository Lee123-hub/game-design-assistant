import { Router } from 'express';
import type { AgentInfo, PlayerPersona, Settings } from '@gda/shared';
import { PRESET_PERSONAS } from '@gda/shared';
import { loadSettings } from '../../store/settingsStore.js';
import { loadPromptExtras, loadPromptTemplate, resolveModel } from '../../store/promptStore.js';
import { buildRegistry } from '../../registry/index.js';

/** 构建 Agent 信息列表（每个 step 携带自己的默认提示词与覆盖状态），agents 接口与项目详情共用 */
export async function buildAgentInfos(personas: PlayerPersona[], settings: Settings): Promise<AgentInfo[]> {
  const registry = buildRegistry(personas);
  const agents: AgentInfo[] = [];
  for (const agent of registry) {
    const steps = [];
    for (const s of agent.steps) {
      const stepKey = `${s.agentId}:${s.stepId}`;
      // 玩家画像 step（player:<personaId>）不开放单独配置；总结报告开放
      const configurable = !(s.agentId === 'player' && s.stepId !== 'summary');
      steps.push({
        stepId: s.stepId,
        stepKey,
        title: s.title,
        mode: s.mode,
        outputKind: s.outputKind,
        dependsOn: s.dependsOn,
        presetQueries: s.presetQueries,
        defaultTools: s.defaultTools ?? [],
        promptFile: s.promptFile,
        defaultPrompt: await loadPromptTemplate(s.promptFile),
        promptExtras: s.promptExtras ?? [],
        defaultPromptExtras: await loadPromptExtras(s.promptExtras ?? []),
        overridden: Boolean(settings.agentOverrides[stepKey]),
        model: resolveModel(settings, stepKey),
        configurable,
      });
    }
    agents.push({
      agentId: agent.agentId,
      title: agent.title,
      description: agent.description,
      steps,
    });
  }
  return agents;
}

export function agentsRouter(): Router {
  const router = Router();

  router.get('/api/agents', async (_req, res) => {
    const settings = await loadSettings();
    res.json(await buildAgentInfos(PRESET_PERSONAS, settings));
  });

  return router;
}

import { Router } from 'express';
import type { AgentInfo, PlayerPersona, Settings } from '@gda/shared';
import { PRESET_PERSONAS } from '@gda/shared';
import { loadSettings } from '../../store/settingsStore.js';
import { loadPromptTemplate, resolveModel } from '../../store/promptStore.js';
import { buildRegistry } from '../../registry/index.js';

/** 构建 Agent 信息列表（含默认提示词与覆盖状态），agents 接口与项目详情共用 */
export async function buildAgentInfos(personas: PlayerPersona[], settings: Settings): Promise<AgentInfo[]> {
  const registry = buildRegistry(personas);
  const agents: AgentInfo[] = [];
  for (const agent of registry) {
    const promptFiles = [...new Set(agent.steps.map((s) => s.promptFile))];
    const defaultPrompt = await loadPromptTemplate(promptFiles[0]);
    agents.push({
      agentId: agent.agentId,
      title: agent.title,
      description: agent.description,
      steps: agent.steps.map((s) => ({
        stepId: s.stepId,
        title: s.title,
        mode: s.mode,
        dependsOn: s.dependsOn,
        presetQueries: s.presetQueries,
        useWebSearch: s.useWebSearch ?? false,
      })),
      defaultPrompt,
      overridden: Boolean(settings.agentOverrides[agent.agentId]),
      overrideModel: resolveModel(settings, agent.agentId),
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

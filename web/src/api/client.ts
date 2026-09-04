import type {
  AddPersonaBody,
  AgentInfo,
  ArtifactContent,
  CreateProjectBody,
  GuideTurn,
  Project,
  ProjectDetail,
  ProjectSummary,
  RunStepResult,
  StepFileInfo,
  SettingsTestResult,
  SettingsView,
  SkillPackage,
  StepKey,
} from '@gda/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      body?.error?.message ?? `请求失败 (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  // settings
  getSettings: () => request<SettingsView>('/api/settings'),
  saveSettings: (patch: Record<string, unknown>) =>
    request<SettingsView>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  testSettings: () =>
    request<SettingsTestResult>('/api/settings/test', { method: 'POST' }),

  // 外挂技能包
  listSkills: () => request<SkillPackage[]>('/api/skills'),
  uploadSkill: (name: string, file: File) => {
    return fetch(`/api/skills?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: file,
    }).then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `上传失败 (${res.status})`);
      }
      return body as SkillPackage;
    });
  },
  deleteSkill: (name: string) =>
    request<{ ok: boolean }>(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  // agents
  getAgents: () => request<AgentInfo[]>('/api/agents'),

  // projects
  listProjects: () => request<ProjectSummary[]>('/api/projects'),
  createProject: (body: CreateProjectBody) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  getProject: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),

  // personas
  addPersona: (projectId: string, body: AddPersonaBody) =>
    request<void>(`/api/projects/${projectId}/players`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePersona: (projectId: string, personaId: string, body: Partial<AddPersonaBody>) =>
    request<void>(`/api/projects/${projectId}/players/${personaId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deletePersona: (projectId: string, personaId: string) =>
    request<void>(`/api/projects/${projectId}/players/${personaId}`, { method: 'DELETE' }),

  // steps
  runStep: (projectId: string, stepKey: StepKey, seedAnswers?: string) => {
    const [agentId, stepId] = stepKey.split(':');
    return request<RunStepResult>(`/api/projects/${projectId}/steps/${agentId}/${stepId}/run`, {
      method: 'POST',
      body: JSON.stringify(seedAnswers ? { seedAnswers } : {}),
    });
  },
  answerStep: (projectId: string, stepKey: StepKey, text: string) => {
    const [agentId, stepId] = stepKey.split(':');
    return request<{ ok: boolean }>(
      `/api/projects/${projectId}/steps/${agentId}/${stepId}/answer`,
      { method: 'POST', body: JSON.stringify({ text }) },
    );
  },
  abortStep: (projectId: string, stepKey: StepKey) => {
    const [agentId, stepId] = stepKey.split(':');
    return request<{ ok: boolean }>(
      `/api/projects/${projectId}/steps/${agentId}/${stepId}/abort`,
      { method: 'POST' },
    );
  },
  completeStep: (projectId: string, stepKey: StepKey) => {
    const [agentId, stepId] = stepKey.split(':');
    return request<{ ok: boolean }>(
      `/api/projects/${projectId}/steps/${agentId}/${stepId}/complete`,
      { method: 'POST' },
    );
  },

  // step 产物版本文件
  listStepFiles: (projectId: string, stepKey: StepKey) => {
    const [agentId, stepId] = stepKey.split(':');
    return request<{ files: StepFileInfo[] }>(
      `/api/projects/${projectId}/steps/${agentId}/${stepId}/files`,
    );
  },
  readStepFile: (projectId: string, stepKey: StepKey, name: string) => {
    const [agentId, stepId] = stepKey.split(':');
    return request<ArtifactContent>(
      `/api/projects/${projectId}/steps/${agentId}/${stepId}/files/${encodeURIComponent(name)}`,
    );
  },
  deleteStepFile: (projectId: string, stepKey: StepKey, name: string) => {
    const [agentId, stepId] = stepKey.split(':');
    return request<{ ok: boolean; remaining: number }>(
      `/api/projects/${projectId}/steps/${agentId}/${stepId}/files/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
  },
  getTurns: (projectId: string, stepKey: StepKey) => {
    const [agentId, stepId] = stepKey.split(':');
    return request<{ turns: GuideTurn[] }>(
      `/api/projects/${projectId}/steps/${agentId}/${stepId}/turns`,
    );
  },

  deliverablesList: (projectId: string) =>
    request<{ files: string[] }>(`/api/projects/${projectId}/deliverables`),
  deliverableContent: (projectId: string, file: string) =>
    request<{ content: string; updatedAt: string }>(
      `/api/projects/${projectId}/deliverables/${encodeURIComponent(file)}`,
    ),
};

export function stepKeyOf(agentId: string, stepId: string): StepKey {
  return `${agentId}:${stepId}`;
}

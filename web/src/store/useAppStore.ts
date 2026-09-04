import { create } from 'zustand';
import type {
  AgentInfo,
  GuideTurn,
  Project,
  ProjectSummary,
  ServerEvent,
  SettingsView,
  SkillPackage,
  StepKey,
} from '@gda/shared';
import { api } from '../api/client.js';

export interface Toast {
  id: number;
  kind: 'error' | 'info';
  message: string;
}

interface AppState {
  projects: ProjectSummary[];
  settings: SettingsView | null;
  registry: AgentInfo[];
  /** 已上传的外挂技能包（GET /api/skills） */
  skillPackages: SkillPackage[];

  currentId: string | null;
  project: Project | null;
  connected: boolean;

  /** 每个 step 的实时流缓冲（SSE delta 累积）；tool = 最近一次开始调用的工具名 */
  /** blocks = 按输出段切分的流式文本（工具调用/思考边界各起一段），phase = 当前活动类型 */
  live: Record<
    StepKey,
    { blocks: string[]; thinking: string; tool?: string; phase?: 'text' | 'thinking' | 'tool' }
  >;
  /** 每个 step 最近一次运行的思考过程（运行结束后保留，仅折叠不消失） */
  lastThinking: Record<StepKey, string>;
  /** 每个 step 的独立聊天 session（服务端持久化，切换步骤时加载） */
  turns: Record<StepKey, GuideTurn[]>;

  toasts: Toast[];

  /** 应用内确认弹窗（代替 window.confirm） */
  confirmRequest: { message: string; onConfirm: () => void } | null;

  // actions
  toast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;
  requestConfirm: (message: string, onConfirm: () => void) => void;
  resolveConfirm: (ok: boolean) => void;

  loadProjects: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadRegistry: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  closeProject: () => void;
  reloadProject: () => Promise<void>;

  applyEvent: (event: ServerEvent) => void;
  setConnected: (v: boolean) => void;

  loadSession: (stepKey: StepKey) => Promise<void>;
  runStep: (stepKey: StepKey, seedAnswers?: string) => Promise<void>;
  answerStep: (stepKey: StepKey, text: string) => Promise<void>;
  abortStep: (stepKey: StepKey) => Promise<void>;
  completeStep: (stepKey: StepKey) => Promise<void>;
  saveSettings: (patch: Record<string, unknown>) => Promise<void>;
  loadSkills: () => Promise<void>;
  uploadSkill: (name: string, file: File) => Promise<void>;
  deleteSkill: (name: string) => Promise<void>;
  createProject: (name: string, idea: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  addPersona: (name: string, description: string) => Promise<void>;
  updatePersona: (personaId: string, patch: { name?: string; description?: string }) => Promise<void>;
  deletePersona: (personaId: string) => Promise<void>;
}

let toastSeq = 1;

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  settings: null,
  registry: [],
  skillPackages: [],
  currentId: null,
  project: null,
  connected: false,
  live: {},
  lastThinking: {},
  turns: {},
  toasts: [],
  confirmRequest: null,

  toast: (kind, message) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismissToast(id), 6000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  requestConfirm: (message, onConfirm) => set({ confirmRequest: { message, onConfirm } }),
  resolveConfirm: (ok) => {
    const req = get().confirmRequest;
    set({ confirmRequest: null });
    if (ok && req) req.onConfirm();
  },

  loadProjects: async () => set({ projects: await api.listProjects() }),
  loadSettings: async () => set({ settings: await api.getSettings() }),
  loadRegistry: async () => set({ registry: await api.getAgents() }),

  openProject: async (id) => {
    const detail = await api.getProject(id);
    set({
      currentId: id,
      project: detail.project,
      registry: detail.registry,
      live: {},
      lastThinking: {},
      turns: {},
    });
  },
  closeProject: () => set({ currentId: null, project: null, live: {}, lastThinking: {}, turns: {} }),

  reloadProject: async () => {
    const id = get().currentId;
    if (!id) return;
    const detail = await api.getProject(id);
    set({ project: detail.project, registry: detail.registry });
  },

  setConnected: (v) => set({ connected: v }),

  loadSession: async (stepKey) => {
    const id = get().currentId;
    if (!id) return;
    try {
      const { turns } = await api.getTurns(id, stepKey);
      set((s) => ({ turns: { ...s.turns, [stepKey]: turns } }));
    } catch {
      // 加载失败不阻塞界面，保留现有轮次
    }
  },

  applyEvent: (event) => {
    switch (event.type) {
      case 'snapshot': {
        set((s) => ({
          project: event.project,
          // 重连恢复：用服务端存活会话的轮次覆盖本地
          turns: event.guideTurns ? { ...s.turns, ...event.guideTurns } : s.turns,
        }));
        break;
      }
      case 'step_state': {
        const p = get().project;
        if (p) {
          // key 不在 project.steps 里也接受（老项目未迁移时 registry 已有新 step），
          // 现场补一条最小记录，避免 running/done 事件被静默丢弃
          const prev = p.steps[event.stepKey];
          const steps = { ...p.steps };
          steps[event.stepKey] = {
            ...prev,
            stepKey: event.stepKey,
            runId: event.runId ?? prev?.runId ?? null,
            state: event.state,
            error: event.error,
          };
          set({ project: { ...p, steps } });
        }
        break;
      }
      case 'delta': {
        set((s) => {
          const cur = s.live[event.stepKey] ?? { blocks: [''], thinking: '' };
          const blocks = [...cur.blocks];
          blocks[blocks.length - 1] = (blocks[blocks.length - 1] ?? '') + event.text;
          return {
            live: {
              ...s.live,
              [event.stepKey]: { ...cur, blocks, tool: undefined, phase: 'text' },
            },
          };
        });
        break;
      }
      case 'tool_use': {
        set((s) => {
          const cur = s.live[event.stepKey] ?? { blocks: [''], thinking: '' };
          // 工具调用是输出段边界：另起一段，后续 delta 落入新块
          const blocks = cur.blocks[cur.blocks.length - 1] === '' ? cur.blocks : [...cur.blocks, ''];
          return {
            live: { ...s.live, [event.stepKey]: { ...cur, blocks, tool: event.tool, phase: 'tool' } },
          };
        });
        break;
      }
      case 'thinking': {
        set((s) => {
          const cur = s.live[event.stepKey] ?? { blocks: [''], thinking: '' };
          // 思考同样是输出段边界
          const blocks = cur.blocks[cur.blocks.length - 1] === '' ? cur.blocks : [...cur.blocks, ''];
          // 思考流可能非常长：只保留尾部，避免内存/渲染膨胀
          const THINKING_CAP = 40_000;
          const nextThinking = (cur.thinking + event.text).slice(-THINKING_CAP);
          return {
            live: {
              ...s.live,
              [event.stepKey]: { ...cur, thinking: nextThinking, tool: undefined, phase: 'thinking' },
            },
            // 运行结束后仍保留，仅折叠展示
            lastThinking: {
              ...s.lastThinking,
              [event.stepKey]: ((s.lastThinking[event.stepKey] ?? '') + event.text).slice(
                -THINKING_CAP,
              ),
            },
          };
        });
        break;
      }
      case 'guide_turn': {
        set((s) => {
          const live = { ...s.live };
          delete live[event.stepKey]; // 本轮流式文本已由完整 turn 取代
          return {
            live,
            turns: {
              ...s.turns,
              [event.stepKey]: [
                ...(s.turns[event.stepKey] ?? []),
                { role: 'assistant' as const, text: event.question },
              ],
            },
          };
        });
        break;
      }
      case 'step_done':
      case 'step_error': {
        // 清流缓冲；session 里的最终 assistant 消息由服务端落盘后重新拉取
        set((s) => {
          const live = { ...s.live };
          delete live[event.stepKey];
          return { live };
        });
        void get().loadSession(event.stepKey);
        break;
      }
      case 'ping':
        break;
    }
  },

  runStep: async (stepKey, seedAnswers) => {
    const id = get().currentId;
    if (!id) return;
    set((s) => ({ lastThinking: { ...s.lastThinking, [stepKey]: '' } }));
    try {
      await api.runStep(id, stepKey, seedAnswers);
    } catch (err) {
      get().toast('error', err instanceof Error ? err.message : String(err));
    }
  },

  answerStep: async (stepKey, text) => {
    const id = get().currentId;
    if (!id) return;
    set((s) => ({
      turns: {
        ...s.turns,
        [stepKey]: [...(s.turns[stepKey] ?? []), { role: 'user' as const, text }],
      },
    }));
    try {
      await api.answerStep(id, stepKey, text);
    } catch (err) {
      get().toast('error', err instanceof Error ? err.message : String(err));
    }
  },

  abortStep: async (stepKey) => {
    const id = get().currentId;
    if (!id) return;
    try {
      await api.abortStep(id, stepKey);
    } catch (err) {
      get().toast('error', err instanceof Error ? err.message : String(err));
    }
  },

  completeStep: async (stepKey) => {
    const id = get().currentId;
    if (!id) return;
    try {
      await api.completeStep(id, stepKey);
    } catch (err) {
      get().toast('error', err instanceof Error ? err.message : String(err));
    }
  },

  saveSettings: async (patch) => {
    set({ settings: await api.saveSettings(patch) });
  },

  loadSkills: async () => {
    set({ skillPackages: await api.listSkills() });
  },

  uploadSkill: async (name, file) => {
    await api.uploadSkill(name, file);
    await get().loadSkills();
  },

  deleteSkill: async (name) => {
    await api.deleteSkill(name);
    await get().loadSkills();
  },

  createProject: async (name, idea) => {
    const project = await api.createProject({ name, idea });
    await get().loadProjects();
    return project.id;
  },

  deleteProject: async (id) => {
    await api.deleteProject(id);
    if (get().currentId === id) get().closeProject();
    await get().loadProjects();
  },

  addPersona: async (name, description) => {
    const id = get().currentId;
    if (!id) return;
    try {
      await api.addPersona(id, { name, description });
      await get().reloadProject();
    } catch (err) {
      get().toast('error', err instanceof Error ? err.message : String(err));
    }
  },
  updatePersona: async (personaId, patch) => {
    const id = get().currentId;
    if (!id) return;
    try {
      await api.updatePersona(id, personaId, patch);
      await get().reloadProject();
    } catch (err) {
      get().toast('error', err instanceof Error ? err.message : String(err));
    }
  },
  deletePersona: async (personaId) => {
    const id = get().currentId;
    if (!id) return;
    try {
      await api.deletePersona(id, personaId);
      await get().reloadProject();
    } catch (err) {
      get().toast('error', err instanceof Error ? err.message : String(err));
    }
  },
}));

import { useEffect, useState } from 'react';
import type { StepKey, StepMode, StepState } from '@gda/shared';
import { useAppStore } from '../store/useAppStore.js';
import { ArtifactViewer } from './ArtifactViewer.js';
import { StepChat } from './StepChat.js';
import { PlayersPanel } from './PlayersPanel.js';
import { DeliverablesPanel } from './DeliverablesPanel.js';

const STATE_LABEL: Record<StepState, string> = {
  pending: '待运行',
  running: '运行中',
  waiting_input: '等待回答',
  done: '完成',
  error: '错误',
  canceled: '已中止',
};

const MODE_LABEL: Record<StepMode, string> = {
  generative: '生成',
  conversational: '访谈',
};

type ModalKind = 'players' | 'deliverables' | null;

/** 项目主视图：顶部横向阶段栏 → 子步骤 chips → 聊天工作区 + 右侧产物文件面板 */
export function ProjectView() {
  const project = useAppStore((s) => s.project);
  const registry = useAppStore((s) => s.registry);
  const connected = useAppStore((s) => s.connected);

  const [agentId, setAgentId] = useState<string | null>(null);
  const [stepKey, setStepKey] = useState<StepKey | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  const order = registry.flatMap((a) =>
    a.steps.map((s) => `${a.agentId}:${s.stepId}` as StepKey),
  );
  // 依赖解锁：某步骤的全部 dependsOn 都完成后即可运行/查看
  // （玩家画像各步骤之间没有依赖，因此多个画像评估可以并行跑）
  const stepDefByKey = new Map(
    registry.flatMap((a) => a.steps.map((s) => [`${a.agentId}:${s.stepId}` as StepKey, s] as const)),
  );
  const isUnlocked = (key: StepKey | null): boolean => {
    if (!key) return false;
    const deps = stepDefByKey.get(key)?.dependsOn ?? [];
    return deps.every((k) => project?.steps[k]?.state === 'done');
  };

  // 默认选中第一个「已解锁且未完成」的步骤；registry 变化或当前选择无效时兜底
  useEffect(() => {
    if (!project || !registry.length) return;
    const unlocked = order.filter((k) => isUnlocked(k));
    const target =
      unlocked.find((k) => project.steps[k]?.state !== 'done') ?? unlocked[0] ?? order[0];
    if (!agentId || !registry.some((a) => a.agentId === agentId) || !unlocked.includes(stepKey as StepKey)) {
      setAgentId(target.split(':')[0]);
      setStepKey(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, project, agentId, stepKey]);

  if (!project) return null;

  const activeAgent = registry.find((a) => a.agentId === agentId) ?? null;

  const selectAgent = (id: string) => {
    setAgentId(id);
    const agent = registry.find((a) => a.agentId === id);
    if (!agent) return;
    const agentKeys = agent.steps.map((s) => `${id}:${s.stepId}` as StepKey);
    if (!agentKeys.includes(stepKey as StepKey)) {
      // 优先选该阶段内第一个已解锁且未完成的步骤
      const target =
        agentKeys.find((k) => isUnlocked(k) && project.steps[k]?.state !== 'done') ??
        agentKeys.find((k) => isUnlocked(k)) ??
        agentKeys[0];
      setStepKey(target ?? null);
    }
  };

  const steps = Object.values(project.steps);
  const doneCount = steps.filter((s) => s.state === 'done').length;

  const agentInfo = stepKey
    ? registry.find((a) => a.agentId === stepKey.split(':')[0])
    : null;
  const stepDef = agentInfo?.steps.find((s) => `${agentInfo.agentId}:${s.stepId}` === stepKey);
  const stepRecord = stepKey ? project.steps[stepKey] : undefined;
  const stepState = stepRecord?.state ?? 'pending';

  return (
    <div className="project-view">
      {/* 顶栏：项目信息 + 全局进度 + 资料入口 */}
      <div className="panel project-header">
        <div className="row spread">
          <div className="row" style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, flexShrink: 0 }}>{project.name}</h3>
            {project.idea && (
              <span className="muted idea-text">{project.idea}</span>
            )}
          </div>
          <div className="row">
            <button onClick={() => setModal('players')}>玩家画像</button>
            <button onClick={() => setModal('deliverables')}>交付包</button>
            <span className={`badge ${connected ? 'done' : 'error'}`}>
              {connected ? '已连接' : '重连中…'}
            </span>
          </div>
        </div>
        <div className="progress-bar" style={{ marginTop: 10 }}>
          <div style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} />
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          {doneCount}/{steps.length} 步骤完成
        </div>
      </div>

      {/* 阶段横向栏 */}
      <div className="stage-bar">
        {registry.map((agent) => {
          const total = agent.steps.length;
          const done = agent.steps.filter(
            (s) => project.steps[`${agent.agentId}:${s.stepId}`]?.state === 'done',
          ).length;
          const running = agent.steps.some((s) => {
            const st = project.steps[`${agent.agentId}:${s.stepId}`]?.state;
            return st === 'running' || st === 'waiting_input';
          });
          const locked = !isUnlocked(`${agent.agentId}:${agent.steps[0]?.stepId}` as StepKey);
          return (
            <button
              key={agent.agentId}
              className={`stage-tab ${agent.agentId === agentId ? 'active' : ''} ${locked ? 'locked' : ''}`}
              onClick={() => selectAgent(agent.agentId)}
              disabled={locked}
              title={locked ? '完成上一个阶段后解锁' : agent.description}
            >
              <span className="stage-title">
                {agent.title}
                {running && <span className="chip-dot running" style={{ marginLeft: 6 }} />}
              </span>
              <span className="stage-meta">
                {done}/{total} 完成
              </span>
              <span className="stage-progress">
                <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      {/* 当前阶段的子步骤 chips */}
      {activeAgent && (
        <div className="step-chips">
          {activeAgent.steps.map((s) => {
            const key = `${activeAgent.agentId}:${s.stepId}` as StepKey;
            const st = project.steps[key]?.state ?? 'pending';
            const locked = !isUnlocked(key);
            return (
              <button
                key={key}
                className={`step-chip ${key === stepKey ? 'active' : ''} ${locked ? 'locked' : ''}`}
                onClick={() => setStepKey(key)}
                disabled={locked}
                title={locked ? '完成上一个步骤后解锁' : undefined}
              >
                <span className={`chip-dot ${st}`} />
                {s.title}
                <span className="chip-state">{locked ? '🔒' : STATE_LABEL[st]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 聊天工作区：左侧对话 + 右侧产物文件 */}
      {stepKey && stepDef && (
        <div className="workspace">
          <div className="panel chat-page">
            <div className="row spread chat-header">
              <div className="row" style={{ minWidth: 0 }}>
                <strong>{stepDef.title}</strong>
                <span className="badge muted">{MODE_LABEL[stepDef.mode]}</span>
                <span className={`badge ${stepState}`}>{STATE_LABEL[stepState]}</span>
                {stepRecord?.error && (
                  <span className="muted" style={{ color: 'var(--err)' }}>
                    {stepRecord.error.message}
                  </span>
                )}
              </div>
              <div className="row">
                {stepDef?.overridden && (
                  <span className="muted">本步骤已自定义模型/提示词</span>
                )}
              </div>
            </div>
            <div className="chat-body">
              <StepChat
                stepKey={stepKey}
                conversational={stepDef.mode === 'conversational'}
                presetQueries={stepDef.presetQueries}
              />
            </div>
          </div>

          <div className="panel files-panel">
            <div className="row spread files-header">
              <strong>产物文件</strong>
              <span className="muted">
                {stepDef.mode === 'conversational' ? '访谈记录 / 产物' : '本步骤生成结果'}
              </span>
            </div>
            <div className="files-body">
              <ArtifactViewer stepKey={stepKey} />
            </div>
          </div>
        </div>
      )}

      {/* 资料面板（弹窗复用原面板组件） */}
      {modal && (
        <div className="modal-mask" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row spread" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{modal === 'players' ? '玩家画像' : '交付包'}</h3>
              <button onClick={() => setModal(null)}>关闭</button>
            </div>
            {modal === 'players' && <PlayersPanel />}
            {modal === 'deliverables' && <DeliverablesPanel />}
          </div>
        </div>
      )}
    </div>
  );
}

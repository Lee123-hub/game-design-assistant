import { useEffect, useRef, useState } from 'react';
import {
  AGENT_IDS,
  AGENT_LABELS,
  AGENT_TOOL_OPTIONS,
  DEFAULT_AGENT_TOOLS,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODELS,
  type AgentId,
  type ProviderKind,
} from '@gda/shared';
import { useAppStore } from '../store/useAppStore.js';
import { api } from '../api/client.js';
import { TrashIcon } from './icons.js';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const registry = useAppStore((s) => s.registry);
  const skillPackages = useAppStore((s) => s.skillPackages);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const loadRegistry = useAppStore((s) => s.loadRegistry);
  const loadSkills = useAppStore((s) => s.loadSkills);
  const uploadSkill = useAppStore((s) => s.uploadSkill);
  const deleteSkill = useAppStore((s) => s.deleteSkill);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const toast = useAppStore((s) => s.toast);

  const [provider, setProvider] = useState<ProviderKind>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEEPSEEK_BASE_URL);
  const [defaultModel, setDefaultModel] = useState('deepseek-chat');
  const [maxRuns, setMaxRuns] = useState(3);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editingModel, setEditingModel] = useState('');
  const [editingTools, setEditingTools] = useState<string[]>(DEFAULT_AGENT_TOOLS);
  const [editingSkills, setEditingSkills] = useState<string[]>([]);
  const [editingMaxTurns, setEditingMaxTurns] = useState('');
  const [uploadingSkill, setUploadingSkill] = useState(false);
  const [saving, setSaving] = useState(false);
  const skillFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider ?? 'deepseek');
      setBaseUrl(settings.baseUrl);
      setDefaultModel(settings.defaultModel);
      setMaxRuns(settings.maxConcurrentRuns);
    }
    void loadRegistry();
    void loadSkills();
  }, [settings, loadRegistry, loadSkills]);

  if (!settings) return null;
  const st = settings;
  const custom = provider === 'custom';

  const overrideOf = (agentId: AgentId) => st.agentOverrides[agentId] ?? {};

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings({
        provider,
        ...(apiKey ? { apiKey } : {}),
        baseUrl: custom ? baseUrl.trim() : DEEPSEEK_BASE_URL,
        defaultModel: defaultModel.trim(),
        maxConcurrentRuns: maxRuns,
      });
      toast('info', '设置已保存');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await saveSettings({
        provider,
        ...(apiKey ? { apiKey } : {}),
        baseUrl: custom ? baseUrl.trim() : DEEPSEEK_BASE_URL,
        defaultModel: defaultModel.trim(),
        maxConcurrentRuns: maxRuns,
      });
      const result = await api.testSettings();
      setTestResult(
        result.ok
          ? `连接成功（${result.latencyMs}ms）`
          : `连接失败: ${result.error ?? '未知错误'}`,
      );
    } catch (err) {
      setTestResult(`连接失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  }

  async function saveAgentOverride(agentId: AgentId) {
    try {
      await saveSettings({
        agentOverrides: {
          ...st.agentOverrides,
          [agentId]: {
            model: editingModel || undefined,
            systemPrompt: editingPrompt || undefined,
            allowedTools: editingTools,
            skills: editingSkills,
            maxTurns: editingMaxTurns.trim() ? Number(editingMaxTurns.trim()) : undefined,
          },
        },
      });
      await loadRegistry();
      toast('info', 'Agent 配置已保存');
      setEditingAgent(null);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    }
  }

  async function resetAgentOverride(agentId: AgentId) {
    try {
      const next = { ...st.agentOverrides };
      delete next[agentId];
      await saveSettings({ agentOverrides: next });
      await loadRegistry();
      toast('info', '已恢复默认配置');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>设置</h3>

        <div className="panel">
          <h3>AI 提供方</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <label>
              <div className="muted">提供方</div>
              <select
                value={provider}
                onChange={(e) => {
                  const next = e.target.value as ProviderKind;
                  setProvider(next);
                  if (next === 'deepseek') setBaseUrl(DEEPSEEK_BASE_URL);
                }}
              >
                <option value="deepseek">DeepSeek（官方网关，模型固定枚举）</option>
                <option value="custom">自定义（自由填写 Base URL 与模型）</option>
              </select>
            </label>
            <label>
              <div className="muted">API Key（留空保持不变）</div>
              <input
                type="password"
                value={apiKey}
                placeholder={settings.hasApiKey ? '••••••••（已配置）' : 'sk-...'}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
            <label>
              <div className="muted">Base URL{custom ? '' : '（DeepSeek 官方固定）'}</div>
              <input
                value={baseUrl}
                disabled={!custom}
                placeholder="https://your-gateway.example.com/anthropic"
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
            <label>
              <div className="muted">默认模型</div>
              {custom ? (
                <input
                  value={defaultModel}
                  placeholder="例如 claude-sonnet-5 / gpt-5 等，按网关支持的模型名填写"
                  onChange={(e) => setDefaultModel(e.target.value)}
                />
              ) : (
                <select
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                >
                  {DEEPSEEK_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                      {m === 'deepseek-reasoner' ? '（推理模型，较慢）' : ''}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label>
              <div className="muted">最大并发运行数（每个运行占一个子进程）</div>
              <input
                type="number"
                min={1}
                max={10}
                value={maxRuns}
                onChange={(e) => setMaxRuns(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" disabled={saving} onClick={handleSave}>
              保存
            </button>
            <button disabled={testing} onClick={handleTest}>
              {testing ? '测试中…' : '测试连接'}
            </button>
            {testResult && <span className="muted">{testResult}</span>}
          </div>
        </div>

        <div className="panel">
          <h3>Agent 配置（模型 / 提示词 / 工具 / 技能）</h3>
          <div style={{ marginBottom: 14 }}>
            <div className="row spread">
              <div className="muted">外挂技能包（zip，Claude Code SKILL.md 格式），勾选后挂载给对应 Agent</div>
              <input
                ref={skillFileRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                disabled={uploadingSkill}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const name = file.name.replace(/\.zip$/i, '');
                  setUploadingSkill(true);
                  try {
                    await uploadSkill(name, file);
                    toast('info', `技能包「${name}」已上传`);
                  } catch (err) {
                    toast('error', err instanceof Error ? err.message : String(err));
                  } finally {
                    setUploadingSkill(false);
                  }
                }}
              />
              <button
                disabled={uploadingSkill}
                onClick={() => skillFileRef.current?.click()}
              >
                {uploadingSkill ? '上传中…' : '上传技能包 zip'}
              </button>
            </div>
            {skillPackages.length === 0 ? (
              <div className="muted" style={{ marginTop: 6 }}>
                尚未上传技能包
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                {skillPackages.map((pkg) => (
                  <div key={pkg.name} className="row spread" style={{ marginBottom: 4 }}>
                    <span>
                      <strong>{pkg.name}</strong>
                      {pkg.skills.length > 0 && (
                        <span className="muted">
                          {' '}
                          （{pkg.skills.map((s) => s.name).join('、')}）
                        </span>
                      )}
                    </span>
                    <button
                      className="danger icon-btn"
                      title="删除技能包"
                      onClick={() =>
                        requestConfirm(
                          `删除技能包「${pkg.name}」？已挂载它的 Agent 将不再加载该技能。`,
                          () => {
                            void deleteSkill(pkg.name)
                              .then(() => toast('info', '技能包已删除'))
                              .catch((err: unknown) =>
                                toast('error', err instanceof Error ? err.message : String(err)),
                              );
                          },
                        )
                      }
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {AGENT_IDS.map((agentId) => {
            const info = registry.find((a) => a.agentId === agentId);
            const ov = overrideOf(agentId);
            return (
              <div key={agentId} style={{ marginBottom: 10 }}>
                <div className="row spread">
                  <div>
                    <strong>{AGENT_LABELS[agentId]}</strong>{' '}
                    <span className="muted">
                      {ov.model ? `模型: ${ov.model}` : `默认模型: ${settings.defaultModel}`}
                      {ov.systemPrompt ? ' · 提示词已自定义' : ''}
                      {ov.allowedTools &&
                      ov.allowedTools.length > 0 &&
                      (ov.allowedTools.length !== DEFAULT_AGENT_TOOLS.length ||
                        ov.allowedTools.some((t) => !DEFAULT_AGENT_TOOLS.includes(t)))
                        ? ' · 工具已自定义'
                        : ''}
                      {ov.skills && ov.skills.length > 0 ? ` · 技能: ${ov.skills.join('、')}` : ''}
                    </span>
                  </div>
                  <div className="row">
                    <button
                      onClick={() => {
                        setEditingAgent(agentId);
                        setEditingPrompt(ov.systemPrompt ?? info?.defaultPrompt ?? '');
                        setEditingModel(ov.model ?? '');
                        setEditingTools(ov.allowedTools ?? DEFAULT_AGENT_TOOLS);
                        setEditingSkills(ov.skills ?? []);
                        setEditingMaxTurns(ov.maxTurns ? String(ov.maxTurns) : '');
                      }}
                    >
                      配置
                    </button>
                    {(ov.model || ov.systemPrompt || ov.allowedTools || ov.skills) && (
                      <button className="danger" onClick={() => resetAgentOverride(agentId)}>
                        恢复默认
                      </button>
                    )}
                  </div>
                </div>
                {editingAgent === agentId && info && (
                  <div style={{ marginTop: 8 }}>
                    <label>
                      <div className="muted">
                        模型（留空使用默认；填当前提供方支持的模型名）
                      </div>
                      <input
                        value={editingModel}
                        placeholder="（使用默认）"
                        onChange={(e) => setEditingModel(e.target.value)}
                      />
                    </label>
                    <div style={{ marginTop: 8 }}>
                      <div className="muted">
                        可用工具（默认全部放开但{' '}
                        <strong>不含 Agent 工具</strong>；Agent 工具可让模型派生子任务）
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4 }}>
                        {AGENT_TOOL_OPTIONS.map((tool) => (
                          <label key={tool} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="checkbox"
                              checked={editingTools.includes(tool)}
                              onChange={(e) =>
                                setEditingTools((prev) =>
                                  e.target.checked
                                    ? [...prev, tool]
                                    : prev.filter((t) => t !== tool),
                                )
                              }
                            />
                            {tool}
                          </label>
                        ))}
                      </div>
                      <button
                        style={{ marginTop: 4 }}
                        onClick={() => setEditingTools(DEFAULT_AGENT_TOOLS)}
                      >
                        恢复默认工具集
                      </button>
                    </div>
                    <label style={{ display: 'block', marginTop: 8 }}>
                      <div className="muted">
                        最大工具轮数（留空使用默认：普通步骤 基础+6；HTML 原型 基础+16）
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        style={{ maxWidth: 160 }}
                        placeholder="（使用默认）"
                        value={editingMaxTurns}
                        onChange={(e) => setEditingMaxTurns(e.target.value)}
                      />
                    </label>
                    <div style={{ marginTop: 8 }}>
                      <div className="muted">外挂技能（挂载后该 Agent 可在对话中使用这些技能）</div>
                      {skillPackages.length === 0 ? (
                        <div className="muted" style={{ marginTop: 4 }}>
                          尚未上传技能包（可在上方上传）
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4 }}>
                          {skillPackages.map((pkg) => (
                            <label
                              key={pkg.name}
                              title={pkg.skills.map((s) => `${s.name}: ${s.description}`).join('\n')}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <input
                                type="checkbox"
                                checked={editingSkills.includes(pkg.name)}
                                onChange={(e) =>
                                  setEditingSkills((prev) =>
                                    e.target.checked
                                      ? [...prev, pkg.name]
                                      : prev.filter((s) => s !== pkg.name),
                                  )
                                }
                              />
                              {pkg.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <label style={{ display: 'block', marginTop: 8 }}>
                      <div className="muted">系统提示词</div>
                      <textarea
                        rows={10}
                        value={editingPrompt}
                        onChange={(e) => setEditingPrompt(e.target.value)}
                      />
                    </label>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button
                        className="primary"
                        onClick={() => saveAgentOverride(agentId)}
                      >
                        保存该 Agent
                      </button>
                      <button onClick={() => setEditingAgent(null)}>取消</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="row">
          <button className="primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  AGENT_LABELS,
  AGENT_TOOL_OPTIONS,
  DEFAULT_AGENT_TOOLS,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODELS,
  type ProviderKind,
} from '@gda/shared';
import type { StepInfo } from '@gda/shared';
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
  const [keyVisible, setKeyVisible] = useState(false);
  const [realKey, setRealKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEEPSEEK_BASE_URL);
  const [defaultModel, setDefaultModel] = useState('deepseek-chat');
  const [maxRuns, setMaxRuns] = useState(3);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [uploadingSkill, setUploadingSkill] = useState(false);
  const [saving, setSaving] = useState(false);
  const skillFileRef = useRef<HTMLInputElement>(null);

  // step tab 状态：当前打开的 stepKey + 该 step 的编辑表单
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState('');
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editingTools, setEditingTools] = useState<string[]>(DEFAULT_AGENT_TOOLS);
  const [editingSkills, setEditingSkills] = useState<string[]>([]);
  const [editingMaxTurns, setEditingMaxTurns] = useState('');

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

  // 可单独配置的 step 列表（玩家画像 step 不开放）；无覆盖时工具默认 = DEFAULT_AGENT_TOOLS
  const configurableSteps: StepInfo[] = registry.flatMap((a) => a.steps).filter((s) => s.configurable);
  const stepByKey = (key: string) => configurableSteps.find((s) => s.stepKey === key);
  const defaultToolsOf = (step: StepInfo) => (step.defaultTools.length > 0 ? step.defaultTools : DEFAULT_AGENT_TOOLS);
  const overrideOf = (key: string) => st.agentOverrides[key] ?? {};

  function openStep(step: StepInfo) {
    const ov = overrideOf(step.stepKey);
    setActiveStep(step.stepKey);
    // 直接填充具体默认模型（settings.defaultModel）；保存时与默认相同则不写入覆盖
    setEditingModel(ov.model ?? settings?.defaultModel ?? '');
    setEditingPrompt(ov.systemPrompt ?? step.defaultPrompt);
    setEditingTools(ov.allowedTools ?? defaultToolsOf(step));
    setEditingSkills(ov.skills ?? []);
    setEditingMaxTurns(ov.maxTurns ? String(ov.maxTurns) : '');
  }

  async function toggleKeyVisible() {
    if (!keyVisible && !realKey) {
      try {
        const r = await api.getApiKey();
        setRealKey(r.apiKey);
      } catch (err) {
        toast('error', err instanceof Error ? err.message : String(err));
        return;
      }
    }
    setKeyVisible(!keyVisible);
  }

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

  async function saveStepOverride(stepKey: string) {
    try {
      await saveSettings({
        agentOverrides: {
          ...st.agentOverrides,
          [stepKey]: {
            // 与全局默认模型相同（或为空）时不写入覆盖，保持跟随默认
            model:
              editingModel.trim() && editingModel.trim() !== settings?.defaultModel
                ? editingModel.trim()
                : undefined,
            systemPrompt: editingPrompt || undefined,
            allowedTools: editingTools,
            skills: editingSkills,
            maxTurns: editingMaxTurns.trim() ? Number(editingMaxTurns.trim()) : undefined,
          },
        },
      });
      await loadRegistry();
      toast('info', '该步骤配置已保存');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    }
  }

  async function resetStepOverride(stepKey: string) {
    try {
      const next = { ...st.agentOverrides };
      delete next[stepKey];
      await saveSettings({ agentOverrides: next });
      await loadRegistry();
      const step = stepByKey(stepKey);
      if (step) openStep(step); // 回填为默认值
      toast('info', '已恢复默认配置');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    }
  }

  const active = activeStep ? stepByKey(activeStep) : undefined;

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
              <div className="muted">API Key（点击 👁 查看明文；留空保存则保持不变）</div>
              <div className="row" style={{ gap: 6 }}>
                <input
                  type="text"
                  style={{ flex: 1 }}
                  value={keyVisible ? realKey : apiKey || (settings.hasApiKey ? '*******' : '')}
                  placeholder={settings.hasApiKey ? '' : 'sk-...'}
                  onFocus={(e) => {
                    // 未查看明文时开始输入：全选掩码，直接输入即可覆盖
                    if (!keyVisible && !apiKey && settings.hasApiKey) e.currentTarget.select();
                  }}
                  onChange={(e) => {
                    // 掩码星号不是真实 key 的一部分：剥离后再保存
                    const v = e.target.value.replaceAll('*', '');
                    setApiKey(v);
                    if (keyVisible) setRealKey(v);
                  }}
                />
                <button
                  className="icon-btn"
                  title={keyVisible ? '隐藏' : '查看明文'}
                  onClick={() => void toggleKeyVisible()}
                >
                  {keyVisible ? '🙈' : '👁'}
                </button>
              </div>
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
          <h3>步骤配置（按步骤独立管理模型 / 提示词 / 工具 / 轮数 / 技能）</h3>
          <div style={{ marginBottom: 14 }}>
            <div className="row spread">
              <div className="muted">外挂技能包（zip，Claude Code SKILL.md 格式），在各步骤中勾选挂载</div>
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
                          `删除技能包「${pkg.name}」？已挂载它的步骤将不再加载该技能。`,
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

          {/* step tab 条 */}
          <div className="tabs" style={{ flexWrap: 'wrap' }}>
            {configurableSteps.map((step) => {
              const ov = overrideOf(step.stepKey);
              const overridden = Boolean(ov.model || ov.systemPrompt || ov.allowedTools || ov.skills || ov.maxTurns);
              const [agentId] = step.stepKey.split(':');
              return (
                <button
                  key={step.stepKey}
                  className={activeStep === step.stepKey ? 'active' : ''}
                  title={`${AGENT_LABELS[agentId as keyof typeof AGENT_LABELS] ?? agentId} · ${step.title}`}
                  onClick={() => openStep(step)}
                >
                  {step.title}
                  {overridden ? ' ●' : ''}
                </button>
              );
            })}
          </div>

          {/* 当前 step 的编辑表单 */}
          {active && (
            <div style={{ marginTop: 10 }}>
              <div className="row spread">
                <strong>{active.title}</strong>
                {(overrideOf(active.stepKey).model ||
                  overrideOf(active.stepKey).systemPrompt ||
                  overrideOf(active.stepKey).allowedTools ||
                  overrideOf(active.stepKey).skills ||
                  overrideOf(active.stepKey).maxTurns) && (
                  <button className="danger" onClick={() => resetStepOverride(active.stepKey)}>
                    恢复默认
                  </button>
                )}
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                <div className="muted">
                  模型（已填充该步骤当前生效的默认值；只有清空后才会显示 placeholder）
                </div>
                <input
                  value={editingModel}
                  placeholder={settings.defaultModel}
                  onChange={(e) => setEditingModel(e.target.value)}
                />
              </label>
              <div style={{ marginTop: 8 }}>
                <div className="muted">
                  可用工具（该步骤默认工具集：
                  <strong>{defaultToolsOf(active).join('、')}</strong>
                  {defaultToolsOf(active).includes('Agent') ? '；Agent 工具可让模型派生子任务' : '；默认不含 Agent 工具'}
                  ）
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
                <button style={{ marginTop: 4 }} onClick={() => setEditingTools(defaultToolsOf(active))}>
                  恢复该步骤默认工具集
                </button>
              </div>
              <label style={{ display: 'block', marginTop: 8 }}>
                <div className="muted">最大工具轮数（默认 99，留空即用默认）</div>
                <input
                  type="number"
                  min={1}
                  max={100}
                  style={{ maxWidth: 160 }}
                  placeholder="（默认 99）"
                  value={editingMaxTurns}
                  onChange={(e) => setEditingMaxTurns(e.target.value)}
                />
              </label>
              <div style={{ marginTop: 8 }}>
                <div className="muted">外挂技能（挂载后该步骤可在对话中使用这些技能）</div>
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
                <div className="muted">系统提示词（该步骤的内置默认见下方编辑框，可直接修改）</div>
                <textarea
                  rows={10}
                  value={editingPrompt}
                  onChange={(e) => setEditingPrompt(e.target.value)}
                />
              </label>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="primary" onClick={() => saveStepOverride(active.stepKey)}>
                  保存该步骤
                </button>
              </div>
            </div>
          )}
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

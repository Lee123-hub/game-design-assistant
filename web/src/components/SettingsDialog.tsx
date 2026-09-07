import { useEffect, useRef, useState } from 'react';
import {
  AGENT_TOOL_OPTIONS,
  DEFAULT_AGENT_TOOLS,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODELS,
  type ProviderKind,
} from '@gda/shared';
import type { AgentInfo, StepInfo } from '@gda/shared';
import { useAppStore } from '../store/useAppStore.js';
import { api } from '../api/client.js';
import {
  DEFAULT_ACCENT,
  PRESET_ACCENTS,
  loadAccent,
  loadThemeMode,
  setAccentColor,
  setThemeMode,
  type ThemeMode,
} from '../theme.js';
import { TrashIcon } from './icons.js';

/** 左侧导航的线性小图标（16px，currentColor 描边） */
function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="nav-ico"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const GeneralIcon = (
  <Ico>
    <path d="M2 4.5h5.5M11.5 4.5H14" />
    <circle cx="9.5" cy="4.5" r="1.9" />
    <path d="M2 11.5h1.5M7.5 11.5H14" />
    <circle cx="5.5" cy="11.5" r="1.9" />
  </Ico>
);

const SunIcon = (
  <Ico>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3" />
  </Ico>
);

const BotIcon = (
  <Ico>
    <rect x="3" y="5" width="10" height="8" rx="2" />
    <path d="M8 2.2V5" />
    <circle cx="5.8" cy="9" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="10.2" cy="9" r="0.6" fill="currentColor" stroke="none" />
  </Ico>
);

const PackageIcon = (
  <Ico>
    <path d="M8 1.8 14 5v6L8 14.2 2 11V5z" />
    <path d="M2 5l6 3.1L14 5M8 8.1v6.1" />
  </Ico>
);

/**
 * 选中项：
 * - 'general' 常规 / 'skills' 技能包
 * - 'agent:<agentId>' 某个 agent 的配置（挂载 skill 等）
 * - 其它含 ':' 的值为 stepKey（某步骤配置）
 */
type SettingsSection = 'general' | 'skills' | string;

/** 分节标题 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div className="settings-section-title">{title}</div>
      <div className="settings-card">{children}</div>
    </section>
  );
}

/** 卡片内一行：左侧名称+描述，右侧控件 */
function Row({
  label,
  desc,
  control,
}: {
  label: string;
  desc?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-label">{label}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

/** 卡片内整行块：标题+描述在上，内容在下（工具/技能/提示词等大面积内容用） */
function Block({
  label,
  desc,
  extra,
  children,
}: {
  label: string;
  desc?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-block">
      <div className="settings-block-head">
        <div>
          <div className="settings-row-label">{label}</div>
          {desc && <div className="settings-row-desc">{desc}</div>}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

/** pill 切换按钮（工具/技能多选用） */
function Chip({
  on,
  onClick,
  title,
  locked,
  children,
}: {
  on: boolean;
  onClick?: () => void;
  title?: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`chip${on ? ' on' : ''}${locked ? ' locked' : ''}`}
      title={title}
      disabled={locked}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** 主题预览卡里的 mini mockup */
function Mini({ bg, panel }: { bg: string; panel: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: bg,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ height: 6, width: '44%', borderRadius: 3, background: panel }} />
      <div style={{ height: 6, width: '68%', borderRadius: 3, background: panel }} />
      <div style={{ flex: 1, borderRadius: 6, background: panel, marginTop: 2 }} />
    </div>
  );
}

/** 主题模式预览缩略图：系统=左浅右深分割，浅色、深色为整块 */
function ThemeThumb({ kind }: { kind: ThemeMode }) {
  if (kind === 'system') {
    return (
      <div className="theme-thumb">
        <div style={{ position: 'absolute', inset: 0, width: '50%' }}>
          <Mini bg="#ffffff" panel="#e3e5ea" />
        </div>
        <div style={{ position: 'absolute', inset: 0, left: '50%' }}>
          <Mini bg="#101319" panel="#22262f" />
        </div>
      </div>
    );
  }
  return (
    <div className="theme-thumb">
      {kind === 'light' ? <Mini bg="#ffffff" panel="#e3e5ea" /> : <Mini bg="#101319" panel="#22262f" />}
    </div>
  );
}

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

  const [selected, setSelected] = useState<SettingsSection>('general');
  const [provider, setProvider] = useState<ProviderKind>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [realKey, setRealKey] = useState('');
  // 只保存自定义网关地址；deepseek 官方地址不占这个 state，切换提供方不会丢自定义值
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultModel, setDefaultModel] = useState('deepseek-v4-flash');
  const [maxRuns, setMaxRuns] = useState(3);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [uploadingSkill, setUploadingSkill] = useState(false);
  const [saving, setSaving] = useState(false);
  const skillFileRef = useRef<HTMLInputElement>(null);

  // 「Agent 配置」导航组的展开/折叠（默认折叠）
  const [agentNavOpen, setAgentNavOpen] = useState(false);

  // 外观：主题模式 + 强调色（localStorage，改动立即生效）
  const [mode, setMode] = useState<ThemeMode>(loadThemeMode);
  const [accent, setAccent] = useState(loadAccent);

  // 当前打开 step 的编辑表单
  const [editingModel, setEditingModel] = useState('');
  const [editingPrompt, setEditingPrompt] = useState('');
  const [editingTools, setEditingTools] = useState<string[]>(DEFAULT_AGENT_TOOLS);
  const [editingSkills, setEditingSkills] = useState<string[]>([]);
  const [editingMaxTurns, setEditingMaxTurns] = useState('');

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider ?? 'deepseek');
      setBaseUrl(settings.baseUrl !== DEEPSEEK_BASE_URL ? settings.baseUrl : '');
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
  const isOverridden = (key: string) => {
    const ov = overrideOf(key);
    return Boolean(ov.model || ov.systemPrompt || ov.allowedTools || ov.skills || ov.maxTurns);
  };
  const agentMountsOf = (agentId: string) => st.agentSkillMounts[agentId] ?? [];

  function openStep(step: StepInfo) {
    const ov = overrideOf(step.stepKey);
    setSelected(step.stepKey);
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
        baseUrl: custom ? baseUrl.trim() || DEEPSEEK_BASE_URL : DEEPSEEK_BASE_URL,
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
        baseUrl: custom ? baseUrl.trim() || DEEPSEEK_BASE_URL : DEEPSEEK_BASE_URL,
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

  /** agent 级技能挂载：对该 agent 全部步骤生效 */
  async function saveAgentMounts(agentId: string, skills: string[]) {
    try {
      await saveSettings({
        agentSkillMounts: { ...st.agentSkillMounts, [agentId]: skills },
      });
      toast('info', 'Agent 技能挂载已保存');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    }
  }

  const active = stepByKey(selected);
  const activeAgent: AgentInfo | undefined = selected.startsWith('agent:')
    ? registry.find((a) => a.agentId === selected.slice('agent:'.length))
    : undefined;
  const activeAgentMounts = activeAgent ? agentMountsOf(activeAgent.agentId) : [];
  const stepAgentMounts = active ? agentMountsOf(active.stepKey.split(':')[0]) : [];

  /** 多选 chip 组（技能包；无包时给提示） */
  const chipGroup = (current: string[], onChange: (next: string[]) => void) =>
    skillPackages.length === 0 ? (
      <div className="settings-row-desc" style={{ marginTop: 8 }}>
        尚未上传技能包（可在左侧「技能包」中上传）
      </div>
    ) : (
      <div className="chip-group">
        {skillPackages.map((pkg) => (
          <Chip
            key={pkg.name}
            on={current.includes(pkg.name)}
            title={pkg.skills.map((s) => `${s.name}: ${s.description}`).join('\n')}
            onClick={() =>
              onChange(
                current.includes(pkg.name)
                  ? current.filter((s) => s !== pkg.name)
                  : [...current, pkg.name],
              )
            }
          >
            {pkg.name}
          </Chip>
        ))}
      </div>
    );

  return (
    <div className="settings-mask" onClick={onClose}>
      <div className="settings-shell" onClick={(e) => e.stopPropagation()}>
        <button className="settings-close icon-btn" title="关闭" onClick={onClose}>
          ✕
        </button>

        {/* 左侧导航 */}
        <aside className="settings-nav">
          <div className="settings-nav-title">设置</div>
          <button
            className={`settings-nav-item${selected === 'general' ? ' active' : ''}`}
            onClick={() => setSelected('general')}
          >
            {GeneralIcon}
            常规
          </button>
          <button
            className={`settings-nav-item${selected === 'appearance' ? ' active' : ''}`}
            onClick={() => setSelected('appearance')}
          >
            {SunIcon}
            外观
          </button>
          <button
            className={`settings-nav-item${agentNavOpen ? ' open' : ''}`}
            onClick={() => setAgentNavOpen((v) => !v)}
          >
            {BotIcon}
            Agent 配置
            <span className="chevron">{agentNavOpen ? '▾' : '▸'}</span>
          </button>
          {agentNavOpen &&
            registry.map((agent) => (
              <div key={agent.agentId}>
                <button
                  className={`settings-nav-item sub${selected === `agent:${agent.agentId}` ? ' active' : ''}`}
                  onClick={() => setSelected(`agent:${agent.agentId}`)}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.title}</span>
                  {agentMountsOf(agent.agentId).length > 0 && <span className="dot">●</span>}
                </button>
                {agent.steps
                  .filter((s) => s.configurable)
                  .map((step) => (
                    <button
                      key={step.stepKey}
                      className={`settings-nav-item sub2${selected === step.stepKey ? ' active' : ''}`}
                      onClick={() => openStep(step)}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.title}</span>
                      {isOverridden(step.stepKey) && <span className="dot">●</span>}
                    </button>
                  ))}
              </div>
            ))}
          <button
            className={`settings-nav-item${selected === 'skills' ? ' active' : ''}`}
            onClick={() => setSelected('skills')}
          >
            {PackageIcon}
            技能包
          </button>
        </aside>

        {/* 右侧完整配置区：大标题 + 分节卡片 */}
        <main className="settings-content">
          {selected === 'general' && (
            <>
              <header className="settings-page-head">
                <h1>常规</h1>
                <p>AI 提供方、模型与运行参数</p>
              </header>
              <Section title="AI 提供方">
                <Row
                  label="提供方"
                  desc="DeepSeek 官方网关模型为固定枚举；自定义可填任意兼容网关"
                  control={
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as ProviderKind)}
                    >
                      <option value="deepseek">DeepSeek</option>
                      <option value="custom">自定义</option>
                    </select>
                  }
                />
                <Row
                  label="API Key"
                  desc={settings.hasApiKey ? '已保存；留空保存则保持不变' : '尚未设置'}
                  control={
                    <div className="row" style={{ gap: 6 }}>
                      <input
                        type="text"
                        style={{ width: 260 }}
                        value={keyVisible ? realKey : apiKey || (settings.hasApiKey ? '*******' : '')}
                        placeholder="sk-..."
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
                  }
                />
                <Row
                  label="Base URL"
                  desc={custom ? '兼容 Anthropic 协议的网关地址' : 'DeepSeek 官方固定，无需修改'}
                  control={
                    <input
                      style={{ width: 260 }}
                      value={custom ? baseUrl : DEEPSEEK_BASE_URL}
                      disabled={!custom}
                      placeholder="https://your-gateway.example.com/anthropic"
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  }
                />
              </Section>
              <Section title="模型与运行">
                <Row
                  label="默认模型"
                  desc={custom ? '按网关支持的模型名填写' : '所有步骤默认使用；可在各步骤中单独覆盖'}
                  control={
                    custom ? (
                      <input
                        style={{ width: 260 }}
                        value={defaultModel}
                        placeholder="例如 claude-sonnet-5 / gpt-5"
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
                            {m === 'deepseek-v4-flash' ? '（默认，快）' : ''}
                            {m === 'deepseek-v4-pro' ? '（更强，较贵）' : ''}
                            {m === 'deepseek-v4-flash-vision-exp' ? '（视觉实验版）' : ''}
                          </option>
                        ))}
                      </select>
                    )
                  }
                />
                <Row
                  label="最大并发运行数"
                  desc="每个运行占一个子进程，默认 3"
                  control={
                    <input
                      type="number"
                      min={1}
                      max={10}
                      style={{ width: 90 }}
                      value={maxRuns}
                      onChange={(e) => setMaxRuns(Number(e.target.value))}
                    />
                  }
                />
              </Section>
              <div className="settings-footer">
                <span className="settings-row-desc">{testResult}</span>
                <button disabled={testing} onClick={handleTest}>
                  {testing ? '测试中…' : '测试连接'}
                </button>
                <button className="primary" disabled={saving} onClick={handleSave}>
                  保存
                </button>
              </div>
            </>
          )}

          {selected === 'appearance' && (
            <>
              <header className="settings-page-head">
                <h1>外观</h1>
                <p>主题模式与强调色，改动立即生效并保存在本机浏览器</p>
              </header>
              <Section title="主题模式">
                <div className="theme-cards">
                  {(
                    [
                      ['system', '系统'],
                      ['light', '浅色'],
                      ['dark', '深色'],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      className={`theme-card${mode === m ? ' active' : ''}`}
                      onClick={() => {
                        setMode(m);
                        setThemeMode(m);
                      }}
                    >
                      <ThemeThumb kind={m} />
                      <div className="theme-card-label">{label}</div>
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="强调色">
                <Block label="强调色" desc="按钮、选中态、链接等使用的主题色">
                  <div className="swatch-row">
                    {PRESET_ACCENTS.map((c) => (
                      <button
                        key={c}
                        className={`swatch${accent.toLowerCase() === c ? ' active' : ''}`}
                        style={{ background: c }}
                        title={c}
                        onClick={() => {
                          setAccent(c);
                          setAccentColor(c);
                        }}
                      />
                    ))}
                    <label className="swatch-custom" title="自定义颜色">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : DEFAULT_ACCENT}
                        onChange={(e) => {
                          setAccent(e.target.value);
                          setAccentColor(e.target.value);
                        }}
                      />
                      自定义
                    </label>
                  </div>
                </Block>
              </Section>
            </>
          )}

          {activeAgent && (
            <>
              <header className="settings-page-head">
                <h1>{activeAgent.title}</h1>
                <p>{activeAgent.description}</p>
              </header>
              <Section title="Agent 级技能挂载">
                <Block
                  label="挂载技能包"
                  desc="对该 Agent 下所有步骤生效，并与步骤级挂载自动合并；保存后从下一次运行开始生效，进行中的对话不会加载新技能"
                >
                  {chipGroup(activeAgentMounts, (next) =>
                    void saveAgentMounts(activeAgent.agentId, next),
                  )}
                </Block>
              </Section>
            </>
          )}

          {active && (
            <>
              <header className="settings-page-head">
                <h1>{active.title}</h1>
                <p>
                  {active.stepKey} · {active.mode === 'conversational' ? '访谈对话' : '单次生成'}
                  {isOverridden(active.stepKey) && ' · 已有自定义配置'}
                </p>
                {isOverridden(active.stepKey) && (
                  <button className="danger" onClick={() => resetStepOverride(active.stepKey)}>
                    恢复默认
                  </button>
                )}
              </header>
              <Section title="运行配置">
                <Row
                  label="模型"
                  desc={settings.defaultModel === editingModel ? '当前跟随全局默认模型' : '覆盖该步骤使用的模型'}
                  control={
                    <input
                      style={{ width: 240 }}
                      value={editingModel}
                      placeholder={settings.defaultModel}
                      onChange={(e) => setEditingModel(e.target.value)}
                    />
                  }
                />
                <Row
                  label="最大工具轮数"
                  desc="留空即用默认（99）"
                  control={
                    <input
                      type="number"
                      min={1}
                      max={100}
                      style={{ width: 90 }}
                      placeholder="99"
                      value={editingMaxTurns}
                      onChange={(e) => setEditingMaxTurns(e.target.value)}
                    />
                  }
                />
              </Section>
              <Section title="工具与技能">
                <Block
                  label="可用工具"
                  desc={
                    defaultToolsOf(active).includes('Agent')
                      ? '默认含 Agent 工具（可派生子任务）'
                      : '默认不含 Agent 工具'
                  }
                  extra={
                    JSON.stringify([...editingTools].sort()) !==
                    JSON.stringify([...defaultToolsOf(active)].sort()) ? (
                      <button
                        className="link-btn"
                        onClick={() => setEditingTools(defaultToolsOf(active))}
                      >
                        重置为默认
                      </button>
                    ) : undefined
                  }
                >
                  <div className="chip-group">
                    {AGENT_TOOL_OPTIONS.map((tool) => (
                      <Chip
                        key={tool}
                        on={editingTools.includes(tool)}
                        onClick={() =>
                          setEditingTools((prev) =>
                            prev.includes(tool)
                              ? prev.filter((t) => t !== tool)
                              : [...prev, tool],
                          )
                        }
                      >
                        {tool}
                      </Chip>
                    ))}
                  </div>
                </Block>
                <Block
                  label="外挂技能"
                  desc="挂载后该步骤可在对话中使用这些技能；保存后从下一次运行开始生效，进行中的对话不会加载新技能"
                >
                  {stepAgentMounts.length > 0 && (
                    <div className="chip-group" style={{ marginBottom: 6 }}>
                      {stepAgentMounts.map((name) => (
                        <Chip key={name} on locked title="Agent 级挂载，对该 agent 所有步骤生效">
                          {name} · Agent 级
                        </Chip>
                      ))}
                    </div>
                  )}
                  {chipGroup(editingSkills, setEditingSkills)}
                </Block>
              </Section>
              <Section title="系统提示词">
                <Block
                  label="提示词"
                  desc="下方为该步骤当前生效的内容（内置默认或已有覆盖），可直接修改"
                >
                  <textarea rows={12} value={editingPrompt} onChange={(e) => setEditingPrompt(e.target.value)} />
                </Block>
              </Section>
              <div className="settings-footer">
                <button className="primary" onClick={() => saveStepOverride(active.stepKey)}>
                  保存该步骤
                </button>
              </div>
            </>
          )}

          {selected === 'skills' && (
            <>
              <header className="settings-page-head">
                <h1>技能包</h1>
                <p>外挂技能（Claude Code SKILL.md 格式的 zip），可在 Agent 级或步骤级挂载</p>
              </header>
              <Section title="已安装">
                <Row
                  label="上传技能包"
                  desc="zip 内含 SKILL.md；上传后即可在「Agent 配置」中挂载"
                  control={
                    <>
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
                      <button disabled={uploadingSkill} onClick={() => skillFileRef.current?.click()}>
                        {uploadingSkill ? '上传中…' : '选择 zip'}
                      </button>
                    </>
                  }
                />
                {skillPackages.map((pkg) => (
                  <Row
                    key={pkg.name}
                    label={pkg.name}
                    desc={
                      pkg.skills.length > 0
                        ? pkg.skills.map((s) => s.name).join('、')
                        : undefined
                    }
                    control={
                      <button
                        className="danger"
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
                    }
                  />
                ))}
                {skillPackages.length === 0 && (
                  <div className="settings-row" style={{ justifyContent: 'center' }}>
                    <span className="settings-row-desc">尚未上传技能包</span>
                  </div>
                )}
              </Section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

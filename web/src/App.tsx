import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore.js';
import { connectProjectEvents } from './api/sse.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { ProjectView } from './components/ProjectView.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { TrashIcon } from './components/icons.js';
import './styles.css';

export default function App() {
  const projects = useAppStore((s) => s.projects);
  const currentId = useAppStore((s) => s.currentId);
  const settings = useAppStore((s) => s.settings);
  const toasts = useAppStore((s) => s.toasts);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const openProject = useAppStore((s) => s.openProject);
  const createProject = useAppStore((s) => s.createProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const dismissToast = useAppStore((s) => s.dismissToast);

  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIdea, setNewIdea] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 项目列表按名称/想法过滤（不区分大小写）
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const visibleProjects = q
    ? projects.filter(
        (p) => p.name.toLowerCase().includes(q) || p.idea.toLowerCase().includes(q),
      )
    : projects;

  useEffect(() => {
    void loadProjects();
    void loadSettings();
  }, [loadProjects, loadSettings]);

  // 打开项目时建立 SSE 订阅；关闭或切换项目时断开旧连接
  useEffect(() => {
    if (!currentId) return;
    const conn = connectProjectEvents(
      currentId,
      (event) => useAppStore.getState().applyEvent(event),
      (connected) => useAppStore.getState().setConnected(connected),
    );
    return () => conn.close();
  }, [currentId]);

  // 项目有更新时刷新侧栏进度
  useEffect(() => {
    if (!currentId) return;
    const timer = setInterval(() => void loadProjects(), 15_000);
    return () => clearInterval(timer);
  }, [currentId, loadProjects]);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const id = await createProject(newName.trim(), newIdea.trim());
      setCreating(false);
      setNewName('');
      setNewIdea('');
      await openProject(id);
    } catch (err) {
      useAppStore
        .getState()
        .toast('error', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="layout">
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">🎮 游戏设计助手</div>
        <div className="sidebar-section">
          <button
            className="primary"
            style={{ width: '100%' }}
            onClick={() => setCreating(true)}
          >
            + 新建项目
          </button>
        </div>
        <div className="sidebar-section">
          <input
            className="project-search"
            value={search}
            placeholder="搜索项目…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sidebar-section project-list">
          {visibleProjects.map((p) => (
            <div key={p.id} className="row spread" style={{ padding: '2px 0' }}>
              <button
                className={`project-item ${p.id === currentId ? 'active' : ''}`}
                onClick={() => void openProject(p.id)}
                style={{ flex: 1, minWidth: 0 }}
              >
                {p.name}
                <span className="idea">{p.idea}</span>
                <span className="idea">
                  {p.progress.done}/{p.progress.total} 完成
                </span>
              </button>
              <button
                className="danger icon-btn"
                title="删除项目"
                onClick={() =>
                  requestConfirm(`确认删除项目「${p.name}」？该操作不可撤销。`, () =>
                    void deleteProject(p.id),
                  )
                }
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          {visibleProjects.length === 0 && (
            <div className="muted" style={{ padding: 8 }}>
              {projects.length === 0 ? '还没有项目，点击上方按钮创建' : '没有匹配的项目'}
            </div>
          )}
        </div>
        <div className="sidebar-section">
          <button style={{ width: '100%' }} onClick={() => setShowSettings(true)}>
            ⚙️ 设置{settings?.hasApiKey ? '' : '（未配置 Key）'}
          </button>
        </div>
      </div>

      <div className="main">{currentId ? <ProjectView /> : <Welcome />}</div>

      {/* 侧栏收起/展开按钮：展开时贴侧栏右缘，收起时贴左缘 */}
      <button
        className={`sidebar-toggle ${sidebarCollapsed ? 'collapsed' : ''}`}
        title={sidebarCollapsed ? '展开项目列表' : '收起项目列表'}
        onClick={() => setSidebarCollapsed((v) => !v)}
      >
        {sidebarCollapsed ? '»' : '«'}
      </button>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>新建游戏设计项目</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <label>
                <div className="muted">项目名称</div>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如：星海远征"
                />
              </label>
              <label>
                <div className="muted">一句话想法（越具体越好）</div>
                <textarea
                  value={newIdea}
                  onChange={(e) => setNewIdea(e.target.value)}
                  placeholder="例如：一个太空题材的 roguelike，玩家每局重建一支舰队……"
                />
              </label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="primary" onClick={handleCreate} disabled={!newName.trim()}>
                创建
              </button>
              <button onClick={() => setCreating(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}

      <ConfirmDialog />

      <div className="toasts">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.kind}`}
            onClick={() => dismissToast(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="panel" style={{ maxWidth: 560, marginTop: 60 }}>
      <h3>开始你的游戏设计</h3>
      <p className="muted">
        从左侧新建一个项目，AI 会按 SOP 引导你完成：概念收集 → 竞品分析 → HTML
        原型 → 数值分析 → 技术方案 → 玩家评估 → 交付文档包。
      </p>
      <p className="muted">
        使用前请先在「设置」中配置 DeepSeek API Key。
      </p>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactContent, StepFileInfo, StepKey } from '@gda/shared';
import { parseModuleUiFileName } from '@gda/shared';
import { api } from '../api/client.js';
import { useAppStore } from '../store/useAppStore.js';
import { TrashIcon } from './icons.js';

interface Props {
  stepKey: StepKey;
}

/** 一个模块下的一份原型文件 */
interface ModuleFile extends StepFileInfo {
  version: number;
  /** 文件名里的时间戳 YYYYMMDD-HHMMSS；解析不出时为空 */
  ts: string;
}

interface ModuleGroup {
  /** 模块名；解析不出的文件归入空字符串组 */
  module: string;
  files: ModuleFile[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 扁平文件列表 → 按模块分组（模块名排序，组内版本倒序），解析不出的进「其他文件」组 */
function groupByModule(files: StepFileInfo[]): ModuleGroup[] {
  const map = new Map<string, ModuleFile[]>();
  for (const f of files) {
    const parsed = parseModuleUiFileName(f.name);
    const key = parsed?.module ?? '';
    const list = map.get(key) ?? [];
    list.push({ ...f, version: parsed?.version ?? 0, ts: parsed?.ts ?? '' });
    map.set(key, list);
  }
  const groups: ModuleGroup[] = [];
  for (const [module, list] of map) {
    list.sort((a, b) => b.version - a.version || b.updatedAt.localeCompare(a.updatedAt));
    groups.push({ module, files: list });
  }
  // 规范命名的模块在前（按模块名排序），杂项文件组垫底
  groups.sort((a, b) => {
    if (!a.module !== !b.module) return a.module ? -1 : 1;
    return a.module.localeCompare(b.module, 'zh-Hans-CN');
  });
  return groups;
}

/** 重新生成某个模块的指令：明确「只写这个模块」，避免 agent 顺手重画其他模块 */
function regenMessage(module: string): string {
  return `只重新生成「${module}」的模块 UI 原型：按最新的模块详细设计重画该模块界面，只写该模块的下一个版本文件，其他模块的文件保持不变。`;
}

/**
 * 模块 UI 原型产物面板：按模块分组展示，每个模块可单独预览 / 重新生成 / 展开版本历史删除。
 * 与 ArtifactViewer 的区别是「一个 step 多个产物文件、且文件按模块归组」。
 */
export function ModuleUiPanel({ stepKey }: Props) {
  const currentId = useAppStore((s) => s.currentId);
  const stepState = useAppStore((s) => s.project?.steps[stepKey]?.state);
  const [files, setFiles] = useState<StepFileInfo[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; content: ArtifactContent } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const running = stepState === 'running';

  const refreshFiles = (id: string) => {
    api
      .listStepFiles(id, stepKey)
      .then((r) => setFiles(r.files))
      .catch(() => setFiles([]));
  };

  // 切换步骤：清空预览与展开状态
  useEffect(() => {
    setPreview(null);
    setExpanded(null);
    setError(null);
    setFiles(null);
  }, [stepKey]);

  useEffect(() => {
    if (!currentId) return;
    refreshFiles(currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, stepKey, stepState]);

  // 全屏状态跟随
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      previewWrapRef.current?.requestFullscreen().catch(() => {});
    }
  };

  // 预览某个版本文件（按需拉内容）
  const openPreview = (name: string) => {
    if (!currentId) return;
    setError(null);
    setPreview(null);
    api
      .readStepFile(currentId, stepKey, name)
      .then((a) => setPreview({ name, content: a }))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  const regen = (module: string) => {
    void useAppStore.getState().runStep(stepKey, regenMessage(module));
  };

  const removeFile = (name: string) => {
    if (!currentId) return;
    useAppStore.getState().requestConfirm(`删除原型文件「${name}」？`, () => {
      api
        .deleteStepFile(currentId, stepKey, name)
        .then(() => {
          if (preview?.name === name) setPreview(null);
          refreshFiles(currentId);
        })
        .catch((err) => {
          useAppStore
            .getState()
            .toast('error', err instanceof Error ? err.message : String(err));
        });
    });
  };

  const groups = useMemo(() => groupByModule(files ?? []), [files]);

  // ---- 预览态 ----
  if (preview) {
    return (
      <>
        <div className="row spread file-detail-header">
          <button className="link-btn" onClick={() => setPreview(null)}>
            ← 返回模块列表
          </button>
          <button className="link-btn" onClick={toggleFullscreen}>
            {fullscreen ? '退出全屏' : '⛶ 全屏'}
          </button>
        </div>
        <div className="muted" style={{ marginBottom: 6 }}>
          {preview.name}
        </div>
        <div className="prototype-wrap" ref={previewWrapRef}>
          <iframe
            className="prototype-frame"
            sandbox="allow-scripts"
            srcDoc={preview.content.content}
          />
          {fullscreen && (
            <button className="fullscreen-exit" onClick={toggleFullscreen}>
              ✕ 退出全屏
            </button>
          )}
        </div>
      </>
    );
  }

  // ---- 模块列表 ----
  return (
    <div className="module-ui-list">
      {error && <div className="muted">{error}</div>}
      {files === null && <div className="muted">加载中…</div>}
      {files?.length === 0 && (
        <div className="muted">
          {stepState === 'done' ? '本步骤没有产物文件' : '还没有原型，请先运行'}
        </div>
      )}
      {groups.map((g) => {
        const latest = g.files[0];
        const isOpen = expanded === (g.module || '__misc__');
        const older = g.files.slice(1);
        return (
          <div className="module-ui-group" key={g.module || '__misc__'}>
            <div className="module-ui-head">
              <div className="module-ui-title">
                <strong className="module-ui-name" title={g.module || '其他文件'}>
                  {g.module || '其他文件'}
                </strong>
                {g.module && <span className="badge muted">v{latest.version}</span>}
              </div>
              <div className="module-ui-actions">
                <span className="muted module-ui-time">{formatTime(latest.updatedAt)}</span>
                <button className="link-btn" onClick={() => openPreview(latest.name)}>
                  预览
                </button>
                {g.module && (
                  <button
                    className="link-btn"
                    disabled={running}
                    title={running ? '该步骤正在运行中' : '按最新模块设计重画该模块'}
                    onClick={() => regen(g.module)}
                  >
                    重新生成
                  </button>
                )}
                {older.length > 0 && (
                  <button
                    className="link-btn"
                    onClick={() => setExpanded(isOpen ? null : g.module || '__misc__')}
                  >
                    {isOpen ? '收起' : `历史 ${older.length}`}
                  </button>
                )}
              </div>
            </div>
            {isOpen &&
              older.map((f) => (
                <div className="file-item" key={f.name}>
                  <button
                    className="file-open"
                    onClick={() => openPreview(f.name)}
                    title={f.name}
                  >
                    <span className="file-icon">📄</span>
                    <span className="file-name">
                      v{f.version || '?'} · {f.name}
                    </span>
                    <span className="file-time muted">{formatTime(f.updatedAt)}</span>
                  </button>
                  <button
                    className="danger icon-btn"
                    title="删除该版本"
                    onClick={() => removeFile(f.name)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

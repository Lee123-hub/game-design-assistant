import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ArtifactContent, StepFileInfo } from '@gda/shared';
import { api } from '../api/client.js';
import { useAppStore } from '../store/useAppStore.js';
import { CsvTable } from './CsvTable.js';
import { TrashIcon } from './icons.js';

interface Props {
  stepKey: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * step 产物查看：文件列表（含历史版本，按生成时间倒序，可删除）→
 * 点击展开详情（markdown 渲染 / html sandbox iframe + 全屏）→「返回文件列表」。
 */
export function ArtifactViewer({ stepKey }: Props) {
  const currentId = useAppStore((s) => s.currentId);
  const stepState = useAppStore((s) => s.project?.steps[stepKey]?.state);
  const [files, setFiles] = useState<StepFileInfo[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<ArtifactContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const previewWrapRef = useRef<HTMLDivElement>(null);

  const refreshFiles = (id: string) => {
    api
      .listStepFiles(id, stepKey)
      .then((r) => setFiles(r.files))
      .catch(() => setFiles([]));
  };

  // 切换步骤：回到列表并刷新
  useEffect(() => {
    setSelected(null);
    setArtifact(null);
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

  // 进入详情后按需拉取内容（列表页不请求）
  useEffect(() => {
    if (!selected || !currentId) return;
    let cancelled = false;
    setArtifact(null);
    setError(null);
    api
      .readStepFile(currentId, stepKey, selected)
      .then((a) => {
        if (!cancelled) setArtifact(a);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selected, currentId, stepKey]);

  const removeFile = (name: string) => {
    if (!currentId) return;
    useAppStore
      .getState()
      .requestConfirm(`删除版本文件「${name}」？剩余文件中最新的一份将成为当前版本。`, () => {
        api
          .deleteStepFile(currentId, stepKey, name)
          .then(() => {
            if (selected === name) {
              setSelected(null);
              setArtifact(null);
            }
            refreshFiles(currentId);
          })
          .catch((err) => {
            useAppStore
              .getState()
              .toast('error', err instanceof Error ? err.message : String(err));
          });
      });
  };

  // ---- 文件列表 ----
  if (!selected) {
    return (
      <div className="file-list">
        {files === null && <div className="muted">加载中…</div>}
        {files?.length === 0 && (
          <div className="muted">{stepState === 'done' ? '本步骤没有产物文件' : '还没有产物，请先运行'}</div>
        )}
        {files?.map((f) => (
          <div key={f.name} className="file-item">
            <button className="file-open" onClick={() => setSelected(f.name)} title={f.name}>
              <span className="file-icon">📄</span>
              <span className="file-name">{f.name}</span>
              <span className="file-time muted">{formatTime(f.updatedAt)}</span>
            </button>
            <button
              className="danger icon-btn"
              title="删除该文件"
              onClick={() => removeFile(f.name)}
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
    );
  }

  // ---- 文件详情 ----
  return (
    <>
      <div className="row spread file-detail-header">
        <button className="link-btn" onClick={() => setSelected(null)}>
          ← 返回文件列表
        </button>
        {artifact && !selected.endsWith('.csv') && (
          <button className="link-btn" onClick={toggleFullscreen}>
            {fullscreen ? '退出全屏' : '⛶ 全屏'}
          </button>
        )}
      </div>
      {error && <div className="muted">{error}</div>}
      {!error && !artifact && <div className="muted">加载中…</div>}
      {artifact && currentId && selected.endsWith('.csv') ? (
        <CsvTable
          projectId={currentId}
          stepKey={stepKey}
          fileName={selected}
          content={artifact.content}
        />
      ) : artifact?.outputKind === 'html' ? (
        <div className="prototype-wrap" ref={previewWrapRef}>
          <iframe className="prototype-frame" sandbox="allow-scripts" srcDoc={artifact.content} />
          {/* 全屏时顶部工具栏不可见，悬浮按钮提供退出入口 */}
          {fullscreen && (
            <button className="fullscreen-exit" onClick={toggleFullscreen}>
              ✕ 退出全屏
            </button>
          )}
        </div>
      ) : artifact ? (
        <div className="markdown" ref={previewWrapRef}>
          {fullscreen && (
            <button className="fullscreen-exit" onClick={toggleFullscreen}>
              ✕ 退出全屏
            </button>
          )}
          <Markdown remarkPlugins={[remarkGfm]}>{artifact.content}</Markdown>
        </div>
      ) : null}
    </>
  );
}

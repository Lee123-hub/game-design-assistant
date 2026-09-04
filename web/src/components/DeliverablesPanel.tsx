import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client.js';
import { useAppStore } from '../store/useAppStore.js';

/** 交付包：assemble 产出物列表 + 内容查看 */
export function DeliverablesPanel() {
  const currentId = useAppStore((s) => s.currentId);
  const project = useAppStore((s) => s.project);
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);

  const assembleDone = Object.values(project?.steps ?? {}).some(
    (s) => s.state === 'done' && s.stepKey.startsWith('assemble:'),
  );

  useEffect(() => {
    if (!currentId) return;
    api
      .deliverablesList(currentId)
      .then((r) => {
        setFiles(r.files);
        setSelected((cur) => cur ?? r.files[0] ?? null);
      })
      .catch(() => setFiles([]));
  }, [currentId, assembleDone]);

  useEffect(() => {
    if (!currentId || !selected) return;
    setContent(null);
    api
      .deliverableContent(currentId, selected)
      .then((r) => setContent(r.content))
      .catch(() => setContent(null));
  }, [currentId, selected]);

  if (files.length === 0) {
    return <div className="muted">交付包还没有内容。完成「交付整合」agent 的步骤后会在这里出现。</div>;
  }

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div style={{ minWidth: 200 }}>
        {files.map((f) => (
          <button
            key={f}
            className={f === selected ? 'primary' : ''}
            style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
            onClick={() => setSelected(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="markdown" style={{ flex: 1 }}>
        {content ? <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown> : '加载中…'}
      </div>
    </div>
  );
}

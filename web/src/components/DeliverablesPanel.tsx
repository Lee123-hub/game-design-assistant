import { useEffect } from 'react';
import { api } from '../api/client.js';
import { useAppStore } from '../store/useAppStore.js';

/** 交付包：一键打包最新版本产物为 zip 下载（含旧项目遗留 deliverables/） */
export function DeliverablesPanel() {
  const currentId = useAppStore((s) => s.currentId);
  const project = useAppStore((s) => s.project);
  const reloadProject = useAppStore((s) => s.reloadProject);

  // 兜底：面板挂载时拉一次最新项目状态。
  // 即使某条 SSE 丢失、或页面长时间停留导致本地状态陈旧，也不会误报「没有产物」。
  useEffect(() => {
    if (currentId) void reloadProject();
  }, [currentId, reloadProject]);

  if (!currentId) return null;

  // 判断依据用 state==='done'：csv / html-modules 类步骤的产物是「一组文件」，
  // artifactPath 可能只指向其中一个或为空，用它判断会漏判。
  const doneCount = Object.values(project?.steps ?? {}).filter((s) => s.state === 'done').length;

  return (
    <div className="deliverables-panel">
      <p>
        交付包会把每个步骤最新版本的产物（详细设计文档、CSV 配置表与说明、HTML 原型、
        各玩家评估与总结报告等）打包为一个 zip 文件下载。
      </p>
      {doneCount === 0 ? (
        <p className="muted">还没有任何已完成的步骤；先完成至少一个步骤再下载。</p>
      ) : (
        <p className="muted">已就绪 {doneCount} 个步骤的产物，可打包下载。</p>
      )}
      <a
        className="primary"
        href={api.exportZipUrl(currentId)}
        style={{ textDecoration: 'none', display: 'inline-block', padding: '8px 16px' }}
      >
        下载交付包（zip）
      </a>
    </div>
  );
}

import { api } from '../api/client.js';
import { useAppStore } from '../store/useAppStore.js';

/** 交付包：一键打包最新版本产物为 zip 下载（含旧项目遗留 deliverables/） */
export function DeliverablesPanel() {
  const currentId = useAppStore((s) => s.currentId);
  const project = useAppStore((s) => s.project);

  const hasAnyArtifact = Object.values(project?.steps ?? {}).some(
    (s) => s.state === 'done' && s.artifactPath,
  );

  if (!currentId) return null;

  return (
    <div className="deliverables-panel">
      <p>
        交付包会把每个步骤最新版本的产物（详细设计文档、CSV 配置表与说明、HTML 原型、
        各玩家评估与总结报告等）打包为一个 zip 文件下载。
      </p>
      {!hasAnyArtifact && (
        <p className="muted">还没有任何已完成的步骤产物；先完成至少一个步骤再下载。</p>
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

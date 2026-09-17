import { useAppStore } from '../store/useAppStore.js';

/** 应用内确认弹窗：代替 window.confirm，由 requestConfirm(message, onConfirm) 触发 */
export function ConfirmDialog() {
  const confirmRequest = useAppStore((s) => s.confirmRequest);
  const resolveConfirm = useAppStore((s) => s.resolveConfirm);
  if (!confirmRequest) return null;
  // 确认按钮文案：删除类（含「删除」二字）沿用「确认删除」，其余通用为「确认继续」
  const okLabel = confirmRequest.message.includes('删除') ? '确认删除' : '确认继续';
  return (
    <div className="modal-mask" onClick={() => resolveConfirm(false)}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>请确认</h3>
        <div style={{ whiteSpace: 'pre-wrap' }}>{confirmRequest.message}</div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={() => resolveConfirm(false)}>取消</button>
          <button className="danger" autoFocus onClick={() => resolveConfirm(true)}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

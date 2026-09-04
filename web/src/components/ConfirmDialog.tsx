import { useAppStore } from '../store/useAppStore.js';

/** 应用内确认弹窗：代替 window.confirm，由 requestConfirm(message, onConfirm) 触发 */
export function ConfirmDialog() {
  const confirmRequest = useAppStore((s) => s.confirmRequest);
  const resolveConfirm = useAppStore((s) => s.resolveConfirm);
  if (!confirmRequest) return null;
  return (
    <div className="modal-mask" onClick={() => resolveConfirm(false)}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>请确认</h3>
        <div style={{ whiteSpace: 'pre-wrap' }}>{confirmRequest.message}</div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={() => resolveConfirm(false)}>取消</button>
          <button className="danger" autoFocus onClick={() => resolveConfirm(true)}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}

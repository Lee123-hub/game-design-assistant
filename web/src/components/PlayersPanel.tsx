import { useState } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { TrashIcon } from './icons.js';

/** 玩家画像管理：预设 + 自定义，新增/编辑/删除（每个画像对应一个评估 step） */
export function PlayersPanel() {
  const project = useAppStore((s) => s.project);
  const addPersona = useAppStore((s) => s.addPersona);
  const deletePersona = useAppStore((s) => s.deletePersona);
  const updatePersona = useAppStore((s) => s.updatePersona);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');

  if (!project) return null;

  const submit = () => {
    if (!name.trim() || !description.trim()) return;
    void addPersona(name.trim(), description.trim());
    setName('');
    setDescription('');
  };

  return (
    <div>
      {project.personas.map((p) => (
        <div className="panel" key={p.id}>
          <div className="row spread">
            <strong>
              {p.name}
              {p.preset && <span className="badge" style={{ marginLeft: 6 }}>预设</span>}
            </strong>
            <span className="row">
              {!p.preset && (
                <button
                  className="danger icon-btn"
                  title="删除画像"
                  onClick={() =>
                    requestConfirm(`删除画像「${p.name}」？对应的评估 step 也会移除。`, () =>
                      void deletePersona(p.id),
                    )
                  }
                >
                  <TrashIcon />
                </button>
              )}
              {editingId === p.id ? (
                <>
                  <button
                    className="primary"
                    onClick={() => {
                      void updatePersona(p.id, { description: editDescription });
                      setEditingId(null);
                    }}
                  >
                    保存
                  </button>
                  <button onClick={() => setEditingId(null)}>取消</button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setEditingId(p.id);
                    setEditDescription(p.description);
                  }}
                >
                  编辑
                </button>
              )}
            </span>
          </div>
          {editingId === p.id ? (
            <textarea
              style={{ marginTop: 8 }}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          ) : (
            <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {p.description}
            </div>
          )}
        </div>
      ))}

      <div className="panel">
        <h3>新增自定义画像</h3>
        <input
          placeholder="画像名称，如：未成年玩家"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          style={{ marginTop: 8 }}
          placeholder="画像描述：游玩习惯、偏好、在意什么、反感什么…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          className="primary"
          style={{ marginTop: 8 }}
          onClick={submit}
          disabled={!name.trim() || !description.trim()}
        >
          添加画像
        </button>
      </div>
    </div>
  );
}

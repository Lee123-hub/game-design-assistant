import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAppStore } from '../store/useAppStore.js';

// ---------- CSV 解析与序列化（支持引号包裹、转义引号） ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

function serializeCsv(rows: string[][]): string {
  const escape = (v: string) =>
    /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  return rows.map((r) => r.map(escape).join(',')).join('\n') + '\n';
}

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

interface ColumnMeta {
  name: string;
  /** 全部非空值都是数字 → 数字列（输入框） */
  numeric: boolean;
  /** 该列出现过的去重取值 → 下拉候选集合 */
  options: string[];
}

interface Props {
  projectId: string;
  stepKey: string;
  fileName: string;
  content: string;
}

/**
 * CSV 应用内可编辑表格：枚举列下拉选（候选 = 该列已有取值集合）、
 * 数字列直接填写、可增行、保存回写原文件、下载 csv。
 */
export function CsvTable({ projectId, stepKey, fileName, content }: Props) {
  const toast = useAppStore((s) => s.toast);
  const [rows, setRows] = useState<string[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(parseCsv(content));
    setDirty(false);
  }, [content, fileName]);

  const header = rows[0] ?? [];
  const body = rows.slice(1);

  const columns = useMemo<ColumnMeta[]>(() => {
    return header.map((name, col) => {
      const values = body.map((r) => r[col] ?? '').filter((v) => v.trim() !== '');
      return {
        name,
        numeric: values.length > 0 && values.every((v) => NUMERIC_RE.test(v.trim())),
        options: [...new Set(values.map((v) => v.trim()))],
      };
    });
  }, [header, body]);

  const setCell = (r: number, c: number, value: string) => {
    setRows((cur) => cur.map((row, i) => (i === r + 1 ? row.map((v, j) => (j === c ? value : v)) : row)));
    setDirty(true);
  };

  const addRow = () => {
    setRows((cur) => [...cur, cur[0]?.map(() => '') ?? ['']]);
    setDirty(true);
  };

  const removeRow = (r: number) => {
    setRows((cur) => cur.filter((_, i) => i !== r + 1));
    setDirty(true);
  };

  const save = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await api.saveStepFile(projectId, stepKey, fileName, serializeCsv(rows));
      toast('info', '已保存');
      setDirty(false);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const blob = new Blob([serializeCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="csv-table-wrap">
      <div className="row spread csv-toolbar">
        <span className="muted">
          {columns.length} 列 × {body.length} 行{dirty ? ' · 有未保存修改' : ''}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button onClick={addRow}>+ 增加一行</button>
          <button onClick={download}>下载 CSV</button>
          <button className="primary" disabled={!dirty || saving} onClick={save}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
      <div className="csv-scroll">
        <table className="csv-table">
          <thead>
            <tr>
              <th className="csv-rownum">#</th>
              {columns.map((c, i) => (
                <th key={i}>
                  {c.name}
                  <span className="muted csv-coltype">{c.numeric ? ' 数字' : c.options.length > 1 ? ' 枚举' : ' 文本'}</span>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                <td className="csv-rownum muted">{r + 1}</td>
                {columns.map((c, ci) => {
                  const value = row[ci] ?? '';
                  if (c.numeric) {
                    return (
                      <td key={ci}>
                        <input
                          type="number"
                          value={value}
                          onChange={(e) => setCell(r, ci, e.target.value)}
                        />
                      </td>
                    );
                  }
                  if (c.options.length > 0) {
                    return (
                      <td key={ci}>
                        <select value={c.options.includes(value) ? value : ''} onChange={(e) => setCell(r, ci, e.target.value)}>
                          {!c.options.includes(value) && value.trim() !== '' && <option value={value}>{value}（表外值）</option>}
                          <option value="">（空）</option>
                          {c.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={ci}>
                      <input value={value} onChange={(e) => setCell(r, ci, e.target.value)} />
                    </td>
                  );
                })}
                <td>
                  <button className="danger icon-btn" title="删除该行" onClick={() => removeRow(r)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted csv-hint">
        枚举列候选值 = 该列已有取值集合；数字列直接填写数字。修改后点「保存」回写原文件。
      </p>
    </div>
  );
}

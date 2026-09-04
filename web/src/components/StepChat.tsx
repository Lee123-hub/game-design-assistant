import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StepKey } from '@gda/shared';
import { useAppStore } from '../store/useAppStore.js';

interface Props {
  stepKey: StepKey;
  conversational: boolean;
  /** 输入框上方预置 query，点击直接发起 */
  presetQueries?: string[];
}

/**
 * 步骤聊天页（每个 step 一个独立 session，服务端持久化，切换步骤时加载）：
 * - 输入框常开，输入后发送即发起（首次=开始生成/访谈，完成后=带要求重新生成）
 * - 运行中：发送位变为「终止」（终止后已流出内容落盘、状态置已终止），「完成」须终止后才可点击；
 *   等待回答=「回答」+「完成」（结束访谈落盘）；待运行/出错/已终止时=「发送」+「完成」
 * - 聊天区贴底时自动跟随新内容，用户上翻阅读时不打扰
 */
export function StepChat({ stepKey, conversational, presetQueries }: Props) {
  const record = useAppStore((s) => s.project?.steps[stepKey]);
  const live = useAppStore((s) => s.live[stepKey]);
  const turns = useAppStore((s) => s.turns[stepKey]);
  const loadSession = useAppStore((s) => s.loadSession);
  const answerStep = useAppStore((s) => s.answerStep);
  const runStep = useAppStore((s) => s.runStep);
  const abortStep = useAppStore((s) => s.abortStep);
  const completeStep = useAppStore((s) => s.completeStep);

  const [draft, setDraft] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const prevState = useRef(record?.state ?? 'pending');

  // 切换步骤：加载该 step 自己的 session，并回到底部
  useEffect(() => {
    setDraft('');
    stickRef.current = true;
    prevState.current = record?.state ?? 'pending';
    void loadSession(stepKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // 运行结束（完成/出错/中止）：服务端已把最终消息落盘，重拉 session
  useEffect(() => {
    const prev = prevState.current;
    const st = record?.state ?? 'pending';
    prevState.current = st;
    if (prev !== st && (st === 'done' || st === 'error' || st === 'canceled')) {
      stickRef.current = true;
      void loadSession(stepKey);
    }
  }, [record?.state, stepKey, loadSession]);

  // 贴底时自动跟随新内容（每次渲染都检查，流式增量不漏）；用户上翻阅读时不打扰
  useEffect(() => {
    const el = chatRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  });

  const state = record?.state ?? 'pending';
  const running = state === 'running';
  const waiting = state === 'waiting_input';
  const waitingAnswer = conversational && waiting;
  const idle = state === 'pending' || state === 'error' || state === 'canceled';

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || running) return;
    setDraft('');
    if (waitingAnswer) {
      void answerStep(stepKey, text);
    } else {
      // pending/done/error/canceled：把消息作为本次发起的说明；
      // 本地先补一条用户消息（服务端 session 已记录，运行结束后重拉会覆盖）
      useAppStore.setState((s) => ({
        turns: { ...s.turns, [stepKey]: [...(s.turns[stepKey] ?? []), { role: 'user' as const, text }] },
      }));
      void runStep(stepKey, text);
    }
  };

  const showPresets = !running && !waitingAnswer && (presetQueries?.length ?? 0) > 0;

  const liveBlocks = (live?.blocks ?? []).filter((b) => b.length > 0);
  const hasLiveText = running && liveBlocks.length > 0;
  // 运行中且当前不在流出文本（思考/调用工具阶段）时，显示活动指示——否则文本静止时像卡住
  const showIndicator = running && live?.phase !== 'text';

  return (
    <>
      <div
        className="chat"
        ref={chatRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {!turns?.length && !running && !hasLiveText && (
          <div className="chat-empty muted">
            {conversational
              ? '点击下方预置问题或输入你的想法，AI 将围绕本步骤逐项提问。'
              : '点击下方预置问题，或在输入框描述你的要求后直接发起生成。'}
          </div>
        )}
        {(turns ?? []).map((turn, i) => (
          <div key={i} className={`msg ${turn.role}`}>
            {turn.role === 'assistant' ? (
              <Markdown remarkPlugins={[remarkGfm]}>{turn.text}</Markdown>
            ) : (
              turn.text
            )}
          </div>
        ))}
        {liveBlocks.map((block, i) => (
          <div key={i} className="msg assistant">
            <Markdown remarkPlugins={[remarkGfm]}>{block}</Markdown>
          </div>
        ))}
        {showIndicator && (
          <div className="msg assistant">
            <span className="muted think-indicator">
              {live?.phase === 'tool' && live?.tool ? `正在使用 ${live.tool} 工具` : '模型思考中'}
              <span className="think-dots" aria-hidden="true">
                <i>.</i>
                <i>.</i>
                <i>.</i>
              </span>
            </span>
          </div>
        )}
      </div>

      {showPresets && (
        <div className="preset-row">
          {presetQueries!.map((q) => (
            <button key={q} className="preset-chip" onClick={() => send(q)} title={q}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input row">
        <textarea
          style={{ minHeight: 48 }}
          placeholder={
            running
              ? '生成中，点击「终止」可结束本次生成…'
              : waitingAnswer
                ? '输入你的回答…（Enter 发送 / Shift+Enter 换行）'
                : conversational
                  ? '输入想法发起/重新开始访谈（Enter 发送）…'
                  : '输入修改要求会重新生成本步骤产物；直接提问（如“现在有哪些文件”）会得到回答，不影响产物（Enter 发送）…'
          }
          value={draft}
          disabled={running}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        {/* 运行中=「终止」+「完成」禁用（须先终止）；
            等待回答=「回答」+「完成」（结束访谈并落盘）；其余=「发送」+「完成」 */}
        {running ? (
          <>
            <button className="danger" onClick={() => void abortStep(stepKey)}>
              终止
            </button>
            <button
              className="danger"
              disabled
              title="请先点「终止」，再点「完成」"
              onClick={() => void completeStep(stepKey)}
            >
              完成
            </button>
          </>
        ) : waiting ? (
          <>
            <button className="primary" onClick={() => send(draft)} disabled={!draft.trim()}>
              回答
            </button>
            <button
              className="danger"
              title="结束访谈并落盘，进入下一步"
              onClick={() => void completeStep(stepKey)}
            >
              完成
            </button>
          </>
        ) : (
          <>
            <button className="primary" onClick={() => send(draft)} disabled={!draft.trim()}>
              发送
            </button>
            {idle && (
              <button
                className="danger"
                title="标记本步骤完成，进入下一步"
                onClick={() => void completeStep(stepKey)}
              >
                完成
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}

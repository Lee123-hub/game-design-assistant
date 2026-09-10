import fs from 'node:fs';
import path from 'node:path';
import { Codex, type Thread, type ThreadEvent, type ThreadItem } from '@openai/codex-sdk';
import { DATA_DIR } from '../config.js';
import {
  QueryRunError,
  type EngineUserMessage,
  type QueryRunOptions,
  type QueryRunResult,
} from './engineTypes.js';

/** Codex 会话隔离目录（不碰用户 ~/.codex）；随 data/ 整体 gitignore */
const CODEX_HOME = path.join(DATA_DIR, 'codex-home');

/** 认证类失败的特征（DeepSeek 网关报错 / Codex CLI 登录提示） */
const AUTH_FAILURE_RE = /401|invalid api key|unauthorized|authentication|not logged in|please run \/login/i;

function friendlyProviderError(message: string): string {
  if (AUTH_FAILURE_RE.test(message)) {
    return 'API 认证失败：请检查「设置」中的 API Key，以及当前协议对应的 baseUrl 是否正确';
  }
  return message || '执行出错';
}

function extractText(msg: EngineUserMessage | string): string {
  if (typeof msg === 'string') return msg;
  const content = msg.message?.content;
  return typeof content === 'string' ? content : '';
}

/** 工具类 item（用于 maxTurns 近似兜底：每轮 ≈ 1 次模型动作，工具密集时按 4 倍余量放宽） */
function isToolItem(item: ThreadItem): boolean {
  return (
    item.type === 'command_execution' ||
    item.type === 'file_change' ||
    item.type === 'mcp_tool_call' ||
    item.type === 'web_search'
  );
}

/** 工具调用的人类可读短描述（UI「正在使用xxx工具...」） */
function toolLabel(item: ThreadItem): string | null {
  switch (item.type) {
    case 'command_execution':
      return `执行命令 ${item.command.split('\n')[0].slice(0, 80)}`;
    case 'file_change':
      return `写文件 ${item.changes.map((c) => c.path.split('/').pop()).join(', ').slice(0, 80)}`;
    case 'web_search':
      return `联网搜索 ${item.query.slice(0, 60)}`;
    case 'mcp_tool_call':
      return `${item.server}.${item.tool}`;
    default:
      return null;
  }
}

function isAuthLike(err: unknown): boolean {
  return err instanceof Error && AUTH_FAILURE_RE.test(err.message);
}

/**
 * Codex 引擎（@openai/codex-sdk，OpenAI Responses 协议）。
 * 复刻 runQuery 的完整契约：
 * - generative：prompt 为字符串，单 turn
 * - conversational：prompt 为 AsyncIterable（InputQueue），同一线程顺序多 turn，迭代器结束即结束
 * 与 Claude 引擎的差异（已知取舍）：
 * - 流式为 item 级（整段消息到达），不逐字
 * - 无 maxTurns / allowedTools 对应物：工具类 item 超过 maxTurns*4 近似兜底；
 *   WebSearch/WebFetch → web_search 开关，写保护由 sandbox（workspace-write 限定 workingDirectory）承担
 * - 技能插件（plugins）与背景小模型（HAIKU）无对应物，忽略
 */
export async function runCodexQuery(opts: QueryRunOptions): Promise<QueryRunResult> {
  const { settings, model, systemPrompt, prompt, maxTurns, handlers } = opts;

  // 模型名由用户手填，空值在这里拦成明确提示
  if (!model.trim()) {
    throw new QueryRunError(
      'provider',
      '尚未填写模型名：请在「设置 → 模型与运行」中填写当前可用的模型名后再运行',
    );
  }

  const netAllowed =
    (opts.allowedTools ?? []).includes('WebSearch') || (opts.allowedTools ?? []).includes('WebFetch');

  fs.mkdirSync(CODEX_HOME, { recursive: true });

  const codex = new Codex({
    env: {
      ...(process.env as Record<string, string>),
      GDA_PROVIDER_API_KEY: settings.apiKey,
      CODEX_HOME,
    },
    config: {
      model_provider: 'gda',
      model,
      model_providers: {
        gda: {
          name: 'GDA Gateway',
          base_url: settings.baseUrl,
          env_key: 'GDA_PROVIDER_API_KEY',
          wire_api: 'responses',
          requires_openai_auth: false,
        },
      },
      // 角色/约束走 developer 消息，保留 Codex 内置 agent 行为
      developer_instructions: systemPrompt,
    },
  });

  const thread: Thread = codex.startThread({
    model,
    workingDirectory: opts.cwd,
    skipGitRepoCheck: true,
    approvalPolicy: 'never',
    // cwd 写保护：workspace-write 只允许写工作目录内（引擎级 sandbox，强于 Claude 引擎的 PreToolUse hook）
    sandboxMode: opts.cwd ? 'workspace-write' : 'read-only',
    networkAccessEnabled: netAllowed,
    webSearchMode: netAllowed ? 'live' : 'disabled',
  });

  // maxTurns 兜底 / 用户中止都走这个内部 signal（不能直接 abort 用户的 controller）
  const internal = new AbortController();
  const onUserAbort = () => internal.abort();
  opts.abortController.signal.addEventListener('abort', onUserAbort, { once: true });

  let sessionId = '';
  let finalText = '';
  let toolItemCount = 0;
  let maxTurnsExceeded = false;

  /** 执行一个 turn，把事件映射到 handlers */
  const runTurn = async (input: string): Promise<string> => {
    let turnText = '';
    const { events } = await thread.runStreamed(input, { signal: internal.signal });
    for await (const ev of events) {
      handlers?.onRawMessage?.(ev);
      switch (ev.type) {
        case 'thread.started': {
          sessionId = ev.thread_id;
          break;
        }
        case 'turn.started': {
          turnText = '';
          break;
        }
        case 'item.started': {
          if (isToolItem(ev.item)) {
            toolItemCount += 1;
            if (toolItemCount > maxTurns * 4) {
              // 近似 maxTurns 兜底：中断本轮并在外层抛错（部分文本已通过 onDelta 流出，调用方可回收）
              maxTurnsExceeded = true;
              internal.abort();
            }
          }
          const label = toolLabel(ev.item);
          if (label) handlers?.onToolUse?.(label);
          break;
        }
        case 'item.completed': {
          if (ev.item.type === 'agent_message' && ev.item.text) {
            turnText = ev.item.text;
            handlers?.onDelta?.(ev.item.text);
          } else if (ev.item.type === 'reasoning' && ev.item.text) {
            handlers?.onThinking?.(ev.item.text);
          }
          break;
        }
        case 'turn.completed': {
          // DeepSeek 网关不回成本信息，Codex 侧只拿得到 token 数，这里保持 0
          handlers?.onAssistantTurn?.(turnText, sessionId);
          break;
        }
        case 'turn.failed': {
          throw new QueryRunError('provider', friendlyProviderError(ev.error?.message ?? 'turn failed'));
        }
        case 'error': {
          throw new QueryRunError('provider', friendlyProviderError(ev.message));
        }
        default:
          break;
      }
    }
    return turnText;
  };

  try {
    if (typeof prompt === 'string') {
      finalText = await runTurn(prompt);
    } else {
      // 对话模式：InputQueue 每条消息触发一个 turn；end() 后迭代器 done，会话结束
      for await (const msg of prompt) {
        const text = extractText(msg);
        if (!text || text === '__GDA_SESSION_END__') continue;
        finalText = await runTurn(text);
      }
    }
  } catch (err) {
    if (maxTurnsExceeded) {
      throw new QueryRunError('max_turns', '达到 maxTurns 上限且没有产出');
    }
    if (internal.signal.aborted && !maxTurnsExceeded && opts.abortController.signal.aborted) {
      throw new QueryRunError('aborted', '已被用户中止');
    }
    if (opts.abortController.signal.aborted) {
      throw new QueryRunError('aborted', '已被用户中止');
    }
    if (isAuthLike(err)) {
      throw new QueryRunError('provider', friendlyProviderError(err instanceof Error ? err.message : String(err)));
    }
    if (err instanceof QueryRunError) throw err;
    throw new QueryRunError('unknown', err instanceof Error ? err.message : String(err));
  } finally {
    opts.abortController.signal.removeEventListener('abort', onUserAbort);
  }

  if (!sessionId) {
    throw new QueryRunError('provider', '会话未成功建立（未收到 thread.started）');
  }
  return { finalText, sessionId, costUsd: 0 };
}

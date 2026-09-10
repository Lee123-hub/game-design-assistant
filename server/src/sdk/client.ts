import path from 'node:path';
import {
  query,
  type HookCallbackMatcher,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { Settings } from '@gda/shared';
import { buildEnv, DISABLED_TOOLS } from './env.js';
import { runCodexQuery } from './codexClient.js';

import { QueryRunError, type QueryRunOptions, type QueryRunResult } from './engineTypes.js';

// 引擎契约统一放在 engineTypes.ts（claude-agent-sdk / Codex 两个引擎共用）；
// 这里原样 re-export，下游 `import { runQuery, QueryRunError } from './client.js'` 的路径保持不变
export type {
  StreamHandlers,
  QueryRunOptions,
  QueryRunResult,
  EngineUserMessage,
} from './engineTypes.js';
export { QueryRunError } from './engineTypes.js';

/** CLI 未认证时会以普通 assistant 消息输出这段文案，必须当成错误而不是回复 */
const AUTH_FAILURE_RE = /not logged in|please run \/login|invalid api key|authentication/i;

function assertNotAuthFailure(text: string): void {
  if (AUTH_FAILURE_RE.test(text)) {
    throw new QueryRunError(
      'provider',
      'API 认证失败：请检查「设置」中的 DeepSeek API Key 与额度',
    );
  }
}

function extractAssistantText(message: SDKMessage & { type: 'assistant' }): string {
  const content = message.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
}

/**
 * 执行一次 SDK query()，把流式增量透传给 handlers，返回最终文本。
 * - generative：prompt 传字符串，一个 turn 结束
 * - conversational：prompt 传 inputQueue（AsyncIterable），每轮 result 触发 onAssistantTurn
 */
export async function runQuery(opts: QueryRunOptions): Promise<QueryRunResult> {
  // 协议格式即引擎选择：openai-responses 走 Codex 引擎，其余（anthropic）走 Claude 引擎
  if (opts.settings.protocol === 'openai-responses') {
    return runCodexQuery(opts);
  }

  const { settings, model, systemPrompt, prompt, abortController, maxTurns, handlers } = opts;
  const allowed = new Set(opts.allowedTools ?? []);

  // 模型名由用户手填（不再预置候选），空值在这里拦成明确提示；
  // 否则会以 model:'' 打到网关，报出难以定位的 provider 错误
  if (!model.trim()) {
    throw new QueryRunError(
      'provider',
      '尚未填写模型名：请在「设置 → 模型与运行」中填写当前可用的模型名后再运行',
    );
  }

  // cwd 模式（项目工作区）：写保护 hook——Write/Edit 只允许落在 cwd 内（产物文件 + CLAUDE.md）
  const hooks: { PreToolUse: HookCallbackMatcher[] } | undefined = opts.cwd
    ? {
        PreToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [
              async (hookInput) => {
                if (hookInput.hook_event_name !== 'PreToolUse') {
                  return { continue: true } as const;
                }
                const toolInput = hookInput.tool_input as { file_path?: string } | undefined;
                const target = path.resolve(toolInput?.file_path ?? '');
                const cwd = opts.cwd as string;
                const rel = path.relative(cwd, target);
                const inside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
                if (!inside) {
                  return {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse',
                      permissionDecision: 'deny',
                      permissionDecisionReason: `写保护：agent 只允许写入项目工作区 ${cwd} 内的文件（拒绝写入 ${target}）`,
                    },
                  };
                }
                return {
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'allow',
                  },
                };
              },
            ],
          },
        ],
      }
    : undefined;

  const iterator = query({
    // InputQueue 实际产出 SDKUserMessage；引擎契约用最小结构，这里收窄回 SDK 类型
    prompt: prompt as string | AsyncIterable<SDKUserMessage>,
    options: {
      model,
      systemPrompt,
      maxTurns,
      env: buildEnv(settings) as Record<string, string>,
      abortController,
      includePartialMessages: true,
      permissionMode: 'dontAsk',
      settingSources: [],
      allowedTools: [...allowed],
      disallowedTools: [...DISABLED_TOOLS.filter((t) => !allowed.has(t))],
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      ...(opts.plugins && opts.plugins.length > 0
        ? {
            plugins: opts.plugins.map((p) => ({ type: 'local' as const, path: p, skipMcpDiscovery: true })),
            // skills:'all' 只作用于本次加载的插件（settingSources 为空，无其他技能来源）
            skills: 'all' as const,
          }
        : {}),
      ...(hooks ? { hooks } : {}),
    },
  });

  let finalText = '';
  let sessionId = '';
  let costUsd = 0;
  let turnText = '';

  try {
    for await (const message of iterator) {
      handlers?.onRawMessage?.(message);

      switch (message.type) {
        case 'system': {
          if (message.subtype === 'init') sessionId = message.session_id;
          break;
        }
        case 'stream_event': {
          const event = message.event as {
            type: string;
            index?: number;
            content_block?: { type: string; name?: string };
            delta?: { type: string; text?: string; thinking?: string };
          };
          if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            // 工具调用：文本进入折叠区，且其前导文本不算最终结论（工具调用被折叠，最后产出结论）
            const name = event.content_block.name ?? 'tool';
            turnText = '';
            handlers?.onToolUse?.(name);
            break;
          }
          if (event.type === 'content_block_delta' && event.delta) {
            if (event.delta.type === 'text_delta' && event.delta.text) {
              turnText += event.delta.text;
              handlers?.onDelta?.(event.delta.text);
            } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
              handlers?.onThinking?.(event.delta.thinking);
            }
          }
          break;
        }
        case 'assistant': {
          // 流式开启时 partial assistant 也会到达；此处只兜底收集（不重复推送 delta）
          break;
        }
        case 'result': {
          sessionId = message.session_id;
          costUsd = message.total_cost_usd ?? costUsd;
          if (message.subtype === 'success') {
            // streaming-input 会话中每个 turn 各有一条 result，result 为本轮文本
            finalText = (message as { result?: string }).result ?? turnText;
          } else if (message.subtype === 'error_max_turns') {
            // max_turns 截断：把手头文本带上，调用方决定是否续跑
            finalText = turnText;
            if (!finalText) {
              throw new QueryRunError('max_turns', '达到 maxTurns 上限且没有产出');
            }
          } else if (message.subtype === 'error_during_execution') {
            const errors = (message as { errors?: string[] }).errors ?? [];
            throw new QueryRunError(
              'provider',
              errors.join('; ') || '执行出错（error_during_execution）',
            );
          } else {
            throw new QueryRunError('provider', `查询异常终止: ${message.subtype}`);
          }
          const turnOut = finalText || turnText;
          assertNotAuthFailure(turnOut);
          handlers?.onAssistantTurn?.(turnOut, sessionId);
          turnText = '';
          break;
        }
        default:
          break;
      }
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      throw new QueryRunError('aborted', '已被用户中止');
    }
    if (err instanceof QueryRunError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new QueryRunError('unknown', msg);
  }

  if (!sessionId) {
    throw new QueryRunError('provider', '会话未成功建立（未收到 init）');
  }
  assertNotAuthFailure(finalText);
  return { finalText, sessionId, costUsd };
}

/** 设置页连通性测试：一个极小查询 */
export async function testProvider(settings: Settings): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await runQuery({
      settings,
      model: settings.defaultModel,
      systemPrompt: 'You are a health check. Reply with exactly: ok',
      prompt: 'Reply with exactly: ok',
      abortController: controller,
      maxTurns: 1,
    });
    if (!res.finalText) throw new Error('空响应');
  } finally {
    clearTimeout(timeout);
  }
}

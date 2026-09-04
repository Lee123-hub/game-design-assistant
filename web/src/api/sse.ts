import type { ServerEvent } from '@gda/shared';
import { SSE_EVENT_TYPES } from '@gda/shared';

export interface SseConnection {
  close(): void;
}

/**
 * 建立 SSE 连接；自动重连由 EventSource 原生提供（携带 Last-Event-ID），
 * 断线重连后会收到新的 snapshot 事件以恢复状态。
 */
export function connectProjectEvents(
  projectId: string,
  onEvent: (event: ServerEvent) => void,
  onStatusChange?: (connected: boolean) => void,
): SseConnection {
  const es = new EventSource(`/api/projects/${projectId}/events`);
  es.onopen = () => onStatusChange?.(true);
  es.onerror = () => onStatusChange?.(false);
  // 事件带 event: <type> 字段，必须按类型注册监听（onmessage 只收无类型事件）
  for (const type of SSE_EVENT_TYPES) {
    es.addEventListener(type, (ev) => {
      const me = ev as MessageEvent<string>;
      try {
        onEvent(JSON.parse(me.data) as ServerEvent);
      } catch (err) {
        console.error('SSE 消息解析失败', err, me.data);
      }
    });
  }
  return { close: () => es.close() };
}

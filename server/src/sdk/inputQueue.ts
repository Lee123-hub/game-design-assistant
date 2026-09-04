import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

const TERMINATOR: SDKUserMessage = {
  type: 'user',
  message: { role: 'user', content: '__GDA_SESSION_END__' },
  parent_tool_use_id: null,
} as unknown as SDKUserMessage;

/**
 * 可 push 的 async generator，作为 streaming-input 模式的 prompt 传给 query()。
 * push() 投递用户消息（同一 CLI 子进程内继续会话），end() 结束会话。
 */
export class InputQueue implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  push(text: string): void {
    if (this.closed) return;
    const msg: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    } as unknown as SDKUserMessage;
    this.queue.push(msg);
    this.wake?.();
    this.wake = null;
  }

  end(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.push(TERMINATOR);
    this.wake?.();
    this.wake = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: async (): Promise<IteratorResult<SDKUserMessage>> => {
        for (;;) {
          const msg = this.queue.shift();
          if (msg) {
            if (msg === TERMINATOR) return { value: msg as SDKUserMessage, done: true };
            return { value: msg, done: false };
          }
          if (this.closed) return { value: undefined, done: true };
          await new Promise<void>((resolve) => {
            this.wake = resolve;
          });
        }
      },
    };
  }
}

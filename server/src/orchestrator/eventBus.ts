import type { ServerEvent } from '@gda/shared';

interface Subscriber {
  id: number;
  send: (event: ServerEvent, seq: number) => void;
}

const RING_SIZE = 200;

/** 每个项目的 SSE 事件总线：带单调 seq 与 ring buffer（Last-Event-ID 重放） */
export class EventBus {
  private subscribers = new Map<number, Subscriber>();
  private ring: Array<{ seq: number; event: ServerEvent }> = [];
  private seq = 0;
  private subSeq = 0;
  private heartbeat: NodeJS.Timeout | null = null;

  publish(event: ServerEvent): void {
    this.seq += 1;
    const entry = { seq: this.seq, event };
    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    for (const sub of this.subscribers.values()) {
      try {
        sub.send(event, this.seq);
      } catch {
        // 客户端断开由 SSE 层处理
      }
    }
  }

  subscribe(send: (event: ServerEvent, seq: number) => void, lastEventId?: number): () => void {
    const id = ++this.subSeq;
    // 重放：只发比客户端最后收到的 seq 更新的事件
    if (lastEventId !== undefined && Number.isFinite(lastEventId)) {
      for (const { seq, event } of this.ring) {
        if (seq > lastEventId) {
          try {
            send(event, seq);
          } catch {
            break;
          }
        }
      }
    }
    this.subscribers.set(id, { id, send });
    if (this.heartbeat === null) {
      this.heartbeat = setInterval(() => {
        this.publish({ type: 'ping' });
      }, 15_000);
      this.heartbeat.unref();
    }
    return () => {
      this.subscribers.delete(id);
      if (this.subscribers.size === 0 && this.heartbeat !== null) {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
      }
    };
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

const buses = new Map<string, EventBus>();

export function getBus(projectId: string): EventBus {
  let bus = buses.get(projectId);
  if (!bus) {
    bus = new EventBus();
    buses.set(projectId, bus);
  }
  return bus;
}

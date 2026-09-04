/** 全局 FIFO 信号量：限制同时运行的 SDK 子进程数量 */
export class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(public limit: number) {}

  get active(): number {
    return this.running;
  }

  get pending(): number {
    return this.queue.length;
  }

  setLimit(n: number): void {
    this.limit = n;
    this.pump();
  }

  async acquire(): Promise<() => void> {
    if (this.running < this.limit) {
      this.running += 1;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running += 1;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.running -= 1;
    this.pump();
  }

  private pump(): void {
    while (this.running < this.limit && this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }
}

export const runSemaphore = new Semaphore(3);

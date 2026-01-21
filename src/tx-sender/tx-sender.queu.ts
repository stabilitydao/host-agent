import { Transaction } from './tx-sender.types';

export class TxQueue {
  private readonly queue: Transaction[] = [];

  add(item: Transaction): void {
    this.queue.push(item);
  }

  remove(): Transaction | undefined {
    return this.queue.shift();
  }

  peek(): Transaction | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  clear(): void {
    this.queue.length = 0;
  }

  getAll(): Transaction[] {
    return [...this.queue];
  }

  moveToEnd(itemId: Transaction['id']): boolean {
    const index = this.queue.findIndex((item) => item.id === itemId);
    if (index === -1) {
      return false;
    }

    const [removed] = this.queue.splice(index, 1);
    this.queue.push(removed);
    return true;
  }
}

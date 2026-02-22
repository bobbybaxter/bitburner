export class Queue extends Array {
  enqueue(val: unknown): void {
    this.push(val);
  }
  dequeue(): unknown {
    return this.shift();
  }
  peek(): unknown {
    return this[0];
  }
  print(): string {
    return JSON.stringify(this);
  }
  isEmpty(): boolean {
    return this.length === 0;
  }
}

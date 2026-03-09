export class Stack<T = unknown> {
  private _items: T[] = [];
  private _maxSize = 0;

  get length(): number {
    return this._items.length;
  }

  get maxSize(): number {
    return this._maxSize;
  }

  push(val: T): void {
    this._items.push(val);
    if (this._items.length > this._maxSize) this._maxSize = this._items.length;
  }

  pop(): T | undefined {
    return this._items.pop();
  }

  peek(): T | undefined {
    return this._items[this._items.length - 1];
  }

  isEmpty(): boolean {
    return this._items.length === 0;
  }

  resetMaxSize(): void {
    this._maxSize = 0;
  }

  print(): string {
    return JSON.stringify(this._items);
  }
}

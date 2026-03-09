export class Queue<T = unknown> {
  private _items: (T | undefined)[];
  private _head = 0;
  private _tail = 0;
  private _size = 0;
  private _maxSize = 0;

  constructor(capacity = 16) {
    this._items = new Array(capacity);
  }

  get length(): number {
    return this._size;
  }

  get maxSize(): number {
    return this._maxSize;
  }

  enqueue(val: T): void {
    if (this._size === this._items.length) this._grow();
    this._items[this._tail] = val;
    this._tail = (this._tail + 1) % this._items.length;
    this._size++;
    if (this._size > this._maxSize) this._maxSize = this._size;
  }

  dequeue(): T | undefined {
    if (this._size === 0) return undefined;
    const val = this._items[this._head];
    this._items[this._head] = undefined;
    this._head = (this._head + 1) % this._items.length;
    this._size--;
    return val;
  }

  peek(): T | undefined {
    return this._size === 0 ? undefined : this._items[this._head];
  }

  isEmpty(): boolean {
    return this._size === 0;
  }

  resetMaxSize(): void {
    this._maxSize = 0;
  }

  print(): string {
    const out: T[] = [];
    for (let i = 0; i < this._size; i++) {
      out.push(this._items[(this._head + i) % this._items.length] as T);
    }
    return JSON.stringify(out);
  }

  private _grow(): void {
    const old = this._items;
    const newCap = old.length * 2;
    this._items = new Array(newCap);
    for (let i = 0; i < this._size; i++) {
      this._items[i] = old[(this._head + i) % old.length];
    }
    this._head = 0;
    this._tail = this._size;
  }
}

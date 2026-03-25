/**
 * @copyright 2020 Eyas Ranjous <eyas.ranjous@gmail.com>
 * @license MIT
 */

import { Heap } from './heap';

/**
 * @class PriorityQueue
 */
export class PriorityQueue<T> {
  private _heap: Heap<T>;

  /**
   * Creates a priority queue
   * @params {function} compare
   */
  constructor(compare: (a: T, b: T) => number, _values?: T[]) {
    if (typeof compare !== 'function') {
      throw new Error('PriorityQueue constructor expects a compare function');
    }
    this._heap = new Heap(compare, _values);
    if (_values) {
      this._heap.fix();
    }
  }

  /**
   * Returns an element with highest priority in the queue
   * @public
   * @returns {number|string|object}
   */
  front(): T | null {
    return this._heap.root();
  }

  /**
   * Returns an element with lowest priority in the queue
   * @public
   * @returns {number|string|object}
   */
  back(): T | null {
    return this._heap.leaf();
  }

  /**
   * Adds a value to the queue
   * @public
   * @param {number|string|object} value
   * @returns {PriorityQueue}
   */
  enqueue(value: T): this {
    this._heap.insert(value);
    return this;
  }

  /**
   * Adds a value to the queue
   * @public
   * @param {number|string|object} value
   * @returns {PriorityQueue}
   */
  push(value: T): this {
    return this.enqueue(value);
  }

  /**
   * Removes and returns an element with highest priority in the queue
   * @public
   * @returns {number|string|object}
   */
  dequeue(): T | null {
    return this._heap.extractRoot();
  }

  /**
   * Removes and returns an element with highest priority in the queue
   * @public
   * @returns {number|string|object}
   */
  pop(): T | null {
    return this.dequeue();
  }

  /**
   * Removes all elements that match a criteria in the callback
   * @public
   * @param {function} cb
   * @returns {array}
   */
  remove(cb: (value: T) => boolean): T[] {
    if (typeof cb !== 'function') {
      throw new Error('PriorityQueue remove expects a callback');
    }

    const removed: T[] = [];
    const dequeued: T[] = [];
    while (!this.isEmpty()) {
      const popped = this.pop();
      if (popped === null) continue;
      if (cb(popped)) {
        removed.push(popped);
      } else {
        dequeued.push(popped);
      }
    }

    dequeued.forEach((val) => this.push(val));
    return removed;
  }

  /**
   * Returns the number of elements in the queue
   * @public
   * @returns {number}
   */
  size(): number {
    return this._heap.size();
  }

  /**
   * Checks if the queue is empty
   * @public
   * @returns {boolean}
   */
  isEmpty(): boolean {
    return this._heap.isEmpty();
  }

  /**
   * Clears the queue
   * @public
   */
  clear(): void {
    this._heap.clear();
  }

  /**
   * Returns a sorted list of elements from highest to lowest priority
   * @public
   * @returns {array}
   */
  toArray(): T[] {
    return this._heap.clone().sort().reverse();
  }

  /**
   * Implements an iterable on the priority queue
   * @public
   */
  [Symbol.iterator]() {
    let size = this.size();
    return {
      next: () => {
        size -= 1;
        return {
          value: this.pop(),
          done: size === -1,
        };
      },
    };
  }

  /**
   * Creates a priority queue from an existing array
   * @public
   * @static
   * @returns {PriorityQueue}
   */
  static fromArray<T>(values: T[], compare: (a: T, b: T) => number): PriorityQueue<T> {
    return new PriorityQueue(compare, values);
  }
}

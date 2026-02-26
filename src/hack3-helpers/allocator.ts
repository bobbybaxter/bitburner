export default class Allocator {
  private availableAllocs: number[];
  private availableAscRank: number[];

  constructor(availableAllocs: number[]) {
    this.availableAllocs = availableAllocs.slice();
    this.availableAscRank = [];
    this._rerank();
  }

  _rerank(): void {
    this.availableAscRank = Array.from(this.availableAllocs.keys()).sort(
      (a, b) => this.availableAllocs[a] - this.availableAllocs[b],
    );
  }

  alloc(count: number, splitable = true): { success: boolean; allocation: number[] } {
    const n = this.availableAllocs.length;

    if (splitable && this.availableAllocs.reduce((s, x) => s + x, 0) < count) {
      return { success: false, allocation: Array(n).fill(0) };
    }
    if (!splitable && this.availableAllocs.every((x) => x < count)) {
      return { success: false, allocation: Array(n).fill(0) };
    }

    const availableAllocTmp = this.availableAllocs.slice();
    const allocation = Array(n).fill(0) as number[];

    if (splitable) {
      for (let i = 0; i < this.availableAscRank.length; ++i) {
        const curAlloc = Math.min(this.availableAllocs[this.availableAscRank[i]], count);
        availableAllocTmp[this.availableAscRank[i]] -= curAlloc;
        allocation[this.availableAscRank[i]] += curAlloc;
        count -= curAlloc;
        if (count === 0) {
          break;
        }
      }
    } else {
      for (let i = 0; i < this.availableAscRank.length; ++i) {
        if (this.availableAllocs[this.availableAscRank[i]] >= count) {
          availableAllocTmp[this.availableAscRank[i]] -= count;
          allocation[this.availableAscRank[i]] += count;
          count = 0;
          break;
        }
      }
    }

    if (count === 0) {
      this.availableAllocs = availableAllocTmp;
      this._rerank();
      return { success: true, allocation };
    }
    return { success: false, allocation: Array(n).fill(0) as number[] };
  }

  free(allocation: number[]): void {
    for (let i = 0; i < allocation.length; ++i) {
      this.availableAllocs[i] += allocation[i];
    }
    this._rerank();
  }
}

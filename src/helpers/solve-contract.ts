import { NS } from '@ns';

/*
  How to update the script with solvers in the source code of BitBurner

  ALL solutions to the contracts can be found in the source code of BitBurners, and they should be better than my solutions.

  Here are steps to use these solutions.
  Step 1: find contract by name in this file
  https://github.com/danielyxie/bitburner/blob/dev/src/data/codingcontracttypes.ts
  Step 2: find the corresponding "solver" of that contract object
  Step 3: copy the solver to your local script as a new function
  Step 4: modify the parameters of the function to (ns, data) without type
  Step 5: modify the last line "return ...", to return the actual result instead of the comparison between result and "ans".
  Step 6: add a new case for this contract to the switch case clauses in your local script, and point to this new function.
*/

/**
 * Extended Hamming code encoding per Bitburner contract spec:
 * - Data bits: MSB first in non-power-of-2 positions (excluding 0)
 * - Parity at 2^N: even parity over positions with bit N set
 * - Parity at 0: overall even parity, set last
 */
export function HammingEncode(data: number): string {
  const dataBits = data.toString(2).split('').map(Number);
  const numDataBits = dataBits.length;

  let totalLen = 0;
  let dataPositions = 0;
  for (let i = 1; ; i++) {
    if ((i & (i - 1)) !== 0) dataPositions++;
    totalLen = i + 1;
    if (dataPositions >= numDataBits) break;
  }

  const enc: number[] = new Array(totalLen).fill(0);
  let dataIdx = 0;
  for (let i = 1; i < totalLen && dataIdx < numDataBits; i++) {
    if ((i & (i - 1)) !== 0) enc[i] = dataBits[dataIdx++];
  }

  for (let j = 0; 1 << j < totalLen; j++) {
    const p = 1 << j;
    if (p >= totalLen) break;
    let xor = 0;
    for (let i = 1; i < totalLen; i++) {
      if (i !== p && (i & p) !== 0) xor ^= enc[i];
    }
    enc[p] = xor;
  }

  let count = 0;
  for (let i = 1; i < totalLen; i++) count += enc[i];
  enc[0] = count % 2;

  return enc.join('');
}

export function HammingEncodeProperly(data: number): string {
  /* How many bits do we need?
   * n = 2^m
   * k = 2^m - m - 1
   * where k is the number of data bits, m the number
   * of parity bits and n the number of total bits. */

  let m = 1;

  while (2 ** (2 ** m - m - 1) - 1 < data) {
    m++;
  }

  const n = 2 ** m;
  const k = 2 ** m - m - 1;

  const enc = [0];
  const data_bits = data.toString(2).split('').reverse();

  data_bits.forEach((e, i, a) => {
    a[i] = String(Number(e));
  });

  /* Flip endianness as in the original implementation by Hedrauta
   * and write the data back to front
   * XXX why do we do this? */
  for (let i = 1, j = k; i < n; i++) {
    if ((i & (i - 1)) != 0) {
      enc[i] = Number(data_bits[--j] ? data_bits[j] : 0);
    }
  }

  let subsectionParity = 0;

  /* Figure out the subsection parities */
  for (let i = 0; i < n; i++) {
    if (enc[i]) {
      subsectionParity ^= i;
    }
  }

  const parityArray = subsectionParity.toString(2).split('').reverse();
  parityArray.forEach((e, i, a) => {
    a[i] = String(Number(e));
  });

  /* Set the parity bits accordingly */
  for (let i = 0; i < m; i++) {
    enc[2 ** i] = Number(parityArray[i] ? 1 : 0);
  }

  let parity = 0;
  /* Figure out the overall parity for the entire block */
  for (let i = 0; i < n; i++) {
    if (enc[i]) {
      parity++;
    }
  }

  /* Finally set the overall parity bit */
  enc[0] = parity % 2 == 0 ? 0 : 1;

  return enc.join('');
}

export function HammingDecode(data: string): number {
  let err = 0;
  const bits: number[] = [];

  /* TODO why not just work with an array of digits from the start? */
  for (const i in data.split('')) {
    const bit = Number(data[i]);
    bits[i] = bit;

    if (bit) {
      err ^= +i;
    }
  }

  /* If err != 0 then it spells out the index of the bit that was flipped */
  if (err) {
    /* Flip to correct */
    bits[err] = bits[err] ? 0 : 1;
  }

  /* Now we have to read the message, bit 0 is unused (it's the overall parity bit
   * which we don't care about). Each bit at an index that is a power of 2 is
   * a parity bit and not part of the actual message. */

  let ans = '';

  for (let i = 1; i < bits.length; i++) {
    /* i is not a power of two so it's not a parity bit */
    if ((i & (i - 1)) != 0) {
      ans += bits[i];
    }
  }

  /* TODO to avoid ambiguity about endianness why not let the player return the extracted (and corrected)
   * data bits, rather than guessing at how to convert it to a decimal string? */
  return parseInt(ans, 2);
}

function convert2DArrayToString(arr: unknown[][]): string {
  const components: string[] = [];
  arr.forEach((e) => {
    let s = String(e);
    s = ['[', s, ']'].join('');
    components.push(s);
  });

  return components.join(',').replace(/\s/g, '');
}

/** Binary heap. */
class BinHeap {
  /**
   * Heap data array consisting of [weight, payload] pairs, arranged by weight
   * to satisfy heap condition.
   *
   * Encodes the binary tree by storing tree root at index 0 and
   * left child of element i at `i * 2 + 1` and
   * right child of element i at `i * 2 + 2`.
   */
  private data: unknown[][];

  constructor() {
    this.data = [];
  }

  /** Get number of elements in the heap. */
  get size(): number {
    return this.data.length;
  }

  /** Add a new element to the heap. */
  push(value: unknown, weight: number): void {
    const i = this.data.length;
    this.data[i] = [weight, value];
    this.heapifyUp(i);
  }

  /** Get the value of the root-most element of the heap, without changing the heap. */
  peek(): unknown | undefined {
    if (this.data.length == 0) return undefined;

    return this.data[0][1];
  }

  /** Remove the root-most element of the heap and return the removed element's value. */
  pop(): unknown | undefined {
    if (this.data.length == 0) return undefined;

    const value = this.data[0][1];

    this.data[0] = this.data[this.data.length - 1];
    this.data.length = this.data.length - 1;

    this.heapifyDown(0);

    return value;
  }

  /** Change the weight of an element in the heap. */
  changeWeight(predicate: (e: unknown) => boolean, weight: number): void {
    // Find first element with matching value, if any
    const i = this.data.findIndex((e) => predicate(e[1]));
    if (i == -1) return;

    // Update that element's weight
    this.data[i][0] = weight;

    // And re-heapify if needed
    const p = Math.floor((i - 1) / 2);

    if (!this.heapOrderABeforeB(this.data[p][0] as number, this.data[i][0] as number))
      // Needs to shift root-wards?
      this.heapifyUp(i);
    // Try shifting deeper
    else this.heapifyDown(i);
  }

  /** Restore heap condition, starting at index i and traveling towards root. */
  heapifyUp(i: number): void {
    // Swap the new element up towards root until it reaches root position or
    // settles under under a suitable parent
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);

      // Reached heap-ordered state already?
      if (this.heapOrderABeforeB(this.data[p][0] as number, this.data[i][0] as number)) break;

      // Swap
      const tmp = this.data[p];
      this.data[p] = this.data[i];
      this.data[i] = tmp;

      // And repeat at parent index
      i = p;
    }
  }

  /** Restore heap condition, starting at index i and traveling away from root. */
  heapifyDown(i: number): void {
    // Swap the shifted element down in the heap until it either reaches the
    // bottom layer or is in correct order relative to it's children
    while (i < this.data.length) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let toSwap = i;

      // Find which one of element i and it's children should be closest to root
      // (check bounds before accessing - out-of-range indices are undefined)
      if (l < this.data.length && this.heapOrderABeforeB(this.data[l][0] as number, this.data[toSwap][0] as number))
        toSwap = l;
      if (r < this.data.length && this.heapOrderABeforeB(this.data[r][0] as number, this.data[toSwap][0] as number))
        toSwap = r;

      // Already in order?
      if (i == toSwap) break;

      // Not in order. Swap child that should be closest to root up to 'i' and repeat
      const tmp = this.data[toSwap];
      this.data[toSwap] = this.data[i];
      this.data[i] = tmp;

      i = toSwap;
    }
  }

  /**
   * Should element with weight `weightA` be closer to root than element with
   * weight `weightB`?
   */
  heapOrderABeforeB(weightA: number, weightB: number): boolean {
    return weightA < weightB;
  }
}

/** Binary min-heap. */
class MinHeap extends BinHeap {
  heapOrderABeforeB(weightA: number, weightB: number): boolean {
    return weightA < weightB;
  }
}

/** @param {NS} ns **/
export async function main(ns: NS): Promise<void> {
  solveContract(ns, String(ns.args[0] ?? ''), String(ns.args[1] ?? ''), 1);
}

export function solveContract(ns: NS, host: string, filename: string, logLevel = 0): void {
  const type = ns.codingcontract.getContractType(filename, host);
  const desc = ns.codingcontract.getDescription(filename, host);
  const data = ns.codingcontract.getData(filename, host);
  ns.tprint(host + ' ' + filename);
  ns.tprint(type);
  if (logLevel >= 1) {
    ns.tprint(desc);
    ns.tprint(data);
  }
  let answer: unknown;
  switch (type) {
    case 'Find Largest Prime Factor':
      answer = largestPrimeFactor(ns, data);
      break;
    case 'Subarray with Maximum Sum':
      answer = subarrayWithMaxSum(ns, data);
      break;
    case 'Total Ways to Sum':
      answer = totalWaysToSum1(ns, data);
      break;
    case 'Total Ways to Sum II':
      answer = totalWaysToSum2(ns, data);
      break;
    case 'Spiralize Matrix':
      answer = spiralizeMatrix(ns, data);
      break;
    case 'Array Jumping Game':
      answer = arrayJumpingGame1(ns, data);
      break;
    case 'Array Jumping Game II':
      answer = arrayJumpingGame2(ns, data);
      break;
    case 'Merge Overlapping Intervals':
      answer = mergeOverlappingIntervals(ns, data);
      break;
    case 'Generate IP Addresses':
      answer = generateIpAddresses(ns, data);
      break;
    case 'Algorithmic Stock Trader I':
      answer = algorithmicStockTrader1(ns, data);
      break;
    case 'Algorithmic Stock Trader II':
      answer = algorithmicStockTrader2(ns, data);
      break;
    case 'Algorithmic Stock Trader III':
      answer = algorithmicStockTrader3(ns, data);
      break;
    case 'Algorithmic Stock Trader IV':
      answer = algorithmicStockTrader4(ns, data);
      break;
    case 'Minimum Path Sum in a Triangle':
      answer = minPathSumInTriangle(ns, data);
      break;
    case 'Unique Paths in a Grid I':
      answer = uniquePathInGrid1(ns, data);
      break;
    case 'Unique Paths in a Grid II':
      answer = uniquePathInGrid2(ns, data);
      break;
    case 'Shortest Path in a Grid':
      answer = shortestPathInGrid(ns, data);
      break;
    case 'Sanitize Parentheses in Expression':
      answer = sanitizeParentheses(ns, data);
      break;
    case 'Find All Valid Math Expressions':
      answer = findAllValidMathExpr(ns, data);
      break;
    case 'HammingCodes: Integer to Encoded Binary':
      answer = hammingCodes1(ns, data);
      break;
    case 'HammingCodes: Encoded Binary to Integer':
      answer = hammingCodes2(ns, data);
      break;
    case 'Proper 2-Coloring of a Graph':
      answer = proper2ColoringOfAGraph(ns, data);
      break;
    case 'Compression I: RLE Compression':
      answer = compression1(ns, data);
      break;
    case 'Compression II: LZ Decompression':
      answer = compression2(ns, data);
      break;
    case 'Compression III: LZ Compression':
      answer = compression3(ns, data);
      break;
    case 'Encryption I: Caesar Cipher':
      answer = encryption1(ns, data);
      break;
    case 'Encryption II: Vigenère Cipher':
      answer = encryption2(ns, data);
      break;
    default:
      ns.tprint('unknown type: ' + type);
      return;
  }
  if (answer && !(answer instanceof String) && Object.keys(answer).length > 20) {
    ns.tprint('answer size too large to print: ' + Object.keys(answer).length);
  } else {
    ns.tprint(answer);
  }
  const reward = ns.codingcontract.attempt(answer, filename, host);
  if (reward) {
    ns.tprint(reward);
  } else {
    ns.tprint('failed!');
  }
}

function largestPrimeFactor(ns: NS, data: number): number {
  if (typeof data !== 'number') throw new Error('solver expected number');
  let fac = 2;
  let n = data;
  while (n > (fac - 1) * (fac - 1)) {
    while (n % fac === 0) {
      n = Math.round(n / fac);
    }
    ++fac;
  }

  return n === 1 ? fac - 1 : n;
}

function subarrayWithMaxSum(ns: NS, data: number[]): number {
  const nums = data.slice();
  for (let i = 1; i < nums.length; i++) {
    nums[i] = Math.max(nums[i], nums[i] + nums[i - 1]);
  }

  return Math.max(...nums);
}

function totalWaysToSum1(ns: NS, data: number): number {
  if (typeof data !== 'number') throw new Error('solver expected number');
  const ways = [1];
  ways.length = data + 1;
  ways.fill(0, 1);
  for (let i = 1; i < data; ++i) {
    for (let j = i; j <= data; ++j) {
      ways[j] += ways[j - i];
    }
  }

  return ways[data];
}

function totalWaysToSum2(ns: NS, data: [number, number[]]): number {
  const n = data[0];
  const s = data[1];
  const ways = [1];
  ways.length = n + 1;
  ways.fill(0, 1);
  for (let i = 0; i < s.length; i++) {
    for (let j = s[i]; j <= n; j++) {
      ways[j] += ways[j - s[i]];
    }
  }
  return ways[n];
}

function spiralizeMatrix(ns: NS, data: number[][]): number[] {
  const spiral = [];
  const m = data.length;
  const n = data[0].length;
  let u = 0;
  let d = m - 1;
  let l = 0;
  let r = n - 1;
  let k = 0;
  while (true) {
    // Up
    for (let col = l; col <= r; col++) {
      spiral[k] = data[u][col];
      ++k;
    }
    if (++u > d) {
      break;
    }

    // Right
    for (let row = u; row <= d; row++) {
      spiral[k] = data[row][r];
      ++k;
    }
    if (--r < l) {
      break;
    }

    // Down
    for (let col = r; col >= l; col--) {
      spiral[k] = data[d][col];
      ++k;
    }
    if (--d < u) {
      break;
    }

    // Left
    for (let row = d; row >= u; row--) {
      spiral[k] = data[row][l];
      ++k;
    }
    if (++l > r) {
      break;
    }
  }

  return spiral;
}

function arrayJumpingGame1(ns: NS, data: number[]): number {
  const n = data.length;
  let i = 0;
  for (let reach = 0; i < n && i <= reach; ++i) {
    reach = Math.max(i + data[i], reach);
  }
  return i === n ? 1 : 0;
}

function arrayJumpingGame2(ns: NS, data: number[]): number {
  const n = data.length;
  let reach = 0;
  let jumps = 0;
  let lastJump = -1;
  while (reach < n - 1) {
    let jumpedFrom = -1;
    for (let i = reach; i > lastJump; i--) {
      if (i + data[i] > reach) {
        reach = i + data[i];
        jumpedFrom = i;
      }
    }
    if (jumpedFrom === -1) {
      jumps = 0;
      break;
    }
    lastJump = jumpedFrom;
    jumps++;
  }
  return jumps;
}

function mergeOverlappingIntervals(ns: NS, data: number[][]): string {
  const intervals = data.slice();
  intervals.sort((a, b) => {
    return a[0] - b[0];
  });

  const result: number[][] = [];
  let start = intervals[0][0];
  let end = intervals[0][1];
  for (const interval of intervals) {
    if (interval[0] <= end) {
      end = Math.max(end, interval[1]);
    } else {
      result.push([start, end]);
      start = interval[0];
      end = interval[1];
    }
  }
  result.push([start, end]);

  const sanitizedResult = convert2DArrayToString(result);

  return sanitizedResult;
}

function generateIpAddresses(ns: NS, data: string): string[] {
  if (typeof data !== 'string') throw new Error('solver expected string');
  const ret: string[] = [];
  for (let a = 1; a <= 3; ++a) {
    for (let b = 1; b <= 3; ++b) {
      for (let c = 1; c <= 3; ++c) {
        for (let d = 1; d <= 3; ++d) {
          if (a + b + c + d === data.length) {
            const A = parseInt(data.substring(0, a), 10);
            const B = parseInt(data.substring(a, a + b), 10);
            const C = parseInt(data.substring(a + b, a + b + c), 10);
            const D = parseInt(data.substring(a + b + c, a + b + c + d), 10);
            if (A <= 255 && B <= 255 && C <= 255 && D <= 255) {
              const ip = [A.toString(), '.', B.toString(), '.', C.toString(), '.', D.toString()].join('');
              if (ip.length === data.length + 3) {
                ret.push(ip);
              }
            }
          }
        }
      }
    }
  }
  return ret;
}

function algorithmicStockTrader1(ns: NS, data: number[]) {
  let maxCur = 0;
  let maxSoFar = 0;
  for (let i = 1; i < data.length; ++i) {
    maxCur = Math.max(0, (maxCur += data[i] - data[i - 1]));
    maxSoFar = Math.max(maxCur, maxSoFar);
  }

  return maxSoFar.toString();
}

function algorithmicStockTrader2(ns: NS, data: number[]) {
  let profit = 0;
  for (let p = 1; p < data.length; ++p) {
    profit += Math.max(data[p] - data[p - 1], 0);
  }

  return profit.toString();
}

function algorithmicStockTrader3(ns: NS, data: number[]) {
  let hold1 = Number.MIN_SAFE_INTEGER;
  let hold2 = Number.MIN_SAFE_INTEGER;
  let release1 = 0;
  let release2 = 0;
  for (const price of data) {
    release2 = Math.max(release2, hold2 + price);
    hold2 = Math.max(hold2, release1 - price);
    release1 = Math.max(release1, hold1 + price);
    hold1 = Math.max(hold1, price * -1);
  }

  return release2.toString();
}

function algorithmicStockTrader4(ns: NS, data: [number, number[]]) {
  const k = data[0];
  const prices = data[1];

  const len = prices.length;
  if (len < 2) {
    return 0;
  }
  if (k > len / 2) {
    let res = 0;
    for (let i = 1; i < len; ++i) {
      res += Math.max(prices[i] - prices[i - 1], 0);
    }

    return res;
  }

  const hold = [];
  const rele = [];
  hold.length = k + 1;
  rele.length = k + 1;
  for (let i = 0; i <= k; ++i) {
    hold[i] = Number.MIN_SAFE_INTEGER;
    rele[i] = 0;
  }

  let cur;
  for (let i = 0; i < len; ++i) {
    cur = prices[i];
    for (let j = k; j > 0; --j) {
      rele[j] = Math.max(rele[j], hold[j] + cur);
      hold[j] = Math.max(hold[j], rele[j - 1] - cur);
    }
  }

  return rele[k];
}

function minPathSumInTriangle(ns: NS, data: number[][]) {
  const n = data.length;
  const dp = data[n - 1].slice();
  for (let i = n - 2; i > -1; --i) {
    for (let j = 0; j < data[i].length; ++j) {
      dp[j] = Math.min(dp[j], dp[j + 1]) + data[i][j];
    }
  }

  return dp[0];
}

function uniquePathInGrid1(ns: NS, data: [number, number]) {
  const n = data[0]; // Number of rows
  const m = data[1]; // Number of columns
  const currentRow = [];
  currentRow.length = n;

  for (let i = 0; i < n; i++) {
    currentRow[i] = 1;
  }
  for (let row = 1; row < m; row++) {
    for (let i = 1; i < n; i++) {
      currentRow[i] += currentRow[i - 1];
    }
  }

  return currentRow[n - 1];
}

function uniquePathInGrid2(ns: NS, data: number[][]) {
  const obstacleGrid = [];
  obstacleGrid.length = data.length;
  for (let i = 0; i < obstacleGrid.length; ++i) {
    obstacleGrid[i] = data[i].slice();
  }

  for (let i = 0; i < obstacleGrid.length; i++) {
    for (let j = 0; j < obstacleGrid[0].length; j++) {
      if (obstacleGrid[i][j] == 1) {
        obstacleGrid[i][j] = 0;
      } else if (i == 0 && j == 0) {
        obstacleGrid[0][0] = 1;
      } else {
        obstacleGrid[i][j] = (i > 0 ? obstacleGrid[i - 1][j] : 0) + (j > 0 ? obstacleGrid[i][j - 1] : 0);
      }
    }
  }

  return obstacleGrid[obstacleGrid.length - 1][obstacleGrid[0].length - 1];
}

function shortestPathInGrid(ns: NS, data: number[][]) {
  const width = data[0].length;
  const height = data.length;
  const dstY = height - 1;
  const dstX = width - 1;

  const distance = new Array(height);
  const queue = new MinHeap();

  for (let y = 0; y < height; y++) {
    distance[y] = new Array(width).fill(Infinity);
  }

  function validPosition(y: number, x: number): boolean {
    return y >= 0 && y < height && x >= 0 && x < width && data[y][x] == 0;
  }

  // List in-bounds and passable neighbors
  function* neighbors(y: number, x: number): Generator<[number, number]> {
    if (validPosition(y - 1, x)) yield [y - 1, x]; // Up
    if (validPosition(y + 1, x)) yield [y + 1, x]; // Down
    if (validPosition(y, x - 1)) yield [y, x - 1]; // Left
    if (validPosition(y, x + 1)) yield [y, x + 1]; // Right
  }

  // Prepare starting point
  distance[0][0] = 0;
  queue.push([0, 0], 0);

  // Take next-nearest position and expand potential paths from there
  while (queue.size > 0) {
    const pos = queue.pop() as [number, number];
    const [y, x] = pos;
    for (const [yN, xN] of neighbors(y, x)) {
      const d = distance[y][x] + 1;
      if (d < distance[yN][xN]) {
        if (distance[yN][xN] == Infinity)
          // Not reached previously
          queue.push([yN, xN], d);
        // Found a shorter path
        else queue.changeWeight((e) => (e as [number, number])[0] === yN && (e as [number, number])[1] === xN, d);
        //prev[yN][xN] = [y, x];
        distance[yN][xN] = d;
      }
    }
  }

  // No path at all?
  if (distance[dstY][dstX] == Infinity) return '';

  // Path was valid, finally verify that the answer path brought us to the end coordinates
  return distance[dstY][dstX];
}

function sanitizeParentheses(ns: NS, data: string): string[] {
  if (typeof data !== 'string') throw new Error('solver expected string');
  let left = 0;
  let right = 0;
  const res: string[] = [];

  for (let i = 0; i < data.length; ++i) {
    if (data[i] === '(') {
      ++left;
    } else if (data[i] === ')') {
      if (left > 0) {
        --left;
      } else {
        ++right;
      }
    }
  }

  function dfs(
    pair: number,
    index: number,
    left: number,
    right: number,
    s: string,
    solution: string,
    res: string[],
  ): void {
    if (s.length === index) {
      if (left === 0 && right === 0 && pair === 0) {
        for (let i = 0; i < res.length; i++) {
          if (res[i] === solution) {
            return;
          }
        }
        res.push(solution);
      }
      return;
    }

    if (s[index] === '(') {
      if (left > 0) {
        dfs(pair, index + 1, left - 1, right, s, solution, res);
      }
      dfs(pair + 1, index + 1, left, right, s, solution + s[index], res);
    } else if (s[index] === ')') {
      if (right > 0) dfs(pair, index + 1, left, right - 1, s, solution, res);
      if (pair > 0) dfs(pair - 1, index + 1, left, right, s, solution + s[index], res);
    } else {
      dfs(pair, index + 1, left, right, s, solution + s[index], res);
    }
  }

  dfs(0, 0, left, right, data, '', res);

  return res;
}

function findAllValidMathExpr(ns: NS, data: [string, number]): string[] {
  const num = data[0];
  const target = data[1];

  function helper(
    res: string[],
    path: string,
    num: string,
    target: number,
    pos: number,
    evaluated: number,
    multed: number,
  ): void {
    if (pos === num.length) {
      if (target === evaluated) {
        res.push(path);
      }
      return;
    }

    for (let i = pos; i < num.length; ++i) {
      if (i != pos && num[pos] == '0') {
        break;
      }
      const cur = parseInt(num.substring(pos, i + 1));

      if (pos === 0) {
        helper(res, path + cur, num, target, i + 1, cur, cur);
      } else {
        helper(res, path + '+' + cur, num, target, i + 1, evaluated + cur, cur);
        helper(res, path + '-' + cur, num, target, i + 1, evaluated - cur, -cur);
        helper(res, path + '*' + cur, num, target, i + 1, evaluated - multed + multed * cur, multed * cur);
      }
    }
  }

  const result: string[] = [];
  helper(result, '', num, target, 0, 0, 0);

  return result;
}

function hammingCodes1(ns: NS, data: number): string {
  if (typeof data !== 'number') throw new Error('solver expected number');
  return HammingEncode(data);
}

function hammingCodes2(ns: NS, data: string): number {
  if (typeof data !== 'string') throw new Error('solver expected string');
  return HammingDecode(data);
}

function proper2ColoringOfAGraph(ns: NS, data: [number, number[][]]): number[] {
  const [numVertices, edges] = data;
  const adj: number[][] = Array.from({ length: numVertices }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);
  }

  const colors = new Array<number>(numVertices).fill(-1);
  for (let start = 0; start < numVertices; start++) {
    if (colors[start] !== -1) continue;
    colors[start] = 0;
    const queue = [start];
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const neighbor of adj[node]) {
        if (colors[neighbor] === -1) {
          colors[neighbor] = colors[node] ^ 1;
          queue.push(neighbor);
        } else if (colors[neighbor] === colors[node]) {
          return [];
        }
      }
    }
  }
  return colors;
}

function compression1(ns: NS, data: string): string {
  if (typeof data !== 'string') throw new Error('solver expected string');

  let encoded = '';
  for (let i = 0; i < data.length; ) {
    let runLength = 1;
    while (i + runLength < data.length && data[i + runLength] === data[i]) {
      ++runLength;
    }
    const ch = data[i];
    i += runLength;

    while (runLength > 0) {
      const chunk = Math.min(runLength, 9);
      encoded += String(chunk) + ch;
      runLength -= chunk;
    }
  }

  return encoded;
}

function compression2(ns: NS, data: string): string | null {
  let plain = '';

  for (let i = 0; i < data.length; ) {
    const literal_length = data.charCodeAt(i) - 0x30;

    if (literal_length < 0 || literal_length > 9 || i + 1 + literal_length > data.length) {
      return null;
    }

    plain += data.substring(i + 1, i + 1 + literal_length);
    i += 1 + literal_length;

    if (i >= data.length) {
      break;
    }
    const backref_length = data.charCodeAt(i) - 0x30;

    if (backref_length < 0 || backref_length > 9) {
      return null;
    } else if (backref_length === 0) {
      ++i;
    } else {
      if (i + 1 >= data.length) {
        return null;
      }

      const backref_offset = data.charCodeAt(i + 1) - 0x30;
      if ((backref_length > 0 && (backref_offset < 1 || backref_offset > 9)) || backref_offset > plain.length) {
        return null;
      }

      for (let j = 0; j < backref_length; ++j) {
        plain += plain[plain.length - backref_offset];
      }

      i += 2;
    }
  }

  return plain;
}

function compression3(ns: NS, data: string): string | null {
  // LZ Compression: encode plain text to minimal LZ format.
  // Chunks alternate: literal (L + L chars) then backref (L + X digits). Length 0 ends chunk.
  const n = data.length;
  type Choice =
    | { type: 'literal'; L: number }
    | { type: 'literal0'; L: number; X: number }
    | { type: 'backref'; L: number; X: number }
    | { type: 'zero'; L: number };
  const memo: Map<string, { len: number; choice: Choice }> = new Map();

  function key(pos: number, nextLiteral: boolean): string {
    return `${pos},${nextLiteral}`;
  }

  function dp(pos: number, nextLiteral: boolean): { len: number; choice: Choice } {
    if (pos >= n) return { len: 0, choice: { type: 'zero', L: 1 } };
    const k = key(pos, nextLiteral);
    if (memo.has(k)) return memo.get(k)!;

    let best = { len: Infinity, choice: { type: 'zero', L: 1 } as Choice };

    if (nextLiteral) {
      for (let L = 1; L <= Math.min(9, n - pos); L++) {
        const rest = dp(pos + L, false);
        const total = 1 + L + rest.len;
        if (total < best.len) best = { len: total, choice: { type: 'literal', L } };
      }
      // Literal length 0: "0" then backref (must advance pos)
      for (let X = 1; X <= 9 && X <= pos; X++) {
        for (let L = 1; L <= 9 && pos + L <= n; L++) {
          let match = true;
          for (let i = 0; i < L; i++) {
            if (data[pos + i] !== data[pos - X + i]) {
              match = false;
              break;
            }
          }
          if (match) {
            const rest = dp(pos + L, true);
            const total = 1 + 2 + rest.len;
            if (total < best.len) best = { len: total, choice: { type: 'literal0', L, X } };
          }
        }
      }
    } else {
      // Backref length 0 ("0"): next chunk must be literal that advances pos
      for (let L = 1; L <= Math.min(9, n - pos); L++) {
        const rest = dp(pos + L, false);
        const total = 1 + 1 + L + rest.len;
        if (total < best.len) best = { len: total, choice: { type: 'zero', L } };
      }

      for (let X = 1; X <= 9 && X <= pos; X++) {
        for (let L = 1; L <= 9 && pos + L <= n; L++) {
          let match = true;
          for (let i = 0; i < L; i++) {
            if (data[pos + i] !== data[pos - X + i]) {
              match = false;
              break;
            }
          }
          if (match) {
            const rest = dp(pos + L, true);
            const total = 2 + rest.len;
            if (total < best.len) best = { len: total, choice: { type: 'backref', L, X } };
          }
        }
      }
    }

    memo.set(k, best);
    return best;
  }

  let result = '';
  let pos = 0;
  let nextLiteral = true;

  while (pos < n) {
    const { choice } = dp(pos, nextLiteral);
    if (choice.type === 'literal') {
      result += String(choice.L) + data.substring(pos, pos + choice.L);
      pos += choice.L;
      nextLiteral = false;
    } else if (choice.type === 'literal0') {
      result += '0' + String(choice.L) + String(choice.X);
      pos += choice.L;
      nextLiteral = true;
    } else if (choice.type === 'backref') {
      result += String(choice.L) + String(choice.X);
      pos += choice.L;
      nextLiteral = true;
    } else {
      result += '0' + String(choice.L) + data.substring(pos, pos + choice.L);
      pos += choice.L;
      nextLiteral = false;
    }
  }

  return result;
}

function encryption1(ns: NS, data: [string, number]): string {
  const cipher = [...data[0]]
    .map((a) => (a === ' ' ? a : String.fromCharCode(((a.charCodeAt(0) - 65 - data[1] + 26) % 26) + 65)))
    .join('');
  return cipher;
}

function encryption2(ns: NS, data: [string, string]): string {
  const cipher = [...data[0]]
    .map((a, i) => {
      return a === ' '
        ? a
        : String.fromCharCode(((a.charCodeAt(0) - 2 * 65 + data[1].charCodeAt(i % data[1].length)) % 26) + 65);
    })
    .join('');
  return cipher;
}

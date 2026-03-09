import type { NS, Server } from '@ns';
import Allocator from './allocator.js';
import * as config from './config.js';
import * as formu from './formulas.js';

interface CalDpsResult {
  dps: number;
  tpb: number;
  hackServerAlloc: number[][];
  growServerAlloc: number[][];
  weaken1ServerAlloc: number[][];
  weaken2ServerAlloc: number[][];
  concurrency: number;
  secondPerBatch: number;
  batchGap: number;
  hackPerBatch: number;
  growPerBatch: number;
  weaken1Time: number;
  weaken2Time: number;
  hackTime: number;
  growTime: number;
}

// const local = config.localGet();
// const stepTimeMillis = config.stepTimeMillisGet();
// const twoWeakenOpts = config.twoWeakenOptsGet();
// const preparationsLogFile = config.preparationsLogFileGet();
// const scriptBaseCost = config.scriptBaseCostGet();
const maxConcurrency = config.maxConcurrencyGet();
const maxHackPerBatch = config.maxHackPerBatchGet();

const arrAdd = (arrA: number[], arrB: number[]) => arrA.map((a, i) => a + arrB[i]);
const arrMinus = (arrA: number[], arrB: number[]) => arrA.map((a, i) => a - arrB[i]);

function totalAllocFromParams(params: CalDpsResult): number[] {
  const h = params.hackServerAlloc.reduce(arrAdd);
  const g = params.growServerAlloc.reduce(arrAdd);
  const w1 = params.weaken1ServerAlloc.reduce(arrAdd);
  const w2 = params.weaken2ServerAlloc.reduce(arrAdd);
  return [h, g, w1, w2].reduce(arrAdd);
}

/**
 * Incrementally find the best paramters.
 *
 * d: dollar
 * h: hack
 * t: thread
 * s: second
 * g: grow
 *
 * XpY: X per Y
 *
 * @param {NS} ns
 * @param {function(string):void} log logging function
 * @param {string[]} dest dest hostnames
 * @param {number[]} availableAllocs
 * @param {number} stepMillis step time in millis, used for adding gap between effects to avoid failures.
 * @param {bool} hwgw hack weaken grow weaken mode, if false, will use one weaken operation to counter the effects().
 */
export async function chooseTargets(
  ns: NS,
  log: (msg: string) => void,
  dests: string[],
  availableAllocs: number[],
  stepMillis: number,
  hwgw = true,
): Promise<(CalDpsResult | null)[]> {
  if (!hwgw) {
    log('hgw mode not implemented.');
    ns.tprint('hgw mode not implemented.');
    ns.exit();
  }

  let remainAllocs = availableAllocs.slice();

  const targetParams: (CalDpsResult | null)[] = Array(dests.length).fill(null);
  const targetHpb: number[] = Array(dests.length).fill(0);
  const targetLastThread: number[] = Array(dests.length).fill(0);
  const targetLastDps: number[] = Array(dests.length).fill(0);

  // log(`remainAllocs ${remainAllocs}`);
  while (true) {
    await ns.sleep(1);
    let maxIncDpsPT = 0;
    let maxIncDpsPTIndex = -1;
    let maxIncDpsPTServerParam: CalDpsResult | undefined;
    let maxIncDpsPTServerOriginalAllocMap: number[] | undefined;

    //find next best investment
    for (const [i, dest] of dests.entries()) {
      // log(` begin to cal ${i}:${dest}, lastHpb ${targetHpb[i]}`);
      // first return allocated threads, then do the calculation again
      let returnedRemainAllocs: number[];
      let totalAllocMap: number[];
      if (targetParams[i] == null) {
        returnedRemainAllocs = remainAllocs;
        totalAllocMap = remainAllocs.map(() => 0);
      } else {
        const params = targetParams[i]!;
        totalAllocMap = totalAllocFromParams(params);
        returnedRemainAllocs = arrAdd(remainAllocs, totalAllocMap);
        log(`  last alloc: ${totalAllocMap}`);
      }
      // log(`  remain alloc: ${remainAllocs}`);
      // log(`  remain alloc(returned): ${returnedRemainAllocs}`);

      if (formu.getHackChance(ns, ns.getServer(dest), ns.getPlayer()) < 1) {
        // log('h ' + dest + ' hacking chance is not 100%, skipping.');
        continue;
      }
      if (maxHackPerBatch > 0 && targetHpb[i] + 1 > maxHackPerBatch) {
        // log('h ' + dest + ' max hack per batch reached, skipping.');
        continue;
      }

      const calRes = calDps(
        ns,
        (logStr: string) => log('   ' + logStr),
        dest,
        targetHpb[i] + 1,
        returnedRemainAllocs,
        stepMillis,
        hwgw,
      );
      // log(` dps:${calRes.dps} dpb:${calRes.hackPerBatch}`);
      // //Stop when required threads exceeds availables
      // if (calRes.concurrency === 0) {
      // 	log("server " +dest+ " cannot meet algorithm constraints.");
      // 	continue;
      // }
      // log("h: "+dest+"\t"
      // 	+"dph: "+dph+"\t"
      // 	+"hpb: "+hpb+"\t"
      // 	+"gpb: "+gpb+"\t"
      // 	+"tpb: "+tpb+"\t"
      // 	+"spb: "+spb+"\t"
      // 	+"con: "+concurrency+"\t"
      // 	+"$/s: "+dps+"\t"
      // );

      const totalThreads = calRes.tpb * calRes.concurrency;
      const totalDps = calRes.dps;
      if (totalDps === 0) {
        continue;
      }

      const incThreads = totalThreads - targetLastThread[i];
      const incDps = totalDps - targetLastDps[i];

      const incDpsPerThread = incDps / incThreads;
      if (incDpsPerThread > maxIncDpsPT) {
        // log(` found better investment i:${i}:${dests[i]}, incDps:${incDps}, incThds:${incThreads}`);
        maxIncDpsPT = incDpsPerThread;
        maxIncDpsPTIndex = i;
        maxIncDpsPTServerParam = calRes;
        maxIncDpsPTServerOriginalAllocMap = totalAllocMap;
      }
    }

    if (maxIncDpsPT === 0) {
      break;
    }

    const i = maxIncDpsPTIndex;
    const serverParam = maxIncDpsPTServerParam!;
    const originalAllocMap = maxIncDpsPTServerOriginalAllocMap!;

    const nextTotalAllocMap = totalAllocFromParams(serverParam);

    remainAllocs = arrAdd(remainAllocs, originalAllocMap);
    remainAllocs = arrMinus(remainAllocs, nextTotalAllocMap);

    //write new params
    targetParams[maxIncDpsPTIndex] = serverParam;
    targetHpb[maxIncDpsPTIndex] = serverParam.hackPerBatch;
    targetLastThread[maxIncDpsPTIndex] = serverParam.tpb * serverParam.concurrency;
    targetLastDps[maxIncDpsPTIndex] = serverParam.dps;
    log(`investing i:${i}:${dests[i]} hpb:${targetHpb[i]} thd:${targetLastThread[i]} dps:${targetLastDps[i]}`);
  }

  return targetParams;
}

/**
 * Incrementally find the best paramters.
 *
 * d: dollar
 * h: hack
 * t: thread
 * s: second
 * g: grow
 *
 * XpY: X per Y
 *
 * @param {NS} ns
 * @param {function(string):void} log logging function
 * @param {string} dest dest hostname
 * @param {number} hpb hack per batch
 * @param {number[]} availableAllocs
 * @param {number} stepMillis step time in millis, used for adding gap between effects to avoid failures.
 * @param {bool} hwgw hack weaken grow weaken mode, if false, will use one weaken operation to counter the effects().
 */
function calDps(
  ns: NS,
  log: (msg: string) => void,
  dest: string,
  hpb: number,
  availableAllocs: number[],
  stepMillis: number,
  _hwgw = true,
): CalDpsResult {
  const serverOptimal = getServerOptimal(ns, dest);
  const player = ns.getPlayer();

  const weaken2Time = formu.getWeakenTime(ns, serverOptimal, player);
  const weaken1Time = formu.getWeakenTime(ns, serverOptimal, player);
  const hackTime = formu.getHackTime(ns, serverOptimal, player);
  const growTime = formu.getGrowTime(ns, serverOptimal, player);

  const batchGap = stepMillis * 4;
  const dph = (serverOptimal.moneyAvailable ?? 0) * formu.getHackPercent(ns, serverOptimal, player);
  //如果开始执行时间和其他批次的执行结束时间重叠，会导致结果无法预测
  //在有更优解决办法之前，先将最大批次限制为hackTime（HWGW中时间最短的那个）可以容纳的作用时间段数
  const maxBatch =
    maxConcurrency > 0
      ? Math.min(maxConcurrency, Math.floor(hackTime / batchGap + 1))
      : Math.floor(hackTime / batchGap + 1);

  let tpb = 0;
  let dps = 0;
  let spb = 0;
  let gpb = 0;
  let concurrency = 0;

  //{number[][]} for batch allocations
  let hackServerAlloc: number[][] = [];
  let growServerAlloc: number[][] = [];
  let weaken1ServerAlloc: number[][] = [];
  let weaken2ServerAlloc: number[][] = [];

  const curDpb = Math.min(serverOptimal.moneyMax ?? 0, dph * hpb);
  const serverBeforeGrow = { ...serverOptimal, moneyAvailable: (serverOptimal.moneyMax ?? 0) - curDpb };

  const hackThreadsRaw = hpb;
  const growThreadsRaw = formu.getGrowThreads(ns, serverBeforeGrow, player, hpb);
  const weaken1ThreadsRaw = (hackThreadsRaw * 0.002) / 0.05;
  const weaken2ThreadsRaw = (growThreadsRaw * 0.004) / 0.05;

  //{number[][]} for batch allocations
  const curHackServerAlloc = [];
  const curGrowServerAlloc = [];
  const curWeaken1ServerAlloc = [];
  const curWeaken2ServerAlloc = [];

  const allocator = new Allocator(availableAllocs);

  let batch = 0;

  //先分配hack、再分配grow，每次要求完整分配
  //weaken可以碎片分配
  while (batch < maxBatch) {
    const hackAllocRes = allocator.alloc(Math.ceil(hackThreadsRaw), false);
    if (!hackAllocRes.success) {
      break;
    }
    curHackServerAlloc.push(hackAllocRes.allocation);

    const growAllocRes = allocator.alloc(Math.ceil(growThreadsRaw), false);
    if (!growAllocRes.success) {
      allocator.free(curHackServerAlloc.pop()!);
      break;
    }
    curGrowServerAlloc.push(growAllocRes.allocation);

    const weaken1AllocRes = allocator.alloc(Math.ceil(weaken1ThreadsRaw), true);
    if (!weaken1AllocRes.success) {
      allocator.free(curHackServerAlloc.pop()!);
      allocator.free(curGrowServerAlloc.pop()!);
      break;
    }
    curWeaken1ServerAlloc.push(weaken1AllocRes.allocation);

    const weaken2AllocRes = allocator.alloc(Math.ceil(weaken2ThreadsRaw), true);
    if (!weaken2AllocRes.success) {
      allocator.free(curHackServerAlloc.pop()!);
      allocator.free(curGrowServerAlloc.pop()!);
      allocator.free(curWeaken1ServerAlloc.pop()!);
      break;
    }
    curWeaken2ServerAlloc.push(weaken2AllocRes.allocation);

    batch++;
    // log(
    //   `batch ${batch} alloced, cur total thd ${[
    //     curHackServerAlloc.reduce(arrAdd),
    //     curGrowServerAlloc.reduce(arrAdd),
    //     curWeaken1ServerAlloc.reduce(arrAdd),
    //     curWeaken2ServerAlloc.reduce(arrAdd),
    //   ]
    //     .reduce(arrAdd)
    //     .reduce((a, b) => a + b)} cur thd left ${allocator.availableAllocs.reduce((a, b) => a + b)}`
    // );
  }

  const curSpb = (weaken1Time + batch * batchGap) / 1000;
  const curDps = curDpb * (1 / curSpb) * batch;

  if (dps < curDps) {
    tpb =
      Math.ceil(hackThreadsRaw) +
      Math.ceil(growThreadsRaw) +
      Math.ceil(weaken1ThreadsRaw) +
      Math.ceil(weaken2ThreadsRaw);
    spb = curSpb;
    dps = curDps;
    gpb = Math.ceil(growThreadsRaw);

    concurrency = batch;

    hackServerAlloc = curHackServerAlloc;
    growServerAlloc = curGrowServerAlloc;
    weaken1ServerAlloc = curWeaken1ServerAlloc;
    weaken2ServerAlloc = curWeaken2ServerAlloc;
  }

  return {
    dps,
    tpb,
    hackServerAlloc,
    growServerAlloc,
    weaken1ServerAlloc,
    weaken2ServerAlloc,
    concurrency,
    secondPerBatch: spb,
    batchGap,
    hackPerBatch: hpb,
    growPerBatch: gpb,
    weaken1Time,
    weaken2Time,
    hackTime,
    growTime,
  };
}

/**
 * @param {NS} ns
 * @param {string} dest
 */
function getServerOptimal(ns: NS, dest: string): Server {
  const server = ns.getServer(dest);
  server.moneyAvailable = server.moneyMax;
  server.hackDifficulty = server.minDifficulty;
  return server;
}

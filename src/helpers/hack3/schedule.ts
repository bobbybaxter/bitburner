import type { NS, Server } from '@ns';
import * as config from './config.js';
import { execMulti } from './exec-multi.js';
import * as formu from './formulas.js';

export interface CalcResult {
  dps: number;
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

const hackScript = config.hackScriptGet();
const growScript = config.growScriptGet();
const weaken1Script = config.weaken1ScriptGet();
const weaken2Script = config.weaken2ScriptGet();
const stepTimeMillis = config.stepTimeMillisGet();
// const scriptBaseCost = config.scriptBaseCostGet();

export async function getTargetHandler(
  ns: NS,
  log: (msg: string) => void,
  target: string,
  calcResult: CalcResult,
  availableServers: string[],
  _twoWeakenOpts = true,
): Promise<() => void> {
  const startTime = Date.now();

  //{number[][]} for batch allocations
  let hackServers = calcResult.hackServerAlloc;
  const growServers = calcResult.growServerAlloc;
  const weaken1Servers = calcResult.weaken1ServerAlloc;
  const weaken2Servers = calcResult.weaken2ServerAlloc;

  let concurrency = calcResult.concurrency;
  let hackPerBatch = calcResult.hackPerBatch;
  const batchDuration = calcResult.secondPerBatch * 1000;
  const batchGap = calcResult.batchGap;

  const finishMarkMillis = startTime + calcResult.weaken1Time - stepTimeMillis;

  const serverOptimal = getServerOptimal(ns, target);

  //打印执行信息
  const hackStartTime = finishMarkMillis - calcResult.hackTime;
  const weaken1StartTime = finishMarkMillis + stepTimeMillis - calcResult.weaken1Time;
  const growStartTime = finishMarkMillis + 2 * stepTimeMillis - calcResult.growTime;
  const weaken2StartTime = finishMarkMillis + 3 * stepTimeMillis - calcResult.weaken2Time;
  log('weaken2: ' + calcResult.weaken2Time);
  log('weaken1: ' + calcResult.weaken1Time);
  log('grow: ' + calcResult.growTime);
  log('hack: ' + calcResult.hackTime);
  log('batchDuration: ' + batchDuration);
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const inSecond = (milli: number) => Math.floor(milli) / 1000;
  const [w1Sum, w2Sum, gSum, hSum] = [
    sum(weaken1Servers[0]),
    sum(weaken2Servers[0]),
    sum(growServers[0]),
    sum(hackServers[0]),
  ];
  log(
    'batch0' +
      '\tw1:' +
      w1Sum +
      '\tw1ST:' +
      inSecond(weaken1StartTime - startTime) +
      '\tw1EA:' +
      inSecond(finishMarkMillis - startTime + stepTimeMillis) +
      '\tw2:' +
      w2Sum +
      '\tw2ST:' +
      inSecond(weaken2StartTime - startTime) +
      '\tw2EA:' +
      inSecond(finishMarkMillis - startTime + 3 * stepTimeMillis) +
      '\t g:' +
      gSum +
      '\t gST:' +
      inSecond(growStartTime - startTime) +
      '\t gEA:' +
      inSecond(finishMarkMillis - startTime + 2 * stepTimeMillis) +
      '\t h:' +
      hSum +
      '\t hST:' +
      inSecond(hackStartTime - startTime) +
      '\t hEA:' +
      inSecond(finishMarkMillis - startTime),
  );

  function execute(alloc: number[][], batch: number, script: string, execTimeGetter: () => number): void {
    const execTime = execTimeGetter();
    const scriptName = script.substring(script.lastIndexOf('/') + 1, script.lastIndexOf('.js'));
    const batchAlloc = alloc[batch];
    for (let i = 0; i < batchAlloc.length; i++) {
      const threads = batchAlloc[i];
      if (threads > 0) {
        execMulti(ns, availableServers[i], threads, script, target, '$threads');
      }
    }
    log(scriptName + '\tST: ' + inSecond(Date.now() - startTime) + '\tRF : ' + inSecond(execTime));
  }

  const weaken1Func = (i: number) =>
    execute(weaken1Servers, i, weaken1Script, () => formu.getWeakenTime(ns, serverOptimal, ns.getPlayer()));
  const weaken2Func = (i: number) =>
    execute(weaken2Servers, i, weaken2Script, () => formu.getWeakenTime(ns, serverOptimal, ns.getPlayer()));
  const growFunc = (i: number) =>
    execute(growServers, i, growScript, () => formu.getGrowTime(ns, serverOptimal, ns.getPlayer()));
  const hackFunc = (i: number) =>
    execute(hackServers, i, hackScript, () => formu.getHackTime(ns, serverOptimal, ns.getPlayer()));

  //{ExecutionManager[]} same action of all batch
  const weaken1Managers: ExecutionManager[] = [];
  const weaken2Managers: ExecutionManager[] = [];
  const growManagers: ExecutionManager[] = [];
  const hackManagers: ExecutionManager[] = [];

  for (let i = 0; i < concurrency; ++i) {
    hackManagers.push(
      new ExecutionManager(
        finishMarkMillis + stepTimeMillis * 0 + batchGap * i,
        batchDuration,
        calcResult.hackTime,
        () => hackFunc(i),
      ),
    );

    weaken1Managers.push(
      new ExecutionManager(
        finishMarkMillis + stepTimeMillis * 1 + batchGap * i,
        batchDuration,
        calcResult.weaken1Time,
        () => weaken1Func(i),
      ),
    );

    growManagers.push(
      new ExecutionManager(
        finishMarkMillis + stepTimeMillis * 2 + batchGap * i,
        batchDuration,
        calcResult.growTime,
        () => growFunc(i),
      ),
    );

    weaken2Managers.push(
      new ExecutionManager(
        finishMarkMillis + stepTimeMillis * 3 + batchGap * i,
        batchDuration,
        calcResult.weaken2Time,
        () => weaken2Func(i),
      ),
    );
  }

  let lastHackLevel = ns.getHackingLevel();
  let lastLog = '';
  let m = ns.getServerMoneyAvailable(target);
  let s = ns.getServerSecurityLevel(target);

  const correctExecTime = () => {
    if (ns.getHackingLevel() != lastHackLevel) {
      const newWeakenTime = formu.getWeakenTime(ns, serverOptimal, ns.getPlayer());
      const newGrowTime = formu.getGrowTime(ns, serverOptimal, ns.getPlayer());
      const newHackTime = formu.getHackTime(ns, serverOptimal, ns.getPlayer());

      log('level up happened, new time: ');
      log('weaken: ' + newWeakenTime);
      log('grow: ' + newGrowTime);
      log('hack: ' + newHackTime);

      const oldConcurrency = concurrency;

      //If no enough hackTime, fire some managers
      while (Math.floor(newHackTime / batchGap + 1) < concurrency) {
        weaken1Managers[concurrency - 1].fire();
        weaken2Managers[concurrency - 1].fire();
        growManagers[concurrency - 1].fire();
        hackManagers[concurrency - 1].fire();
        concurrency--;
      }

      log('new concurrency: ' + concurrency + ' (old: ' + oldConcurrency + ' )');

      //If new growth cannot cover new hack money, decrease hack
      const newGrowPerBatchNeeded = (hpb: number) => {
        const newDph = (serverOptimal.moneyAvailable ?? 0) * formu.getHackPercent(ns, serverOptimal, ns.getPlayer());
        const serverBeforeGrow = getServerOptimal(ns, target);
        serverBeforeGrow.moneyAvailable = (serverBeforeGrow.moneyMax ?? 0) - newDph * hpb;
        return Math.ceil(formu.getGrowThreads(ns, serverBeforeGrow, ns.getPlayer(), hpb));
      };
      let newHpb = hackPerBatch;
      while (newGrowPerBatchNeeded(newHpb) > calcResult.growPerBatch) {
        newHpb--;
      }
      const oldHpb = hackPerBatch;
      if (newHpb !== hackPerBatch) {
        hackServers = hackServers.map((allocMap) => allocMap.map((sa) => (sa ? newHpb : 0)));
        hackPerBatch = newHpb;
      }

      log('new hackPerBatch: ' + hackPerBatch + ' (old: ' + oldHpb + ' )');

      //Tell the rest managers the new execute plan
      for (let i = 0; i < concurrency; ++i) {
        weaken1Managers[i].changeExecuteTime(newWeakenTime);
        weaken2Managers[i].changeExecuteTime(newWeakenTime);
        growManagers[i].changeExecuteTime(newGrowTime);
        hackManagers[i].changeExecuteTime(newHackTime);
      }
      lastHackLevel = ns.getHackingLevel();
    }
  };

  return () => {
    //print stats changes
    m = ns.getServerMoneyAvailable(target);
    s = ns.getServerSecurityLevel(target);
    const curLog = 'm: ' + Math.floor(m) + ' s: ' + s.toFixed(4);
    if (curLog !== lastLog) {
      const delT = Math.floor(Date.now() - startTime) / 1000;
      log(delT + '\t' + curLog);
      lastLog = curLog;
    }

    correctExecTime();
    for (let i = 0; i < concurrency; ++i) {
      weaken1Managers[i].react();
      weaken2Managers[i].react();
      growManagers[i].react();
      hackManagers[i].react();
    }
  };
}

function getServerOptimal(ns: NS, dest: string): Server {
  const server = ns.getServer(dest);
  server.moneyAvailable = server.moneyMax;
  server.hackDifficulty = server.minDifficulty;
  return server;
}

class ExecutionManager {
  private targetTimeFirst: number;
  private targetTimeEvery: number;
  private executeTime: number;
  private doExecute: () => void;
  private employed: boolean;
  private executed: number;

  /**
   * @param {number} targetTimeFirst Timestamp where first execution finish. In millis.
   * @param {number} targetTimeEvery Time between every execution finish. In millis.
   * @param {number} executeTime Time of every execution needed. In millis.
   * @param {function} doExecute Execution function.
   */
  constructor(targetTimeFirst: number, targetTimeEvery: number, executeTime: number, doExecute: () => void) {
    this.targetTimeFirst = targetTimeFirst;
    this.targetTimeEvery = targetTimeEvery;
    this.executeTime = executeTime;
    this.doExecute = doExecute;
    this.employed = true;

    this.executed = 0;
  }

  react(): void {
    if (!this.employed) {
      return;
    }

    const now = Date.now();
    const nextExecute = this.targetTimeFirst + this.targetTimeEvery * this.executed - this.executeTime;
    if (now >= nextExecute) {
      this.doExecute();
      this.executed++;
    }
  }

  /**
   * @param {number} executeTime Time of every execution needed. In millis.
   */
  changeExecuteTime(executeTime: number): void {
    this.executeTime = executeTime;
  }

  fire(): void {
    this.employed = false;
  }
}

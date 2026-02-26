import { NS, Server } from '@ns';
import { disableNoisyLogs, formulas, getServerNames } from '/helpers/index.js';

type BatchEvent = { host: string; target: string; threads: number; type: string };

interface HostServer {
  hostname: string;
  name: string;
  depth: number;
  availableRam: number;
  availableThreads: number;
}

interface TargetServerWithBatches {
  hostname: string;
  name: string;
  depth: number;
  batches: BatchEvent[][];
  optimalServer: Server;
  optimalDollarsPerHour: number;
  weakenTime: number;
  hackTime: number;
  growTime: number;
  maxBatch: number;
  hacksPerBatch: number;
  threadsPerBatch: number;
  secondsPerBatch: number;
  dollarsPerSecond: number;
  growPerBatch: number;
  batchAmt: number;
  latestThreadCount: number;
  latestDollarsPerSecond: number;
}

const scriptBaseCost = 1.75;
/** Delay (ms) between batch completions. Batches are pipelined over one weaken runtime; maxBatch = ceil(weakenTime / batchStepMs) gives pipeline capacity, but threads usually limit actual batches. */
const batchStepMs = 200;
/** RAM (GB) to reserve on home for startup scripts (open-all-ports, infiltrate, stockmaster, etc.). */
const homeRamReserveGb = 60;
/** When home has less RAM than this, use percent-based reserve instead (10% = reserve when home < 260GB). */
const homeRamPercentReserve = 0.1;

/** Security must be at or below minSec + this for "prepped". */
const prepSecurityEpsilon = 0.001;
/** Money must be at or above this fraction of max for "prepped" (e.g. 0.99 = 99%). */
const prepMoneyFraction = 0.99;
/** Max hack fraction when auto-tuning (caps at 25% to avoid grow explosion). */
const maxHackFractionCap = 0.25;
/** Run open-all-ports at most this often (ms). Reduces orchestration RAM tax. */
const openAllPortsIntervalMs = 30_000;
/** Cache getServerNames for this long (ms). Network topology is static. */
const serverNamesCacheMs = 60_000;
/** Max targets to hack (focus on best). Combined with thread budget for hybrid selection. */
const maxTargetsToHack = 10;
/** Max batches per target per run. Caps total scripts (4 per batch) to reduce game lag. ~50 = 2k scripts for 10 targets. */
const maxBatchesPerTargetPerRun = 50;
/** Spawn scripts in chunks to avoid freezing. Yield every N execs so the game stays responsive. */
const execChunkSize = 25;
/** Ms to yield between exec chunks. Higher = less freeze, slower ramp-up. */
const execChunkDelayMs = 5;

export async function main(ns: NS): Promise<void> {
  disableNoisyLogs(ns);
  let lastOpenAllPortsTime = 0;
  let cachedServerNames: ReturnType<typeof getServerNames> | null = null;
  let lastServerNamesTime = 0;

  while (true) {
    try {
      await ns.sleep(0);
      const now = Date.now();
      if (now - lastOpenAllPortsTime >= openAllPortsIntervalMs) {
        await ns.run('open-all-ports.js', 1, 'home');
        lastOpenAllPortsTime = now;
      }
      if (!cachedServerNames || now - lastServerNamesTime >= serverNamesCacheMs) {
        cachedServerNames = getServerNames(ns);
        lastServerNamesTime = now;
        await ns.sleep(0);
      }
      const allServerNames = cachedServerNames;
      const hostCandidates = new Map(
        allServerNames.map((s) => [s.hostname, { hostname: s.hostname, name: s.name, depth: s.depth }]),
      );
      for (const name of ns.getPurchasedServers()) {
        if (!hostCandidates.has(name)) hostCandidates.set(name, { hostname: name, name, depth: 1 });
      }
      const availableServers = [...hostCandidates.values()].filter((server) => {
        try {
          return ns.hasRootAccess(server.hostname) && ns.getServerMaxRam(server.hostname) >= scriptBaseCost;
        } catch {
          return false;
        }
      });

      const hostServers = availableServers
        .map((server) => {
          const maxRam = ns.getServerMaxRam(server.hostname);
          const usedRam = ns.getServerUsedRam(server.hostname);
          let availableRam = Math.floor(maxRam - usedRam);
          if (server.hostname === 'home') {
            const reserve =
              maxRam >= homeRamReserveGb / homeRamPercentReserve
                ? homeRamReserveGb
                : Math.floor(maxRam * homeRamPercentReserve);
            availableRam = Math.max(0, Math.floor(maxRam - usedRam - reserve));
          }
          const availableThreads = Math.floor(availableRam / scriptBaseCost);

          return {
            ...server,
            hostname: server.hostname,
            availableRam,
            availableThreads,
          };
        })
        .filter(
          (server) =>
            server.availableThreads > 0 && ns.getServerRequiredHackingLevel(server.hostname) <= ns.getHackingLevel(),
        );

      const targetServers = availableServers
        .filter((server) => {
          const isPurchasedServer = ns.getPurchasedServers().includes(server.hostname);
          const isHomeServer = server.hostname === 'home';
          const holdsNoMoney = ns.getServerMaxMoney(server.hostname) === 0;
          const ableToHack = ns.getServerRequiredHackingLevel(server.hostname) <= ns.getHackingLevel();
          return ableToHack && !isPurchasedServer && !isHomeServer && !holdsNoMoney;
        })
        .map((server) => {
          const optimalServer = getOptimalServer({ ns, targetServer: server.hostname });
          const dollarsPerHour =
            (optimalServer.moneyAvailable ?? 0) * formulas.getHackPercent(ns, optimalServer, ns.getPlayer());
          const hackTime = formulas.getHackTime(ns, optimalServer, ns.getPlayer());
          const weakenTime = formulas.getWeakenTime(ns, optimalServer, ns.getPlayer());

          return {
            ...server,
            batches: [],
            optimalServer,
            optimalDollarsPerHour: dollarsPerHour,
            weakenTime,
            hackTime,
            growTime: formulas.getGrowTime(ns, optimalServer, ns.getPlayer()),
            maxBatch: Math.ceil(weakenTime / batchStepMs),
            hacksPerBatch: 0,
            threadsPerBatch: 0,
            secondsPerBatch: 0,
            dollarsPerSecond: 0,
            growPerBatch: 0,
            batchAmt: 0,
            latestThreadCount: 0,
            latestDollarsPerSecond: 0,
          };
        });

      if (targetServers.length === 0) {
        await ns.sleep(1000 * 60);
        continue;
      }

      const actionScripts = [
        '/scripts/do-hack.js',
        '/scripts/do-grow.js',
        '/scripts/do-weaken1.js',
        '/scripts/do-weaken2.js',
      ];
      for (const host of hostServers) {
        if (host.hostname === 'home') continue;
        if (ns.fileExists(actionScripts[0], host.hostname)) continue;
        const ok = ns.scp(actionScripts, host.hostname, 'home');
        if (!ok) ns.tprint(`WARN: scp to ${host.hostname} failed`);
      }

      await ns.sleep(0);
      const finalTargetServers = await chooseTargets({
        ns,
        hostServers: hostServers as HostServer[],
        targetServers: targetServers as TargetServerWithBatches[],
      });
      const batchesToSchedule = finalTargetServers.reduce((acc, server) => acc + server.batches.length, 0);
      if (batchesToSchedule === 0) {
        await ns.sleep(1000);
      } else {
        await schedule({ ns, targetServers: finalTargetServers });
        const scriptsSpawned = batchesToSchedule * 4;
        await ns.sleep(scriptsSpawned > 5000 ? 75 : scriptsSpawned > 2000 ? 40 : 20);
      }
    } catch (e) {
      ns.tprint(`ERROR hack3: ${e instanceof Error ? e.message : String(e)}`);
      await ns.sleep(5000);
    }
  }
}

async function chooseTargets({
  ns,
  hostServers,
  targetServers,
}: {
  ns: NS;
  hostServers: HostServer[];
  targetServers: TargetServerWithBatches[];
}): Promise<TargetServerWithBatches[]> {
  let finalHostServers = hostServers.map((s) => ({ ...s }));

  const finalTargetServers = targetServers.map((s) => ({ ...s, batches: [...s.batches] }));

  // while (finalHostServerThreads > 0) {
  // for (let i = 0; i < 1; i++) {
  let finalHostServerThreads = finalHostServers.reduce((acc, server) => acc + server.availableThreads, 0);
  // console.log(`STARTING OUTER LOOP - host threads left to use: ${finalHostServerThreads}`);

  if (finalHostServerThreads < 2) {
    await ns.sleep(1000);
  }

  // Prep phase: bring targets to minSec + maxMoney before batching.
  // Phase 1: weaken only until security at min. Phase 2: grow+weaken until money at max.
  finalTargetServers.forEach((targetServer) => {
    const currentMoney = ns.getServerMoneyAvailable(targetServer.hostname);
    const currentSecurity = ns.getServerSecurityLevel(targetServer.hostname);
    const minSec = ns.getServerMinSecurityLevel(targetServer.hostname);
    const maxMoney = ns.getServerMaxMoney(targetServer.hostname);
    const moneyThreshold = maxMoney * prepMoneyFraction;
    const securityAtMin = currentSecurity <= minSec + prepSecurityEpsilon;

    let tempHostServers = finalHostServers.map((s) => ({ ...s }));
    tempHostServers = tempHostServers.sort((a, b) => a.availableThreads - b.availableThreads);
    let tempHostServerAvailableThreads = tempHostServers.reduce((acc, server) => acc + server.availableThreads, 0);

    const weakenEvents: BatchEvent[] = [];
    const growEvents: BatchEvent[] = [];

    // Phase 1: Weaken until security at minimum. Do not start grow until done.
    if (!securityAtMin && tempHostServerAvailableThreads > 0) {
      const securityToRemove = currentSecurity - minSec;
      const weakenThreadsNeeded = Math.min(Math.ceil(securityToRemove / 0.05), tempHostServerAvailableThreads);

      if (weakenThreadsNeeded > 0) {
        let threadsLeft = weakenThreadsNeeded;
        for (const server of tempHostServers) {
          if (server.availableThreads > 0 && threadsLeft > 0) {
            const allocatedThreads = Math.min(server.availableThreads, threadsLeft);
            server.availableThreads -= allocatedThreads;
            threadsLeft -= allocatedThreads;
            weakenEvents.push({
              host: server.hostname,
              target: targetServer.hostname,
              threads: allocatedThreads,
              type: 'weaken1',
            });
            if (threadsLeft === 0) break;
          }
        }
        tempHostServerAvailableThreads = tempHostServers.reduce((acc, s) => acc + s.availableThreads, 0);
      }
    }

    // Phase 2: Grow+weaken only when security is at min.
    if (securityAtMin && currentMoney < moneyThreshold && tempHostServerAvailableThreads > 0) {
      let growThreadsNeeded: number;
      if (ns.fileExists('/Formulas.exe')) {
        const optimalServer = getOptimalServer({ ns, targetServer: targetServer.hostname });
        optimalServer.moneyAvailable = Math.max(currentMoney, 1);
        growThreadsNeeded = Math.max(
          1,
          Math.ceil(ns.formulas.hacking.growThreads(optimalServer, ns.getPlayer(), maxMoney)),
        );
      } else {
        const multiplier = maxMoney / Math.max(currentMoney, 1);
        growThreadsNeeded = Math.max(1, Math.ceil(ns.growthAnalyze(targetServer.hostname, multiplier)));
      }

      const weaken2ThreadsNeeded = Math.ceil((growThreadsNeeded * 0.004) / 0.05);
      const totalThreadsNeeded = growThreadsNeeded + weaken2ThreadsNeeded;

      if (tempHostServerAvailableThreads >= totalThreadsNeeded) {
        let growLeft = growThreadsNeeded;
        let weaken2Left = weaken2ThreadsNeeded;

        for (const server of tempHostServers) {
          if (server.availableThreads > 0 && growLeft > 0) {
            const allocatedThreads = Math.min(server.availableThreads, growLeft);
            server.availableThreads -= allocatedThreads;
            growLeft -= allocatedThreads;
            growEvents.push({
              host: server.hostname,
              target: targetServer.hostname,
              threads: allocatedThreads,
              type: 'grow',
            });
            if (growLeft === 0) break;
          }
        }

        for (const server of tempHostServers) {
          if (server.availableThreads > 0 && weaken2Left > 0) {
            const allocatedThreads = Math.min(server.availableThreads, weaken2Left);
            server.availableThreads -= allocatedThreads;
            weaken2Left -= allocatedThreads;
            growEvents.push({
              host: server.hostname,
              target: targetServer.hostname,
              threads: allocatedThreads,
              type: 'weaken2',
            });
            if (weaken2Left === 0) break;
          }
        }
      }
    }

    if (weakenEvents.length === 0 && growEvents.length === 0) return;

    const index = finalTargetServers.findIndex((server) => server.hostname === targetServer.hostname);
    finalTargetServers[index].batches.push([...weakenEvents, ...growEvents]);

    finalHostServers = tempHostServers;
  });

  let smallestTotalHackThreadsPerCycle: number | null = null;

  const preppedCandidates = finalTargetServers.filter(
    (s) =>
      isPrepped(ns, s.hostname) &&
      Math.floor(ns.getServerMoneyAvailable(s.hostname)) > 0 &&
      ns.getServerMaxRam(s.hostname) >= scriptBaseCost,
  );
  const scoredAndSorted: Array<(typeof preppedCandidates)[0] & { score: number; threadsPerBatch: number }> = [];
  for (let i = 0; i < preppedCandidates.length; i++) {
    if (i > 0 && i % 20 === 0) await ns.sleep(0);
    const s = preppedCandidates[i];
    scoredAndSorted.push({
      ...s,
      score: scoreTargetForBatch(ns, s.hostname),
      threadsPerBatch: computeThreadsPerBatch(ns, s.hostname, 0.01),
    });
  }
  scoredAndSorted.sort((a, b) => b.score - a.score);

  const filteredBestServers: typeof scoredAndSorted = [];
  let threadsReserved = 0;
  for (const candidate of scoredAndSorted) {
    if (filteredBestServers.length >= maxTargetsToHack) break;
    if (threadsReserved + candidate.threadsPerBatch <= finalHostServerThreads) {
      filteredBestServers.push(candidate);
      threadsReserved += candidate.threadsPerBatch;
    } else break;
  }

  const hackFraction =
    filteredBestServers.length > 0
      ? findOptimalHackFraction(
          ns,
          filteredBestServers[0].name,
          finalHostServerThreads,
          filteredBestServers.length,
          finalTargetServers.find((s) => s.hostname === filteredBestServers[0].name)?.maxBatch ?? 150,
        )
      : 0.01;

  const bestServersToHack = filteredBestServers.map((server) => {
    const optimalServer = getOptimalServer({ ns, targetServer: server.name });
    const maxMoney = optimalServer.moneyMax ?? optimalServer.moneyAvailable ?? 1;
    const hackPercentPerThread = ns.fileExists('/Formulas.exe')
      ? formulas.getHackPercent(ns, optimalServer, ns.getPlayer())
      : ns.hackAnalyze(server.name);
    const amountToHack = maxMoney * hackFraction;
    const hackThreadsRaw = amountToHack / (maxMoney * hackPercentPerThread);
    const postHackMoney = Math.max(maxMoney * (1 - hackFraction), 1);
    const serverBeforeGrow = { ...optimalServer, moneyAvailable: postHackMoney };
    const growThreadsRaw = formulas.getGrowThreads(ns, serverBeforeGrow, ns.getPlayer(), hackThreadsRaw);
    const weaken1ThreadsRaw = (hackThreadsRaw * 0.002) / 0.05;
    const weaken2ThreadsRaw = (growThreadsRaw * 0.004) / 0.05;

    const currentHackThreadsPerCycle = Math.ceil(hackThreadsRaw);
    const currentGrowThreadsPerCycle = Math.ceil(growThreadsRaw);
    const currentWeaken1ThreadsPerCycle = Math.ceil(weaken1ThreadsRaw);
    const currentWeaken2ThreadsPerCycle = Math.ceil(weaken2ThreadsRaw);
    const totalHackThreadsPerCycle =
      currentHackThreadsPerCycle +
      currentGrowThreadsPerCycle +
      currentWeaken1ThreadsPerCycle +
      currentWeaken2ThreadsPerCycle;

    if (!smallestTotalHackThreadsPerCycle) {
      smallestTotalHackThreadsPerCycle = totalHackThreadsPerCycle;
    } else {
      smallestTotalHackThreadsPerCycle = Math.min(smallestTotalHackThreadsPerCycle, totalHackThreadsPerCycle);
    }

    return {
      ...server,
      hostname: server.name,
      currentHackThreadsPerCycle,
      currentGrowThreadsPerCycle,
      currentWeaken1ThreadsPerCycle,
      currentWeaken2ThreadsPerCycle,
      totalHackThreadsPerCycle,
    };
  });

  while (smallestTotalHackThreadsPerCycle !== null && finalHostServerThreads > smallestTotalHackThreadsPerCycle) {
    const batchesSoFar = finalTargetServers.reduce((acc, s) => acc + s.batches.length, 0);
    if (batchesSoFar >= maxTargetsToHack * maxBatchesPerTargetPerRun) break;

    bestServersToHack.forEach((targetServer) => {
      const targetBatches = finalTargetServers.find((s) => s.hostname === targetServer.hostname)?.batches.length ?? 0;
      if (targetBatches >= maxBatchesPerTargetPerRun) return;

      finalHostServerThreads = finalHostServers.reduce((acc, server) => acc + server.availableThreads, 0);

      if (smallestTotalHackThreadsPerCycle !== null && finalHostServerThreads < smallestTotalHackThreadsPerCycle)
        return;

      let tempHostServers = finalHostServers.map((s) => ({ ...s }));
      tempHostServers = tempHostServers.sort((a, b) => a.availableThreads - b.availableThreads);

      let hackThreadsLeft = targetServer.currentHackThreadsPerCycle;
      let growThreadsLeft = targetServer.currentGrowThreadsPerCycle;
      let weaken1ThreadsLeft = targetServer.currentWeaken1ThreadsPerCycle;
      let weaken2ThreadsLeft = targetServer.currentWeaken2ThreadsPerCycle;

      const hackEvents = [],
        growEvents = [],
        weaken1Events = [],
        weaken2Events = [];

      for (const hostServer of tempHostServers) {
        if (hostServer.availableThreads > 0 && hackThreadsLeft > 0) {
          const allocatedThreads = Math.min(hostServer.availableThreads, hackThreadsLeft);
          hostServer.availableThreads -= allocatedThreads;
          hackThreadsLeft -= allocatedThreads;
          hackEvents.push({
            host: hostServer.hostname,
            target: targetServer.hostname,
            threads: allocatedThreads,
            type: 'hack',
          });
          if (hackThreadsLeft === 0) break;
        }
      }

      for (const hostServer of tempHostServers) {
        if (hostServer.availableThreads > 0 && growThreadsLeft > 0) {
          const allocatedThreads = Math.min(hostServer.availableThreads, growThreadsLeft);
          hostServer.availableThreads -= allocatedThreads;
          growThreadsLeft -= allocatedThreads;
          growEvents.push({
            host: hostServer.hostname,
            target: targetServer.hostname,
            threads: allocatedThreads,
            type: 'grow',
          });
          if (growThreadsLeft === 0) break;
        }
      }

      for (const hostServer of tempHostServers) {
        if (hostServer.availableThreads > 0 && weaken1ThreadsLeft > 0) {
          const allocatedThreads = Math.min(hostServer.availableThreads, weaken1ThreadsLeft);
          hostServer.availableThreads -= allocatedThreads;
          weaken1ThreadsLeft -= allocatedThreads;
          weaken1Events.push({
            host: hostServer.hostname,
            target: targetServer.hostname,
            threads: allocatedThreads,
            type: 'weaken1',
          });
          if (weaken1ThreadsLeft === 0) break;
        }
      }

      for (const hostServer of tempHostServers) {
        if (hostServer.availableThreads > 0 && weaken2ThreadsLeft > 0) {
          const allocatedThreads = Math.min(hostServer.availableThreads, weaken2ThreadsLeft);
          hostServer.availableThreads -= allocatedThreads;
          weaken2ThreadsLeft -= allocatedThreads;
          weaken2Events.push({
            host: hostServer.hostname,
            target: targetServer.hostname,
            threads: allocatedThreads,
            type: 'weaken2',
          });
          if (weaken2ThreadsLeft === 0) break;
        }
      }

      const index = finalTargetServers.findIndex((server) => server.hostname === targetServer.hostname);

      finalTargetServers[index].batches.push([...hackEvents, ...growEvents, ...weaken1Events, ...weaken2Events]);

      finalHostServers = tempHostServers;
    });
  }

  return finalTargetServers;
}

function getOptimalServer({ ns, targetServer }: { ns: NS; targetServer: string }): Server {
  const server = ns.getServer(targetServer);
  server.moneyAvailable = server.moneyMax;
  server.hackDifficulty = server.minDifficulty;
  return server;
}

/** True if target is at min security and max money (ready for HWGW batching). */
function isPrepped(ns: NS, hostname: string): boolean {
  const minSec = ns.getServerMinSecurityLevel(hostname);
  const currentSec = ns.getServerSecurityLevel(hostname);
  const maxMoney = ns.getServerMaxMoney(hostname);
  const currentMoney = ns.getServerMoneyAvailable(hostname);
  return currentSec <= minSec + prepSecurityEpsilon && currentMoney >= maxMoney * prepMoneyFraction;
}

/** Compute threads per batch for a given hack fraction on a target. Uses optimal state (min sec, max money) for accuracy. */
function computeThreadsPerBatch(ns: NS, hostname: string, hackFraction: number): number {
  const optimalServer = getOptimalServer({ ns, targetServer: hostname });
  const maxMoney = Math.max(optimalServer.moneyMax ?? optimalServer.moneyAvailable ?? 1, 1);
  const hackPercentPerThread = ns.fileExists('/Formulas.exe')
    ? formulas.getHackPercent(ns, optimalServer, ns.getPlayer())
    : ns.hackAnalyze(hostname);
  if (hackPercentPerThread <= 0) return Infinity;
  const amountToHack = maxMoney * hackFraction;
  const hackThreadsRaw = amountToHack / (maxMoney * hackPercentPerThread);
  const postHackMoney = Math.max(maxMoney * (1 - hackFraction), 1);
  const serverBeforeGrow = { ...optimalServer, moneyAvailable: postHackMoney };
  const growThreadsRaw = formulas.getGrowThreads(ns, serverBeforeGrow, ns.getPlayer(), hackThreadsRaw);
  const weaken1ThreadsRaw = (hackThreadsRaw * 0.002) / 0.05;
  const weaken2ThreadsRaw = (growThreadsRaw * 0.004) / 0.05;
  return (
    Math.ceil(hackThreadsRaw) + Math.ceil(growThreadsRaw) + Math.ceil(weaken1ThreadsRaw) + Math.ceil(weaken2ThreadsRaw)
  );
}

/** Score target by $/sec per RAM (expected $ per thread per second). Higher = better. Uses 1% hack for fair comparison. */
function scoreTargetForBatch(ns: NS, hostname: string, referenceHackFraction: number = 0.01): number {
  const optimalServer = getOptimalServer({ ns, targetServer: hostname });
  const maxMoney = Math.max(optimalServer.moneyMax ?? optimalServer.moneyAvailable ?? 1, 1);
  const hackChance = ns.fileExists('/Formulas.exe')
    ? formulas.getHackChance(ns, optimalServer, ns.getPlayer())
    : ns.hackAnalyzeChance(hostname);
  const weakenTime = formulas.getWeakenTime(ns, optimalServer, ns.getPlayer());
  const threadsPerBatch = computeThreadsPerBatch(ns, hostname, referenceHackFraction);
  const expectedMoneyPerBatch = maxMoney * referenceHackFraction * hackChance;
  if (threadsPerBatch <= 0 || weakenTime <= 0) return 0;
  return expectedMoneyPerBatch / (threadsPerBatch * weakenTime);
}

/** Find largest hack fraction that fits within thread budget (pipeline-driven auto-tune). */
function findOptimalHackFraction(
  ns: NS,
  referenceTarget: string,
  totalThreads: number,
  numTargets: number,
  maxBatch: number,
): number {
  if (numTargets <= 0 || maxBatch <= 0 || totalThreads <= 0) return 0.01;
  const budget = totalThreads / (maxBatch * numTargets);
  let low = 0.01;
  let high = Math.min(0.9, maxHackFractionCap);
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const threads = computeThreadsPerBatch(ns, referenceTarget, mid);
    if (threads <= budget) low = mid;
    else high = mid;
  }
  return low;
}

async function schedule({ ns, targetServers }: { ns: NS; targetServers: TargetServerWithBatches[] }): Promise<void> {
  let execCount = 0;
  // Iterate through each target server
  for (const targetServer of targetServers) {
    const { batches, hackTime, weakenTime, growTime } = targetServer;

    // Set initial time from which the first batch will start
    let previousTaskEndTime = Date.now();

    // Process each batch
    for (const batch of batches) {
      // Start each new batch batchStepMs after the last task of the previous batch ended
      let taskEndTime = previousTaskEndTime + batchStepMs;

      // Compute all exec params for this batch
      const execParams: { script: string; host: string; target: string; threads: number; waitTime: number }[] = [];
      for (const action of batch) {
        const { host, target, threads, type } = action;

        // Determine the script and get the delay based on the type
        let script = '';
        let delay = 0;
        switch (type) {
          case 'hack':
            script = '/scripts/do-hack.js';
            delay = hackTime;
            break;
          case 'weaken1':
            script = '/scripts/do-weaken1.js';
            delay = weakenTime;
            break;
          case 'grow':
            script = '/scripts/do-grow.js';
            delay = growTime;
            break;
          case 'weaken2':
            script = '/scripts/do-weaken2.js';
            delay = weakenTime;
            break;
        }

        // Calculate start time so this task ends exactly batchStepMs after the previous one
        const startTime = taskEndTime - delay + batchStepMs;
        const waitTime = Math.max(0, startTime - Date.now());
        execParams.push({ script, host, target, threads, waitTime });
        taskEndTime = startTime + delay;
      }

      // Execute all scripts in parallel (they schedule with their own delays)
      for (const { script, host, target, threads, waitTime } of execParams) {
        const pid = ns.exec(script, host, threads, target, threads, waitTime);
        if (pid === 0 && host !== 'home') {
          ns.tprint(`WARN: exec ${script} on ${host} failed (script exists? ${ns.fileExists(script, host)})`);
        }
        execCount++;
        if (execCount % execChunkSize === 0) await ns.sleep(execChunkDelayMs);
      }

      // Update lastTaskEndTime to the end of the last task in this batch
      previousTaskEndTime = taskEndTime;
    }
  }
  // console.log('All batches have been scheduled.');
}

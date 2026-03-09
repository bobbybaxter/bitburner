//
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
const batchStepMs = 500;
const homeRamReserveGb = 60;
const homeRamPercentReserve = 0.1;
const prepSecurityEpsilon = 0.001;
const prepMoneyFraction = 0.99;
const maxHackFractionCap = 0.9;
const prepThreadBudgetFraction = 0.5;
const openAllPortsIntervalMs = 30_000;
const serverNamesCacheMs = 60_000;

const maxTargetsToHack = 10;
const maxTotalRunningScripts = 50_000;
const maxBatchesPerTargetPerRun = 25;
const minThreadsPerExec = 4;

const execChunkSize = 10;
const execChunkDelayMs = 15;
const targetStaggerMs = 500;

export async function main(ns: NS): Promise<void> {
  disableNoisyLogs(ns);
  let lastOpenAllPortsTime = 0;
  let cachedServerNames: ReturnType<typeof getServerNames> | null = null;
  let lastServerNamesTime = 0;

  let cycleCount = 0;
  while (true) {
    try {
      await ns.sleep(0);
      cycleCount++;
      const now = Date.now();
      if (now - lastOpenAllPortsTime >= openAllPortsIntervalMs) {
        ns.run('/helpers/open-all-ports.js', 1);
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
        if (name === 'pserv-share') continue;
        if (!hostCandidates.has(name)) hostCandidates.set(name, { hostname: name, name, depth: 1 });
      }
      const availableServers = [...hostCandidates.values()].filter((server) => {
        if (server.hostname === 'pserv-share') return false;
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

      const totalThreads = hostServers.reduce((acc, s) => acc + s.availableThreads, 0);

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
        ns.print(`cycle ${cycleCount}: no targets to hack, sleeping for 1 minute`);
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

      const totalRunningScripts = hostServers.reduce((sum, host) => sum + ns.ps(host.hostname).length, 0);
      ns.print(
        `cycle ${cycleCount}: ${hostServers.length} hosts, ${targetServers.length} targets, ${totalThreads} threads, ${totalRunningScripts} running scripts`,
      );
      if (totalRunningScripts >= maxTotalRunningScripts) {
        ns.tprint(
          `[hack3] cycle ${cycleCount}: ${totalRunningScripts} scripts running (>= ${maxTotalRunningScripts}), pausing 5s`,
        );
        await ns.sleep(5000);
        continue;
      }

      await ns.sleep(0);
      const finalTargetServers = await chooseTargets({
        ns,
        hostServers: hostServers as HostServer[],
        targetServers: targetServers as TargetServerWithBatches[],
      });
      const batchesToSchedule = finalTargetServers.reduce((acc, server) => acc + server.batches.length, 0);
      const hackBatches = finalTargetServers.reduce(
        (acc, s) => acc + s.batches.filter((b) => b.some((e) => e.type === 'hack')).length,
        0,
      );
      const prepBatches = batchesToSchedule - hackBatches;
      ns.print(`cycle ${cycleCount}: ${prepBatches} prep + ${hackBatches} hack batches`);
      if (batchesToSchedule === 0) {
        ns.print(`cycle ${cycleCount}: no batches to schedule, sleeping for 1 second`);
        await ns.sleep(1000);
      } else {
        await schedule({ ns, targetServers: finalTargetServers, hostnames: hostServers.map((h) => h.hostname) });
        const scriptsSpawned = batchesToSchedule * 4;
        const sleepMs = scriptsSpawned > 5000 ? 2000 : scriptsSpawned > 2000 ? 1000 : scriptsSpawned > 500 ? 500 : 100;
        ns.print(`cycle ${cycleCount}: sleeping for ${sleepMs}ms`);
        await ns.sleep(sleepMs);
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

  if (finalHostServerThreads < 2) {
    ns.print(`chooseTargets: no threads left to use, sleeping for 1 second`);
    await ns.sleep(1000);
  }

  // Sort targets by profitability so best targets get prepped first
  const prepScores = new Map<string, number>();
  for (let i = 0; i < finalTargetServers.length; i++) {
    if (i > 0 && i % 20 === 0) await ns.sleep(0);
    prepScores.set(finalTargetServers[i].hostname, scoreTargetForBatch(ns, finalTargetServers[i].hostname));
  }
  finalTargetServers.sort((a, b) => (prepScores.get(b.hostname) ?? 0) - (prepScores.get(a.hostname) ?? 0));

  // Reserve threads for hacking when prepped targets already exist;
  // if nothing is prepped yet, give all threads to prep so the first target finishes fast.
  const hasPreppedTargets = finalTargetServers.some((s) => isPrepped(ns, s.hostname));
  const effectivePrepFraction = hasPreppedTargets ? prepThreadBudgetFraction : 1.0;
  const reservedForHack = new Map<string, number>();
  for (const host of finalHostServers) {
    const reserved = Math.ceil(host.availableThreads * (1 - effectivePrepFraction));
    reservedForHack.set(host.hostname, reserved);
    host.availableThreads -= reserved;
  }

  for (const targetServer of finalTargetServers) {
    const currentMoney = ns.getServerMoneyAvailable(targetServer.hostname);
    const currentSecurity = ns.getServerSecurityLevel(targetServer.hostname);
    const minSec = ns.getServerMinSecurityLevel(targetServer.hostname);
    const maxMoney = ns.getServerMaxMoney(targetServer.hostname);
    const moneyThreshold = maxMoney * prepMoneyFraction;
    const securityAtMin = currentSecurity <= minSec + prepSecurityEpsilon;

    let tempHostServers = finalHostServers.map((s) => ({ ...s }));
    tempHostServers = tempHostServers.sort((a, b) => b.availableThreads - a.availableThreads);
    let tempHostServerAvailableThreads = tempHostServers.reduce((acc, server) => acc + server.availableThreads, 0);

    const weakenEvents: BatchEvent[] = [];
    const growEvents: BatchEvent[] = [];

    if (!securityAtMin && tempHostServerAvailableThreads > 0) {
      const securityToRemove = currentSecurity - minSec;
      const weakenThreadsNeeded = Math.min(Math.ceil(securityToRemove / 0.05), tempHostServerAvailableThreads);

      if (weakenThreadsNeeded > 0) {
        weakenEvents.push(...allocateThreads(tempHostServers, weakenThreadsNeeded, targetServer.hostname, 'weaken1'));
        tempHostServerAvailableThreads = tempHostServers.reduce((acc, s) => acc + s.availableThreads, 0);
      }
    }

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
        growEvents.push(...allocateThreads(tempHostServers, growThreadsNeeded, targetServer.hostname, 'grow'));
        growEvents.push(...allocateThreads(tempHostServers, weaken2ThreadsNeeded, targetServer.hostname, 'weaken2'));
      }
    }

    if (weakenEvents.length === 0 && growEvents.length === 0) continue;

    const index = finalTargetServers.findIndex((server) => server.hostname === targetServer.hostname);
    finalTargetServers[index].batches.push([...weakenEvents, ...growEvents]);

    finalHostServers = tempHostServers;
  }

  // Restore reserved threads for hacking phase
  for (const host of finalHostServers) {
    host.availableThreads += reservedForHack.get(host.hostname) ?? 0;
  }
  finalHostServerThreads = finalHostServers.reduce((acc, s) => acc + s.availableThreads, 0);

  let smallestTotalHackThreadsPerCycle: number | null = null;

  const preppedCandidates = finalTargetServers.filter(
    (s) =>
      isPrepped(ns, s.hostname) &&
      Math.floor(ns.getServerMoneyAvailable(s.hostname)) > 0 &&
      ns.getServerMaxRam(s.hostname) >= scriptBaseCost,
  );
  const unprepCount = finalTargetServers.length - preppedCandidates.length;
  const prepBatchCount = finalTargetServers.reduce((acc, s) => acc + s.batches.length, 0);
  if (unprepCount > 0) {
    ns.print(`prep: ${unprepCount} targets still prepping (${prepBatchCount} prep batches)`);
  }
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

  if (filteredBestServers.length === 0) {
    ns.print(`hack: no prepped targets yet, prep only this cycle`);
    return finalTargetServers;
  }

  const hackFraction = findOptimalHackFraction(
    ns,
    filteredBestServers[0].name,
    finalHostServerThreads,
    filteredBestServers.length,
    maxBatchesPerTargetPerRun,
  );

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

  ns.print(
    `hack: ${filteredBestServers.length} targets [${filteredBestServers.map((s) => s.name).join(', ')}], hackFrac=${(hackFraction * 100).toFixed(1)}%`,
  );
  while (smallestTotalHackThreadsPerCycle !== null && finalHostServerThreads > smallestTotalHackThreadsPerCycle) {
    const batchesSoFar = finalTargetServers.reduce((acc, s) => acc + s.batches.length, 0);
    if (batchesSoFar >= maxTargetsToHack * maxBatchesPerTargetPerRun) break;

    const threadsBefore = finalHostServers.reduce((acc, s) => acc + s.availableThreads, 0);

    bestServersToHack.forEach((targetServer) => {
      const targetBatches = finalTargetServers.find((s) => s.hostname === targetServer.hostname)?.batches.length ?? 0;
      if (targetBatches >= maxBatchesPerTargetPerRun) return;

      finalHostServerThreads = finalHostServers.reduce((acc, server) => acc + server.availableThreads, 0);

      if (smallestTotalHackThreadsPerCycle !== null && finalHostServerThreads < smallestTotalHackThreadsPerCycle)
        return;

      let tempHostServers = finalHostServers.map((s) => ({ ...s }));
      tempHostServers = tempHostServers.sort((a, b) => b.availableThreads - a.availableThreads);

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

    const threadsAfter = finalHostServers.reduce((acc, s) => acc + s.availableThreads, 0);
    if (threadsAfter >= threadsBefore) break;
  }

  return finalTargetServers;
}

/** Allocate threads to hosts, preferring a single host that can handle the full request. Falls back to fragmented allocation, skipping hosts below minThreadsPerExec. */
function allocateThreads(
  hosts: Array<{ hostname: string; availableThreads: number }>,
  threadsNeeded: number,
  target: string,
  type: string,
): BatchEvent[] {
  if (threadsNeeded <= 0) return [];
  const events: BatchEvent[] = [];

  const singleHost = hosts.find((h) => h.availableThreads >= threadsNeeded);
  if (singleHost) {
    singleHost.availableThreads -= threadsNeeded;
    events.push({ host: singleHost.hostname, target, threads: threadsNeeded, type });
    return events;
  }

  let threadsLeft = threadsNeeded;
  for (const host of hosts) {
    if (threadsLeft <= 0) break;
    if (host.availableThreads < minThreadsPerExec) continue;
    const allocated = Math.min(host.availableThreads, threadsLeft);
    host.availableThreads -= allocated;
    threadsLeft -= allocated;
    events.push({ host: host.hostname, target, threads: allocated, type });
  }
  return events;
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

function findFallbackHost(ns: NS, hostnames: string[], failedHost: string, threads: number): string | null {
  const ramNeeded = threads * scriptBaseCost;
  for (const host of hostnames) {
    if (host === failedHost) continue;
    try {
      const maxRam = ns.getServerMaxRam(host);
      const usedRam = ns.getServerUsedRam(host);
      let available = maxRam - usedRam;
      if (host === 'home') {
        const reserve =
          maxRam >= homeRamReserveGb / homeRamPercentReserve
            ? homeRamReserveGb
            : Math.floor(maxRam * homeRamPercentReserve);
        available -= reserve;
      }
      if (available >= ramNeeded) return host;
    } catch {
      continue;
    }
  }
  return null;
}

async function schedule({
  ns,
  targetServers,
  hostnames,
}: {
  ns: NS;
  targetServers: TargetServerWithBatches[];
  hostnames: string[];
}): Promise<void> {
  let execCount = 0;
  const baseTime = Date.now();

  // Iterate through each target server
  for (let targetIndex = 0; targetIndex < targetServers.length; targetIndex++) {
    const targetServer = targetServers[targetIndex];
    const { batches, hackTime, weakenTime, growTime } = targetServer;
    // Stagger each target's first batch so they don't all finish at once (avoids game freeze).
    let previousTaskEndTime = baseTime + targetIndex * targetStaggerMs;

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

      const launchedPids: number[] = [];
      let batchAborted = false;

      for (const params of execParams) {
        const { script, target, threads, waitTime } = params;
        let host = params.host;
        let pid = ns.exec(script, host, threads, target, threads, waitTime);

        if (pid === 0) {
          const fallback = findFallbackHost(ns, hostnames, host, threads);
          if (fallback) {
            if (fallback !== 'home' && !ns.fileExists(script, fallback)) {
              ns.scp([script], fallback, 'home');
            }
            host = fallback;
            pid = ns.exec(script, host, threads, target, threads, waitTime);
          }
        }

        if (pid === 0) {
          ns.tprint(
            `WARN: batch for ${target} aborted — ${params.host} unavailable, no fallback with ${threads} threads free`,
          );
          for (const p of launchedPids) ns.kill(p);
          batchAborted = true;
          break;
        }

        launchedPids.push(pid);
        execCount++;
        if (execCount % execChunkSize === 0) {
          await ns.sleep(execChunkDelayMs);
        }
      }

      if (batchAborted) continue;
      previousTaskEndTime = taskEndTime;
    }
  }
}

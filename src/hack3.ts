import { NS, Server } from '@ns';
import { disableNoisyLogs, findBestServer, formulas, getServerNames } from '/helpers/index.js';

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
const stepTimeMillis = 500;
const batchGap = stepTimeMillis * 4;
/** Max fraction of home's total RAM that hack3 can use when home is a host (0–1, e.g. 0.9 = 90%). */
const homeRamUsagePercent = 0.9;

export async function main(ns: NS): Promise<void> {
  disableNoisyLogs(ns);

  try {
    while (true) {
      await ns.run('open-all-ports.js', 1, 'home');
      const allServerNames = getServerNames(ns);
      const purchasedServers = ns
        .getPurchasedServers()
        .filter((name) => !allServerNames.some((s) => s.hostname === name))
        .map((hostname) => ({ hostname, name: hostname, depth: 1 }));
      const availableServers = [...allServerNames, ...purchasedServers].filter(
        (server) => ns.hasRootAccess(server.hostname) && ns.getServerMaxRam(server.hostname) >= scriptBaseCost,
      );

      const hostServers = availableServers
        .map((server) => {
          const maxRam = ns.getServerMaxRam(server.hostname);
          const usedRam = ns.getServerUsedRam(server.hostname);
          let availableRam = Math.floor(maxRam - usedRam);
          if (server.hostname === 'home') {
            const maxUsable = Math.floor(maxRam * homeRamUsagePercent);
            availableRam = Math.max(0, maxUsable - usedRam);
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

          return {
            ...server,
            batches: [],
            optimalServer,
            optimalDollarsPerHour: dollarsPerHour,
            weakenTime: formulas.getWeakenTime(ns, optimalServer, ns.getPlayer()),
            hackTime,
            growTime: formulas.getGrowTime(ns, optimalServer, ns.getPlayer()),
            maxBatch: Math.floor(hackTime / batchGap + 1),
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
        const ok = ns.scp(actionScripts, host.hostname, 'home');
        if (!ok && host.hostname !== 'home') {
          ns.tprint(`WARN: scp to ${host.hostname} failed`);
        }
      }

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
      }
      await ns.sleep(20);
    }
  } catch (e) {
    console.error('Error with hack3-service.js', e);
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

  finalTargetServers.forEach((targetServer) => {
    const currentMoney = ns.getServerMoneyAvailable(targetServer.hostname);
    const currentSecurity = ns.getServerSecurityLevel(targetServer.hostname);
    const maxMoney = ns.getServerMaxMoney(targetServer.hostname);
    const moneyThreshold = maxMoney * 0.9;
    const securityThreshold = ns.getServerMinSecurityLevel(targetServer.hostname) + 5;
    let tempHostServers = finalHostServers.map((s) => ({ ...s }));
    tempHostServers = tempHostServers.sort((a, b) => a.availableThreads - b.availableThreads);
    let tempHostServerAvailableThreads = tempHostServers.reduce((acc, server) => acc + server.availableThreads, 0);
    const batchOperations = [];

    const growEvents = [],
      weakenEvents = [];

    if (currentSecurity > securityThreshold && tempHostServerAvailableThreads > 0) {
      let weakenThreadsNeeded = Math.min(100, tempHostServerAvailableThreads);
      for (const server of tempHostServers) {
        if (server.availableThreads > 0 && weakenThreadsNeeded > 0) {
          const allocatedThreads = Math.min(server.availableThreads, weakenThreadsNeeded);
          server.availableThreads -= allocatedThreads;
          weakenThreadsNeeded -= allocatedThreads;
          batchOperations.push({ hostname: server.hostname, threads: allocatedThreads });
          weakenEvents.push({
            host: server.hostname,
            target: targetServer.hostname,
            threads: allocatedThreads,
            type: 'weaken1',
          });
          if (weakenThreadsNeeded === 0) break;
        }
      }
      tempHostServerAvailableThreads = tempHostServers.reduce((acc, s) => acc + s.availableThreads, 0);
    }

    if (currentMoney < moneyThreshold && tempHostServerAvailableThreads > 0) {
      // console.log(`targetServer: ${targetServer.hostname} needs initial grow`);
      let growThreadsNeeded: number;
      let weakenThreadsNeeded: number;

      if (ns.fileExists('/Formulas.exe')) {
        growThreadsNeeded = Math.max(
          1,
          ns.formulas.hacking.growThreads(ns.getServer(targetServer.hostname), ns.getPlayer(), maxMoney * 0.1),
        );
      } else {
        // this number comes from turning this equation around and weakenThreadsNeeded were 100
        // const weaken2ThreadsRaw = (growThreadsRaw * 0.004) / 0.05;
        growThreadsNeeded = Math.min(1250, tempHostServerAvailableThreads);
      }

      weakenThreadsNeeded = Math.ceil((growThreadsNeeded * 0.004) / 0.05);
      const totalThreadsNeeded = growThreadsNeeded + weakenThreadsNeeded;

      if (tempHostServerAvailableThreads > totalThreadsNeeded) {
        for (const server of tempHostServers) {
          if (server.availableThreads > 0 && growThreadsNeeded > 0) {
            const allocatedThreads = Math.min(server.availableThreads, growThreadsNeeded);
            server.availableThreads -= allocatedThreads;
            growThreadsNeeded -= allocatedThreads;
            batchOperations.push({ hostname: server.hostname, threads: allocatedThreads });
            growEvents.push({
              host: server.hostname,
              target: targetServer.hostname,
              threads: allocatedThreads,
              type: 'grow',
            });
            if (growThreadsNeeded === 0) break;
          }
        }

        for (const server of tempHostServers) {
          if (server.availableThreads > 0 && weakenThreadsNeeded > 0) {
            const allocatedThreads = Math.min(server.availableThreads, weakenThreadsNeeded);
            server.availableThreads -= allocatedThreads;
            weakenThreadsNeeded -= allocatedThreads;
            batchOperations.push({ hostname: server.hostname, threads: allocatedThreads });
            growEvents.push({
              host: server.hostname,
              target: targetServer.hostname,
              threads: allocatedThreads,
              type: 'weaken2',
            });
            if (weakenThreadsNeeded === 0) break;
          }
        }
      }
    }

    if (batchOperations.length === 0) return;

    const index = finalTargetServers.findIndex((server) => server.hostname === targetServer.hostname);
    finalTargetServers[index].batches.push([...weakenEvents, ...growEvents]);

    finalHostServers = tempHostServers;
  });

  const bestServers = findBestServer(ns);
  const percOfServersToHack = 0.2;
  const finalTargetHostnames = new Set(finalTargetServers.map((s) => s.hostname));
  let smallestTotalHackThreadsPerCycle: number | null = null;

  const bestServersToHack = bestServers
    .slice(0, Math.ceil(bestServers.length * percOfServersToHack))
    .filter((server) => {
      return (
        finalTargetHostnames.has(server.name) &&
        Math.floor(ns.getServerMoneyAvailable(server.name)) > 0 &&
        ns.getServerMaxRam(server.name) >= scriptBaseCost
      );
    })
    .map((server) => {
      const currentMoney = Math.floor(ns.getServerMoneyAvailable(server.name));
      const hackPercentPerThread = ns.hackAnalyze(server.name);
      const amountToHack = currentMoney * 0.9;
      const hackThreadsRaw = amountToHack / (currentMoney * hackPercentPerThread);

      // what money will server be at after hack?
      const serverBeforeGrow = ns.getServer(server.name);
      serverBeforeGrow.moneyAvailable = (serverBeforeGrow.moneyAvailable ?? 0) - amountToHack;

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
    bestServersToHack.forEach((targetServer) => {
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

async function schedule({ ns, targetServers }: { ns: NS; targetServers: TargetServerWithBatches[] }): Promise<void> {
  // Iterate through each target server
  for (const targetServer of targetServers) {
    const { batches, hackTime, weakenTime, growTime } = targetServer;

    // Set initial time from which the first batch will start
    let previousTaskEndTime = Date.now();

    // Process each batch
    for (const batch of batches) {
      // Start each new batch 200ms after the last task of the previous batch ended
      let taskEndTime = previousTaskEndTime + 200;

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

        // Calculate start time so this task ends exactly 200ms after the previous one
        const startTime = taskEndTime - delay + 200;
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
      }

      // Update lastTaskEndTime to the end of the last task in this batch
      previousTaskEndTime = taskEndTime;
    }
  }
  // console.log('All batches have been scheduled.');
}

import type { NS } from '@ns';
import { disableNoisyLogs, findBestServer, getServerNames } from '/helpers/index.js';
import type { HostServer } from './hack2-helpers/get-host-servers.js';
import { findBestConfig, getHostServers, getTotalAvailableThreads } from './hack2-helpers/index.js';

const RAM_PER_THREAD_HACK = 1.7;
const RAM_PER_THREAD_GROW = 1.75;
const RAM_PER_THREAD_WEAKEN = 1.75;
const FIND_BEST_SERVER_CACHE_MS = 60_000;

function ensureScriptOnHost(ns: NS, host: string, scripts: string | string[], copied: Set<string>): void {
  const list = Array.isArray(scripts) ? scripts : [scripts];
  for (const script of list) {
    const key = `${host}:${script}`;
    if (!copied.has(key)) {
      ns.scp(script, host);
      copied.add(key);
    }
  }
}

/**
 * Hacks a target server until the money threshold is reached or the security threshold is reached
 */
export async function main(ns: NS): Promise<void> {
  disableNoisyLogs(ns);

  try {
    const threadCost = Math.max(
      ns.getScriptRam('worker-hack.js'),
      ns.getScriptRam('worker-grow.js'),
      ns.getScriptRam('worker-weaken.js'),
    );
    const copiedScripts = new Set<string>();

    let cachedTargetServers: string[] = [];
    let lastFindBestServerTime = 0;

    while (true) {
      const now = Date.now();
      if (now - lastFindBestServerTime > FIND_BEST_SERVER_CACHE_MS) {
        cachedTargetServers = findBestServer(ns).map((server) => server.name);
        lastFindBestServerTime = now;
      }
      const targetServers = cachedTargetServers;

      const allServerNames = getServerNames(ns);

      for (const target of targetServers) {
        const hostServers = getHostServers(ns, allServerNames, threadCost);
        if (hostServers.length === 0 || getTotalAvailableThreads(hostServers, threadCost) === 0) {
          break;
        }

        const hostServer = hostServers[0];
        const { freeRam } = getHostFreeRam(ns, hostServer);

        const currentMoney = ns.getServerMoneyAvailable(target);
        const currentSecurity = ns.getServerSecurityLevel(target);
        const moneyThresh = ns.getServerMaxMoney(target) * 0.9;
        const securityThresh = ns.getServerMinSecurityLevel(target) + 5;
        const hackTime = ns.getHackTime(target) + 200;
        const weakenTime = ns.getWeakenTime(target) + 200;
        const growTime = ns.getGrowTime(target) + 200;

        if (currentMoney < moneyThresh) {
          const growThreads = Math.floor(freeRam / RAM_PER_THREAD_GROW);
          const waitPeriod = Math.random() * 500 + 1000;
          ensureScriptOnHost(ns, hostServer.hostname, 'worker-grow.js', copiedScripts);
          ns.exec('worker-grow.js', hostServer.hostname, growThreads, target, waitPeriod);
        } else if (currentSecurity > securityThresh) {
          const weakenThreads = Math.floor(freeRam / RAM_PER_THREAD_WEAKEN);
          const waitPeriod = Math.random() * 500 + 1000;
          ensureScriptOnHost(ns, hostServer.hostname, 'worker-weaken.js', copiedScripts);
          ns.exec('worker-weaken.js', hostServer.hostname, weakenThreads, target, waitPeriod);
        } else {
          const bestConfig = findBestConfig({
            ns,
            target,
            currentMoney,
            freeRam,
            ramPerThreadHack: RAM_PER_THREAD_HACK,
            ramPerThreadWeaken: RAM_PER_THREAD_WEAKEN,
            ramPerThreadGrow: RAM_PER_THREAD_GROW,
          });

          if (bestConfig === null) {
            continue;
          }

          ensureScriptOnHost(
            ns,
            hostServer.hostname,
            ['worker-hack.js', 'worker-grow.js', 'worker-weaken.js'],
            copiedScripts,
          );
          ns.exec('worker-hack.js', hostServer.hostname, bestConfig.hackThreads, target);
          ns.exec('worker-weaken.js', hostServer.hostname, bestConfig.firstWeakenThreads, target, hackTime);
          ns.exec('worker-grow.js', hostServer.hostname, bestConfig.growThreads, target, weakenTime);
          ns.exec('worker-weaken.js', hostServer.hostname, bestConfig.secondWeakenThreads, target, growTime);
        }
      }
      await ns.sleep(5000);
    }
  } catch (e) {
    console.error('Error with hack2-service.js', e);
  }
}

function getHostFreeRam(ns: NS, host: HostServer): { maxRam: number; usedRam: number; freeRam: number } {
  const maxRam =
    host.hostname === 'home' ? ns.getServerMaxRam(host.hostname) / 1.25 : ns.getServerMaxRam(host.hostname);
  const usedRam = ns.getServerUsedRam(host.hostname);
  const freeRam = maxRam - usedRam;
  return { maxRam, usedRam, freeRam };
}

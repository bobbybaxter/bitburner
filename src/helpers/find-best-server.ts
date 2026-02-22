import { NS } from '@ns';
import { getServerNames } from './get-server-names';
import target from './target';

export type ServerWithScore = {
  name: string;
  cycleTime: number;
  cycleEarning: number;
  score: number;
};

/**
 * Finds the best server to hack based on the cycle time and earning
 */
export function findBestServer(ns: NS): ServerWithScore[] {
  const hostname = ns.getHostname();
  const maxThreads = Math.floor(
    ns.getServerMaxRam(hostname) /
      Math.max(
        ns.getScriptRam('worker-hack.js'),
        ns.getScriptRam('worker-grow.js'),
        ns.getScriptRam('worker-weaken.js'),
      ),
  );

  const servers = getServerNames(ns)
    .filter(
      (server) =>
        server.name !== 'home' &&
        ns.hasRootAccess(server.name) &&
        ns.getServerRequiredHackingLevel(server.name) <= ns.getHackingLevel(),
    )
    .map((server): ServerWithScore | null => {
      const maxCash = ns.getServerMaxMoney(server.name);
      if (!maxCash) return null;

      const hackChance = ns.hackAnalyzeChance(server.name);
      const threads = target(ns, server.name, hostname).calculateCycleThreads(0.99, maxThreads);
      const cycleTime = ns.getWeakenTime(server.name);
      const cycleEarning = maxCash * hackChance * threads.taking;
      const score = cycleEarning / cycleTime;

      return { name: server.name, cycleTime, cycleEarning, score };
    })
    .filter((s): s is ServerWithScore => s !== null);

  const sortedServers = [...servers].sort((a, b) => b.score - a.score);
  console.info('Best Servers:', sortedServers);
  return sortedServers;
}

export async function main(ns: NS): Promise<ServerWithScore[]> {
  return await findBestServer(ns);
}

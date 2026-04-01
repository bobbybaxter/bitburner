import { NS, Server } from '@ns';
import * as formulas from '/helpers/formulas.js';

export function getOptimalServer({ ns, targetServer }: { ns: NS; targetServer: string }): Server {
  const server = ns.getServer(targetServer);
  server.moneyAvailable = server.moneyMax;
  server.hackDifficulty = server.minDifficulty;
  return server;
}

/** Compute threads per batch for a given hack fraction on a target. Uses optimal state (min sec, max money) for accuracy. */
export function computeThreadsPerBatch(ns: NS, hostname: string, hackFraction: number): number {
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
export function scoreTargetForBatch(ns: NS, hostname: string, referenceHackFraction: number = 0.01): number {
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

/**
 * Same candidate rules as hack3 batch targets: rooted, hackable level, not home/purchased, has money.
 * Highest {@link scoreTargetForBatch} wins (same ordering chooseTargets uses for prep priority).
 */
export function pickBestScoredHackTarget(ns: NS, hostnames: readonly string[], fallback = 'n00dles'): string {
  const hackingLevel = ns.getHackingLevel();
  const purchased = new Set(ns.getPurchasedServers());
  let best: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const hostname of hostnames) {
    if (hostname === 'home' || purchased.has(hostname)) continue;
    if (ns.getServerMaxMoney(hostname) < 1) continue;
    if (ns.getServerRequiredHackingLevel(hostname) > hackingLevel) continue;
    if (!ns.hasRootAccess(hostname)) continue;
    const score = scoreTargetForBatch(ns, hostname);
    if (score > bestScore) {
      bestScore = score;
      best = hostname;
    }
  }
  return best ?? fallback;
}

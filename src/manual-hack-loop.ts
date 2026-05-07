//
import type { NS } from '@ns';
import { getPathFromHomeTo } from '/helpers/get-path-from-home.js';
import { getServerNames } from '/helpers/get-server-names.js';
import { pickBestScoredHackTarget } from '/helpers/hack-target-score.js';

/** Walk the terminal from the current server to `home` using only neighbor connects. */
function singularityWalkToHome(ns: NS): void {
  const curr = ns.singularity.getCurrentServer();
  if (curr === 'home') return;
  const pathFromHome = getPathFromHomeTo(ns, curr);
  if (pathFromHome === null || pathFromHome.length === 0) {
    throw new Error(`no path from home to current server ${curr}`);
  }
  for (let i = pathFromHome.length - 2; i >= 0; i--) {
    const hop = pathFromHome[i]!;
    if (!ns.singularity.connect(hop)) {
      throw new Error(`connect failed toward ${hop}`);
    }
  }
  if (!ns.singularity.connect('home')) {
    throw new Error('connect home failed');
  }
}

/** From `home`, connect hop-by-hop to `target`. */
function singularityConnectPathFromHome(ns: NS, target: string): void {
  const path = getPathFromHomeTo(ns, target);
  if (path === null || path.length === 0) {
    throw new Error(`no path from home to ${target}`);
  }
  for (const hop of path) {
    if (!ns.singularity.connect(hop)) {
      throw new Error(`connect failed toward ${hop}`);
    }
  }
}

function singularityEnsureOnTarget(ns: NS, target: string): void {
  if (ns.singularity.getCurrentServer() === target) return;
  singularityWalkToHome(ns);
  singularityConnectPathFromHome(ns, target);
}

/**
 * Picks the same best hack target as hack3 ({@link pickBestScoredHackTarget}), connects the terminal
 * there, then runs {@link NS.singularity.manualHack} in a loop. Requires singularity (Source-File 4).
 */
export async function main(ns: NS): Promise<void> {
  while (true) {
    await ns.sleep(0);
    const hostnames = getServerNames(ns).map((s) => s.hostname);
    const target = pickBestScoredHackTarget(ns, hostnames);
    singularityEnsureOnTarget(ns, target);
    const moneyStolen = await ns.singularity.manualHack();
    ns.tprint(`${ns.format.number(moneyStolen)} stolen from ${target}`);
  }
}

import { NS, Person, Server } from '@ns';

/**
 * Gets the hack percent of a server
 */
export function getHackPercent(ns: NS, server: Server, player: Person): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.hackPercent(server, player);
  } else {
    return ns.hackAnalyze(server.hostname);
  }
}

/**
 * Gets the hack chance of a server
 */
export function getHackChance(ns: NS, server: Server, player: Person): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.hackChance(server, player);
  } else {
    return ns.hackAnalyzeChance(server.hostname);
  }
}

/**
 * Gets the grow threads of a server
 */
export function getGrowThreads(ns: NS, server: Server, player: Person, hackThd: number): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.growThreads(server, player, server.moneyMax ?? 0);
  } else {
    console.warn('DOESNT HAVE FORMULA');
    const hackPercent = ns.hackAnalyze(server.hostname);
    const hackMon = hackPercent * (server.moneyAvailable ?? 0) * hackThd;
    const monAfterHack = (server.moneyAvailable ?? 0) - hackMon;
    const multiplier = hackMon / (monAfterHack + 1) + 1;

    return ns.growthAnalyze(server.hostname, multiplier);
  }
}

/**
 * Gets the weaken time of a server
 */
export function getWeakenTime(ns: NS, server: Server, player: Person): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.weakenTime(server, player);
  } else {
    return ns.getWeakenTime(server.hostname);
  }
}

/**
 * Gets the hack time of a server
 */
export function getHackTime(ns: NS, server: Server, player: Person): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.hackTime(server, player);
  } else {
    return ns.getHackTime(server.hostname);
  }
}

/**
 * Gets the grow time of a server
 */
export function getGrowTime(ns: NS, server: Server, player: Person): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.growTime(server, player);
  } else {
    return ns.getGrowTime(server.hostname);
  }
}

/**
 * Checks if the formulas are available
 */
function hasFormula(ns: NS): boolean {
  return ns.fileExists('/Formulas.exe');
}

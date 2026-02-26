import type { NS, Player, Server } from '@ns';

export function getHackPercent(ns: NS, server: Server, player: Player): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.hackPercent(server, player);
  } else {
    return ns.hackAnalyze(server.hostname);
  }
}

export function getHackChance(ns: NS, server: Server, player: Player): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.hackChance(server, player);
  } else {
    return ns.hackAnalyzeChance(server.hostname);
  }
}

export function getGrowThreads(ns: NS, server: Server, player: Player, hackThd: number): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.growThreads(server, player, server.moneyMax ?? 0);
  } else {
    console.log('DOESNT HAVE FORMULA');
    const moneyAvailable = server.moneyAvailable ?? 0;
    const hackPercent = ns.hackAnalyze(server.hostname);
    const hackMon = hackPercent * moneyAvailable * hackThd;
    const monAfterHack = moneyAvailable - hackMon;
    const multiplier = hackMon / (monAfterHack + 1) + 1;

    return ns.growthAnalyze(server.hostname, multiplier);
  }
}

export function getWeakenTime(ns: NS, server: Server, player: Player): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.weakenTime(server, player);
  } else {
    return ns.getWeakenTime(server.hostname);
  }
}

export function getHackTime(ns: NS, server: Server, player: Player): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.hackTime(server, player);
  } else {
    return ns.getHackTime(server.hostname);
  }
}

export function getGrowTime(ns: NS, server: Server, player: Player): number {
  if (hasFormula(ns)) {
    return ns.formulas.hacking.growTime(server, player);
  } else {
    return ns.getGrowTime(server.hostname);
  }
}

function hasFormula(ns: NS): boolean {
  return ns.fileExists('/Formulas.exe');
}

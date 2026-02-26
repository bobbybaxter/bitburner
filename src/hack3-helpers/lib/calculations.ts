import type { NS } from '@ns';

export function getMaxThreads(ns: NS, host: string, script: string): number {
  const scriptRam = ns.getScriptRam(script);
  const maxRam = ns.getServerMaxRam(host);
  const usedRam = ns.getServerUsedRam(host);

  return Math.floor((maxRam - usedRam) / scriptRam);
}

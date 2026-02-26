import type { NS } from '@ns';
import * as config from '/hack3-helpers/config.js';
import { execMulti } from '/hack3-helpers/exec-multi.js';

const autoGrowScript = config.autoGrowScriptGet();

export async function autoGrow(
  ns: NS,
  log: (msg: string) => void,
  targets: string[],
  availableServers: string[],
): Promise<void> {
  log(`execute targets:${targets}`);
  const scriptCostGB = ns.getScriptRam(autoGrowScript);
  if (scriptCostGB <= 0) return;

  for (const server of availableServers) {
    log(`exec on server ${server}`);
    const totalAvaiGB = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    const avgThd = Math.floor(totalAvaiGB / targets.length / scriptCostGB);
    if (avgThd < 1) continue;

    for (const target of targets) {
      log(` exec thds ${avgThd} on target ${target}`);
      execMulti(ns, server, avgThd, autoGrowScript, target, '$threads');
    }
  }

  while (availableServers.some((s) => ns.scriptRunning(autoGrowScript, s))) {
    await ns.sleep(1);
  }
  log('all grow finished');
}

import type { NS } from '@ns';

export interface FindBestConfigParams {
  ns: NS;
  target: string;
  currentMoney: number;
  freeRam: number;
  ramPerThreadHack: number;
  ramPerThreadWeaken: number;
  ramPerThreadGrow: number;
}

export function findBestConfig({
  ns,
  target,
  currentMoney,
  freeRam,
  ramPerThreadHack,
  ramPerThreadWeaken,
  ramPerThreadGrow,
}: FindBestConfigParams) {
  // Max threads calculable
  const maxThreadsHack = Math.floor(freeRam / ramPerThreadHack);
  const maxThreadsWeaken = Math.floor(freeRam / ramPerThreadWeaken);
  const maxThreadsGrow = Math.floor(freeRam / ramPerThreadGrow);

  let bestConfig = { moneyStolen: 0, hackThreads: 0, firstWeakenThreads: 0, growThreads: 0, secondWeakenThreads: 0 };

  for (let hackThreads = 1; hackThreads <= maxThreadsHack; hackThreads++) {
    const percentToSteal = ns.hackAnalyze(target) * hackThreads;
    const moneyStolen = ns.getServerMaxMoney(target) * percentToSteal;
    if (moneyStolen > currentMoney) {
      continue; // Skip over-hacking beyond available money
    }

    const secIncreaseHack = ns.hackAnalyzeSecurity(hackThreads);
    const secDecreasePerThread = ns.weakenAnalyze(1);
    const firstWeakenThreads = Math.ceil(secIncreaseHack / secDecreasePerThread);

    // Calculate growth needed to restore money to max after hack
    const remainingMoney = currentMoney - moneyStolen;
    const growthMultiplier = ns.getServerMaxMoney(target) / Math.max(1, remainingMoney);
    if (growthMultiplier < 1) continue; // Ignore cases where grow isn't needed

    const growThreads = Math.ceil(ns.growthAnalyze(target, growthMultiplier));
    if (growThreads > maxThreadsGrow) continue; // Skip if growth exceeds thread capacity

    const secIncreaseGrow = ns.growthAnalyzeSecurity(growThreads);
    const secondWeakenThreads = Math.ceil(secIncreaseGrow / secDecreasePerThread);

    const totalWeakenThreads = firstWeakenThreads + secondWeakenThreads;
    if (totalWeakenThreads > maxThreadsWeaken) continue; // Skip if weaken exceeds thread capacity

    // Check if this configuration uses resources more effectively
    const totalThreadsUsed = hackThreads + growThreads + totalWeakenThreads;
    if (
      totalThreadsUsed >
      bestConfig.hackThreads + bestConfig.growThreads + bestConfig.firstWeakenThreads + bestConfig.secondWeakenThreads
    ) {
      bestConfig = {
        moneyStolen: moneyStolen,
        hackThreads: hackThreads,
        firstWeakenThreads: firstWeakenThreads,
        growThreads: growThreads,
        secondWeakenThreads: secondWeakenThreads,
      };
    }
  }

  if (bestConfig.moneyStolen === 0) {
    // console.info(`No optimal setup found for ${target}`);
    return null;
  } else {
    // console.info(
    //   `Optimal setup for ${target}: Steal $${ns.formatNumber(bestConfig.moneyStolen)}, ` +
    //     `Hack Threads = ${bestConfig.hackThreads}, ` +
    //     `First Weaken Threads = ${bestConfig.firstWeakenThreads}, ` +
    //     `Grow Threads = ${bestConfig.growThreads}, ` +
    //     `Second Weaken Threads = ${bestConfig.secondWeakenThreads}`
    // );

    return bestConfig;
  }
}

import { NS } from '@ns';
import { Do } from '/helpers/do.js';
import { localISOString } from './helpers/local-iso-string.js';

const INTERVAL_MS = 5 * 60_000;

export async function main(ns: NS): Promise<void> {
  ns.tprint('home-opt started — upgrading home RAM and cores until maxed');

  while (true) {
    const money = ns.getPlayer().money;
    const ramCost = (await Do(ns, 'ns.singularity.getUpgradeHomeRamCost')) as number;
    const coreCost = (await Do(ns, 'ns.singularity.getUpgradeHomeCoresCost')) as number;
    const ramMaxed = ramCost === Infinity;
    const coresMaxed = coreCost === Infinity;

    if (ramMaxed && coresMaxed) {
      ns.tprint(`${localISOString()} Home RAM and cores are fully maxed. Exiting.`);
      return;
    }

    if (!ramMaxed && money >= ramCost) {
      const result = await Do(ns, 'ns.singularity.upgradeHomeRam');
      if (result) {
        ns.tprint(`${localISOString()} Upgraded home RAM for $${ns.formatNumber(ramCost)}`);
      }
    }

    if (!coresMaxed && ns.getPlayer().money >= coreCost) {
      const result = await Do(ns, 'ns.singularity.upgradeHomeCores');
      if (result) {
        ns.tprint(`${localISOString()} Upgraded home cores for $${ns.formatNumber(coreCost)}`);
      }
    }

    const nextRamCost = (await Do(ns, 'ns.singularity.getUpgradeHomeRamCost')) as number;
    const nextCoreCost = (await Do(ns, 'ns.singularity.getUpgradeHomeCoresCost')) as number;
    const nextCheapest = Math.min(
      nextRamCost === Infinity ? Infinity : nextRamCost,
      nextCoreCost === Infinity ? Infinity : nextCoreCost,
    );

    if (nextCheapest < Infinity) {
      ns.tprint(
        `${localISOString()} Next home upgrade: $${ns.formatNumber(nextCheapest)} ` +
          `(RAM $${ns.formatNumber(nextRamCost)}, cores $${ns.formatNumber(nextCoreCost)})`,
      );
    }

    await ns.sleep(INTERVAL_MS);
  }
}

import { NS } from '@ns';

export async function main(ns: NS): Promise<void> {
  /** Valid purchased-server RAM sizes: 2, 4, 8, … up to game cap. */
  // function ramTiers(maxRam: number): number[] {
  //   const tiers: number[] = [];
  //   for (let ram = 2; ram <= maxRam; ram *= 2) {
  //     tiers.push(ram);
  //   }
  //   return tiers;
  // }

  // function canAfford(cash: number, threshold: number, cost: number): boolean {
  //   return Number.isFinite(cost) && cost >= 0 && cash * threshold >= cost;
  // }

  // /** Largest RAM tier whose purchase price fits the money rule. */
  // function bestPurchasableRam(ns: NS, cash: number, threshold: number): number | null {
  //   const cap = ns.getPurchasedServerMaxRam();
  //   let best: number | null = null;
  //   for (const ram of ramTiers(cap)) {
  //     const cost = ns.getPurchasedServerCost(ram);
  //     ns.tprint(`Cost of ${ram}GB: ${ns.format.number(cost)}`);
  //     if (!Number.isFinite(cost) || cost <= 0) continue;
  //     if (canAfford(cash, threshold, cost)) best = ram;
  //   }
  //   return best;
  // }

  // const cash = ns.getPlayer().money;
  // const threshold = 0.25;
  // const ram = bestPurchasableRam(ns, cash, threshold);
  // ns.tprint(`Best purchasable RAM: ${ram}`);

  // ns.purchaseServer('pserv-share', 4096);
  // ns.tprint(`Server purchased: pserv-share 4096GB`);

  ns.tprint(JSON.stringify(ns.singularity.getAugmentationsFromFaction('Chongqing'), null, 2));
}

// 8.5GB RAM

import { NS } from '@ns';

const SHARE_NAME = 'cloud-share';
const SHARE_SCRIPT = 'share-server.js';

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const CONFIG = {
  moneyThreshold: 0.25, // only act when cash >= cost / moneyThreshold
  sleepMs: 3000,
};

function normalizeCloudHostname(hostname: string): string {
  return hostname.trim();
}

/** Valid purchased-server RAM sizes: 2, 4, 8, … up to game cap. */
function ramTiers(maxRam: number): number[] {
  const tiers: number[] = [];
  for (let ram = 2; ram <= maxRam; ram *= 2) {
    tiers.push(ram);
  }
  return tiers;
}

/** cloud-share, then cloud-1 … cloud-(limit-1). */
function purchaseHostnameOrder(limit: number): string[] {
  const names = [SHARE_NAME];
  for (let i = 1; i < limit; i++) {
    names.push(`cloud-${i}`);
  }
  return names;
}

function nextMissingHostname(limit: number, owned: readonly string[]): string | null {
  for (const h of purchaseHostnameOrder(limit)) {
    if (!owned.includes(h)) return h;
  }
  return null;
}

function canAfford(cash: number, threshold: number, cost: number): boolean {
  return Number.isFinite(cost) && cost >= 0 && cash * threshold >= cost;
}

/** Largest RAM tier whose purchase price fits the money rule. */
function bestPurchasableRam(ns: NS, cash: number, threshold: number): number | null {
  const cap = ns.cloud.getRamLimit();
  let best: number | null = null;
  for (const ram of ramTiers(cap)) {
    const cost = ns.cloud.getServerCost(ram);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    if (canAfford(cash, threshold, cost)) best = ram;
  }
  return best;
}

/** Largest RAM tier above currentRam whose upgrade price fits the money rule. */
function bestUpgradeForServer(
  ns: NS,
  hostname: string,
  currentRam: number,
  cash: number,
  threshold: number,
): { ram: number; cost: number } | null {
  const cap = ns.cloud.getRamLimit();
  let best: { ram: number; cost: number } | null = null;
  for (const ram of ramTiers(cap)) {
    if (ram <= currentRam) continue;
    const cost = ns.cloud.getServerUpgradeCost(hostname, ram);
    if (cost < 0 || !Number.isFinite(cost)) continue;
    if (canAfford(cash, threshold, cost)) best = { ram, cost };
  }
  return best;
}

/** Prefer higher target RAM, then higher upgrade cost, then hostname (stable). */
function isBetterUpgrade(
  a: { hostname: string; ram: number; cost: number },
  b: { hostname: string; ram: number; cost: number },
): boolean {
  if (a.ram !== b.ram) return a.ram > b.ram;
  if (a.cost !== b.cost) return a.cost > b.cost;
  return a.hostname < b.hostname;
}

function allCloudServersAtCap(ns: NS, owned: readonly string[], limit: number): boolean {
  if (owned.length !== limit) return false;
  const cap = ns.cloud.getRamLimit();
  return owned.every((h) => ns.getServerMaxRam(h) === cap);
}

/**
 * Optimizes purchased servers: fills fixed hostnames in order, then upgrades the single
 * best affordable tier jump each tick when at the server cap.
 */
export async function main(ns: NS): Promise<void> {
  const limit = ns.cloud.getServerLimit();
  if (limit < 1) {
    ns.tprint('cloud-opt: purchased servers disabled (e.g. BitNode-9); exiting');
    return;
  }

  while (true) {
    const owned = ns.cloud.getServerNames();
    const cash = ns.getPlayer().money;
    const th = CONFIG.moneyThreshold;

    if (allCloudServersAtCap(ns, owned, limit)) {
      ns.tprint(`cloud-opt: all ${limit} purchased servers at ${ns.cloud.getRamLimit()}GB cap; exiting`);
      return;
    }

    if (owned.length < limit) {
      const ram = bestPurchasableRam(ns, cash, th);
      const hostname = nextMissingHostname(limit, owned);
      if (ram != null && hostname != null) {
        const normalizedHostname = normalizeCloudHostname(hostname);
        if (!normalizedHostname) {
          ns.tprint(`WARN: skipping purchase due to invalid hostname "${hostname}"`);
          await ns.asleep(CONFIG.sleepMs);
          continue;
        }
        const cost = ns.cloud.getServerCost(ram);
        const result = ns.cloud.purchaseServer(normalizedHostname, ram);
        if (result) {
          ns.tprint(`${result}:${ram} purchased for ${formatter.format(cost)}`);
          if (normalizedHostname === SHARE_NAME) ns.run(SHARE_SCRIPT);
        } else {
          ns.tprint(`WARN: purchase failed for ${normalizedHostname} @ ${ram}GB`);
        }
      } else {
        console.log('Next: purchase (waiting for funds / threshold)');
      }
    } else {
      let choice: { hostname: string; ram: number; cost: number } | null = null;
      for (const hostname of owned) {
        const currentRam = ns.getServerMaxRam(hostname);
        const up = bestUpgradeForServer(ns, hostname, currentRam, cash, th);
        if (!up) continue;
        const cand = { hostname, ram: up.ram, cost: up.cost };
        if (!choice || isBetterUpgrade(cand, choice)) choice = cand;
      }

      if (choice) {
        // ns.killall(choice.hostname);
        if (ns.cloud.upgradeServer(choice.hostname, choice.ram)) {
          ns.tprint(`${choice.hostname} upgraded to ${choice.ram}GB for ${formatter.format(choice.cost)}`);
          if (choice.hostname === SHARE_NAME) ns.run(SHARE_SCRIPT);
        } else {
          ns.tprint(`WARN: upgrade failed for ${choice.hostname} to ${choice.ram}GB`);
        }
      } else {
        console.log('Next: upgrade (waiting), no affordable tier');
      }
    }

    await ns.asleep(CONFIG.sleepMs);
  }
}

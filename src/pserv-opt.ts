// 8.5GB RAM

import { NS } from '@ns';

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const CONFIG = {
  initialMulti: 7, // 3 = 8GB, 7 = 128GB, 11 = 2TB, 15 = 32TB, 19 = 512TB
  moneyThreshold: 0.25, // only buy when cash >= cost / moneyThreshold
  sleepMs: 3000,
};

/**
 * Optimizes purchased servers.
 */
export async function main(ns: NS): Promise<void> {
  if (ns.getPurchasedServerLimit() < 1) {
    ns.tprint('pserv-opt: purchased servers disabled (e.g. BitNode-9); exiting');
    return;
  }

  let multi = CONFIG.initialMulti;
  const maxRamAvailable = Math.pow(2, 20); // maxRam available for a server

  let servers = ns.getPurchasedServers();
  // raises multi if you have a server that increases maxRam
  if (servers.length > 0) {
    const maxRam = servers.reduce((a: number, e: string) => Math.max(a, ns.getServerMaxRam(e)), 0);
    while (Math.pow(2, multi) < maxRam) {
      ns.tprint(`max ram changed - bumping ram multi from ${multi} to ${multi + 4}`);
      multi += 4;
    }
  }

  const SHARE_NAME = 'pserv-share';
  let nameCounter = 0;

  while (true) {
    const ramPow = Math.pow(2, multi);
    const ramThreshold = Math.min(maxRamAvailable, ramPow);
    if (ramPow > maxRamAvailable) {
      ns.tprint('servers maxed, killing process');
      return;
    }

    servers = ns.getPurchasedServers();
    const count = servers.length;
    const cash = ns.getPlayer().money;
    const cost = ns.getPurchasedServerCost(ramThreshold);
    const canBuyMoreServers = count < ns.getPurchasedServerLimit();
    const isMoneyAvailable = cash * CONFIG.moneyThreshold >= cost;

    const shareExists = servers.includes(SHARE_NAME);
    const shareRam = shareExists ? ns.getServerMaxRam(SHARE_NAME) : 0;
    const shareNeedsUpgrade = shareExists && shareRam < ramThreshold;

    if (!shareExists && !canBuyMoreServers && isMoneyAvailable) {
      const serversWithRam = servers.map((s) => ({ name: s, ram: ns.getServerMaxRam(s) }));
      const smallest = serversWithRam.reduce((min, s) => (s.ram < min.ram ? s : min));
      ns.tprint(`${smallest.name}:${smallest.ram} server replaced with ${SHARE_NAME}`);
      ns.killall(smallest.name);
      ns.deleteServer(smallest.name);
      const hostname = ns.purchaseServer(SHARE_NAME, ramThreshold);
      if (hostname) {
        ns.tprint(`${hostname}:${ramThreshold} share server purchased for ${formatter.format(cost)}`);
        ns.run('share-server.js');
      } else {
        ns.tprint(`WARN: failed to purchase ${SHARE_NAME}`);
      }
    } else if (!shareExists && canBuyMoreServers && isMoneyAvailable) {
      const hostname = ns.purchaseServer(SHARE_NAME, ramThreshold);
      if (hostname) {
        ns.tprint(`${hostname}:${ramThreshold} share server purchased for ${formatter.format(cost)}`);
        ns.run('share-server.js');
      } else {
        ns.tprint(`WARN: failed to purchase ${SHARE_NAME}`);
      }
    } else if (shareNeedsUpgrade && isMoneyAvailable) {
      ns.tprint(`${SHARE_NAME}:${shareRam} share server killed to upgrade`);
      ns.killall(SHARE_NAME);
      ns.deleteServer(SHARE_NAME);
      const hostname = ns.purchaseServer(SHARE_NAME, ramThreshold);
      if (hostname) {
        ns.tprint(`${hostname}:${ramThreshold} share server upgraded for ${formatter.format(cost)}`);
        ns.run('share-server.js');
      } else {
        ns.tprint(`WARN: failed to re-purchase ${SHARE_NAME} after delete`);
      }
    } else if (!canBuyMoreServers && isMoneyAvailable) {
      const numbered = servers.filter((s) => s !== SHARE_NAME);
      if (numbered.length === 0) continue;
      const serversWithRam = numbered.map((s) => ({ name: s, ram: ns.getServerMaxRam(s) }));
      const smallest = serversWithRam.reduce((min, s) => (s.ram < min.ram ? s : min));
      const current = smallest.name;
      const currentServerMaxRam = smallest.ram;

      if (ramThreshold <= currentServerMaxRam) {
        ns.tprint(`bumping ram multi from ${multi} to ${multi + 4}`);
        multi += 4;
        continue;
      }

      ns.tprint(`${current}:${currentServerMaxRam} server killed to upgrade`);
      ns.killall(current);
      ns.deleteServer(current);
    } else if (canBuyMoreServers && isMoneyAvailable) {
      if (!ns.getPurchasedServers().includes(SHARE_NAME)) {
        const hostname = ns.purchaseServer(SHARE_NAME, ramThreshold);
        if (hostname) {
          ns.tprint(`${hostname}:${ramThreshold} share server purchased for ${formatter.format(cost)}`);
          ns.run('share-server.js');
        }
      } else {
        const name = 'pserv-' + nameCounter;
        nameCounter++;
        const newBoxHostname = ns.purchaseServer(name, ramThreshold);
        ns.tprint(`${newBoxHostname}:${ramThreshold} server purchased for ${formatter.format(cost)}`);
      }
    }

    let nextAction = 'waiting for funds';
    if (!shareExists && !canBuyMoreServers && isMoneyAvailable) nextAction = 'replace smallest with share server';
    else if (!shareExists && canBuyMoreServers && isMoneyAvailable) nextAction = 'purchase share server';
    else if (shareNeedsUpgrade && isMoneyAvailable) nextAction = 'upgrade share server';
    else if (canBuyMoreServers && isMoneyAvailable) nextAction = 'purchase new server';
    else if (!canBuyMoreServers && isMoneyAvailable) nextAction = 'upgrade smallest server';
    console.log(`Next: ${nextAction}, cost: ${formatter.format(cost)}`);
    await ns.asleep(CONFIG.sleepMs);
  }
}

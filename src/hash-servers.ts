import { NS } from '@ns';

export async function main(ns: NS) {
  ns.disableLog('sleep');
  if (ns.args.includes('tail')) ns.ui.openTail();
  const h = ns.hacknet;
  const hacksMults = ns.getHacknetMultipliers();
  const productionMult = hacksMults.production;
  const serverCostMult = hacksMults.purchaseCost;

  const requestedServerCapArg = ns.args.find(
    (arg): arg is string => typeof arg === 'string' && arg.startsWith('servers:'),
  );
  const requestedServerCap = requestedServerCapArg ? Number.parseInt(requestedServerCapArg.split(':')[1], 10) : NaN;
  const serverCap =
    Number.isFinite(requestedServerCap) && requestedServerCap > 0
      ? Math.min(requestedServerCap, h.maxNumNodes())
      : h.maxNumNodes();

  type UpgradeTarget = 'purchase' | 'level' | 'ram' | 'core';
  type Candidate = {
    type: UpgradeTarget;
    nodeIndex: number | null;
    cost: number;
    gain: number;
    roi: number;
  };

  const hashGainRate = (level: number, ram: number, cores: number, ramUsed: number): number => {
    const baseGain = 0.001 * level;
    const ramMultiplier = Math.pow(1.07, Math.log2(ram));
    const coreMultiplier = 1 + (cores - 1) / 5;
    const ramRatio = 1 - ramUsed / ram;
    return baseGain * ramMultiplier * coreMultiplier * ramRatio * productionMult;
  };

  const getNodeProduction = (nodeIndex: number): number => {
    const stats = h.getNodeStats(nodeIndex);
    return hashGainRate(stats.level ?? 1, stats.ram ?? 1, stats.cores ?? 1, stats.ramUsed ?? 0);
  };

  const makeCandidate = (
    type: UpgradeTarget,
    nodeIndex: number | null,
    cost: number,
    oldProduction: number,
    newProduction: number,
  ): Candidate | null => {
    if (!Number.isFinite(cost) || cost <= 0) return null;
    const gain = newProduction - oldProduction;
    if (!Number.isFinite(gain) || gain <= 0) return null;
    return { type, nodeIndex, cost, gain, roi: gain / cost };
  };

  const pickBestCandidate = (): Candidate | null => {
    const candidates: Candidate[] = [];

    if (h.numNodes() < serverCap) {
      const cost = h.getPurchaseNodeCost() * serverCostMult;
      const newNodeProduction = hashGainRate(1, 1, 1, 0);
      const purchaseCandidate = makeCandidate('purchase', null, cost, 0, newNodeProduction);
      if (purchaseCandidate) candidates.push(purchaseCandidate);
    }

    for (let i = 0; i < h.numNodes(); i++) {
      const stats = h.getNodeStats(i);
      const level = stats.level ?? 1;
      const ram = stats.ram ?? 1;
      const cores = stats.cores ?? 1;
      const ramUsed = stats.ramUsed ?? 0;
      const currentProduction = hashGainRate(level, ram, cores, ramUsed);

      const levelCost = h.getLevelUpgradeCost(i, 1);
      const levelProduction = hashGainRate(level + 1, ram, cores, ramUsed);
      const levelCandidate = makeCandidate('level', i, levelCost, currentProduction, levelProduction);
      if (levelCandidate) candidates.push(levelCandidate);

      const ramCost = h.getRamUpgradeCost(i, 1);
      const ramProduction = hashGainRate(level, ram * 2, cores, ramUsed);
      const ramCandidate = makeCandidate('ram', i, ramCost, currentProduction, ramProduction);
      if (ramCandidate) candidates.push(ramCandidate);

      const coreCost = h.getCoreUpgradeCost(i, 1);
      const coreProduction = hashGainRate(level, ram, cores + 1, ramUsed);
      const coreCandidate = makeCandidate('core', i, coreCost, currentProduction, coreProduction);
      if (coreCandidate) candidates.push(coreCandidate);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.roi - a.roi);
    return candidates[0] ?? null;
  };

  const executeCandidate = (candidate: Candidate): boolean => {
    if (candidate.type === 'purchase') return h.purchaseNode() !== -1;
    if (candidate.nodeIndex === null) return false;
    if (candidate.type === 'level') return h.upgradeLevel(candidate.nodeIndex, 1);
    if (candidate.type === 'ram') return h.upgradeRam(candidate.nodeIndex, 1);
    return h.upgradeCore(candidate.nodeIndex, 1);
  };

  while (1) {
    ns.clearLog();
    const serversInfo: { index: number; name: string; level: number; ram: number; cores: number; cache: number }[] = [];
    for (let i = 0; i < h.numNodes(); i++) {
      const stats = h.getNodeStats(i);
      serversInfo.push({ index: i, ...stats, cache: stats.cache ?? 0 });
    }

    let upgradesThisCycle = 0;
    let lastUpgradeSummary = 'None';
    while (true) {
      const candidate = pickBestCandidate();
      if (!candidate) break;
      if (ns.getPlayer().money < candidate.cost) break;
      if (!executeCandidate(candidate)) break;
      upgradesThisCycle++;
      const target = candidate.nodeIndex === null ? 'new' : `#${candidate.nodeIndex}`;
      lastUpgradeSummary = `${candidate.type} ${target} | ROI: ${ns.format.number(candidate.roi)} | cost: $${ns.format.number(candidate.cost)}`;
    }

    serversInfo.length = 0;
    for (let i = 0; i < h.numNodes(); i++) {
      const stats = h.getNodeStats(i);
      serversInfo.push({ index: i, ...stats, cache: stats.cache ?? 0 });
    }

    // max length of server stat values for print padding
    const maxLen = { serverName: 0, level: 0, ram: 0, cores: 0, cache: 0 };
    for (const server of serversInfo) {
      if (maxLen.serverName < server.name.length) maxLen.serverName = server.name.length;
      if (maxLen.level < server.level.toString().length) maxLen.level = server.level.toString().length;
      if (maxLen.ram < ns.format.ram(server.ram).length) maxLen.ram = ns.format.ram(server.ram).length;
      if (maxLen.cores < server.cores.toString().length) maxLen.cores = server.cores.toString().length;
      if (maxLen.cache < server.cache.toString().length) maxLen.cache = server.cache.toString().length;
    }

    const totalProd = Array.from({ length: h.numNodes() }, (_, i) => getNodeProduction(i)).reduce((a, b) => a + b, 0);
    ns.print(`Active servers: ${h.numNodes()}/${serverCap}`);
    ns.print(`Hash production: ${ns.format.number(totalProd)} h/s`);
    ns.print(`Upgrades this cycle: ${upgradesThisCycle}`);
    ns.print(`Last upgrade: ${lastUpgradeSummary}`);
    for (const server of serversInfo) {
      ns.print(
        `-${(server.name + ':').padEnd(maxLen.serverName + 1, ' ')} Level: ${server.level
          .toString()
          .padStart(maxLen.level, ' ')} -- Ram: ${ns.format
          .ram(server.ram)
          .padStart(maxLen.ram, ' ')} -- Cores: ${server.cores
          .toString()
          .padStart(maxLen.cores, ' ')} -- Cache: ${server.cache.toString().padStart(maxLen.cache, ' ')}`,
      );
    }
    await ns.sleep(0);
  }
}

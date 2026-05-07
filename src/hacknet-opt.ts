import { Hacknet, NS } from '@ns';
import { localISOString } from './helpers/local-iso-string.js';

type UpgradeType = 'ram' | 'level' | 'cpu';

type UpgradeResult = {
  nodeIndex: number | null;
  type: UpgradeType | null;
  cost: number;
  roi: number;
  levelAmount?: number; // for level upgrades, how many levels to buy
};

// Default values
const DEFAULT_NUM_LEVELS = 1;
const DEFAULT_BUDGET_PCT = 50;
const PURCHASE_COOLDOWN_MS = 200;
const IDLE_SLEEP_MS = 30000;
const NOTHING_TO_DO_SLEEP_MS = 60000;

function hasFormulas(ns: NS): boolean {
  return ns.fileExists('/Formulas.exe');
}

function findCheapestUpgrade(hacknet: Hacknet, numLevels: number): UpgradeResult {
  const numNodes = hacknet.numNodes();
  let minCost = Infinity;
  let nodeIndex: number | null = null;
  let type: UpgradeType | null = null;
  let levelAmount = 1;

  for (let i = 0; i < numNodes; i++) {
    const ramCost = hacknet.getRamUpgradeCost(i, 1);
    if (ramCost < minCost) {
      nodeIndex = i;
      minCost = ramCost;
      type = 'ram';
    }

    const levelCost = hacknet.getLevelUpgradeCost(i, numLevels);
    if (levelCost < minCost) {
      nodeIndex = i;
      minCost = levelCost;
      type = 'level';
      levelAmount = numLevels;
    }

    const coreCost = hacknet.getCoreUpgradeCost(i, 1);
    if (coreCost < minCost) {
      nodeIndex = i;
      minCost = coreCost;
      type = 'cpu';
    }
  }

  return { nodeIndex, type, cost: minCost, roi: 0, levelAmount };
}

/**
 * Finds the upgrade with the best ROI (gain per dollar spent).
 * Requires Formulas API.
 */
function findBestROIUpgrade(ns: NS, hacknet: Hacknet, numLevels: number): UpgradeResult {
  const numNodes = hacknet.numNodes();
  const multipliers = ns.getHacknetMultipliers();
  let bestROI = 0;
  let nodeIndex: number | null = null;
  let type: UpgradeType | null = null;
  let cost = 0;
  let levelAmount = 1;

  for (let i = 0; i < numNodes; i++) {
    const node = hacknet.getNodeStats(i);
    const currentGainRate = ns.formulas.hacknetNodes.moneyGainRate(
      node.level,
      node.ram,
      node.cores,
      multipliers.production,
    );

    // RAM upgrade
    const ramGainRate = ns.formulas.hacknetNodes.moneyGainRate(
      node.level,
      node.ram + 1,
      node.cores,
      multipliers.production,
    );
    const ramCost = hacknet.getRamUpgradeCost(i, 1);
    const ramROI = ramCost > 0 ? (ramGainRate - currentGainRate) / ramCost : 0;
    if (ramROI > bestROI) {
      bestROI = ramROI;
      nodeIndex = i;
      type = 'ram';
      cost = ramCost;
    }

    // Level upgrade (+numLevels)
    const levelGainRate = ns.formulas.hacknetNodes.moneyGainRate(
      node.level + numLevels,
      node.ram,
      node.cores,
      multipliers.production,
    );
    const levelCost = hacknet.getLevelUpgradeCost(i, numLevels);
    const levelROI = levelCost > 0 ? (levelGainRate - currentGainRate) / levelCost : 0;
    if (levelROI > bestROI) {
      bestROI = levelROI;
      nodeIndex = i;
      type = 'level';
      cost = levelCost;
      levelAmount = numLevels;
    }

    // Core upgrade
    const coreGainRate = ns.formulas.hacknetNodes.moneyGainRate(
      node.level,
      node.ram,
      node.cores + 1,
      multipliers.production,
    );
    const coreCost = hacknet.getCoreUpgradeCost(i, 1);
    const coreROI = coreCost > 0 ? (coreGainRate - currentGainRate) / coreCost : 0;
    if (coreROI > bestROI) {
      bestROI = coreROI;
      nodeIndex = i;
      type = 'cpu';
      cost = coreCost;
    }
  }

  return { nodeIndex, type, cost, roi: bestROI, levelAmount };
}

function getNewNodeROI(ns: NS, purchaseCost: number): number {
  if (purchaseCost <= 0) return 0;
  const multipliers = ns.getHacknetMultipliers();
  const gainRate = ns.formulas.hacknetNodes.moneyGainRate(1, 1, 1, multipliers.production);
  return gainRate / purchaseCost;
}

function performUpgrade(hacknet: Hacknet, nodeIndex: number, type: UpgradeType, levelAmount: number): boolean {
  try {
    if (type === 'ram') {
      return hacknet.upgradeRam(nodeIndex, 1);
    }
    if (type === 'level') {
      return hacknet.upgradeLevel(nodeIndex, levelAmount);
    }
    if (type === 'cpu') {
      return hacknet.upgradeCore(nodeIndex, 1);
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Optimizes HackNet node upgrades and purchases.
 */
export async function main(ns: NS): Promise<void> {
  const numLevels = (ns.args[0] as number | undefined) ?? DEFAULT_NUM_LEVELS;
  const budgetPct = (ns.args[1] as number | undefined) ?? DEFAULT_BUDGET_PCT;
  ns.tprint(`hacknet-opt v2 loaded with numLevels=${numLevels}, budgetPct=${budgetPct}%`); // Remove after confirming sync works

  let hacknetMoneyEarned: number;
  let hacknetMoneySpent: number;
  let spendingMax: number;
  ({
    sinceInstall: { hacknet: hacknetMoneyEarned, hacknet_expenses: hacknetMoneySpent },
  } = await ns.getMoneySources());
  let currentMoney = ns.getPlayer().money;

  const { hacknet } = ns;
  const maxNodes = hacknet.maxNumNodes();

  // Buy first node promptly when starting fresh
  if (hacknetMoneyEarned === 0 && hacknetMoneySpent === 0) {
    const purchaseCost = hacknet.getPurchaseNodeCost();
    if (currentMoney >= purchaseCost) {
      try {
        hacknet.purchaseNode();
      } catch {
        // Will retry in main loop
      }
    }
  }

  while (true) {
    ({
      sinceInstall: { hacknet: hacknetMoneyEarned, hacknet_expenses: hacknetMoneySpent },
    } = await ns.getMoneySources());
    currentMoney = ns.getPlayer().money;
    let wasItemPurchased = false;
    // hacknet_expenses is stored as negative (outflow); treat as positive amount spent
    const spent = Math.abs(hacknetMoneySpent);
    // Both modes: overall spending must not exceed earned. Budget left = earned - spent, scaled by budgetPct.
    spendingMax = Math.max(0, hacknetMoneyEarned - spent) * (budgetPct / 100);
    const purchaseNodeCost = hacknet.getPurchaseNodeCost();
    const numNodes = hacknet.numNodes();

    const useROI = hasFormulas(ns);
    const bestUpgrade = useROI ? findBestROIUpgrade(ns, hacknet, numLevels) : findCheapestUpgrade(hacknet, numLevels);

    const canBuyNewNode = numNodes < maxNodes && purchaseNodeCost <= spendingMax && currentMoney >= purchaseNodeCost;

    const upgradeCost = bestUpgrade.cost;
    const canUpgrade =
      bestUpgrade.type !== null &&
      bestUpgrade.nodeIndex !== null &&
      upgradeCost <= spendingMax &&
      currentMoney >= upgradeCost;

    // New node vs upgrade: pick better ROI when both available (requires Formulas)
    let shouldBuyNode = false;
    if (canBuyNewNode && canUpgrade && useROI) {
      const newNodeROI = getNewNodeROI(ns, purchaseNodeCost);
      const upgradeROI = bestUpgrade.roi;
      shouldBuyNode = newNodeROI >= upgradeROI;
    } else if (canBuyNewNode) {
      shouldBuyNode = true;
    }

    if (shouldBuyNode) {
      try {
        hacknet.purchaseNode();
        ns.print(`HackNet node purchased for $${ns.format.number(purchaseNodeCost)}`);
        wasItemPurchased = true;
      } catch {
        // Purchase failed, will retry next iteration
      }
    } else if (canUpgrade && bestUpgrade.type && bestUpgrade.nodeIndex !== null) {
      const levelAmt = bestUpgrade.levelAmount ?? numLevels;
      const success = performUpgrade(hacknet, bestUpgrade.nodeIndex, bestUpgrade.type, levelAmt);
      if (success) {
        const levelLabel = bestUpgrade.type === 'level' ? `level +${levelAmt}` : bestUpgrade.type;
        ns.print(`${localISOString()} Upgrading HackNet ${levelLabel} for $${ns.format.number(upgradeCost)}`);
        wasItemPurchased = true;
      }
    } else {
      // Nothing affordable this iteration - log next planned action and sleep
      const isTrulyMaxed = numNodes >= maxNodes && bestUpgrade.type === null;

      if (isTrulyMaxed) {
        ns.tprint(`HackNet maxed - no further purchases planned.`);
      } else {
        const nextIsNewNode =
          numNodes < maxNodes &&
          (bestUpgrade.type === null ||
            (useROI ? getNewNodeROI(ns, purchaseNodeCost) >= bestUpgrade.roi : purchaseNodeCost <= upgradeCost));
        if (nextIsNewNode) {
          ns.print(`Next planned: new node for $${ns.format.number(purchaseNodeCost)}`);
        } else if (bestUpgrade.type !== null && bestUpgrade.nodeIndex !== null) {
          const nextLevelLabel =
            bestUpgrade.type === 'level' ? `level +${bestUpgrade.levelAmount ?? numLevels}` : bestUpgrade.type;
          ns.print(
            `Next planned: node ${bestUpgrade.nodeIndex} ${nextLevelLabel} upgrade for $${ns.format.number(upgradeCost)}`,
          );
        } else {
          ns.print(`Next planned: new node for $${ns.format.number(purchaseNodeCost)}`);
        }
        ns.print(
          `  (spending budget: $${ns.format.number(spendingMax)}, earned $${ns.format.number(hacknetMoneyEarned)}, spent $${ns.format.number(spent)})`,
        );
      }

      const sleepLonger = isTrulyMaxed;
      await ns.sleep(wasItemPurchased ? PURCHASE_COOLDOWN_MS : sleepLonger ? NOTHING_TO_DO_SLEEP_MS : IDLE_SLEEP_MS);
      continue;
    }

    await ns.sleep(wasItemPurchased ? PURCHASE_COOLDOWN_MS : IDLE_SLEEP_MS);
  }
}

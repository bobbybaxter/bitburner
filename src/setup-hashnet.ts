//
import { NS, Server } from '@ns';
import { art } from '/helpers/art';
import { rankHackTargetsByScore } from '/helpers/hack-target-score.js';
import { hms } from '/helpers/hms';
import { numPad } from '/helpers/num-pad';

export async function main(ns: NS) {
  ns.disableLog('ALL');
  const colorPalette = {
    money: 246,
    titles: 231,
    titlebar: 231,
    htitlebar: 231,
    mhash: 208,
    chash: 231,
    hashrate: 231,
    runtime: 246,
    starttime: 231,
    currenttime: 231,
    level: 231,
    cores: 231,
    ram: 231,
    usedram: 1,
    dollars: 231,
    funds: 231,
    tech: 231,
    minsec: 231,
    maxmon: 231,
    study: 231,
    train: 231,
    pnodes: 231,
    lnodes: 231,
    rnodes: 231,
    cnodes: 231,
    cashelevel: 231,
    companyfavor: 231,
  };
  function scanner(a: string[]) {
    const servers = new Set(a);
    for (const server of servers) {
      for (const connectedServer of ns.scan(server)) {
        if (ns.getServer(connectedServer).purchasedByPlayer) continue;
        if (ns.getServerMaxMoney(connectedServer) < 1) continue;
        servers.add(connectedServer);
      }
    }
    return Array.from(servers);
  }
  const choices = scanner(['home']);
  choices.shift(); // removes home from list
  let nodePurchases = 0;
  let levelUpgrades = 0;
  let ramUpgrades = 0;
  let coreUpgrades = 0;
  let cacheLvlUpgrades = 0;
  let studyingImproved = 0;
  let hashMoney = 0;
  let trainingImproved = 0;
  let hashCorpFund = 0;
  let redMinSec = 0;
  let incMaxMon = 0;
  let hashCorpTech = 0;
  let hashCompanyFavor = 0;

  const scriptStartTime = new Date();
  const hashStudyPerms = await ns.prompt('Use "Improve Studying" auto upgrade?');
  const hashGymPerms = await ns.prompt('Use "Improve Gym Training" auto upgrade?');
  const hashCorpPerms = ns.corporation.hasCorporation()
    ? await ns.prompt('Use "Sell for Corporation Funds" auto upgrade?')
    : false;
  const hashCorpTechPerms = ns.corporation.hasCorporation()
    ? await ns.prompt('Use "Exchange for Corporation Research" auto upgrade?')
    : false;
  const hashBladeburnerSpPerms = await ns.prompt('Use "Exchange for Bladeburner SP" auto upgrade?');
  const hashBladeburnerRankPerms = await ns.prompt('Use "Exchange for Bladeburner Rank" auto upgrade?');
  const hashServerMinSecPerms = await ns.prompt('Use "Reduce Minimum Security" auto upgrade?');
  const hashServerIncMaxMon = await ns.prompt('Use "Increase Maximum Money" auto upgrade?');
  const targetChoices = ['all', ...choices];
  const initialRankedTargets = rankHackTargetsByScore(ns, choices);
  const target =
    hashServerMinSecPerms || hashServerIncMaxMon
      ? await ns.prompt('Choose a target', { type: 'select', choices: targetChoices })
      : (initialRankedTargets[0] ?? 'n00dles');
  const sellForMoneyRateChoices = ['10% (default)', '25%', '50%', '75%'] as const;
  const sellForMoneyRateChoice = (await ns.prompt('Choose Sell for Money Rate', {
    type: 'select',
    choices: [...sellForMoneyRateChoices],
  })) as (typeof sellForMoneyRateChoices)[number];
  const sellForMoneyRateByChoice: Record<(typeof sellForMoneyRateChoices)[number], number> = {
    '10% (default)': 0.1,
    '25%': 0.25,
    '50%': 0.5,
    '75%': 0.75,
  };
  const hashCompanyFavorPerms = await ns.prompt('Use "Company Favor" auto upgrade?');
  const hashCompanyFavorTargetChoices = [
    'Bachman & Associates',
    'ECorp',
    'MegaCorp',
    'KuaiGong International',
    'Four Sigma',
    'NWO',
    'Blade Industries',
    'OmniTek Incorporated',
    'Clarke Incorporated',
    'Fulcrum Technologies',
  ];
  const hashCompanyFavorTargetChoice = hashCompanyFavorPerms
    ? ((await ns.prompt('Choose Company Favor Target', {
        type: 'select',
        choices: hashCompanyFavorTargetChoices,
      })) as (typeof hashCompanyFavorTargetChoices)[number])
    : null;
  const hashCompanyFavorTarget = hashCompanyFavorTargetChoice ?? 'Bachman & Associates';
  const sellForMoneyRate = sellForMoneyRateByChoice[sellForMoneyRateChoice] ?? 0.1;
  const loopSleepMs = 100;
  let sellForMoneyHashBudget = 0;
  const serverPerms = await ns.prompt('Auto upgrade Hacknet servers?');
  ns.ui.openTail();

  while (true) {
    ns.ui.resizeTail(375, 475);
    ns.print('clearing log......');
    ns.clearLog();
    const rankedTargets = target === 'all' ? rankHackTargetsByScore(ns, choices) : [target as string];
    const resolvedMaxMoneyTarget = rankedTargets[0] ?? 'n00dles';
    const resolvedMaxMoneyServer = ns.getServer(resolvedMaxMoneyTarget) as Server;
    const resolvedMinSecTarget =
      rankedTargets.find(() => (resolvedMaxMoneyServer?.minDifficulty ?? 1) > 1) ?? resolvedMaxMoneyTarget;
    const resolvedMinSecServer = ns.getServer(resolvedMinSecTarget) as Server;
    const targetMinSec = resolvedMinSecServer?.minDifficulty ?? 0;
    const targetMaxMon = resolvedMaxMoneyServer?.moneyMax ?? 0;
    ns.print(art('-------Script Stats--------', { color: colorPalette.titlebar }));
    ns.print(`Script start: ${art(scriptStartTime.toLocaleString(), { color: colorPalette.starttime })}`);
    const scriptCurrentTime = new Date();
    ns.print(`Current time: ${art(scriptCurrentTime.toLocaleString(), { color: colorPalette.currenttime })}`);
    const runtime = Date.now() - scriptStartTime.getTime();
    if (runtime >= 86400 * 1e3) {
      colorPalette.runtime = 200;
    } else if (runtime >= 36000 * 1e3) {
      colorPalette.runtime = 196;
    } else if (runtime >= 18000 * 1e3) {
      colorPalette.runtime = 208;
    } else if (runtime >= 3600 * 1e3) {
      colorPalette.runtime = 3;
    } else if (runtime >= 600 * 1e3) {
      colorPalette.runtime = 2;
    }
    ns.print(`Script runtime: ${art(hms(runtime), { color: colorPalette.runtime })}`);
    const rate = [];
    for (let i = 0; i < ns.hacknet.numNodes(); i++) rate.push(ns.hacknet.getNodeStats(i).production);
    function sum(total: number, num: number) {
      return total + num;
    }
    let productionRate;
    if (ns.hacknet.numNodes() > 0) {
      productionRate = rate.reduce(sum);
    } else {
      productionRate = 0;
    }
    const pMoney = ns.getPlayer().money;
    if (pMoney > 1e15) {
      colorPalette.money = 200;
    } else if (pMoney > 1e12) {
      colorPalette.money = 196;
    } else if (pMoney > 1e9) {
      colorPalette.money = 208;
    } else if (pMoney > 1e6) {
      colorPalette.money = 3;
    } else if (pMoney > 1e3) {
      colorPalette.money = 2;
    }
    if (pMoney > 1e33) {
      colorPalette.money = 231;
    }
    ns.print(`Money:  ${art('$' + ns.format.number(pMoney), { color: colorPalette.money })}`);
    ns.print(
      `Hashes: ${art(ns.format.number(ns.hacknet.numHashes()), { color: colorPalette.chash })} / ${art(ns.format.number(ns.hacknet.hashCapacity()), { color: colorPalette.mhash })}`,
    );
    if (ns.hacknet.numNodes() > 0)
      ns.print(
        `Total Hashnet Production: ${art(ns.format.number(productionRate), { color: colorPalette.hashrate })} h / s`,
      );
    ns.print(`Sell for Money rate: ${ns.format.percent(sellForMoneyRate)} of production`);
    const sellForMoneyCost = ns.hacknet.hashCost('Sell for Money');
    const targetSellHashesPerSecond = productionRate * sellForMoneyRate;
    sellForMoneyHashBudget += targetSellHashesPerSecond * (loopSleepMs / 1e3);
    const targetSellPurchases = Math.floor(sellForMoneyHashBudget / sellForMoneyCost);
    let actualSellPurchases = 0;
    for (let i = 0; i < targetSellPurchases; i++) {
      if (!ns.hacknet.spendHashes('Sell for Money')) break;
      hashMoney++;
      actualSellPurchases++;
    }
    sellForMoneyHashBudget -= actualSellPurchases * sellForMoneyCost;
    const maxHash = ns.hacknet.hashCapacity();

    let budget = Math.floor(maxHash * 0.25);
    const reduceMinSecCost = ns.hacknet.hashCost('Reduce Minimum Security');
    if (budget > reduceMinSecCost && targetMinSec && targetMinSec > 1 && hashServerMinSecPerms) {
      if (ns.hacknet.spendHashes('Reduce Minimum Security', resolvedMinSecTarget)) {
        redMinSec++;
        budget -= reduceMinSecCost;
      }
    }

    const incMaxMoneyCost = ns.hacknet.hashCost('Increase Maximum Money');
    if (budget > incMaxMoneyCost && hashServerIncMaxMon) {
      if (ns.hacknet.spendHashes('Increase Maximum Money', resolvedMaxMoneyTarget)) {
        incMaxMon++;
        budget -= incMaxMoneyCost;
      }
    }

    const improveStudyingCost = ns.hacknet.hashCost('Improve Studying');
    if (budget > improveStudyingCost && hashStudyPerms) {
      if (ns.hacknet.spendHashes('Improve Studying')) {
        studyingImproved++;
        budget -= improveStudyingCost;
      }
    }

    const improveGymTrainingCost = ns.hacknet.hashCost('Improve Gym Training');
    if (budget > improveGymTrainingCost && hashGymPerms) {
      if (ns.hacknet.spendHashes('Improve Gym Training')) {
        trainingImproved++;
        budget -= improveGymTrainingCost;
      }
    }

    const corpFundsCost = ns.hacknet.hashCost('Sell for Corporation Funds');
    if (budget > corpFundsCost && ns.corporation.hasCorporation() && hashCorpPerms) {
      if (ns.hacknet.spendHashes('Sell for Corporation Funds')) {
        hashCorpFund++;
        budget -= corpFundsCost;
      }
    }

    const corpResearchCost = ns.hacknet.hashCost('Exchange for Corporation Research');
    if (budget > corpResearchCost && ns.corporation.hasCorporation() && hashCorpTechPerms) {
      if (ns.hacknet.spendHashes('Exchange for Corporation Research')) {
        hashCorpTech++;
        budget -= corpResearchCost;
      }
    }

    const bladeburnerSpCost = ns.hacknet.hashCost('Exchange for Bladeburner SP');
    if (budget > bladeburnerSpCost && hashBladeburnerSpPerms) {
      if (ns.hacknet.spendHashes('Exchange for Bladeburner SP')) {
        budget -= bladeburnerSpCost;
      }
    }

    const bladeburnerRankCost = ns.hacknet.hashCost('Exchange for Bladeburner Rank');
    if (budget > bladeburnerRankCost && hashBladeburnerRankPerms) {
      if (ns.hacknet.spendHashes('Exchange for Bladeburner Rank')) {
        budget -= bladeburnerRankCost;
      }
    }

    const companyFavorCost = ns.hacknet.hashCost('Company Favor');
    if (budget > companyFavorCost && hashCompanyFavorPerms) {
      if (ns.hacknet.spendHashes('Company Favor', hashCompanyFavorTarget)) {
        hashCompanyFavor++;
        budget -= companyFavorCost;
      }
    }

    if (ns.hacknet.numNodes() < 1) {
      if (ns.getPlayer().money > ns.hacknet.getPurchaseNodeCost()) {
        ns.hacknet.purchaseNode();
        nodePurchases++;
      } else {
        ns.print('Not enough money for first hacknet server.');
      }
    } else {
      for (let i = 0; i < ns.hacknet.numNodes(); i++) {
        if (ns.getPlayer().money > ns.hacknet.getLevelUpgradeCost(i, 1) && serverPerms) {
          ns.hacknet.upgradeLevel(i, 1);
          levelUpgrades++;
        } else if (ns.getPlayer().money > ns.hacknet.getRamUpgradeCost(i, 1) && serverPerms) {
          ns.hacknet.upgradeRam(i, 1);
          ramUpgrades++;
        } else if (ns.getPlayer().money > ns.hacknet.getCoreUpgradeCost(i, 1) && serverPerms) {
          ns.hacknet.upgradeCore(i, 1);
          coreUpgrades++;
        } else if (
          ns.getPlayer().money > ns.hacknet.getCacheUpgradeCost(i, 1) &&
          (ns.hacknet.getNodeStats(i).hashCapacity ?? 0) < 3.2e4 &&
          serverPerms
        ) {
          ns.hacknet.upgradeCache(i, 1);
          cacheLvlUpgrades++;
        }
      }

      if (
        ns.getPlayer().money > ns.hacknet.getPurchaseNodeCost() &&
        ns.hacknet.numNodes() < ns.hacknet.maxNumNodes() &&
        serverPerms
      ) {
        ns.hacknet.purchaseNode();
        nodePurchases++;
      }
    }
    if (hashStudyPerms) ns.print(`Current study mult: ${ns.format.percent(ns.hacknet.getStudyMult() - 1)}`);
    if (hashGymPerms) ns.print(`Current training mult: ${ns.format.percent(ns.hacknet.getTrainingMult() - 1)}`);
    if (hashServerMinSecPerms) ns.print(`${resolvedMinSecTarget}'s MinSec: ${ns.format.number(targetMinSec ?? 0)}`);
    if (hashServerIncMaxMon)
      ns.print(`${resolvedMaxMoneyTarget}'s Max Server$: ${'$' + ns.format.number(targetMaxMon ?? 0)}`);
    if (
      hashMoney > 0 ||
      hashCorpFund > 0 ||
      hashCorpTech > 0 ||
      redMinSec > 0 ||
      incMaxMon > 0 ||
      studyingImproved > 0 ||
      trainingImproved > 0 ||
      nodePurchases > 0 ||
      levelUpgrades > 0 ||
      ramUpgrades > 0 ||
      coreUpgrades > 0 ||
      cacheLvlUpgrades > 0
    )
      ns.print(art('-------Since launch--------', { color: colorPalette.titlebar }));
    if (
      hashMoney > 0 ||
      hashCorpFund > 0 ||
      hashCorpTech > 0 ||
      redMinSec > 0 ||
      incMaxMon > 0 ||
      studyingImproved > 0 ||
      trainingImproved > 0
    )
      ns.print(art('Hash purchases:', { color: colorPalette.titles }));
    if (hashMoney > 0)
      ns.print(`${art('$' + ns.format.number(hashMoney * 1e6), { color: colorPalette.dollars })} dollars`);
    if (hashCorpFund > 0)
      ns.print(`${art('$' + ns.format.number(hashCorpFund * 1e9), { color: colorPalette.funds })} corp funds`);
    if (hashCorpTech > 0)
      ns.print(`${art(ns.format.number(hashCorpTech * 1e3), { color: colorPalette.tech })} Scientific Research`);
    if (redMinSec > 0)
      ns.print(`${art(numPad(redMinSec, 3), { color: colorPalette.minsec })} Min Security Reduction(s)`);
    if (incMaxMon > 0) ns.print(`${art(numPad(incMaxMon, 3), { color: colorPalette.maxmon })} Max Money Increase(s)`);
    ns.print(`${art(numPad(studyingImproved, 3), { color: colorPalette.study })} studying multiplier(s)`);
    if (trainingImproved > 0)
      ns.print(`${art(numPad(trainingImproved, 3), { color: colorPalette.train })} training multiplier(s)`);
    if (hashCompanyFavor > 0)
      ns.print(`${art(numPad(hashCompanyFavor ?? 0, 3), { color: colorPalette.companyfavor })} company favor(s)`);
    if (nodePurchases > 0 || levelUpgrades > 0 || ramUpgrades > 0 || coreUpgrades > 0 || cacheLvlUpgrades > 0)
      ns.print(art('Hacknet server upgrades bought:', { color: colorPalette.titles }));
    if (nodePurchases > 0) ns.print(`${art(numPad(nodePurchases, 3), { color: colorPalette.pnodes })} server node(s)`);
    if (levelUpgrades > 0)
      ns.print(`${art(numPad(levelUpgrades, 3), { color: colorPalette.lnodes })} level upgrade(s)`);
    if (ramUpgrades > 0) ns.print(`${art(numPad(ramUpgrades, 3), { color: colorPalette.rnodes })} RAM upgrade(s)`);
    if (coreUpgrades > 0) ns.print(`${art(numPad(coreUpgrades, 3), { color: colorPalette.cnodes })} core upgrade(s)`);
    if (cacheLvlUpgrades > 0)
      ns.print(`${art(numPad(cacheLvlUpgrades, 3), { color: colorPalette.cashelevel })} cache lvl upgrade(s)`);
    await ns.sleep(loopSleepMs);
  }
}

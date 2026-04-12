// TODO: refactor this file, separating into multiple files
// TODO: make all rounds idempotent
//

import { AutocompleteData, CityName, CorpIndustryData, Material, NS, Product } from '@ns';
import {
  NetscriptExtension,
  NetscriptFlags,
  NetscriptFlagsSchema,
  parseAutoCompleteDataFromDefaultConfig,
} from '/libs/NetscriptExtension';
import { exposeInternalGameObjects } from './exploits';
import { corporationEventLogger } from './helpers/corpo/corporation-event-logger';
import {
  CorpState,
  DivisionResearches,
  getMaxAffordableAdVertLevel,
  getMaxAffordableOfficeSize,
  getMaxAffordableUpgradeLevel,
  getMaxAffordableWarehouseLevel,
  getOfficeUpgradeCost,
  IndustryType,
  MaterialName,
  OfficeSetup,
  ResearchName,
  UnlockName,
  UpgradeName,
} from './helpers/corpo/corporation-formulas';
import {
  BalancingModifierForProfitProgress,
  CorporationOptimizer,
  defaultPerformanceModifierForOfficeBenchmark,
  OfficeBenchmarkSortType,
  precalculatedEmployeeRatioForProductDivisionRound3,
  precalculatedEmployeeRatioForProductDivisionRound4,
  precalculatedEmployeeRatioForProductDivisionRound5_1,
  precalculatedEmployeeRatioForProductDivisionRound5_2,
  precalculatedEmployeeRatioForProfitSetupOfRound3,
  precalculatedEmployeeRatioForProfitSetupOfRound4,
  precalculatedEmployeeRatioForSupportDivisions,
} from './helpers/corpo/corporation-optimizer';
import { optimizeOffice } from './helpers/corpo/corporation-optimizer-tools';
import * as testingTools from './helpers/corpo/corporation-testing-tools';
import {
  assignJobs,
  buyAdvert,
  buyBoostMaterials,
  buyTeaAndThrowParty,
  buyTeaAndThrowPartyForAllDivisions,
  buyUnlock,
  buyUpgrade,
  cities,
  clearPurchaseOrders,
  createDivision,
  createDummyDivisions,
  developNewProduct,
  DivisionName,
  exportString,
  findOptimalAmountOfBoostMaterials,
  generateMaterialsOrders,
  generateOfficeSetupsForEarlyRounds,
  getDivisionResearches,
  getIndustryData,
  getProductIdArray,
  getProductMarketPrice,
  getProfit,
  hasDivision,
  Logger,
  researchPrioritiesForProductDivision,
  researchPrioritiesForSupportDivision,
  sampleProductName,
  stockMaterials,
  upgradeOffices,
  upgradeWarehouse,
  waitForNextTimeStateHappens,
  waitForNumberOfCycles,
  waitForOffer,
  waitUntilHavingEnoughResearchPoints,
} from './helpers/corpo/corporation-utils';
import { Do } from './helpers/do';

export function autocomplete(data: AutocompleteData, _flags: string[]): string[] {
  return parseAutoCompleteDataFromDefaultConfig(data, defaultConfig);
}

interface Round1Option {
  agricultureOfficeSize: number;
  waitForAgricultureRP: number;
  boostMaterialsRatio: number;
}

const PrecalculatedRound1Option = {
  // 1498 - 61.344e9 - 504.8e9 - 443.456e9 - 4.89m/s - 17.604b/h
  OPTION1: <Round1Option>{
    agricultureOfficeSize: 3,
    waitForAgricultureRP: 55,
    boostMaterialsRatio: 0.89,
    // boostMaterialsRatio: 0.88 // Smart Supply - Advert 1
  },
  // 1649 - 51.46e9 - 557.1e9 - 505.64e9 - 5.381m/s - 19.371b/h
  OPTION2: <Round1Option>{
    agricultureOfficeSize: 4,
    waitForAgricultureRP: 55,
    boostMaterialsRatio: 0.86,
    // boostMaterialsRatio: 0.84 // Smart Supply
  },
  // 1588 - 42.704e9 - 536.8e9 - 494.096e9 - 5.176m/s - 18.633b/h
  OPTION3: <Round1Option>{
    agricultureOfficeSize: 5,
    waitForAgricultureRP: 55,
    boostMaterialsRatio: 0.84,
  },
  // 1441 - 34.13e9 - 487.5e9 - 453.37e9 - 4.694m/s - 16.898b/h
  OPTION4: <Round1Option>{
    agricultureOfficeSize: 6,
    waitForAgricultureRP: 55,
    boostMaterialsRatio: 0.815,
  },
} as const;

interface Round2Option {
  agricultureOfficeSize: number;
  increaseBusiness: boolean;
  waitForAgricultureRP: number;
  waitForChemicalRP: number;
  agricultureBoostMaterialsRatio: number;
}

const PrecalculatedRound2Option = {
  // 15.266e12 17282 804.175
  OPTION1: <Round2Option>{
    agricultureOfficeSize: 8, // 3-1-1-3
    increaseBusiness: false,
    waitForAgricultureRP: 903,
    waitForChemicalRP: 516,
    agricultureBoostMaterialsRatio: 0.75,
  },
  // 14.57e12 16485 815.188
  OPTION2: <Round2Option>{
    agricultureOfficeSize: 8,
    increaseBusiness: true,
    waitForAgricultureRP: 703,
    waitForChemicalRP: 393,
    agricultureBoostMaterialsRatio: 0.76,
  },
  // 14.474e12
  OPTION3: <Round2Option>{
    agricultureOfficeSize: 8,
    increaseBusiness: true,
    waitForAgricultureRP: 653,
    waitForChemicalRP: 362,
    agricultureBoostMaterialsRatio: 0.755,
  },
  // 13.994e12
  OPTION4: <Round2Option>{
    agricultureOfficeSize: 8,
    increaseBusiness: true,
    waitForAgricultureRP: 602,
    waitForChemicalRP: 331,
    agricultureBoostMaterialsRatio: 0.74,
  },
  // 13.742e12
  OPTION5: <Round2Option>{
    agricultureOfficeSize: 8, // 2-1-3-2
    increaseBusiness: true,
    waitForAgricultureRP: 602,
    waitForChemicalRP: 331,
    agricultureBoostMaterialsRatio: 0.77,
  },
  // 13.425e12
  OPTION6: <Round2Option>{
    agricultureOfficeSize: 8,
    increaseBusiness: true,
    waitForAgricultureRP: 551,
    waitForChemicalRP: 300,
    agricultureBoostMaterialsRatio: 0.71,
  },
  // 13.7e12
  OPTION7: <Round2Option>{
    agricultureOfficeSize: 8, // 2-1-3-2
    increaseBusiness: true,
    waitForAgricultureRP: 551,
    waitForChemicalRP: 300,
    agricultureBoostMaterialsRatio: 0.77,
  },
  // 13.6e12
  OPTION8: <Round2Option>{
    agricultureOfficeSize: 8, // 2-1-3-2
    increaseBusiness: true,
    waitForAgricultureRP: 500,
    waitForChemicalRP: 269,
    agricultureBoostMaterialsRatio: 0.77,
  },
  // 13e12
  OPTION9: <Round2Option>{
    agricultureOfficeSize: 8, // 2-1-3-2
    increaseBusiness: true,
    waitForAgricultureRP: 450,
    waitForChemicalRP: 238,
    agricultureBoostMaterialsRatio: 0.73,
  },
  // 10.884e12
  OPTION10: <Round2Option>{
    agricultureOfficeSize: 8, // 2-1-3-2
    increaseBusiness: true,
    waitForAgricultureRP: 302,
    waitForChemicalRP: 148,
    agricultureBoostMaterialsRatio: 0.61,
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Round3Option {}

const PrecalculatedRound3Option = {
  OPTION1: <Round3Option>{},
} as const;

const defaultBudgetRatioForSupportDivision = {
  warehouse: 0.1,
  office: 0.9,
};

const defaultBudgetRatioForProductDivision = {
  rawProduction: 1 / 23,
  wilsonAdvert: 4 / 23,
  office: 8 / 23,
  employeeStatUpgrades: 8 / 23,
  salesBot: 1 / 23,
  projectInsight: 1 / 23,
};

const budgetRatioForProductDivisionWithoutAdvert = {
  rawProduction: 1 / 19,
  wilsonAdvert: 0,
  office: 8 / 19,
  employeeStatUpgrades: 8 / 19,
  salesBot: 1 / 19,
  projectInsight: 1 / 19,
};

const maxRerunWhenOptimizingOfficeForProductDivision = 0;

const usePrecalculatedEmployeeRatioForSupportDivisions = true;

const usePrecalculatedEmployeeRatioForProfitSetup = true;

const usePrecalculatedEmployeeRatioForProductDivision = true;

const maxNumberOfProductsInRound3 = 1;

const maxNumberOfProductsInRound4 = 2;

const thresholdOfFocusingOnAdvert = 0;

// WIP
const useAdvancedStrategy = false;

let ns: NS;
let nsx: NetscriptExtension;
let config: NetscriptFlags;
let enableTestingTools: boolean = false;
let mainProductDevelopmentCity: CityName;
let supportProductDevelopmentCities: CityName[];
let agricultureIndustryData: CorpIndustryData;
let chemicalIndustryData: CorpIndustryData;
let tobaccoIndustryData: CorpIndustryData;
let budgetRatioForProductDivision = defaultBudgetRatioForProductDivision;
const corporationSaveModeFile = '/tmp/corporation-save-mode.txt';

const defaultConfig: NetscriptFlagsSchema = [
  ['benchmark', false],
  ['auto', false],
  ['selfFund', false],
  ['wilsonCap', 15],
  ['round1', false],
  ['round2', false],
  ['round3', false],
  ['improveAllDivisions', false],
  ['test', false],
  ['help', false],
];

function init(nsContext: NS): void {
  ns = nsContext;
  nsx = new NetscriptExtension(ns);
  mainProductDevelopmentCity = ns.enums.CityName.Sector12;
  supportProductDevelopmentCities = Object.values(ns.enums.CityName).filter(
    (cityName) => cityName !== mainProductDevelopmentCity,
  );
}

function getConfiguredWilsonCap(): number {
  const rawCap = Number(config.wilsonCap);
  if (!Number.isFinite(rawCap) || rawCap < 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(rawCap);
}

function toRnDOnlyOfficeSetups(officeSetups: OfficeSetup[]): OfficeSetup[] {
  return officeSetups.map((officeSetup) => ({
    city: officeSetup.city,
    size: officeSetup.size,
    jobs: {
      Operations: 0,
      Engineer: 0,
      Business: 0,
      Management: 0,
      'Research & Development': officeSetup.size,
      Intern: 0,
    },
  }));
}

async function waitUntilHavingEnoughResearchPointsWithRnDStaffing(
  conditions: {
    divisionName: string;
    researchPoint: number;
  }[],
  officeSetupsToRestore: {
    divisionName: string;
    officeSetups: OfficeSetup[];
  }[],
): Promise<void> {
  ns.print('Assigning all employees to R&D before waiting for research points...');
  for (const item of officeSetupsToRestore) {
    await assignJobs(ns, item.divisionName, toRnDOnlyOfficeSetups(item.officeSetups));
  }
  try {
    await waitUntilHavingEnoughResearchPoints(ns, conditions);
  } finally {
    ns.print('Restoring employee job setups after RP wait...');
    for (const item of officeSetupsToRestore) {
      await assignJobs(ns, item.divisionName, item.officeSetups);
    }
  }
}

async function round1(option?: Round1Option): Promise<void> {
  option ??= config.selfFund ? PrecalculatedRound1Option.OPTION2 : PrecalculatedRound1Option.OPTION1;
  ns.print(`Round 1 options: ${JSON.stringify(option)}`);

  // Create Agriculture division
  await createDivision(ns, DivisionName.AGRICULTURE, option.agricultureOfficeSize, 1);
  ns.print('Setting up sell orders for Agriculture (Plants + Food)...');
  for (const city of cities) {
    await Do(ns, 'ns.corporation.sellMaterial', DivisionName.AGRICULTURE, city, MaterialName.PLANTS, 'MAX', 'MP');
    await Do(ns, 'ns.corporation.sellMaterial', DivisionName.AGRICULTURE, city, MaterialName.FOOD, 'MAX', 'MP');
  }

  if (enableTestingTools && config.auto === false) {
    testingTools.setEnergyAndMorale(DivisionName.AGRICULTURE, 100, 100);
    testingTools.setResearchPoints(DivisionName.AGRICULTURE, option.waitForAgricultureRP);
  }

  ns.print('Buying tea and throwing party for Agriculture...');
  await buyTeaAndThrowParty(ns, DivisionName.AGRICULTURE);

  ns.print('Buying AdVert for Agriculture (level 2)...');
  await buyAdvert(ns, DivisionName.AGRICULTURE, 2);

  ns.print('Optimizing storage and factory upgrades...');
  const optimizerBudget = Math.max(
    ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>).funds,
    0,
  );

  const dataArray = new CorporationOptimizer().optimizeStorageAndFactory(
    agricultureIndustryData,
    ((await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.SMART_STORAGE)) ?? 0) as number,
    (
      (await Do(ns, 'ns.corporation.getWarehouse', DivisionName.AGRICULTURE, ns.enums.CityName.Sector12)) as ReturnType<
        NS['corporation']['getWarehouse']
      >
    ).level,
    (await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.SMART_FACTORIES)) as number,
    await getDivisionResearches(ns, DivisionName.AGRICULTURE),
    optimizerBudget,
    false,
  );

  if (dataArray.length === 0) {
    ns.print('No storage/factory optimization possible with current budget.');
  } else {
    const optimalData = dataArray[dataArray.length - 1];
    ns.print(
      `Buying Smart Storage (lvl ${optimalData.smartStorageLevel}) and Smart Factories (lvl ${optimalData.smartFactoriesLevel})...`,
    );
    await buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
    await buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
    ns.print(`Upgrading warehouses for Agriculture (lvl ${optimalData.warehouseLevel})...`);
    for (const city of cities) {
      await upgradeWarehouse(ns, DivisionName.AGRICULTURE, city, optimalData.warehouseLevel);
    }
  }

  await waitUntilHavingEnoughResearchPointsWithRnDStaffing(
    [
      {
        divisionName: DivisionName.AGRICULTURE,
        researchPoint: option.waitForAgricultureRP,
      },
    ],
    [
      {
        divisionName: DivisionName.AGRICULTURE,
        officeSetups: generateOfficeSetupsForEarlyRounds(option.agricultureOfficeSize, false),
      },
    ],
  );

  ns.print('Calculating optimal boost materials for Agriculture...');
  const optimalAmountOfBoostMaterials = await findOptimalAmountOfBoostMaterials(
    ns,
    DivisionName.AGRICULTURE,
    agricultureIndustryData,
    ns.enums.CityName.Sector12,
    true,
    option.boostMaterialsRatio,
  );
  ns.print('Stocking boost materials for Agriculture...');
  await stockMaterials(
    ns,
    DivisionName.AGRICULTURE,
    generateMaterialsOrders(cities, [
      { name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterials[0] },
      { name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterials[1] },
      { name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterials[2] },
      { name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterials[3] },
    ]),
  );

  if (config.auto === true) {
    // Wait a few cycles for production to stabilize, then check revenue
    await waitForNumberOfCycles(ns, 5);
    let agricultureRev = (
      (await Do(ns, 'ns.corporation.getDivision', DivisionName.AGRICULTURE)) as ReturnType<
        NS['corporation']['getDivision']
      >
    ).lastCycleRevenue;

    if (agricultureRev === 0) {
      ns.print('WARNING: Agriculture has no revenue. Clearing boost material orders and waiting for production...');
      await clearPurchaseOrders(ns, false);
      for (const city of cities) {
        for (const mat of [
          MaterialName.AI_CORES,
          MaterialName.HARDWARE,
          MaterialName.REAL_ESTATE,
          MaterialName.ROBOTS,
        ]) {
          await Do(ns, 'ns.corporation.sellMaterial', DivisionName.AGRICULTURE, city, mat, 'MAX', 'MP');
        }
      }
      await waitForNumberOfCycles(ns, 10);
      agricultureRev = (
        (await Do(ns, 'ns.corporation.getDivision', DivisionName.AGRICULTURE)) as ReturnType<
          NS['corporation']['getDivision']
        >
      ).lastCycleRevenue;
      if (agricultureRev > 0) {
        ns.print(`Revenue restored: ${ns.formatNumber(agricultureRev)}/cycle. Stopping boost material sell-off.`);
      } else {
        ns.print('WARNING: Still no revenue after clearing boost materials. Proceeding anyway.');
      }
      for (const city of cities) {
        for (const mat of [
          MaterialName.AI_CORES,
          MaterialName.HARDWARE,
          MaterialName.REAL_ESTATE,
          MaterialName.ROBOTS,
        ]) {
          await Do(ns, 'ns.corporation.sellMaterial', DivisionName.AGRICULTURE, city, mat, '0', 'MP');
        }
      }
    }

    const expectedOffer = config.selfFund ? 490e9 : 20e9;
    ns.print(`Waiting for Round 1 investment offer (target: ${ns.formatNumber(expectedOffer)})...`);
    await waitForOffer(ns, 10, 10, expectedOffer);
    const offer1 = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    ns.print(`Round 1: Accept offer: ${ns.formatNumber(offer1.funds)}`);
    await corporationEventLogger.generateOfferAcceptanceEvent(ns);
    await Do(ns, 'ns.corporation.acceptInvestmentOffer');
    await round2();
  }
}

async function round2(option?: Round2Option): Promise<void> {
  option ??= config.selfFund ? PrecalculatedRound2Option.OPTION2 : PrecalculatedRound2Option.OPTION10;
  ns.print(`Round 2 options: ${JSON.stringify(option)}`);

  if (enableTestingTools && config.auto === false) {
    resetStatistics();
    testingTools.setFunds(490e9);
  }

  if (!config.selfFund) {
    const minFundsForRound2 = 50e9;
    let corpFunds = ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>)
      .funds;
    if (corpFunds < minFundsForRound2) {
      const agricultureRev = (
        (await Do(ns, 'ns.corporation.getDivision', DivisionName.AGRICULTURE)) as ReturnType<
          NS['corporation']['getDivision']
        >
      ).lastCycleRevenue;
      if (agricultureRev <= 0) {
        ns.print(
          `WARNING: Funds ${ns.formatNumber(corpFunds)} and no Agriculture revenue. Round 2 setup will likely fail.`,
        );
      } else {
        ns.print(
          `Seed money: funds ${ns.formatNumber(corpFunds)}, revenue ${ns.formatNumber(agricultureRev)}/cycle. ` +
            `Waiting for funds to reach ${ns.formatNumber(minFundsForRound2)}...`,
        );
        const maxWaitCycles = 500;
        let waited = 0;
        let stagnantChecks = 0;
        while (corpFunds < minFundsForRound2 && waited < maxWaitCycles) {
          const prev = corpFunds;
          await waitForNumberOfCycles(ns, 10);
          waited += 10;
          corpFunds = (
            (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
          ).funds;
          if (waited % 50 === 0) {
            ns.print(
              `Funds: ${ns.formatNumber(corpFunds)} (need ${ns.formatNumber(minFundsForRound2)}, ${waited}/${maxWaitCycles} cycles)`,
            );
          }
          if (corpFunds <= prev) {
            stagnantChecks++;
            if (stagnantChecks >= 3) {
              ns.print('WARNING: Funds stagnant over multiple checks. Proceeding with available funds.');
              break;
            }
          } else {
            stagnantChecks = 0;
          }
        }
        if (corpFunds >= minFundsForRound2) {
          ns.print(`Funds reached ${ns.formatNumber(corpFunds)}. Proceeding with round 2.`);
        }
      }
    }
  }

  ns.print('Buying Export unlock...');
  await buyUnlock(ns, UnlockName.EXPORT);

  ns.print(`Upgrading Agriculture offices to size ${option.agricultureOfficeSize}...`);
  await upgradeOffices(
    ns,
    DivisionName.AGRICULTURE,
    generateOfficeSetupsForEarlyRounds(option.agricultureOfficeSize, false),
  );

  // Create Chemical division
  await createDivision(ns, DivisionName.CHEMICAL, 3, 2);
  ns.print('Setting up export routes between Agriculture and Chemical...');
  for (const city of cities) {
    // Export Plants from Agriculture to Chemical
    await Do(
      ns,
      'ns.corporation.cancelExportMaterial',
      DivisionName.AGRICULTURE,
      city,
      DivisionName.CHEMICAL,
      city,
      MaterialName.PLANTS,
    );
    await Do(
      ns,
      'ns.corporation.exportMaterial',
      DivisionName.AGRICULTURE,
      city,
      DivisionName.CHEMICAL,
      city,
      MaterialName.PLANTS,
      exportString,
    );

    // Export Chemicals from Chemical to Agriculture
    await Do(
      ns,
      'ns.corporation.cancelExportMaterial',
      DivisionName.CHEMICAL,
      city,
      DivisionName.AGRICULTURE,
      city,
      MaterialName.CHEMICALS,
    );
    await Do(
      ns,
      'ns.corporation.exportMaterial',
      DivisionName.CHEMICAL,
      city,
      DivisionName.AGRICULTURE,
      city,
      MaterialName.CHEMICALS,
      exportString,
    );
    // Sell Chemicals
    await Do(ns, 'ns.corporation.sellMaterial', DivisionName.CHEMICAL, city, MaterialName.CHEMICALS, 'MAX', 'MP');
  }

  testingTools.setResearchPoints(DivisionName.AGRICULTURE, 55);
  if (enableTestingTools && config.auto === false) {
    testingTools.setEnergyAndMorale(DivisionName.AGRICULTURE, 100, 100);
    testingTools.setEnergyAndMorale(DivisionName.CHEMICAL, 100, 100);
    testingTools.setResearchPoints(DivisionName.AGRICULTURE, option.waitForAgricultureRP);
    testingTools.setResearchPoints(DivisionName.CHEMICAL, option.waitForChemicalRP);
  }

  ns.print('Buying tea and throwing parties for Agriculture and Chemical...');
  await buyTeaAndThrowParty(ns, DivisionName.AGRICULTURE);
  await buyTeaAndThrowParty(ns, DivisionName.CHEMICAL);

  ns.print('Buying Smart Supply unlock...');
  await buyUnlock(ns, UnlockName.SMART_SUPPLY);

  ns.print('Buying AdVert for Agriculture (level 8)...');
  await buyAdvert(ns, DivisionName.AGRICULTURE, 8);

  ns.print('Optimizing storage and factory upgrades...');
  const dataArray = new CorporationOptimizer().optimizeStorageAndFactory(
    agricultureIndustryData,
    ((await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.SMART_STORAGE)) ?? 0) as number,
    // Assume that all warehouses are at the same level
    (
      (await Do(ns, 'ns.corporation.getWarehouse', DivisionName.AGRICULTURE, ns.enums.CityName.Sector12)) as ReturnType<
        NS['corporation']['getWarehouse']
      >
    ).level,
    (await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.SMART_FACTORIES)) as number,
    await getDivisionResearches(ns, DivisionName.AGRICULTURE),
    ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>).funds,
    false,
  );
  if (dataArray.length === 0) {
    throw new Error('Cannot find optimal data');
  }
  const optimalData = dataArray[dataArray.length - 1];

  ns.print(
    `Buying Smart Storage (lvl ${optimalData.smartStorageLevel}) and Smart Factories (lvl ${optimalData.smartFactoriesLevel})...`,
  );
  await buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
  await buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
  ns.print(`Upgrading warehouses for Agriculture (lvl ${optimalData.warehouseLevel})...`);
  for (const city of cities) {
    await upgradeWarehouse(ns, DivisionName.AGRICULTURE, city, optimalData.warehouseLevel);
  }

  await waitUntilHavingEnoughResearchPointsWithRnDStaffing(
    [
      {
        divisionName: DivisionName.AGRICULTURE,
        researchPoint: option.waitForAgricultureRP,
      },
      {
        divisionName: DivisionName.CHEMICAL,
        researchPoint: option.waitForChemicalRP,
      },
    ],
    [
      {
        divisionName: DivisionName.AGRICULTURE,
        officeSetups: generateOfficeSetupsForEarlyRounds(option.agricultureOfficeSize, option.increaseBusiness),
      },
      {
        divisionName: DivisionName.CHEMICAL,
        officeSetups: generateOfficeSetupsForEarlyRounds(3),
      },
    ],
  );

  ns.print('Buying additional AdVert for Agriculture...');
  await buyAdvert(
    ns,
    DivisionName.AGRICULTURE,
    getMaxAffordableAdVertLevel(
      (await Do(ns, 'ns.corporation.getHireAdVertCount', DivisionName.AGRICULTURE)) as number,
      ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>).funds,
    ),
  );

  ns.print('Calculating optimal boost materials for Agriculture and Chemical...');
  const optimalAmountOfBoostMaterialsForAgriculture = await findOptimalAmountOfBoostMaterials(
    ns,
    DivisionName.AGRICULTURE,
    agricultureIndustryData,
    ns.enums.CityName.Sector12,
    true,
    option.agricultureBoostMaterialsRatio,
  );
  const optimalAmountOfBoostMaterialsForChemical = await findOptimalAmountOfBoostMaterials(
    ns,
    DivisionName.CHEMICAL,
    chemicalIndustryData,
    ns.enums.CityName.Sector12,
    true,
    0.95,
  );
  ns.print('Stocking boost materials for Agriculture and Chemical...');
  await Promise.allSettled([
    stockMaterials(
      ns,
      DivisionName.AGRICULTURE,
      generateMaterialsOrders(cities, [
        { name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterialsForAgriculture[0] },
        { name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterialsForAgriculture[1] },
        { name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterialsForAgriculture[2] },
        { name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterialsForAgriculture[3] },
      ]),
    ),
    stockMaterials(
      ns,
      DivisionName.CHEMICAL,
      generateMaterialsOrders(cities, [
        { name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterialsForChemical[0] },
        { name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterialsForChemical[1] },
        { name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterialsForChemical[2] },
        { name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterialsForChemical[3] },
      ]),
    ),
  ]);

  if (config.auto === true) {
    const expectedOffer = config.selfFund ? 11e12 : 200e9;
    ns.print(`Waiting for Round 2 investment offer (target: ${ns.formatNumber(expectedOffer)})...`);
    await waitForOffer(ns, 15, 10, expectedOffer);
    const offer2 = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    ns.print(`Round 2: Accept offer: ${ns.formatNumber(offer2.funds)}`);
    await corporationEventLogger.generateOfferAcceptanceEvent(ns);
    await Do(ns, 'ns.corporation.acceptInvestmentOffer');
    await round3();
  }
}

async function round3(option: Round3Option = PrecalculatedRound3Option.OPTION1): Promise<void> {
  const productDivisionName = DivisionName.TOBACCO_0;
  const hasPrimaryProductDivision = await hasDivision(ns, DivisionName.TOBACCO_0);
  if (hasPrimaryProductDivision) {
    const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
    const primaryDivision = (await Do(ns, 'ns.corporation.getDivision', productDivisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    const round3LikelyComplete = corp.divisions.length >= 20 && primaryDivision.products.length > 0;
    if (round3LikelyComplete) {
      ns.print('Round 3 appears complete. Continuing with improve-all-divisions phase...');
      ns.spawn(ns.getScriptName(), { spawnDelay: 500 }, '--improveAllDivisions');
      return;
    }
    ns.print('Detected partially completed Round 3. Resuming setup...');
  }

  ns.print(`Round 3 options: ${JSON.stringify(option)}`);

  if (enableTestingTools && config.auto === false) {
    resetStatistics();
    testingTools.setFunds(11e12);
  }

  ns.print('Buying Market Research Demand and Market Data Competition unlocks...');
  await buyUnlock(ns, UnlockName.MARKET_RESEARCH_DEMAND);
  await buyUnlock(ns, UnlockName.MARKET_DATA_COMPETITION);

  const corp3a = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
  if (corp3a.divisions.length === 20 && !hasPrimaryProductDivision) {
    throw new Error('You need to sell 1 division');
  }

  // Create Tobacco division
  await createDivision(ns, productDivisionName, 3, 1);

  if (useAdvancedStrategy) {
    await createDivision(ns, DivisionName.TOBACCO_1, 3, 1);
    await improveSecondaryProductDivision(
      DivisionName.TOBACCO_1,
      ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>).funds * 0.1,
      false,
      false,
    );
    await createDivision(ns, DivisionName.RESTAURANT_0, 3, 1);
  }

  // Create dummy divisions
  ns.print('Creating dummy divisions...');
  const corp3b = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
  await createDummyDivisions(ns, 20 - corp3b.divisions.length);

  ns.print('Setting up export routes for Tobacco and Chemical...');
  for (const city of cities) {
    // We must prioritize Tobacco over Chemical when setting up export routes
    // Export Plants from Agriculture to Tobacco
    await Do(
      ns,
      'ns.corporation.cancelExportMaterial',
      DivisionName.AGRICULTURE,
      city,
      productDivisionName,
      city,
      MaterialName.PLANTS,
    );
    await Do(
      ns,
      'ns.corporation.exportMaterial',
      DivisionName.AGRICULTURE,
      city,
      productDivisionName,
      city,
      MaterialName.PLANTS,
      exportString,
    );

    // Export Plants from Agriculture to Chemical
    await Do(
      ns,
      'ns.corporation.cancelExportMaterial',
      DivisionName.AGRICULTURE,
      city,
      DivisionName.CHEMICAL,
      city,
      MaterialName.PLANTS,
    );
    await Do(
      ns,
      'ns.corporation.exportMaterial',
      DivisionName.AGRICULTURE,
      city,
      DivisionName.CHEMICAL,
      city,
      MaterialName.PLANTS,
      exportString,
    );
  }

  const agricultureDivision = (await Do(ns, 'ns.corporation.getDivision', DivisionName.AGRICULTURE)) as ReturnType<
    NS['corporation']['getDivision']
  >;
  const chemicalDivision = (await Do(ns, 'ns.corporation.getDivision', DivisionName.CHEMICAL)) as ReturnType<
    NS['corporation']['getDivision']
  >;
  const tobaccoDivision = (await Do(ns, 'ns.corporation.getDivision', productDivisionName)) as ReturnType<
    NS['corporation']['getDivision']
  >;

  const agricultureDivisionBudget = 150e9;
  const chemicalDivisionBudget = 30e9;

  ns.print('Waiting for initial production cycle...');
  while (
    ((await Do(ns, 'ns.corporation.getDivision', productDivisionName)) as ReturnType<NS['corporation']['getDivision']>)
      .productionMult === 0
  ) {
    await Do(ns, 'ns.corporation.nextUpdate');
  }

  ns.print(`Improving ${productDivisionName} division (upgrades, Wilson/AdVert, offices)...`);
  const corp3c = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
  await improveProductDivision(
    productDivisionName,
    corp3c.funds * 0.99 - agricultureDivisionBudget - chemicalDivisionBudget - 1e9,
    false,
    false,
    false,
  );

  ns.print(`Developing first product for ${productDivisionName}...`);
  await developNewProduct(ns, productDivisionName, mainProductDevelopmentCity, 1e9);
  await corporationEventLogger.generateNewProductEvent(ns, productDivisionName);

  ns.print(`Improving Agriculture support division (budget: ${ns.formatNumber(agricultureDivisionBudget)})...`);
  await improveSupportDivision(
    DivisionName.AGRICULTURE,
    agricultureDivisionBudget,
    defaultBudgetRatioForSupportDivision,
    false,
    false,
  );

  ns.print(`Improving Chemical support division (budget: ${ns.formatNumber(chemicalDivisionBudget)})...`);
  await improveSupportDivision(
    DivisionName.CHEMICAL,
    chemicalDivisionBudget,
    defaultBudgetRatioForSupportDivision,
    false,
    false,
  );

  ns.print('Buying boost materials for all divisions...');
  await Promise.allSettled([
    buyBoostMaterials(ns, agricultureDivision),
    buyBoostMaterials(ns, chemicalDivision),
    buyBoostMaterials(ns, tobaccoDivision),
  ]);

  ns.spawn(ns.getScriptName(), { spawnDelay: 500 }, '--improveAllDivisions');
}

async function ensureSellOrdersForFinishedProducts(divisionName: string): Promise<void> {
  const products = (
    (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>
  ).products;
  const hasTA1 = (await Do(ns, 'ns.corporation.hasResearched', divisionName, ResearchName.MARKET_TA_1)) as boolean;
  const hasTA2 = (await Do(ns, 'ns.corporation.hasResearched', divisionName, ResearchName.MARKET_TA_2)) as boolean;
  for (const productName of products) {
    const product = (await Do(
      ns,
      'ns.corporation.getProduct',
      divisionName,
      mainProductDevelopmentCity,
      productName,
    )) as Product;
    if (product.developmentProgress < 100) {
      continue;
    }
    for (const city of cities) {
      await Do(ns, 'ns.corporation.sellProduct', divisionName, city, productName, 'MAX', 'MP', false);
    }
    if (hasTA1) {
      await Do(ns, 'ns.corporation.setProductMarketTA1', divisionName, productName, true);
    }
    if (hasTA2) {
      await Do(ns, 'ns.corporation.setProductMarketTA2', divisionName, productName, true);
    }
  }
}

async function improveAllDivisions(): Promise<void> {
  let cycleCount = corporationEventLogger.cycle;
  // This is used for calling improveProductDivision with skipUpgradingOffice = true
  const pendingImprovingProductDivisions1 = new Map<string, number>();
  // This is used for manually calling improveProductDivisionOffices
  const pendingImprovingProductDivisions2 = new Map<string, number>();
  const pendingImprovingSupportDivisions = new Map<string, number>();
  const pendingBuyingBoostMaterialsDivisions = new Set<string>();
  const buyBoostMaterialsIfNeeded = (divisionName: string) => {
    if (!pendingBuyingBoostMaterialsDivisions.has(divisionName)) {
      pendingBuyingBoostMaterialsDivisions.add(divisionName);
      ns.print(`Buying boost materials for division: ${divisionName}`);
      void (async () => {
        const div = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
          NS['corporation']['getDivision']
        >;
        await buyBoostMaterials(ns, div);
        ns.print(`Finish buying boost materials for division: ${divisionName}`);
        pendingBuyingBoostMaterialsDivisions.delete(divisionName);
      })();
    }
  };

  const primaryProductDivisionName = DivisionName.TOBACCO_0;

  ns.print(`Initial improvement of ${primaryProductDivisionName}...`);
  const corpIad = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
  await improveProductDivision(primaryProductDivisionName, corpIad.funds * 0.99 - 1e9, false, false, false);
  buyBoostMaterialsIfNeeded(primaryProductDivisionName);

  let reservedFunds = 0;
  const increaseReservedFunds = (amount: number) => {
    console.log(`Increase reservedFunds by ${ns.formatNumber(amount)}`);
    reservedFunds += amount;
    console.log(`New reservedFunds: ${ns.formatNumber(reservedFunds)}`);
  };
  const decreaseReservedFunds = (amount: number) => {
    console.log(`Decrease reservedFunds by ${ns.formatNumber(amount)}`);
    reservedFunds -= amount;
    console.log(`New reservedFunds: ${ns.formatNumber(reservedFunds)}`);
  };

  const parseBudgetFromProductName = (productName: string): number | null => {
    const lastDashIndex = productName.lastIndexOf('-');
    if (lastDashIndex < 0 || lastDashIndex >= productName.length - 1) {
      return null;
    }
    const budget = Number(productName.slice(lastDashIndex + 1));
    if (!Number.isFinite(budget) || budget <= 0) {
      return null;
    }
    return budget;
  };

  const getRequiredProductDevelopmentBudget = async (divisionName: string): Promise<number> => {
    const products = (
      (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>
    ).products;
    if (products.length === 0) {
      return 0;
    }
    let bestKnownBudget = 0;
    for (const productName of products) {
      const parsedBudget = parseBudgetFromProductName(productName);
      if (parsedBudget !== null) {
        bestKnownBudget = Math.max(bestKnownBudget, parsedBudget);
        continue;
      }
      const product = (await Do(
        ns,
        'ns.corporation.getProduct',
        divisionName,
        mainProductDevelopmentCity,
        productName,
      )) as Product;
      bestKnownBudget = Math.max(bestKnownBudget, product.designInvestment + product.advertisingInvestment);
    }
    return bestKnownBudget * 1.0102;
  };

  const hasDevelopingProduct = async (divisionName: string): Promise<boolean> => {
    const products = (
      (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>
    ).products;
    for (const productName of products) {
      const product = (await Do(
        ns,
        'ns.corporation.getProduct',
        divisionName,
        mainProductDevelopmentCity,
        productName,
      )) as Product;
      if (product.developmentProgress < 100) {
        return true;
      }
    }
    return false;
  };

  // We use preparingToAcceptOffer to prevent optimizing office right before we switch all offices to "profit" setup.
  // This eliminates a potential race condition.
  let preparingToAcceptOffer = false;
  let saveForNextProductMode = false;
  const productSaveExitMultiplier = 1.1;
  /** While saving for the next product, treat ~91% of spendable funds as earmarked for that goal; use 9% (3% per division) for gradual Tobacco / Agriculture / Chemical upgrades. */
  const saveModeProductReserveRatio = 0.91;
  const saveModeDivisionSpendRatio = 0.09;
  const saveModePerDivisionSpendRatio = 0.03;
  // noinspection InfiniteLoopJS
  while (true) {
    ++cycleCount;
    const investmentOfferLoop = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    const currentRound = investmentOfferLoop.round;
    const profit = await getProfit(ns);
    const corpLoop = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
    const cycleStatus =
      `Cycle ${cycleCount} | Round ${currentRound} | Funds: ${ns.formatNumber(corpLoop.funds)} | Profit: ${ns.formatNumber(profit)}/s` +
      (currentRound <= 4 ? ` | Offer: ${ns.formatNumber(investmentOfferLoop.funds)}` : '');
    ns.print(cycleStatus);
    console.log(cycleStatus);
    const productIsDeveloping = await hasDevelopingProduct(primaryProductDivisionName);
    const requiredProductDevelopmentBudget = productIsDeveloping
      ? 0
      : await getRequiredProductDevelopmentBudget(primaryProductDivisionName);
    const shouldEnterSaveMode = corpLoop.funds < requiredProductDevelopmentBudget;
    const shouldExitSaveMode = corpLoop.funds >= requiredProductDevelopmentBudget * productSaveExitMultiplier;
    const previousSaveMode = saveForNextProductMode;
    if (saveForNextProductMode) {
      saveForNextProductMode = !shouldExitSaveMode;
    } else {
      saveForNextProductMode = shouldEnterSaveMode;
    }
    ns.write(corporationSaveModeFile, saveForNextProductMode ? '1' : '0', 'w');
    if (saveForNextProductMode && !previousSaveMode) {
      ns.print('Entering save-for-product mode. Clearing purchase orders to reduce hidden spending...');
      await clearPurchaseOrders(ns, true);
    }
    if (!saveForNextProductMode && previousSaveMode) {
      ns.print('Leaving save-for-product mode.');
    }
    const prioritizeProductCreation = !saveForNextProductMode && corpLoop.funds >= requiredProductDevelopmentBudget;

    if (!useAdvancedStrategy) {
      await buyResearchWithStandardStrategy();
    } else if (useAdvancedStrategy) {
      await buyResearchWithAdvancedStrategy();
    }

    if (useAdvancedStrategy) {
      // WIP
    }

    const primaryDivisionAware = (
      (await Do(ns, 'ns.corporation.getDivision', primaryProductDivisionName)) as ReturnType<
        NS['corporation']['getDivision']
      >
    ).awareness;
    if (primaryDivisionAware !== Number.MAX_VALUE && !saveForNextProductMode && !prioritizeProductCreation) {
      // Buy Wilson ASAP if we can afford it with the last cycle's profit. Budget for Wilson and Advert is just part of
      // current funds, it's usually too low for our benchmark to calculate the optimal combination. The benchmark is
      // most suitable for big-budget situation, like after accepting investment offer.
      const currentWilsonLevel = (await Do(
        ns,
        'ns.corporation.getUpgradeLevel',
        UpgradeName.WILSON_ANALYTICS,
      )) as number;
      const maxWilsonLevel = getMaxAffordableUpgradeLevel(UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, profit);
      const cappedWilsonLevel = Math.min(maxWilsonLevel, getConfiguredWilsonCap());
      if (cappedWilsonLevel > currentWilsonLevel) {
        await buyUpgrade(ns, UpgradeName.WILSON_ANALYTICS, cappedWilsonLevel);
      }

      // Prioritize Advert
      if (profit >= thresholdOfFocusingOnAdvert) {
        const currentAdvertLevel = (await Do(
          ns,
          'ns.corporation.getHireAdVertCount',
          primaryProductDivisionName,
        )) as number;
        const corpAdv = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<
          NS['corporation']['getCorporation']
        >;
        const maxAdvertLevel = getMaxAffordableAdVertLevel(currentAdvertLevel, (corpAdv.funds - reservedFunds) * 0.6);
        if (maxAdvertLevel > currentAdvertLevel) {
          await buyAdvert(ns, primaryProductDivisionName, maxAdvertLevel);
        }
      }
    }

    const corpAfterSpending = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<
      NS['corporation']['getCorporation']
    >;
    const totalFunds = Math.max(corpAfterSpending.funds - reservedFunds, 0);
    // Keep enough funds to create the next product, otherwise upgrade spending can starve product progression.
    // In save-for-product mode, funds are below the full next-product budget; reserve ~91% toward that goal and spend ~9% on divisions so they still improve gradually.
    let availableFunds: number;
    if (saveForNextProductMode) {
      availableFunds = totalFunds * saveModeDivisionSpendRatio;
    } else {
      const productBudgetReserve = Math.min(requiredProductDevelopmentBudget, totalFunds);
      availableFunds = Math.max(totalFunds - productBudgetReserve, 0);
    }

    // In round 3 and 4, we only develop up to maxNumberOfProducts
    let maxNumberOfProducts = maxNumberOfProductsInRound3;
    if (currentRound === 4) {
      maxNumberOfProducts = maxNumberOfProductsInRound4;
    }
    if (currentRound === 3 || currentRound === 4) {
      const productIdArray = await getProductIdArray(ns, primaryProductDivisionName);
      let numberOfDevelopedProducts = 0;
      if (productIdArray.length > 0) {
        numberOfDevelopedProducts = Math.max(...productIdArray) + 1;
      }
      if (numberOfDevelopedProducts >= maxNumberOfProducts) {
        // If all products are finished, we wait for 15 cycles, then accept investment offer.
        // We take a "snapshot" of product list here. When we use the standard setup, we use only 1 slot of
        // product slots while waiting for offer. In that case, we can develop the next product while waiting.
        // This "snapshot" ensures the product list that we use to calculate the "profit" setup does not include
        // the developing product.
        const products = (
          (await Do(ns, 'ns.corporation.getDivision', primaryProductDivisionName)) as ReturnType<
            NS['corporation']['getDivision']
          >
        ).products;
        let allProductsAreFinished = true;
        for (const productName of products) {
          const product = (await Do(
            ns,
            'ns.corporation.getProduct',
            primaryProductDivisionName,
            mainProductDevelopmentCity,
            productName,
          )) as Product;
          if (product.developmentProgress !== 100) {
            allProductsAreFinished = false;
            break;
          }
        }
        const getNewestProduct = async () =>
          (await Do(
            ns,
            'ns.corporation.getProduct',
            primaryProductDivisionName,
            mainProductDevelopmentCity,
            products[products.length - 1],
          )) as Product;
        const newestProduct = await getNewestProduct();
        if (
          !preparingToAcceptOffer &&
          newestProduct.developmentProgress > 98 &&
          newestProduct.developmentProgress < 100
        ) {
          preparingToAcceptOffer = true;
        }
        if (allProductsAreFinished) {
          ns.print('All products finished, developing new product before accepting offer...');
          const productDevelopmentBudget = Math.max(totalFunds * 0.9, requiredProductDevelopmentBudget);
          const fundsForProductAttempt = Math.max(
            ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>).funds -
              reservedFunds,
            0,
          );
          if (fundsForProductAttempt >= productDevelopmentBudget) {
            const newProductName = await developNewProduct(
              ns,
              primaryProductDivisionName,
              mainProductDevelopmentCity,
              productDevelopmentBudget,
            );
            if (newProductName) {
              await corporationEventLogger.generateNewProductEvent(ns, primaryProductDivisionName);
              availableFunds -= productDevelopmentBudget;
            }
          } else {
            ns.print(
              `Deferring product creation while saving funds: ` +
                `${ns.formatNumber(fundsForProductAttempt)} / ${ns.formatNumber(productDevelopmentBudget)}.`,
            );
          }

          ns.print('Setting sell orders for finished products...');
          await ensureSellOrdersForFinishedProducts(primaryProductDivisionName);

          ns.print('Waiting for newest product to get effectiveRating...');
          while ((await getNewestProduct()).effectiveRating === 0) {
            await waitForNumberOfCycles(ns, 1);
            ++cycleCount;
          }

          ns.print('Switching all offices to "profit" setup to maximize offer...');
          await switchAllOfficesToProfitSetup(
            primaryProductDivisionName,
            // We must use the latest data of product
            await getNewestProduct(),
          );

          let expectedOffer = Number.MAX_VALUE;
          if (currentRound === 3) {
            expectedOffer = config.selfFund ? 1e16 : 1e14;
          } else if (currentRound === 4) {
            expectedOffer = config.selfFund ? 1e20 : 1e18;
          }
          ns.print(`Waiting for Round ${currentRound} investment offer (target: ${ns.formatNumber(expectedOffer)})...`);
          const currentCycle = corporationEventLogger.cycle;
          await waitForOffer(ns, 10, 5, expectedOffer);
          cycleCount += corporationEventLogger.cycle - currentCycle;
          const offerAccept = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
            NS['corporation']['getInvestmentOffer']
          >;
          console.log(`Cycle: ${cycleCount}. ` + `Accept offer: ${ns.formatNumber(offerAccept.funds)}`);
          await corporationEventLogger.generateOfferAcceptanceEvent(ns);
          await Do(ns, 'ns.corporation.acceptInvestmentOffer');
          preparingToAcceptOffer = false;

          if (useAdvancedStrategy) {
            // WIP
          }

          continue;
        }
      }
    }

    // Skip developing new product if we are at the near end of exponential phase
    if (profit <= 1e40 || availableFunds >= 1e72) {
      const productDevelopmentBudget = Math.max(totalFunds * 0.9, requiredProductDevelopmentBudget);
      const fundsForProductAttempt = Math.max(
        ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>).funds -
          reservedFunds,
        0,
      );
      if (fundsForProductAttempt >= productDevelopmentBudget) {
        const newProductName = await developNewProduct(
          ns,
          primaryProductDivisionName,
          mainProductDevelopmentCity,
          productDevelopmentBudget,
        );
        if (newProductName) {
          ns.print(`Developing new product: ${newProductName}`);
          console.log(`Develop ${newProductName}`);
          await corporationEventLogger.generateNewProductEvent(ns, primaryProductDivisionName);
          availableFunds -= productDevelopmentBudget;
        }
      } else {
        ns.print(
          `Deferring product creation while saving funds: ` +
            `${ns.formatNumber(fundsForProductAttempt)} / ${ns.formatNumber(productDevelopmentBudget)}.`,
        );
      }
    } else {
      const productsElse = (
        (await Do(ns, 'ns.corporation.getDivision', primaryProductDivisionName)) as ReturnType<
          NS['corporation']['getDivision']
        >
      ).products;
      let allProductsAreFinishedElse = true;
      for (const productName of productsElse) {
        const product = (await Do(
          ns,
          'ns.corporation.getProduct',
          primaryProductDivisionName,
          mainProductDevelopmentCity,
          productName,
        )) as Product;
        if (product.developmentProgress !== 100) {
          allProductsAreFinishedElse = false;
          break;
        }
      }
      if (allProductsAreFinishedElse) {
        await corporationEventLogger.generateSkipDevelopingNewProductEvent(ns);
      }
    }

    const tobaccoHasRevenue =
      (
        (await Do(ns, 'ns.corporation.getDivision', primaryProductDivisionName)) as ReturnType<
          NS['corporation']['getDivision']
        >
      ).lastCycleRevenue > 0;
    const isSavingForNextProduct = saveForNextProductMode;
    if (isSavingForNextProduct) {
      const budgetForNextProject = totalFunds * saveModeProductReserveRatio;
      ns.print(
        `Saving funds for next product: ${ns.formatNumber(corpLoop.funds)} / ` +
          `${ns.formatNumber(requiredProductDevelopmentBudget)}.`,
      );
      ns.print(
        `Save-mode: ~${saveModeProductReserveRatio * 100}% toward next product (${ns.formatNumber(budgetForNextProject)}), ` +
          `${saveModeDivisionSpendRatio * 100}% for divisions (${ns.formatNumber(availableFunds)}, ` +
          `${saveModePerDivisionSpendRatio * 100}% each). ` +
          `Diagnostics: currentFunds=${ns.formatNumber(corpAfterSpending.funds)}, ` +
          `reservedFunds=${ns.formatNumber(reservedFunds)}, spendable=${ns.formatNumber(totalFunds)}.`,
      );
    }
    const budgetForTobaccoDivision = isSavingForNextProduct
      ? totalFunds * saveModePerDivisionSpendRatio
      : availableFunds * 0.9;
    if (
      tobaccoHasRevenue &&
      (cycleCount % 5 === 0 || (await needToUpgradeDivision(primaryProductDivisionName, budgetForTobaccoDivision)))
    ) {
      availableFunds -= budgetForTobaccoDivision;

      // Skip upgrading office in the following function call. We need to buy corporation's upgrades ASAP, so we
      // will upgrade offices in a separate call later.
      if (!pendingImprovingProductDivisions1.has(primaryProductDivisionName)) {
        const nonOfficesBudget = budgetForTobaccoDivision * (1 - budgetRatioForProductDivision.office);
        increaseReservedFunds(nonOfficesBudget);
        pendingImprovingProductDivisions1.set(primaryProductDivisionName, nonOfficesBudget);
        ns.print(`Upgrading ${primaryProductDivisionName} upgrades (budget: ${ns.formatNumber(nonOfficesBudget)})...`);
        console.log(`Upgrade ${primaryProductDivisionName}-1, budget: ${ns.formatNumber(nonOfficesBudget)}`);
        console.time(primaryProductDivisionName + '-1');
        improveProductDivision(primaryProductDivisionName, budgetForTobaccoDivision, true, false, false)
          .catch((reason) => {
            console.error(`Error occurred when upgrading ${primaryProductDivisionName}`, reason);
          })
          .finally(() => {
            console.timeEnd(primaryProductDivisionName + '-1');
            decreaseReservedFunds(pendingImprovingProductDivisions1.get(primaryProductDivisionName) ?? 0);
            pendingImprovingProductDivisions1.delete(primaryProductDivisionName);
            buyBoostMaterialsIfNeeded(primaryProductDivisionName);
          });
      }

      // Upgrade offices of product division
      if (!pendingImprovingProductDivisions2.has(primaryProductDivisionName) && !preparingToAcceptOffer) {
        const officesBudget = budgetForTobaccoDivision * budgetRatioForProductDivision.office;
        increaseReservedFunds(officesBudget);
        pendingImprovingProductDivisions2.set(primaryProductDivisionName, officesBudget);
        ns.print(`Upgrading ${primaryProductDivisionName} offices (budget: ${ns.formatNumber(officesBudget)})...`);
        console.log(`Upgrade ${primaryProductDivisionName}-2, budget: ${ns.formatNumber(officesBudget)}`);
        console.time(primaryProductDivisionName + '-2');
        improveProductDivisionOffices(primaryProductDivisionName, tobaccoIndustryData, officesBudget, false, false)
          .catch((reason) => {
            console.error(`Error occurred when upgrading ${primaryProductDivisionName}`, reason);
          })
          .finally(() => {
            console.timeEnd(primaryProductDivisionName + '-2');
            decreaseReservedFunds(pendingImprovingProductDivisions2.get(primaryProductDivisionName) ?? 0);
            pendingImprovingProductDivisions2.delete(primaryProductDivisionName);
          });
      }
    }

    const improveSupportDivisionAndBuyBoostMaterials = (divisionName: string, budget: number) => {
      availableFunds -= budget;
      increaseReservedFunds(budget);
      pendingImprovingSupportDivisions.set(divisionName, budget);
      ns.print(`Upgrading support division ${divisionName} (budget: ${ns.formatNumber(budget)})...`);
      console.log(`Upgrade ${divisionName}, budget: ${ns.formatNumber(budget)}`);
      console.time(divisionName);
      improveSupportDivision(divisionName, budget, defaultBudgetRatioForSupportDivision, false, false)
        .catch((reason) => {
          console.error(`Error occurred when upgrading ${divisionName}`, reason);
        })
        .finally(() => {
          console.timeEnd(divisionName);
          decreaseReservedFunds(pendingImprovingSupportDivisions.get(divisionName) ?? 0);
          pendingImprovingSupportDivisions.delete(divisionName);
          buyBoostMaterialsIfNeeded(divisionName);
        });
    };

    const budgetForAgricultureDivision = isSavingForNextProduct
      ? Math.max(Math.min(totalFunds * saveModePerDivisionSpendRatio, availableFunds), 0)
      : Math.max(Math.min(profit * (currentRound <= 4 ? 0.9 : 0.99), totalFunds * 0.09, availableFunds), 0);
    if (
      tobaccoHasRevenue &&
      (cycleCount % 10 === 0 ||
        (await needToUpgradeDivision(DivisionName.AGRICULTURE, budgetForAgricultureDivision))) &&
      !pendingImprovingSupportDivisions.has(DivisionName.AGRICULTURE)
    ) {
      improveSupportDivisionAndBuyBoostMaterials(DivisionName.AGRICULTURE, budgetForAgricultureDivision);
    }
    const budgetForChemicalDivision = isSavingForNextProduct
      ? Math.max(Math.min(totalFunds * saveModePerDivisionSpendRatio, availableFunds), 0)
      : Math.max(Math.min(profit * (currentRound <= 4 ? 0.1 : 0.01), totalFunds * 0.01, availableFunds), 0);
    if (
      tobaccoHasRevenue &&
      (cycleCount % 15 === 0 || (await needToUpgradeDivision(DivisionName.CHEMICAL, budgetForChemicalDivision))) &&
      !pendingImprovingSupportDivisions.has(DivisionName.CHEMICAL)
    ) {
      improveSupportDivisionAndBuyBoostMaterials(DivisionName.CHEMICAL, budgetForChemicalDivision);
    }

    const producedPlants = (
      (await Do(
        ns,
        'ns.corporation.getMaterial',
        DivisionName.AGRICULTURE,
        mainProductDevelopmentCity,
        MaterialName.PLANTS,
      )) as Material
    ).productionAmount;
    const consumedPlants = Math.abs(
      (
        (await Do(
          ns,
          'ns.corporation.getMaterial',
          primaryProductDivisionName,
          mainProductDevelopmentCity,
          MaterialName.PLANTS,
        )) as Material
      ).productionAmount,
    );
    if (consumedPlants > 0 && producedPlants / consumedPlants < 1) {
      console.debug(`plants ratio: ${producedPlants / consumedPlants}`);
    }

    if (!isSavingForNextProduct) {
      await buyTeaAndThrowPartyForAllDivisions(ns);
    }

    await ensureSellOrdersForFinishedProducts(primaryProductDivisionName);

    ns.print('Waiting for next cycle...');
    await waitForNextTimeStateHappens(ns, CorpState.START);
  }
}

async function needToUpgradeDivision(divisionName: string, budget: number): Promise<boolean> {
  const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, ns.enums.CityName.Sector12)) as ReturnType<
    NS['corporation']['getOffice']
  >;
  let expectedUpgradeSize = 30;
  const invOffer = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
    NS['corporation']['getInvestmentOffer']
  >;
  if (invOffer.round <= 4) {
    expectedUpgradeSize = Math.min(office.size / 2, 30);
  }
  // Assume that we use entire budget to upgrade offices. This is not correct, but it simplifies the calculation.
  const maxOfficeSize = getMaxAffordableOfficeSize(office.size, budget / 6);
  const needToUpgrade = maxOfficeSize >= office.size + expectedUpgradeSize;
  if (needToUpgrade) {
    console.debug(
      `needToUpgrade ${divisionName}, budget: ${ns.formatNumber(budget)}, office.size: ${office.size}, ` +
        `maxOfficeSize: ${maxOfficeSize}}`,
    );
  }
  return needToUpgrade;
}

async function ensureOfficeBudgetForMinimumSize(
  divisionName: string,
  city: CityName,
  currentOfficeSize: number,
  minOfficeSize: number,
  officeBudget: number,
): Promise<number> {
  if (currentOfficeSize >= minOfficeSize) {
    return officeBudget;
  }
  const minimumRequiredBudget = getOfficeUpgradeCost(currentOfficeSize, minOfficeSize);
  if (officeBudget >= minimumRequiredBudget) {
    return officeBudget;
  }

  ns.print(
    `Office budget below minimum for ${divisionName}/${city}. ` +
      `Need ${ns.formatNumber(minimumRequiredBudget)}, have ${ns.formatNumber(officeBudget)}. Waiting for funds...`,
  );
  const maxWaitCycles = 20;
  let waited = 0;
  while (waited < maxWaitCycles) {
    const funds = ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>)
      .funds;
    if (funds >= minimumRequiredBudget) {
      break;
    }
    waited += 10;
    if (waited % 50 === 0) {
      ns.print(
        `Waiting office bootstrap funds for ${divisionName}/${city}: ` +
          `${ns.formatNumber(funds)} / ${ns.formatNumber(minimumRequiredBudget)} (${waited}/${maxWaitCycles} cycles)`,
      );
    }
    await waitForNumberOfCycles(ns, 10);
  }

  const fundsAfterWait = (
    (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
  ).funds;
  if (fundsAfterWait < minimumRequiredBudget) {
    ns.print(
      `WARNING: Office bootstrap still unaffordable for ${divisionName}/${city} after waiting. ` +
        `Proceeding without extra office budget.`,
    );
    return officeBudget;
  }
  const cappedByFunds = fundsAfterWait * 0.9;
  const effectiveBudget = Math.max(officeBudget, Math.min(minimumRequiredBudget, cappedByFunds));
  if (effectiveBudget > officeBudget) {
    ns.print(
      `Temporarily increasing office budget for ${divisionName}/${city}: ` +
        `${ns.formatNumber(officeBudget)} -> ${ns.formatNumber(effectiveBudget)}`,
    );
  }
  return effectiveBudget;
}

async function getBalancingModifierForProfitProgress(): Promise<BalancingModifierForProfitProgress> {
  if ((await getProfit(ns)) >= 1e35) {
    return {
      profit: 1,
      progress: 2.5,
    };
  }
  return {
    profit: 1,
    progress: 5,
  };
}

async function switchAllOfficesToProfitSetup(divisionName: string, newestProduct: Product): Promise<void> {
  const mainOffice = (await Do(ns, 'ns.corporation.getOffice', divisionName, mainProductDevelopmentCity)) as ReturnType<
    NS['corporation']['getOffice']
  >;
  const officeSetup: OfficeSetup = {
    city: mainProductDevelopmentCity,
    size: mainOffice.numEmployees,
    jobs: {
      Operations: 0,
      Engineer: 0,
      Business: 0,
      Management: 0,
      'Research & Development': 0,
    },
  };
  if (usePrecalculatedEmployeeRatioForProfitSetup) {
    const swOffer = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    const precalculatedEmployeeRatioForProfitSetup =
      swOffer.round === 3
        ? precalculatedEmployeeRatioForProfitSetupOfRound3
        : precalculatedEmployeeRatioForProfitSetupOfRound4;
    officeSetup.jobs.Operations = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProfitSetup.operations);
    officeSetup.jobs.Engineer = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProfitSetup.engineer);
    officeSetup.jobs.Business = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProfitSetup.business);
    officeSetup.jobs.Management =
      officeSetup.size - (officeSetup.jobs.Operations + officeSetup.jobs.Engineer + officeSetup.jobs.Business);
  } else {
    const swDiv = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    const dataArray = await optimizeOffice(
      nsx,
      swDiv,
      await getIndustryData(ns, divisionName),
      mainProductDevelopmentCity,
      mainOffice.numEmployees,
      0,
      newestProduct,
      true,
      'profit',
      await getBalancingModifierForProfitProgress(),
      0, // Do not rerun
      20, // Half of defaultPerformanceModifierForOfficeBenchmark
      false,
    );
    const optimalData = dataArray[dataArray.length - 1];
    console.log(`Optimize all offices for "profit"`, optimalData);
    officeSetup.jobs = {
      Operations: optimalData.operations,
      Engineer: optimalData.engineer,
      Business: optimalData.business,
      Management: optimalData.management,
      'Research & Development': 0,
    };
  }
  await assignJobs(ns, divisionName, [officeSetup]);
  // Reuse the ratio of main office. This is not entirely correct, but it's still good enough. We do
  // this to reduce the computing time needed to find and switch to the optimal office setups.
  for (const city of supportProductDevelopmentCities) {
    const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city)) as ReturnType<
      NS['corporation']['getOffice']
    >;
    const operations = Math.max(
      Math.floor(office.numEmployees * (officeSetup.jobs.Operations / mainOffice.numEmployees)),
      1,
    );
    const engineer = Math.max(
      Math.floor(office.numEmployees * (officeSetup.jobs.Engineer / mainOffice.numEmployees)),
      1,
    );
    const business = Math.max(
      Math.floor(office.numEmployees * (officeSetup.jobs.Business / mainOffice.numEmployees)),
      1,
    );
    const management = office.numEmployees - (operations + engineer + business);
    await assignJobs(ns, divisionName, [
      {
        city: city,
        size: office.numEmployees,
        jobs: {
          Operations: operations,
          Engineer: engineer,
          Business: business,
          Management: management,
          'Research & Development': 0,
        },
      },
    ]);
  }
}

function getResearchCostMultiplier(divisionName: string, researchName: ResearchName) {
  if (divisionName === DivisionName.AGRICULTURE || divisionName === DivisionName.CHEMICAL) {
    return 2;
  }
  const costMultiplierForEmployeeStatsResearch = 5;
  const costMultiplierForProductionResearch = 10;
  let costMultiplier;
  switch (researchName) {
    case ResearchName.HI_TECH_RND_LABORATORY:
      costMultiplier = 1;
      break;
    case ResearchName.AUTO_PARTY:
      costMultiplier = 1;
      break;
    case ResearchName.AUTO_BREW:
      costMultiplier = 1;
      break;
    case ResearchName.OVERCLOCK:
    case ResearchName.STIMU:
    case ResearchName.GO_JUICE:
    case ResearchName.CPH4_INJECT:
      costMultiplier = costMultiplierForEmployeeStatsResearch;
      break;
    case ResearchName.AUTO_DRUG:
      costMultiplier = 13.5;
      break;
    case ResearchName.MARKET_TA_1:
    case ResearchName.MARKET_TA_2:
    case ResearchName.SELF_CORRECTING_ASSEMBLERS:
    case ResearchName.DRONES_ASSEMBLY:
    case ResearchName.DRONES_TRANSPORT:
    case ResearchName.UPGRADE_FULCRUM:
      costMultiplier = costMultiplierForProductionResearch;
      break;
    case ResearchName.DRONES:
      costMultiplier = 50;
      break;
    case ResearchName.UPGRADE_CAPACITY_1:
    case ResearchName.UPGRADE_CAPACITY_2:
      costMultiplier = Number.MAX_VALUE;
      break;

    default:
      throw new Error(`Invalid research: ${researchName}`);
  }
  return costMultiplier;
}

async function buyResearchWithStandardStrategy(): Promise<void> {
  const brOffer = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
    NS['corporation']['getInvestmentOffer']
  >;
  if (brOffer.round < 4) {
    return;
  }
  const buyResearches = async (divisionName: string) => {
    let researchPriorities: ResearchName[];
    if (divisionName === DivisionName.AGRICULTURE || divisionName === DivisionName.CHEMICAL) {
      researchPriorities = researchPrioritiesForSupportDivision;
    } else {
      researchPriorities = researchPrioritiesForProductDivision;
    }
    for (const researchName of researchPriorities) {
      if ((await Do(ns, 'ns.corporation.hasResearched', divisionName, researchName)) as boolean) {
        continue;
      }
      const researchCost = (await Do(ns, 'ns.corporation.getResearchCost', divisionName, researchName)) as number;
      const divRp = (
        (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>
      ).researchPoints;
      if (divRp < researchCost * getResearchCostMultiplier(divisionName, researchName)) {
        break;
      }
      await Do(ns, 'ns.corporation.research', divisionName, researchName);
    }
  };
  await buyResearches(DivisionName.AGRICULTURE);
  await buyResearches(DivisionName.CHEMICAL);
  await buyResearches(DivisionName.TOBACCO_0);
}

async function buyResearchWithAdvancedStrategy(): Promise<void> {
  // WIP
}

async function improveSecondaryProductDivision(
  divisionName: string,
  totalBudget: number,
  dryRun: boolean,
  enableLogging: boolean,
): Promise<void> {
  if (totalBudget < 0) {
    return;
  }
  const logger = new Logger(enableLogging);
  const currentFunds = (
    (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
  ).funds;
  const officeBudget = totalBudget / 6;
  const officeSetups: OfficeSetup[] = [];
  for (const city of cities) {
    const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city)) as ReturnType<
      NS['corporation']['getOffice']
    >;
    const maxOfficeSize = getMaxAffordableOfficeSize(office.size, officeBudget);
    officeSetups.push({
      city: city,
      size: maxOfficeSize,
      jobs: {
        Operations: 0,
        Engineer: 0,
        Business: 0,
        Management: 0,
        'Research & Development': maxOfficeSize,
      },
    });
  }
  if (!dryRun) {
    await upgradeOffices(ns, divisionName, officeSetups);
  }
  const secFundsAfter = (
    (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
  ).funds;
  logger.log(`Spent: ${ns.formatNumber(currentFunds - secFundsAfter)}`);
}

/**
 * This function assumes that all city setups (office + warehouse) in the division are the same
 *
 * @param divisionName
 * @param totalBudget
 * @param budgetRatio
 * @param dryRun
 * @param enableLogging
 */
async function improveSupportDivision(
  divisionName: string,
  totalBudget: number,
  budgetRatio: {
    warehouse: number;
    office: number;
  },
  dryRun: boolean,
  enableLogging: boolean,
): Promise<void> {
  if (totalBudget < 0) {
    return;
  }
  const logger = new Logger(enableLogging);
  const currentFunds = (
    (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
  ).funds;

  const warehouseBudget = (totalBudget * budgetRatio.warehouse) / 6;
  const officeBudget = (totalBudget * budgetRatio.office) / 6;
  const officeSetups: OfficeSetup[] = [];
  for (const city of cities) {
    logger.city = city;
    const currentWarehouseLevel = (
      (await Do(ns, 'ns.corporation.getWarehouse', divisionName, city)) as ReturnType<NS['corporation']['getWarehouse']>
    ).level;
    const newWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, warehouseBudget);
    if (newWarehouseLevel > currentWarehouseLevel && !dryRun) {
      await Do(ns, 'ns.corporation.upgradeWarehouse', divisionName, city, newWarehouseLevel - currentWarehouseLevel);
    }
    const whLevelLog = (
      (await Do(ns, 'ns.corporation.getWarehouse', divisionName, city)) as ReturnType<NS['corporation']['getWarehouse']>
    ).level;
    logger.log(
      `Division ${divisionName}: currentWarehouseLevel: ${currentWarehouseLevel}, ` +
        `newWarehouseLevel: ${whLevelLog}`,
    );
  }

  // We use Sector-12's office as the base to find the optimal setup for all cities' offices. This is not entirely
  // accurate, because each office has different employee's stats. However, the optimal setup of each office won't be
  // much different even with that concern.
  const city = ns.enums.CityName.Sector12;
  logger.city = city;
  const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city)) as ReturnType<
    NS['corporation']['getOffice']
  >;
  const effectiveOfficeBudget = await ensureOfficeBudgetForMinimumSize(
    divisionName,
    city,
    office.size,
    6,
    officeBudget,
  );
  const maxOfficeSize = getMaxAffordableOfficeSize(office.size, effectiveOfficeBudget);
  logger.log(`City: ${city}. currentOfficeSize: ${office.size}, maxOfficeSize: ${maxOfficeSize}`);
  if (maxOfficeSize < 6) {
    ns.print(
      `WARNING: Budget for office is too low. Skipping main office upgrade. ` +
        `Division: ${divisionName}. Office budget: ${ns.formatNumber(officeBudget)}`,
    );
    return;
  }
  const rndEmployee = Math.min(Math.floor(maxOfficeSize * 0.2), maxOfficeSize - 3);
  const nonRnDEmployees = maxOfficeSize - rndEmployee;
  const officeSetup: OfficeSetup = {
    city: city,
    size: maxOfficeSize,
    jobs: {
      Operations: 0,
      Engineer: 0,
      Business: 0,
      Management: 0,
      'Research & Development': rndEmployee,
    },
  };
  if (usePrecalculatedEmployeeRatioForSupportDivisions) {
    officeSetup.jobs.Operations = Math.floor(
      nonRnDEmployees * precalculatedEmployeeRatioForSupportDivisions.operations,
    );
    officeSetup.jobs.Business = Math.floor(nonRnDEmployees * precalculatedEmployeeRatioForSupportDivisions.business);
    officeSetup.jobs.Management = Math.floor(
      nonRnDEmployees * precalculatedEmployeeRatioForSupportDivisions.management,
    );
    officeSetup.jobs.Engineer =
      nonRnDEmployees - (officeSetup.jobs.Operations + officeSetup.jobs.Business + officeSetup.jobs.Management);
  } else {
    let item: Material;
    switch (divisionName) {
      case DivisionName.AGRICULTURE:
        item = (await Do(ns, 'ns.corporation.getMaterial', divisionName, city, MaterialName.PLANTS)) as Material;
        break;
      case DivisionName.CHEMICAL:
        item = (await Do(ns, 'ns.corporation.getMaterial', divisionName, city, MaterialName.CHEMICALS)) as Material;
        break;
      default:
        throw new Error(`Invalid division: ${divisionName}`);
    }
    if (nonRnDEmployees <= 3) {
      throw new Error('Invalid R&D ratio');
    }
    const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    const industryData = (await Do(ns, 'ns.corporation.getIndustryData', division.type)) as CorpIndustryData;
    const dataArray = await optimizeOffice(
      nsx,
      division,
      industryData,
      city,
      nonRnDEmployees,
      rndEmployee,
      item,
      true,
      'rawProduction',
      await getBalancingModifierForProfitProgress(),
      0, // Do not rerun
      20, // Half of defaultPerformanceModifierForOfficeBenchmark
      enableLogging,
      {
        engineer: Math.floor(nonRnDEmployees * 0.625),
        business: 0,
      },
    );
    if (dataArray.length === 0) {
      throw new Error(
        `Cannot calculate optimal office setup. Division: ${divisionName}, nonRnDEmployees: ${nonRnDEmployees}`,
      );
    } else {
      const optimalData = dataArray[dataArray.length - 1];
      officeSetup.jobs = {
        Operations: optimalData.operations,
        Engineer: optimalData.engineer,
        Business: optimalData.business,
        Management: optimalData.management,
        'Research & Development': rndEmployee,
      };
    }
    logger.log('Optimal officeSetup:', JSON.stringify(officeSetup));
  }
  for (const city of cities) {
    officeSetups.push({
      city: city,
      size: officeSetup.size,
      jobs: officeSetup.jobs,
    });
  }
  logger.city = undefined;
  if (!dryRun) {
    await upgradeOffices(ns, divisionName, officeSetups);
  }
  const supFundsAfter = (
    (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
  ).funds;
  logger.log(`Spent: ${ns.formatNumber(currentFunds - supFundsAfter)}`);
}

async function improveProductDivisionRawProduction(
  divisionName: string,
  industryData: CorpIndustryData,
  divisionResearches: DivisionResearches,
  budget: number,
  dryRun: boolean,
  benchmark: CorporationOptimizer,
  enableLogging: boolean,
): Promise<void> {
  const logger = new Logger(enableLogging);
  const dataArray = benchmark.optimizeStorageAndFactory(
    industryData,
    ((await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.SMART_STORAGE)) ?? 0) as number,
    // Assume that all warehouses are at the same level
    (
      (await Do(ns, 'ns.corporation.getWarehouse', divisionName, ns.enums.CityName.Sector12)) as ReturnType<
        NS['corporation']['getWarehouse']
      >
    ).level,
    (await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.SMART_FACTORIES)) as number,
    divisionResearches,
    budget,
    enableLogging,
  );
  if (dataArray.length === 0) {
    return;
  }
  const optimalData = dataArray[dataArray.length - 1];
  logger.log(`rawProduction: ${JSON.stringify(optimalData)}`);
  if (!dryRun) {
    await buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
    await buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
    for (const city of cities) {
      const currentWarehouseLevel = (
        (await Do(ns, 'ns.corporation.getWarehouse', divisionName, city)) as ReturnType<
          NS['corporation']['getWarehouse']
        >
      ).level;
      if (optimalData.warehouseLevel > currentWarehouseLevel) {
        await Do(
          ns,
          'ns.corporation.upgradeWarehouse',
          divisionName,
          city,
          optimalData.warehouseLevel - currentWarehouseLevel,
        );
      }
    }
  }
}

async function improveProductDivisionWilsonAdvert(
  divisionName: string,
  industryData: CorpIndustryData,
  divisionResearches: DivisionResearches,
  budget: number,
  dryRun: boolean,
  benchmark: CorporationOptimizer,
  enableLogging: boolean,
): Promise<void> {
  const logger = new Logger(enableLogging);
  const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
    NS['corporation']['getDivision']
  >;
  const currentWilsonLevel = (await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.WILSON_ANALYTICS)) as number;
  const dataArray = benchmark.optimizeWilsonAndAdvert(
    industryData,
    currentWilsonLevel,
    (await Do(ns, 'ns.corporation.getHireAdVertCount', divisionName)) as number,
    division.awareness,
    division.popularity,
    divisionResearches,
    budget,
    enableLogging,
  );
  if (dataArray.length === 0) {
    return;
  }
  const optimalData = dataArray[dataArray.length - 1];
  logger.log(`wilsonAdvert: ${JSON.stringify(optimalData)}`);
  if (!dryRun) {
    const cappedWilsonLevel = Math.min(optimalData.wilsonLevel, getConfiguredWilsonCap());
    if (cappedWilsonLevel > currentWilsonLevel) {
      await buyUpgrade(ns, UpgradeName.WILSON_ANALYTICS, cappedWilsonLevel);
    }
    await buyAdvert(ns, divisionName, optimalData.advertLevel);
  }
}

async function improveProductDivisionMainOffice(
  divisionName: string,
  industryData: CorpIndustryData,
  budget: number,
  dryRun: boolean,
  enableLogging: boolean,
): Promise<void> {
  const logger = new Logger(enableLogging);
  const profit = await getProfit(ns);
  const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
    NS['corporation']['getDivision']
  >;
  const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, mainProductDevelopmentCity)) as ReturnType<
    NS['corporation']['getOffice']
  >;
  const maxOfficeSize = getMaxAffordableOfficeSize(office.size, budget);
  if (maxOfficeSize < office.size) {
    return;
  }
  const officeSetup: OfficeSetup = {
    city: mainProductDevelopmentCity,
    size: maxOfficeSize,
    jobs: {
      Operations: 0,
      Engineer: 0,
      Business: 0,
      Management: 0,
      'Research & Development': 0,
    },
  };
  const products = division.products;
  let item: Product;
  let sortType: OfficeBenchmarkSortType;
  let useCurrentItemData = true;
  if (usePrecalculatedEmployeeRatioForProductDivision) {
    let precalculatedEmployeeRatioForProductDivision;
    const moOffer = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    if (moOffer.round === 3) {
      precalculatedEmployeeRatioForProductDivision = precalculatedEmployeeRatioForProductDivisionRound3;
    } else if (moOffer.round === 4) {
      precalculatedEmployeeRatioForProductDivision = precalculatedEmployeeRatioForProductDivisionRound4;
    } else if (moOffer.round === 5 && profit < 1e30) {
      precalculatedEmployeeRatioForProductDivision = precalculatedEmployeeRatioForProductDivisionRound5_1;
    } else if (moOffer.round === 5 && profit >= 1e30) {
      precalculatedEmployeeRatioForProductDivision = precalculatedEmployeeRatioForProductDivisionRound5_2;
    } else {
      throw new Error('Invalid precalculated employee ratio');
    }
    officeSetup.jobs.Operations = Math.floor(
      officeSetup.size * precalculatedEmployeeRatioForProductDivision.operations,
    );
    officeSetup.jobs.Engineer = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProductDivision.engineer);
    officeSetup.jobs.Business = Math.floor(officeSetup.size * precalculatedEmployeeRatioForProductDivision.business);
    if (officeSetup.jobs.Business === 0) {
      officeSetup.jobs.Business = 1;
    }
    officeSetup.jobs.Management =
      officeSetup.size - (officeSetup.jobs.Operations + officeSetup.jobs.Engineer + officeSetup.jobs.Business);
  } else {
    const moOffer2 = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    if (moOffer2.round === 3 || moOffer2.round === 4) {
      sortType = 'progress';
    } else {
      sortType = 'profit_progress';
    }
    let bestProduct = null;
    let highestEffectiveRating = Number.MIN_VALUE;
    for (const productName of products) {
      const product = (await Do(
        ns,
        'ns.corporation.getProduct',
        divisionName,
        mainProductDevelopmentCity,
        productName,
      )) as Product;
      if (product.developmentProgress < 100) {
        continue;
      }
      if (product.effectiveRating > highestEffectiveRating) {
        bestProduct = product;
        highestEffectiveRating = product.effectiveRating;
      }
    }
    if (!bestProduct) {
      useCurrentItemData = false;
      const referenceMarketPrice = await getProductMarketPrice(ns, division, industryData, ns.enums.CityName.Sector12);
      item = {
        name: sampleProductName,
        demand: 54,
        competition: 35,
        rating: 36000,
        effectiveRating: 36000,
        stats: {
          quality: 42000,
          performance: 46000,
          durability: 20000,
          reliability: 31000,
          aesthetics: 25000,
          features: 37000,
        },
        // Material's market price is different between cities. We use Sector12's price as reference price.
        productionCost: referenceMarketPrice,
        desiredSellPrice: 0,
        desiredSellAmount: 0,
        stored: 0,
        productionAmount: 0,
        actualSellAmount: 0,
        developmentProgress: 100,
        advertisingInvestment:
          (((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>).funds *
            0.01) /
          2,
        designInvestment:
          (((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>).funds *
            0.01) /
          2,
        size: 0.05,
      };
    } else {
      item = bestProduct;
      logger.log(`Use product: ${JSON.stringify(item)}`);
    }
    const dataArray = await optimizeOffice(
      nsx,
      division,
      industryData,
      mainProductDevelopmentCity,
      maxOfficeSize,
      0,
      item,
      useCurrentItemData,
      sortType,
      await getBalancingModifierForProfitProgress(),
      maxRerunWhenOptimizingOfficeForProductDivision,
      defaultPerformanceModifierForOfficeBenchmark,
      enableLogging,
    );
    if (dataArray.length === 0) {
      throw new Error(`Cannot calculate optimal office setup. maxTotalEmployees: ${maxOfficeSize}`);
    }
    const optimalData = dataArray[dataArray.length - 1];
    officeSetup.jobs = {
      Operations: optimalData.operations,
      Engineer: optimalData.engineer,
      Business: optimalData.business,
      Management: optimalData.management,
      'Research & Development': 0,
    };
  }

  logger.log(`mainOffice: ${JSON.stringify(officeSetup)}`);
  if (!dryRun) {
    await upgradeOffices(ns, divisionName, [officeSetup]);
  }
}

async function improveProductDivisionSupportOffices(
  divisionName: string,
  budget: number,
  dryRun: boolean,
  enableLogging: boolean,
): Promise<void> {
  const logger = new Logger(enableLogging);
  const officeSetups: OfficeSetup[] = [];
  const supFunds = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
  if (budget > supFunds.funds) {
    // Bypass usage of logger. If this happens, there is race condition. We must be notified about it.
    console.warn(
      `Budget is higher than current funds. Budget: ${ns.formatNumber(budget)}, ` +
        `funds: ${ns.formatNumber(supFunds.funds)}`,
    );
    budget = supFunds.funds * 0.9;
  }
  const budgetForEachOffice = budget / 5;
  for (const city of supportProductDevelopmentCities) {
    const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city)) as ReturnType<
      NS['corporation']['getOffice']
    >;
    const effectiveBudgetForOffice = await ensureOfficeBudgetForMinimumSize(
      divisionName,
      city,
      office.size,
      5,
      budgetForEachOffice,
    );
    const maxOfficeSize = getMaxAffordableOfficeSize(office.size, effectiveBudgetForOffice);
    if (maxOfficeSize < 5) {
      ns.print(
        `WARNING: Budget for office is too low. Skipping support office upgrade. ` +
          `Division: ${divisionName}, city: ${city}. Office budget: ${ns.formatNumber(budgetForEachOffice)}`,
      );
      continue;
    }
    if (maxOfficeSize < office.size) {
      continue;
    }
    const officeSetup: OfficeSetup = {
      city: city,
      size: maxOfficeSize,
      jobs: {
        Operations: 0,
        Engineer: 0,
        Business: 0,
        Management: 0,
        'Research & Development': 0,
      },
    };
    const supInv = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    if (supInv.round === 3 && maxNumberOfProductsInRound3 === 1) {
      officeSetup.jobs.Operations = 0;
      officeSetup.jobs.Engineer = 0;
      officeSetup.jobs.Business = 0;
      officeSetup.jobs.Management = 0;
      officeSetup.jobs['Research & Development'] = maxOfficeSize;
    } else if (supInv.round === 3 || supInv.round === 4) {
      officeSetup.jobs.Operations = 1;
      officeSetup.jobs.Engineer = 1;
      officeSetup.jobs.Business = 1;
      officeSetup.jobs.Management = 1;
      officeSetup.jobs['Research & Development'] = maxOfficeSize - 4;
    } else {
      const rndEmployee = Math.min(Math.floor(maxOfficeSize * 0.5), maxOfficeSize - 4);
      const nonRnDEmployees = maxOfficeSize - rndEmployee;
      // Reuse the ratio of "profit" setup in round 4. It's good enough.
      officeSetup.jobs.Operations = Math.floor(
        nonRnDEmployees * precalculatedEmployeeRatioForProfitSetupOfRound4.operations,
      );
      officeSetup.jobs.Engineer = Math.floor(
        nonRnDEmployees * precalculatedEmployeeRatioForProfitSetupOfRound4.engineer,
      );
      officeSetup.jobs.Business = Math.floor(
        nonRnDEmployees * precalculatedEmployeeRatioForProfitSetupOfRound4.business,
      );
      officeSetup.jobs.Management =
        nonRnDEmployees - (officeSetup.jobs.Operations + officeSetup.jobs.Engineer + officeSetup.jobs.Business);
      officeSetup.jobs['Research & Development'] = rndEmployee;
    }
    officeSetups.push(officeSetup);
  }
  logger.log(`supportOffices: ${JSON.stringify(officeSetups)}`);
  if (!dryRun) {
    await upgradeOffices(ns, divisionName, officeSetups);
  }
}

async function improveProductDivisionOffices(
  divisionName: string,
  industryData: CorpIndustryData,
  budget: number,
  dryRun: boolean,
  enableLogging: boolean,
): Promise<void> {
  let ratio = {
    mainOffice: 0.5,
    supportOffices: 0.5,
  };
  const offInv = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
    NS['corporation']['getInvestmentOffer']
  >;
  if (offInv.round === 3) {
    ratio = {
      mainOffice: 0.75,
      supportOffices: 0.25,
    };
  }
  await improveProductDivisionMainOffice(divisionName, industryData, budget * ratio.mainOffice, dryRun, enableLogging);
  await improveProductDivisionSupportOffices(divisionName, budget * ratio.supportOffices, dryRun, enableLogging);
}

async function improveProductDivision(
  divisionName: string,
  totalBudget: number,
  skipUpgradingOffice: boolean,
  dryRun: boolean,
  enableLogging: boolean,
): Promise<void> {
  if (totalBudget < 0) {
    return;
  }
  const logger = new Logger(enableLogging);
  const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
    NS['corporation']['getDivision']
  >;
  const industryData = (await Do(ns, 'ns.corporation.getIndustryData', division.type)) as CorpIndustryData;
  const divisionResearches = await getDivisionResearches(ns, divisionName);
  const benchmark = new CorporationOptimizer();
  const currentFunds = (
    (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
  ).funds;

  if ((await getProfit(ns)) >= thresholdOfFocusingOnAdvert) {
    budgetRatioForProductDivision = budgetRatioForProductDivisionWithoutAdvert;
  }

  // employeeStatUpgrades
  const employeeStatUpgradesBudget = totalBudget * budgetRatioForProductDivision.employeeStatUpgrades;
  const currentCreativityUpgradeLevel = (await Do(
    ns,
    'ns.corporation.getUpgradeLevel',
    UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS,
  )) as number;
  const currentCharismaUpgradeLevel = (await Do(
    ns,
    'ns.corporation.getUpgradeLevel',
    UpgradeName.SPEECH_PROCESSOR_IMPLANTS,
  )) as number;
  const currentIntelligenceUpgradeLevel = (await Do(
    ns,
    'ns.corporation.getUpgradeLevel',
    UpgradeName.NEURAL_ACCELERATORS,
  )) as number;
  const currentEfficiencyUpgradeLevel = (await Do(
    ns,
    'ns.corporation.getUpgradeLevel',
    UpgradeName.FOCUS_WIRES,
  )) as number;
  const newCreativityUpgradeLevel = getMaxAffordableUpgradeLevel(
    UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS,
    currentCreativityUpgradeLevel,
    employeeStatUpgradesBudget / 4,
  );
  const newCharismaUpgradeLevel = getMaxAffordableUpgradeLevel(
    UpgradeName.SPEECH_PROCESSOR_IMPLANTS,
    currentCharismaUpgradeLevel,
    employeeStatUpgradesBudget / 4,
  );
  const newIntelligenceUpgradeLevel = getMaxAffordableUpgradeLevel(
    UpgradeName.NEURAL_ACCELERATORS,
    currentIntelligenceUpgradeLevel,
    employeeStatUpgradesBudget / 4,
  );
  const newEfficiencyUpgradeLevel = getMaxAffordableUpgradeLevel(
    UpgradeName.FOCUS_WIRES,
    currentEfficiencyUpgradeLevel,
    employeeStatUpgradesBudget / 4,
  );
  if (!dryRun) {
    await buyUpgrade(ns, UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS, newCreativityUpgradeLevel);
    await buyUpgrade(ns, UpgradeName.SPEECH_PROCESSOR_IMPLANTS, newCharismaUpgradeLevel);
    await buyUpgrade(ns, UpgradeName.NEURAL_ACCELERATORS, newIntelligenceUpgradeLevel);
    await buyUpgrade(ns, UpgradeName.FOCUS_WIRES, newEfficiencyUpgradeLevel);
  }

  // salesBot
  const salesBotBudget = totalBudget * budgetRatioForProductDivision.salesBot;
  const currentSalesBotUpgradeLevel = (await Do(
    ns,
    'ns.corporation.getUpgradeLevel',
    UpgradeName.ABC_SALES_BOTS,
  )) as number;
  const newSalesBotUpgradeLevel = getMaxAffordableUpgradeLevel(
    UpgradeName.ABC_SALES_BOTS,
    currentSalesBotUpgradeLevel,
    salesBotBudget,
  );
  if (!dryRun) {
    await buyUpgrade(ns, UpgradeName.ABC_SALES_BOTS, newSalesBotUpgradeLevel);
  }

  // projectInsight
  const projectInsightBudget = totalBudget * budgetRatioForProductDivision.projectInsight;
  const currentProjectInsightUpgradeLevel = (await Do(
    ns,
    'ns.corporation.getUpgradeLevel',
    UpgradeName.PROJECT_INSIGHT,
  )) as number;
  const newProjectInsightUpgradeLevel = getMaxAffordableUpgradeLevel(
    UpgradeName.PROJECT_INSIGHT,
    currentProjectInsightUpgradeLevel,
    projectInsightBudget,
  );
  if (!dryRun) {
    await buyUpgrade(ns, UpgradeName.PROJECT_INSIGHT, newProjectInsightUpgradeLevel);
  }

  // rawProduction
  const rawProductionBudget = totalBudget * budgetRatioForProductDivision.rawProduction;
  await improveProductDivisionRawProduction(
    division.name,
    industryData,
    divisionResearches,
    rawProductionBudget,
    dryRun,
    benchmark,
    enableLogging,
  );

  // wilsonAdvert
  const wilsonAdvertBudget = totalBudget * budgetRatioForProductDivision.wilsonAdvert;
  await improveProductDivisionWilsonAdvert(
    division.name,
    industryData,
    divisionResearches,
    wilsonAdvertBudget,
    dryRun,
    benchmark,
    enableLogging,
  );

  // office
  if (!skipUpgradingOffice) {
    const officesBudget = totalBudget * budgetRatioForProductDivision.office;
    await improveProductDivisionOffices(division.name, industryData, officesBudget, dryRun, enableLogging);
  }

  const impFundsAfter = (
    (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
  ).funds;
  logger.log(`Spent: ${ns.formatNumber(currentFunds - impFundsAfter)}`);
}

function resetStatistics() {
  globalThis.Player.corporation!.cycleCount = 0;
  globalThis.corporationCycleHistory = [];
  corporationEventLogger.cycle = 0;
  corporationEventLogger.clearEventData();
}

async function test(): Promise<void> {}

export async function main(nsContext: NS): Promise<void> {
  init(nsContext);

  // if (ns.getResetInfo().currentNode !== 3) {
  //   throw new Error('This script is specialized for BN3');
  // }

  config = ns.flags(defaultConfig);
  if (config.help === true) {
    ns.tprint(`Default config: ${defaultConfig}`);
    return;
  }

  ns.disableLog('ALL');
  ns.ui.openTail();
  ns.clearLog();

  if (!((await Do(ns, 'ns.corporation.hasCorporation')) as boolean)) {
    globalThis.Player.money += 150e9;
    if (!((await Do(ns, 'ns.corporation.createCorporation', 'Corp', config.selfFund as boolean)) as boolean)) {
      ns.print(`Cannot create corporation`);
      return;
    }
  }

  // Clear purchase order of boost materials when script exits
  nsx.addAtExitCallback(() => {
    void clearPurchaseOrders(ns, false);
    ns.write(corporationSaveModeFile, '0', 'w');
  });

  agricultureIndustryData = (await Do(
    ns,
    'ns.corporation.getIndustryData',
    IndustryType.AGRICULTURE,
  )) as CorpIndustryData;
  chemicalIndustryData = (await Do(ns, 'ns.corporation.getIndustryData', IndustryType.CHEMICAL)) as CorpIndustryData;
  tobaccoIndustryData = (await Do(ns, 'ns.corporation.getIndustryData', IndustryType.TOBACCO)) as CorpIndustryData;

  if (config.benchmark === true) {
    exposeInternalGameObjects();
    testingTools.resetRNGData();
    enableTestingTools = true;
  }

  if (config.round1 === true) {
    await round1();
    return;
  }
  if (config.round2 === true) {
    await round2();
    return;
  }
  if (config.round3 === true) {
    await round3();
    return;
  }
  if (config.improveAllDivisions === true) {
    nsx.killProcessesSpawnFromSameScript();
    ns.ui.openTail();
    await improveAllDivisions();
    return;
  }
  if (config.test) {
    ns.ui.openTail();
    await test();
    return;
  }
}

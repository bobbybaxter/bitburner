/* eslint-disable no-unused-vars */
import type {
  CityName,
  CorpEmployeePosition,
  CorpIndustryData,
  CorpMaterialName,
  CorpUnlockName,
  CorpUpgradeName,
  Division,
  Material,
  NS,
  Office,
  Product,
  Warehouse,
} from '@ns';
import { CorpMaterialsData } from '/constants/corp';
import {
  CeresSolverResult,
  CorporationUpgradeLevels,
  CorpState,
  DivisionResearches,
  EmployeePosition,
  ExportRoute,
  getAdvertisingFactors,
  getBusinessFactor,
  getDivisionRawProduction,
  getMarketFactor,
  getResearchRPMultiplier,
  getResearchSalesMultiplier,
  getUpgradeBenefit,
  IndustryType,
  MaterialName,
  MaterialOrder,
  OfficeSetup,
  OfficeSetupJobs,
  productMarketPriceMultiplier,
  ResearchName,
  UnlockName,
  UpgradeName,
} from '/helpers/corpo/corporation-formulas';
import { Ceres } from '/libs/Ceres';
import { getRecordEntries, getRecordKeys, PartialRecord } from '../../libs/Record';
import { parseNumber } from '../../libs/utils';
import { Do } from '../do';

export enum DivisionName {
  AGRICULTURE = 'Agriculture',
  CHEMICAL = 'Chemical',
  TOBACCO_0 = 'T0',
  TOBACCO_1 = 'T1',
  RESTAURANT_0 = 'R0',
}

export const cities = ['Sector-12', 'Aevum', 'Chongqing', 'New Tokyo', 'Ishima', 'Volhaven'] as CityName[];

export const materials = Object.values(MaterialName);

export const boostMaterials = [
  MaterialName.AI_CORES,
  MaterialName.HARDWARE,
  MaterialName.REAL_ESTATE,
  MaterialName.ROBOTS,
];

export const researchPrioritiesForSupportDivision: ResearchName[] = [
  ResearchName.HI_TECH_RND_LABORATORY,
  ResearchName.AUTO_PARTY,
  ResearchName.AUTO_BREW,
  ResearchName.OVERCLOCK,
  ResearchName.STIMU,
  ResearchName.AUTO_DRUG,
  ResearchName.GO_JUICE,
  ResearchName.CPH4_INJECT,

  ResearchName.MARKET_TA_1,
  ResearchName.MARKET_TA_2,
  ResearchName.SELF_CORRECTING_ASSEMBLERS,
  ResearchName.DRONES,
  ResearchName.DRONES_ASSEMBLY,
  ResearchName.DRONES_TRANSPORT,
];

export const researchPrioritiesForProductDivision: ResearchName[] = [
  ...researchPrioritiesForSupportDivision,
  ResearchName.UPGRADE_FULCRUM,
  ResearchName.UPGRADE_CAPACITY_1,
  ResearchName.UPGRADE_CAPACITY_2,
];

/** Priorities the standard research buyer can actually finish (capacity tiers use an infinite RP multiplier). */
export const researchPrioritiesForProductDivisionOfficeCompletion: ResearchName[] = [
  ...researchPrioritiesForSupportDivision,
  ResearchName.UPGRADE_FULCRUM,
];

export const exportString = '(IPROD+IINV/10)*(-1)';

export const dummyDivisionNamePrefix = 'z-';

export const sampleProductName = 'Sample product';

// Key: divisionName|city
const smartSupplyData: Map<string, number> = new Map<string, number>();

// Key: divisionName|city|productName
const productMarkupData: Map<string, number> = new Map<string, number>();

const setOfDivisionsWaitingForRP: Set<string> = new Set<string>();

export class Logger {
  readonly #enableLogging: boolean;
  city?: CityName;

  constructor(enableLogging: boolean, city?: CityName) {
    this.#enableLogging = enableLogging;
    this.city = city;
  }

  public log(...args: unknown[]) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.log(...args);
    }
  }

  public warn(...args: unknown[]) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.warn(...args);
    }
  }

  public error(...args: unknown[]) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.error(...args);
    }
  }

  public time(label: string) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.time(label);
    }
  }

  public timeEnd(label: string) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.timeEnd(label);
    }
  }

  public timeLog(label: string) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.timeLog(label);
    }
  }
}

export function showWarning(ns: NS, warningMessage: string): void {
  console.warn(warningMessage);
  ns.print(warningMessage);
  ns.toast(warningMessage, 'warning');
}

export async function loopAllDivisionsAndCities(
  ns: NS,
  callback: (divisionName: string, city: CityName) => void | Promise<void>,
): Promise<void> {
  const corporation = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<
    NS['corporation']['getCorporation']
  >;
  for (const division of corporation.divisions) {
    if (division.startsWith(dummyDivisionNamePrefix)) {
      continue;
    }
    const divisionData = (await Do(ns, 'ns.corporation.getDivision', division)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    for (const city of divisionData.cities) {
      await callback(division, city);
    }
  }
}

export async function loopAllDivisionsAndCitiesAsyncCallback(
  ns: NS,
  callback: (divisionName: string, city: CityName) => Promise<void>,
): Promise<void> {
  await loopAllDivisionsAndCities(ns, callback);
}

export async function waitUntilAfterStateHappens(ns: NS, state: CorpState): Promise<void> {
  while (true) {
    const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
    if (corp.prevState === state) {
      break;
    }
    await Do(ns, 'ns.corporation.nextUpdate');
  }
}

export async function waitForNextTimeStateHappens(ns: NS, state: CorpState): Promise<void> {
  while (true) {
    await Do(ns, 'ns.corporation.nextUpdate');
    const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
    if (corp.prevState === state) {
      break;
    }
  }
}

export async function waitForNumberOfCycles(ns: NS, numberOfCycles: number): Promise<void> {
  const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
  const currentState = corp.prevState;
  let count = 0;
  while (count < numberOfCycles) {
    await waitForNextTimeStateHappens(ns, currentState as CorpState);
    ++count;
  }
}

export async function getProfit(ns: NS): Promise<number> {
  const corporation = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<
    NS['corporation']['getCorporation']
  >;
  return corporation.revenue - corporation.expenses;
}

export async function hasDivision(ns: NS, divisionName: string): Promise<boolean> {
  const corporation = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<
    NS['corporation']['getCorporation']
  >;
  return corporation.divisions.includes(divisionName);
}

export async function buyUpgrade(ns: NS, upgrade: CorpUpgradeName, targetLevel: number): Promise<void> {
  for (let i = (await Do(ns, 'ns.corporation.getUpgradeLevel', upgrade)) as number; i < targetLevel; i++) {
    try {
      await Do(ns, 'ns.corporation.levelUpgrade', upgrade);
    } catch {
      ns.print(`WARNING: Could not purchase ${upgrade} (insufficient funds), stopping at current level`);
      break;
    }
  }
}

export async function buyAdvert(ns: NS, divisionName: string, targetLevel: number): Promise<void> {
  for (let i = (await Do(ns, 'ns.corporation.getHireAdVertCount', divisionName)) as number; i < targetLevel; i++) {
    try {
      await Do(ns, 'ns.corporation.hireAdVert', divisionName);
    } catch {
      ns.print(
        `WARNING: Could not purchase AdVert for ${divisionName} (insufficient funds), stopping at current level`,
      );
      break;
    }
  }
}

export async function buyUnlock(ns: NS, unlockName: CorpUnlockName): Promise<void> {
  if ((await Do(ns, 'ns.corporation.hasUnlock', unlockName)) as boolean) {
    return;
  }
  const unlockCost = (await Do(ns, 'ns.corporation.getUnlockCost', unlockName)) as number;
  let cyclesWaited = 0;
  while (true) {
    const funds = ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>)
      .funds;
    if (funds >= unlockCost) {
      break;
    }
    cyclesWaited += 10;
    if (cyclesWaited % 50 === 0) {
      ns.print(
        `Waiting to buy ${unlockName}: ${ns.format.number(funds)} / ${ns.format.number(unlockCost)} ` +
          `(${cyclesWaited} cycles)`,
      );
    }
    await waitForNumberOfCycles(ns, 10);
  }

  // Another script might have purchased it while we waited.
  if ((await Do(ns, 'ns.corporation.hasUnlock', unlockName)) as boolean) {
    return;
  }
  await Do(ns, 'ns.corporation.purchaseUnlock', unlockName);
}

/**
 * Warehouse starts at level 1
 *
 * @param ns
 * @param divisionName
 * @param city
 * @param targetLevel
 */
export async function upgradeWarehouse(
  ns: NS,
  divisionName: string,
  city: CityName,
  targetLevel: number,
): Promise<void> {
  const wh = (await Do(ns, 'ns.corporation.getWarehouse', divisionName, city)) as ReturnType<
    NS['corporation']['getWarehouse']
  >;
  const amount = targetLevel - wh.level;
  if (amount < 1) {
    return;
  }
  await Do(ns, 'ns.corporation.upgradeWarehouse', divisionName, city, amount);
}

/**
 * Buying tea/throwing party for each office
 *
 * @param ns
 * @param divisionName
 */
export async function buyTeaAndThrowParty(ns: NS, divisionName: string): Promise<void> {
  const epsilon = 0.5;
  while (true) {
    let finish = true;
    for (const city of cities) {
      const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city)) as ReturnType<
        NS['corporation']['getOffice']
      >;
      if (office.avgEnergy < office.maxEnergy - epsilon) {
        await Do(ns, 'ns.corporation.buyTea', divisionName, city);
        finish = false;
      }
      if (office.avgMorale < office.maxMorale - epsilon) {
        await Do(ns, 'ns.corporation.throwParty', divisionName, city, 500000);
        finish = false;
      }
    }
    if (finish) {
      break;
    }
    await Do(ns, 'ns.corporation.nextUpdate');
  }
}

/**
 * Buying tea/throwing party once for each office in all divisions
 */
export async function buyTeaAndThrowPartyForAllDivisions(ns: NS): Promise<void> {
  const offer = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
    NS['corporation']['getInvestmentOffer']
  >;
  const corporation = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<
    NS['corporation']['getCorporation']
  >;
  // If we are in round 3+, we buy tea and throw party every cycle to maintain max energy/morale
  if (offer.round >= 3 || corporation.public) {
    await loopAllDivisionsAndCities(ns, async (divisionName: string, city: CityName) => {
      await Do(ns, 'ns.corporation.buyTea', divisionName, city);
      await Do(ns, 'ns.corporation.throwParty', divisionName, city, 500000);
    });
    return;
  }
  const epsilon = 0.5;
  await loopAllDivisionsAndCities(ns, async (divisionName: string, city: CityName) => {
    const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city)) as ReturnType<
      NS['corporation']['getOffice']
    >;
    if (office.avgEnergy < office.maxEnergy - epsilon) {
      await Do(ns, 'ns.corporation.buyTea', divisionName, city);
    }
    if (office.avgMorale < office.maxMorale - epsilon) {
      await Do(ns, 'ns.corporation.throwParty', divisionName, city, 500000);
    }
  });
}

export function generateOfficeSetupsForEarlyRounds(size: number, increaseBusiness = false): OfficeSetup[] {
  let officeSetup;
  switch (size) {
    case 3:
      officeSetup = [
        { name: EmployeePosition.OPERATIONS, count: 1 },
        { name: EmployeePosition.ENGINEER, count: 1 },
        { name: EmployeePosition.BUSINESS, count: 1 },
        { name: EmployeePosition.MANAGEMENT, count: 0 },
      ];
      break;
    case 4:
      officeSetup = [
        { name: EmployeePosition.OPERATIONS, count: 1 },
        { name: EmployeePosition.ENGINEER, count: 1 },
        { name: EmployeePosition.BUSINESS, count: 1 },
        { name: EmployeePosition.MANAGEMENT, count: 1 },
      ];
      break;
    case 5:
      officeSetup = [
        { name: EmployeePosition.OPERATIONS, count: 2 },
        { name: EmployeePosition.ENGINEER, count: 1 },
        { name: EmployeePosition.BUSINESS, count: 1 },
        { name: EmployeePosition.MANAGEMENT, count: 1 },
      ];
      break;
    case 6:
      if (increaseBusiness) {
        officeSetup = [
          { name: EmployeePosition.OPERATIONS, count: 2 },
          { name: EmployeePosition.ENGINEER, count: 1 },
          { name: EmployeePosition.BUSINESS, count: 2 },
          { name: EmployeePosition.MANAGEMENT, count: 1 },
        ];
      } else {
        officeSetup = [
          { name: EmployeePosition.OPERATIONS, count: 2 },
          { name: EmployeePosition.ENGINEER, count: 1 },
          { name: EmployeePosition.BUSINESS, count: 1 },
          { name: EmployeePosition.MANAGEMENT, count: 2 },
        ];
      }
      break;
    case 7:
      if (increaseBusiness) {
        officeSetup = [
          { name: EmployeePosition.OPERATIONS, count: 2 },
          { name: EmployeePosition.ENGINEER, count: 1 },
          { name: EmployeePosition.BUSINESS, count: 2 },
          { name: EmployeePosition.MANAGEMENT, count: 2 },
        ];
      } else {
        officeSetup = [
          { name: EmployeePosition.OPERATIONS, count: 3 },
          { name: EmployeePosition.ENGINEER, count: 1 },
          { name: EmployeePosition.BUSINESS, count: 1 },
          { name: EmployeePosition.MANAGEMENT, count: 2 },
        ];
      }
      break;
    case 8:
      if (increaseBusiness) {
        officeSetup = [
          { name: EmployeePosition.OPERATIONS, count: 3 },
          { name: EmployeePosition.ENGINEER, count: 1 },
          { name: EmployeePosition.BUSINESS, count: 2 },
          { name: EmployeePosition.MANAGEMENT, count: 2 },
          // { name: EmployeePosition.OPERATIONS, count: 2 },
          // { name: EmployeePosition.ENGINEER, count: 1 },
          // { name: EmployeePosition.BUSINESS, count: 3 },
          // { name: EmployeePosition.MANAGEMENT, count: 2 },
        ];
      } else {
        officeSetup = [
          { name: EmployeePosition.OPERATIONS, count: 3 },
          { name: EmployeePosition.ENGINEER, count: 1 },
          { name: EmployeePosition.BUSINESS, count: 1 },
          { name: EmployeePosition.MANAGEMENT, count: 3 },
        ];
      }
      break;
    default:
      throw new Error(`Invalid office size: ${size}`);
  }
  return generateOfficeSetups(cities, size, officeSetup);
}

export function generateOfficeSetups(
  cities: readonly CityName[],
  size: number,
  jobs: {
    name: CorpEmployeePosition;
    count: number;
  }[],
): OfficeSetup[] {
  const officeSetupJobs: OfficeSetupJobs = {
    Operations: 0,
    Engineer: 0,
    Business: 0,
    Management: 0,
    'Research & Development': 0,
    Intern: 0,
  };
  for (const job of jobs) {
    switch (job.name) {
      case EmployeePosition.OPERATIONS:
        officeSetupJobs.Operations = job.count;
        break;
      case EmployeePosition.ENGINEER:
        officeSetupJobs.Engineer = job.count;
        break;
      case EmployeePosition.BUSINESS:
        officeSetupJobs.Business = job.count;
        break;
      case EmployeePosition.MANAGEMENT:
        officeSetupJobs.Management = job.count;
        break;
      case EmployeePosition.RESEARCH_DEVELOPMENT:
        officeSetupJobs['Research & Development'] = job.count;
        break;
      case EmployeePosition.INTERN:
        officeSetupJobs.Intern = job.count;
        break;
      default:
        throw new Error(`Invalid job: ${job.name}`);
    }
  }
  const officeSetups: OfficeSetup[] = [];
  for (const city of cities) {
    officeSetups.push({
      city: city,
      size: size,
      jobs: officeSetupJobs,
    });
  }
  return officeSetups;
}

export async function assignJobs(ns: NS, divisionName: string, officeSetups: OfficeSetup[]): Promise<void> {
  for (const officeSetup of officeSetups) {
    try {
      // Reset all jobs
      for (const jobName of Object.values(EmployeePosition)) {
        if (jobName === EmployeePosition.UNASSIGNED) {
          continue;
        }
        await Do(ns, 'ns.corporation.setJobAssignment', divisionName, officeSetup.city, jobName, 0);
      }

      const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, officeSetup.city)) as ReturnType<
        NS['corporation']['getOffice']
      >;
      const actualSize = office.numEmployees;
      const targetSize = Object.values(officeSetup.jobs).reduce((a, b) => a + b, 0);

      let jobs = officeSetup.jobs;
      if (actualSize < targetSize && actualSize > 0) {
        const scale = actualSize / targetSize;
        const scaled: Record<string, number> = {};
        let assigned = 0;
        const entries = getRecordEntries(officeSetup.jobs);
        for (let i = 0; i < entries.length; i++) {
          const [jobName, count] = entries[i];
          if (i === entries.length - 1) {
            scaled[jobName] = actualSize - assigned;
          } else {
            scaled[jobName] = Math.floor(count * scale);
            assigned += scaled[jobName];
          }
        }
        ns.print(
          `Office ${officeSetup.city} has ${actualSize} employees but setup expects ${targetSize}. Scaling assignments.`,
        );
        jobs = scaled as unknown as typeof officeSetup.jobs;
      }

      // Assign jobs
      for (const [jobName, count] of getRecordEntries(jobs)) {
        if (
          !((await Do(
            ns,
            'ns.corporation.setJobAssignment',
            divisionName,
            officeSetup.city,
            jobName,
            count,
          )) as boolean)
        ) {
          ns.print(`Cannot assign job properly. City: ${officeSetup.city}, job: ${jobName}, count: ${count}`);
        }
      }
    } catch (e) {
      ns.print(`WARNING: Failed to assign jobs for ${divisionName} in ${officeSetup.city}: ${e}`);
    }
  }
}

export async function upgradeOffices(ns: NS, divisionName: string, officeSetups: OfficeSetup[]): Promise<void> {
  const successfulSetups: OfficeSetup[] = [];
  for (const officeSetup of officeSetups) {
    try {
      const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, officeSetup.city)) as ReturnType<
        NS['corporation']['getOffice']
      >;
      if (officeSetup.size < office.size) {
        ns.print(`Office's new size is smaller than current size. City: ${officeSetup.city}`);
        successfulSetups.push({ ...officeSetup, size: office.size });
        continue;
      }
      if (officeSetup.size > office.size) {
        await Do(
          ns,
          'ns.corporation.upgradeOfficeSize',
          divisionName,
          officeSetup.city,
          officeSetup.size - office.size,
        );
        ns.print(`Upgraded office ${officeSetup.city} to ${officeSetup.size} slots.`);
      }
      while (
        (await Do(
          ns,
          'ns.corporation.hireEmployee',
          divisionName,
          officeSetup.city,
          EmployeePosition.RESEARCH_DEVELOPMENT,
        )) as boolean
      ) {
        /* hire until full */
      }
      successfulSetups.push(officeSetup);
    } catch (e) {
      ns.print(`WARNING: Failed to upgrade office for ${divisionName} in ${officeSetup.city}: ${e}`);
    }
  }
  if (successfulSetups.length > 0) {
    await assignJobs(ns, divisionName, successfulSetups);
    ns.print(`Finished upgrading offices for ${divisionName}`);
  }
}

export async function clearPurchaseOrders(ns: NS, clearInputMaterialOrders: boolean = true): Promise<void> {
  await loopAllDivisionsAndCities(ns, async (divisionName, city) => {
    for (const materialName of boostMaterials) {
      await Do(ns, 'ns.corporation.buyMaterial', divisionName, city, materialName, 0);
      await Do(ns, 'ns.corporation.sellMaterial', divisionName, city, materialName, '0', 'MP');
    }
    if (clearInputMaterialOrders) {
      const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
        NS['corporation']['getDivision']
      >;
      const industrialData = (await Do(ns, 'ns.corporation.getIndustryData', division.industry)) as CorpIndustryData;
      for (const materialName of getRecordKeys(
        industrialData.requiredMaterials as PartialRecord<CorpMaterialName, string>,
      )) {
        await Do(ns, 'ns.corporation.buyMaterial', divisionName, city, materialName, 0);
        await Do(ns, 'ns.corporation.sellMaterial', divisionName, city, materialName, '0', 'MP');
      }
    }
  });
}

export function generateMaterialsOrders(
  cities: readonly CityName[],
  materials: {
    name: MaterialName;
    count: number;
  }[],
): MaterialOrder[] {
  const orders: MaterialOrder[] = [];
  for (const city of cities) {
    orders.push({
      city: city,
      materials: materials,
    });
  }
  return orders;
}

export async function stockMaterials(
  ns: NS,
  divisionName: string,
  orders: MaterialOrder[],
  bulkPurchase = false,
  discardExceeded = false,
): Promise<void> {
  let count = 0;
  while (true) {
    if (count === 5) {
      const warningMessage =
        `It takes too many cycles to stock up on materials. Division: ${divisionName}, ` +
        `orders: ${JSON.stringify(orders)}`;
      showWarning(ns, warningMessage);
      break;
    }
    let finish = true;
    for (const order of orders) {
      for (const material of order.materials) {
        const storedAmount = (
          (await Do(ns, 'ns.corporation.getMaterial', divisionName, order.city, material.name)) as Material
        ).stored;
        if (storedAmount === material.count) {
          await Do(ns, 'ns.corporation.buyMaterial', divisionName, order.city, material.name, 0);
          await Do(ns, 'ns.corporation.sellMaterial', divisionName, order.city, material.name, '0', 'MP');
          continue;
        }
        // Buy
        if (storedAmount < material.count) {
          if (bulkPurchase) {
            await Do(
              ns,
              'ns.corporation.bulkPurchase',
              divisionName,
              order.city,
              material.name,
              material.count - storedAmount,
            );
          } else {
            await Do(
              ns,
              'ns.corporation.buyMaterial',
              divisionName,
              order.city,
              material.name,
              (material.count - storedAmount) / 10,
            );
            await Do(ns, 'ns.corporation.sellMaterial', divisionName, order.city, material.name, '0', 'MP');
          }
          finish = false;
        }
        // Discard
        else if (discardExceeded) {
          await Do(ns, 'ns.corporation.buyMaterial', divisionName, order.city, material.name, 0);
          await Do(
            ns,
            'ns.corporation.sellMaterial',
            divisionName,
            order.city,
            material.name,
            ((storedAmount - material.count) / 10).toString(),
            '0',
          );
          finish = false;
        }
      }
    }
    if (finish) {
      break;
    }
    await waitForNextTimeStateHappens(ns, CorpState.PURCHASE);
    ++count;
  }
}

export async function getCorporationUpgradeLevels(ns: NS): Promise<CorporationUpgradeLevels> {
  const corporationUpgradeLevels: CorporationUpgradeLevels = {
    [UpgradeName.SMART_FACTORIES]: 0,
    [UpgradeName.SMART_STORAGE]: 0,
    [UpgradeName.WILSON_ANALYTICS]: 0,
    [UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS]: 0,
    [UpgradeName.SPEECH_PROCESSOR_IMPLANTS]: 0,
    [UpgradeName.NEURAL_ACCELERATORS]: 0,
    [UpgradeName.FOCUS_WIRES]: 0,
    [UpgradeName.ABC_SALES_BOTS]: 0,
    [UpgradeName.PROJECT_INSIGHT]: 0,
  };
  for (const upgradeName of Object.values(UpgradeName)) {
    corporationUpgradeLevels[upgradeName] = (await Do(ns, 'ns.corporation.getUpgradeLevel', upgradeName)) as number;
  }
  return corporationUpgradeLevels;
}

export async function getDivisionResearches(ns: NS, divisionName: string): Promise<DivisionResearches> {
  const divisionResearches: DivisionResearches = {
    [ResearchName.HI_TECH_RND_LABORATORY]: false,
    [ResearchName.AUTO_BREW]: false,
    [ResearchName.AUTO_PARTY]: false,
    [ResearchName.AUTO_DRUG]: false,
    [ResearchName.CPH4_INJECT]: false,
    [ResearchName.DRONES]: false,
    [ResearchName.DRONES_ASSEMBLY]: false,
    [ResearchName.DRONES_TRANSPORT]: false,
    [ResearchName.GO_JUICE]: false,
    [ResearchName.HR_BUDDY_RECRUITMENT]: false,
    [ResearchName.HR_BUDDY_TRAINING]: false,
    [ResearchName.MARKET_TA_1]: false,
    [ResearchName.MARKET_TA_2]: false,
    [ResearchName.OVERCLOCK]: false,
    [ResearchName.SELF_CORRECTING_ASSEMBLERS]: false,
    [ResearchName.STIMU]: false,
    [ResearchName.UPGRADE_CAPACITY_1]: false,
    [ResearchName.UPGRADE_CAPACITY_2]: false,
    [ResearchName.UPGRADE_DASHBOARD]: false,
    [ResearchName.UPGRADE_FULCRUM]: false,
  };
  for (const researchName of Object.values(ResearchName)) {
    divisionResearches[researchName] = (await Do(
      ns,
      'ns.corporation.hasResearched',
      divisionName,
      researchName,
    )) as boolean;
  }
  return divisionResearches;
}

export async function getIndustryData(ns: NS, divisionName: string): Promise<CorpIndustryData> {
  const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
    NS['corporation']['getDivision']
  >;
  return (await Do(ns, 'ns.corporation.getIndustryData', division.industry)) as CorpIndustryData;
}

export async function createDivision(
  ns: NS,
  divisionName: string,
  officeSize: number,
  warehouseLevel: number,
): Promise<Division> {
  // Create division if not exists
  if (!(await hasDivision(ns, divisionName))) {
    let industryType;
    switch (divisionName) {
      case DivisionName.AGRICULTURE:
        industryType = IndustryType.AGRICULTURE;
        break;
      case DivisionName.CHEMICAL:
        industryType = IndustryType.CHEMICAL;
        break;
      case DivisionName.TOBACCO_0:
      case DivisionName.TOBACCO_1:
        industryType = IndustryType.TOBACCO;
        break;
      case DivisionName.RESTAURANT_0:
        industryType = IndustryType.RESTAURANT;
        break;
      default:
        throw new Error(`Invalid division name: ${divisionName}`);
    }

    const industryData = (await Do(ns, 'ns.corporation.getIndustryData', industryType)) as CorpIndustryData;
    const expandIndustryCost = industryData.startingCost;
    let cyclesWaited = 0;
    while (true) {
      const funds = ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>)
        .funds;
      if (funds >= expandIndustryCost) {
        break;
      }
      cyclesWaited += 10;
      if (cyclesWaited % 50 === 0) {
        ns.print(
          `Waiting to create ${divisionName}: ${ns.format.number(funds)} / ${ns.format.number(expandIndustryCost)} ` +
            `(${cyclesWaited} cycles)`,
        );
      }
      await waitForNumberOfCycles(ns, 10);
    }

    // Another script might have created the division while we waited.
    if (await hasDivision(ns, divisionName)) {
      return (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>;
    }
    await Do(ns, 'ns.corporation.expandIndustry', industryType, divisionName);
  }
  let division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
    NS['corporation']['getDivision']
  >;
  ns.print(`Initializing division: ${divisionName}`);

  // Expand to all cities
  for (const city of cities) {
    if (!division.cities.includes(city)) {
      await Do(ns, 'ns.corporation.expandCity', divisionName, city);
      ns.print(`Expand ${divisionName} to ${city}`);
    }
    // Buy warehouse
    if (!(await Do(ns, 'ns.corporation.hasWarehouse', divisionName, city))) {
      await Do(ns, 'ns.corporation.purchaseWarehouse', divisionName, city);
    }
  }
  division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>;
  // Set up all cities
  await upgradeOffices(
    ns,
    divisionName,
    generateOfficeSetups(cities, officeSize, [
      {
        name: EmployeePosition.RESEARCH_DEVELOPMENT,
        count: officeSize,
      },
    ]),
  );
  for (const city of cities) {
    await upgradeWarehouse(ns, divisionName, city, warehouseLevel);
    // Enable Smart Supply
    if ((await Do(ns, 'ns.corporation.hasUnlock', UnlockName.SMART_SUPPLY)) as boolean) {
      await Do(ns, 'ns.corporation.setSmartSupply', divisionName, city, true);
    }
  }
  return (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>;
}

export function getOptimalBoostMaterialQuantities(
  industryData: CorpIndustryData,
  spaceConstraint: number,
  round: boolean = true,
): number[] {
  const { aiCoreFactor, hardwareFactor, realEstateFactor, robotFactor } = industryData;
  const boostMaterialCoefficients = [aiCoreFactor!, hardwareFactor!, realEstateFactor!, robotFactor!];
  const boostMaterialSizes = boostMaterials.map((mat) => CorpMaterialsData[mat].size);

  const calculateOptimalQuantities = (matCoefficients: number[], matSizes: number[]): number[] => {
    const sumOfCoefficients = matCoefficients.reduce((a, b) => a + b, 0);
    const sumOfSizes = matSizes.reduce((a, b) => a + b, 0);
    const result = [];
    for (let i = 0; i < matSizes.length; ++i) {
      let matCount =
        (spaceConstraint -
          500 *
            ((matSizes[i] / matCoefficients[i]) * (sumOfCoefficients - matCoefficients[i]) -
              (sumOfSizes - matSizes[i]))) /
        (sumOfCoefficients / matCoefficients[i]) /
        matSizes[i];
      if (matCoefficients[i] <= 0 || matCount < 0) {
        return calculateOptimalQuantities(matCoefficients.toSpliced(i, 1), matSizes.toSpliced(i, 1)).toSpliced(i, 0, 0);
      } else {
        if (round) {
          matCount = Math.round(matCount);
        }
        result.push(matCount);
      }
    }
    return result;
  };
  return calculateOptimalQuantities(boostMaterialCoefficients, boostMaterialSizes);
}

export async function getExportRoutes(ns: NS): Promise<ExportRoute[]> {
  const exportRoutes: ExportRoute[] = [];
  for (const material of materials) {
    await loopAllDivisionsAndCities(ns, async (divisionName, sourceCity) => {
      const exports = ((await Do(ns, 'ns.corporation.getMaterial', divisionName, sourceCity, material)) as Material)
        .exports;
      if (exports.length === 0) {
        return;
      }
      for (const exportRoute of exports) {
        exportRoutes.push({
          material: material,
          sourceCity: sourceCity,
          sourceDivision: divisionName,
          destinationDivision: exportRoute.division,
          destinationCity: exportRoute.city,
          destinationAmount: exportRoute.amount,
        });
      }
    });
  }
  return exportRoutes;
}

function buildSmartSupplyKey(divisionName: string, city: CityName): string {
  return `${divisionName}|${city}`;
}

export async function getRawProduction(
  ns: NS,
  division: Division,
  city: CityName,
  isProduct: boolean,
): Promise<number> {
  const office = (await Do(ns, 'ns.corporation.getOffice', division.name, city)) as ReturnType<
    NS['corporation']['getOffice']
  >;
  let rawProduction = getDivisionRawProduction(
    isProduct,
    {
      operationsProduction: office.employeeProductionByJob.Operations,
      engineerProduction: office.employeeProductionByJob.Engineer,
      managementProduction: office.employeeProductionByJob.Management,
    },
    division.productionMult,
    await getCorporationUpgradeLevels(ns),
    await getDivisionResearches(ns, division.name),
  );
  rawProduction = rawProduction * 10;
  return rawProduction;
}

export async function getLimitedRawProduction(
  ns: NS,
  division: Division,
  city: CityName,
  industrialData: CorpIndustryData,
  warehouse: Warehouse,
  isProduct: boolean,
  productSize?: number,
): Promise<number> {
  let rawProduction = await getRawProduction(ns, division, city, isProduct);

  // Calculate required storage space of each output unit. It is the net change in warehouse's storage space when
  // producing an output unit.
  let requiredStorageSpaceOfEachOutputUnit = 0;
  if (isProduct) {
    requiredStorageSpaceOfEachOutputUnit += productSize!;
  } else {
    for (const outputMaterialName of industrialData.producedMaterials!) {
      requiredStorageSpaceOfEachOutputUnit += (
        (await Do(ns, 'ns.corporation.getMaterialData', outputMaterialName)) as ReturnType<
          NS['corporation']['getMaterialData']
        >
      ).size;
    }
  }
  for (const [requiredMaterialName, requiredMaterialCoefficient] of getRecordEntries(
    industrialData.requiredMaterials,
  )) {
    requiredStorageSpaceOfEachOutputUnit -=
      (
        (await Do(ns, 'ns.corporation.getMaterialData', requiredMaterialName)) as ReturnType<
          NS['corporation']['getMaterialData']
        >
      ).size * requiredMaterialCoefficient;
  }
  // Limit the raw production if needed
  if (requiredStorageSpaceOfEachOutputUnit > 0) {
    const maxNumberOfOutputUnits = Math.floor(
      (warehouse.size - warehouse.sizeUsed) / requiredStorageSpaceOfEachOutputUnit,
    );
    rawProduction = Math.min(rawProduction, maxNumberOfOutputUnits);
  }

  rawProduction = Math.max(rawProduction, 0);
  return rawProduction;
}

export async function setSmartSupplyData(ns: NS): Promise<void> {
  // Only set smart supply data after "PURCHASE" state
  const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
  if (corp.prevState !== CorpState.PURCHASE) {
    return;
  }
  await loopAllDivisionsAndCities(ns, async (divisionName, city) => {
    const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    if (!(await Do(ns, 'ns.corporation.hasWarehouse', division.name, city))) {
      return;
    }
    const industrialData = (await Do(ns, 'ns.corporation.getIndustryData', division.industry)) as CorpIndustryData;
    const warehouse = (await Do(ns, 'ns.corporation.getWarehouse', division.name, city)) as ReturnType<
      NS['corporation']['getWarehouse']
    >;
    let totalRawProduction = 0;

    if (industrialData.makesMaterials) {
      totalRawProduction += await getLimitedRawProduction(ns, division, city, industrialData, warehouse, false);
    }

    if (industrialData.makesProducts) {
      for (const productName of division.products) {
        const product = (await Do(ns, 'ns.corporation.getProduct', divisionName, city, productName)) as Product;
        if (product.developmentProgress < 100) {
          continue;
        }
        totalRawProduction += await getLimitedRawProduction(
          ns,
          division,
          city,
          industrialData,
          warehouse,
          true,
          product.size,
        );
      }
    }

    smartSupplyData.set(buildSmartSupplyKey(divisionName, city), totalRawProduction);
  });
}

async function detectWarehouseCongestion(
  ns: NS,
  division: Division,
  industrialData: CorpIndustryData,
  city: CityName,
  warehouseCongestionData: Map<string, number>,
): Promise<boolean> {
  const requiredMaterials = getRecordEntries(industrialData.requiredMaterials);
  let isWarehouseCongested = false;
  const warehouseCongestionDataKey = `${division.name}|${city}`;
  const items: (Material | Product)[] = [];
  if (industrialData.producedMaterials) {
    for (const materialName of industrialData.producedMaterials) {
      items.push((await Do(ns, 'ns.corporation.getMaterial', division.name, city, materialName)) as Material);
    }
  }
  if (industrialData.makesProducts) {
    for (const productName of division.products) {
      const product = (await Do(ns, 'ns.corporation.getProduct', division.name, city, productName)) as Product;
      if (product.developmentProgress < 100) {
        continue;
      }
      items.push(product);
    }
  }
  for (const item of items) {
    if (item.productionAmount !== 0) {
      warehouseCongestionData.set(warehouseCongestionDataKey, 0);
      continue;
    }
    // item.productionAmount === 0 means that division does not produce material/product last cycle.
    let numberOfCongestionTimes = warehouseCongestionData.get(warehouseCongestionDataKey)! + 1;
    if (Number.isNaN(numberOfCongestionTimes)) {
      numberOfCongestionTimes = 0;
    }
    warehouseCongestionData.set(warehouseCongestionDataKey, numberOfCongestionTimes);
    break;
  }
  // If that happens more than 5 times, the warehouse is very likely congested.
  if (warehouseCongestionData.get(warehouseCongestionDataKey)! > 5) {
    isWarehouseCongested = true;
  }
  // We need to mitigate this situation. Discarding stored input material is the simplest solution.
  if (isWarehouseCongested) {
    showWarning(ns, `Warehouse may be congested. Division: ${division.name}, city: ${city}.`);
    for (const [materialName] of requiredMaterials) {
      // Clear purchase
      await Do(ns, 'ns.corporation.buyMaterial', division.name, city, materialName, 0);
      // Discard stored input material
      await Do(ns, 'ns.corporation.sellMaterial', division.name, city, materialName, 'MAX', '0');
    }
    warehouseCongestionData.set(warehouseCongestionDataKey, 0);
  } else {
    for (const [materialName] of requiredMaterials) {
      const material = (await Do(ns, 'ns.corporation.getMaterial', division.name, city, materialName)) as Material;
      if (material.desiredSellAmount !== 0) {
        // Stop discarding input material
        await Do(ns, 'ns.corporation.sellMaterial', division.name, city, materialName, '0', '0');
      }
    }
  }
  return isWarehouseCongested;
}

/**
 * Custom Smart Supply script
 *
 * @param ns
 * @param warehouseCongestionData
 */
export async function buyOptimalAmountOfInputMaterials(
  ns: NS,
  warehouseCongestionData: Map<string, number>,
): Promise<void> {
  const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']> & {
    nextState?: string;
  };
  if (corp.nextState !== 'PURCHASE') {
    return;
  }
  // Loop and set buy amount
  await loopAllDivisionsAndCities(ns, async (divisionName, city) => {
    const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    if (!(await Do(ns, 'ns.corporation.hasWarehouse', division.name, city))) {
      return;
    }
    const industrialData = (await Do(ns, 'ns.corporation.getIndustryData', division.industry)) as CorpIndustryData;
    const office = (await Do(ns, 'ns.corporation.getOffice', division.name, city)) as ReturnType<
      NS['corporation']['getOffice']
    >;
    const requiredMaterials = getRecordEntries(industrialData.requiredMaterials);

    // Detect warehouse congestion
    let isWarehouseCongested = false;
    if (
      !setOfDivisionsWaitingForRP.has(divisionName) &&
      office.employeeJobs['Research & Development'] !== office.numEmployees
    ) {
      isWarehouseCongested = await detectWarehouseCongestion(
        ns,
        division,
        industrialData,
        city,
        warehouseCongestionData,
      );
    }
    if (isWarehouseCongested) {
      return;
    }

    const warehouse = (await Do(ns, 'ns.corporation.getWarehouse', division.name, city)) as ReturnType<
      NS['corporation']['getWarehouse']
    >;
    const inputMaterials: PartialRecord<
      CorpMaterialName,
      {
        requiredQuantity: number;
        coefficient: number;
      }
    > = {};
    for (const [materialName, materialCoefficient] of requiredMaterials) {
      inputMaterials[materialName] = {
        requiredQuantity: 0,
        coefficient: materialCoefficient,
      };
    }

    // Find required quantity of input materials to produce material/product
    for (const inputMaterialData of Object.values(inputMaterials)) {
      const requiredQuantity =
        (smartSupplyData.get(buildSmartSupplyKey(divisionName, city)) ?? 0) * inputMaterialData.coefficient;
      inputMaterialData.requiredQuantity += requiredQuantity;
    }

    // Limit the input material units to max number of units that we can store in warehouse's free space
    for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
      const materialData = (await Do(ns, 'ns.corporation.getMaterialData', materialName)) as ReturnType<
        NS['corporation']['getMaterialData']
      >;
      const maxAcceptableQuantity = Math.floor((warehouse.size - warehouse.sizeUsed) / materialData.size);
      const limitedRequiredQuantity = Math.min(inputMaterialData.requiredQuantity, maxAcceptableQuantity);
      if (limitedRequiredQuantity > 0) {
        inputMaterialData.requiredQuantity = limitedRequiredQuantity;
      }
    }

    // Find which input material creates the least number of output units
    let leastAmountOfOutputUnits = Number.MAX_VALUE;
    for (const { requiredQuantity, coefficient } of Object.values(inputMaterials)) {
      const amountOfOutputUnits = requiredQuantity / coefficient;
      if (amountOfOutputUnits < leastAmountOfOutputUnits) {
        leastAmountOfOutputUnits = amountOfOutputUnits;
      }
    }

    // Align all the input materials to the smallest amount
    for (const inputMaterialData of Object.values(inputMaterials)) {
      inputMaterialData.requiredQuantity = leastAmountOfOutputUnits * inputMaterialData.coefficient;
    }

    // Calculate the total size of all input materials we are trying to buy
    let requiredSpace = 0;
    for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
      const md = (await Do(ns, 'ns.corporation.getMaterialData', materialName)) as ReturnType<
        NS['corporation']['getMaterialData']
      >;
      requiredSpace += inputMaterialData.requiredQuantity * md.size;
    }

    // If there is not enough free space, we apply a multiplier to required quantity to not overfill warehouse
    const freeSpace = warehouse.size - warehouse.sizeUsed;
    if (requiredSpace > freeSpace) {
      const constrainedStorageSpaceMultiplier = freeSpace / requiredSpace;
      for (const inputMaterialData of Object.values(inputMaterials)) {
        inputMaterialData.requiredQuantity = Math.floor(
          inputMaterialData.requiredQuantity * constrainedStorageSpaceMultiplier,
        );
      }
    }

    // Deduct the number of stored input material units from the required quantity
    for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
      const material = (await Do(ns, 'ns.corporation.getMaterial', divisionName, city, materialName)) as Material;
      inputMaterialData.requiredQuantity = Math.max(0, inputMaterialData.requiredQuantity - material.stored);
    }

    // Buy input materials
    for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
      await Do(
        ns,
        'ns.corporation.buyMaterial',
        divisionName,
        city,
        materialName,
        inputMaterialData.requiredQuantity / 10,
      );
    }
  });
}

/**
 * @param ns
 * @param divisionName
 * @param industryData
 * @param city
 * @param useWarehouseSize If false, function uses unused storage size after PRODUCTION state
 * @param ratio
 */
export async function findOptimalAmountOfBoostMaterials(
  ns: NS,
  divisionName: string,
  industryData: CorpIndustryData,
  city: CityName,
  useWarehouseSize: boolean,
  ratio: number,
): Promise<number[]> {
  const wh = (await Do(ns, 'ns.corporation.getWarehouse', divisionName, city)) as ReturnType<
    NS['corporation']['getWarehouse']
  >;
  const warehouseSize = wh.size;
  if (useWarehouseSize) {
    return getOptimalBoostMaterialQuantities(industryData, warehouseSize * ratio);
  }
  await waitUntilAfterStateHappens(ns, CorpState.PRODUCTION);
  const wh2 = (await Do(ns, 'ns.corporation.getWarehouse', divisionName, city)) as ReturnType<
    NS['corporation']['getWarehouse']
  >;
  const availableSpace = wh2.size - wh2.sizeUsed;
  return getOptimalBoostMaterialQuantities(industryData, availableSpace * ratio);
}

export async function waitUntilHavingEnoughResearchPoints(
  ns: NS,
  conditions: {
    divisionName: string;
    researchPoint: number;
  }[],
): Promise<void> {
  ns.print(`Waiting for research points: ${JSON.stringify(conditions)}`);
  while (true) {
    let finish = true;
    for (const condition of conditions) {
      const div = (await Do(ns, 'ns.corporation.getDivision', condition.divisionName)) as ReturnType<
        NS['corporation']['getDivision']
      >;
      if (div.researchPoints >= condition.researchPoint) {
        setOfDivisionsWaitingForRP.delete(condition.divisionName);
        continue;
      }
      setOfDivisionsWaitingForRP.add(condition.divisionName);
      finish = false;
    }
    if (finish) {
      break;
    }
    await Do(ns, 'ns.corporation.nextUpdate');
  }
  ns.print(`Finished waiting for research points. Conditions: ${JSON.stringify(conditions)}`);
}

/**
 * This function assumes that all product's names were generated by {@link generateNextProductName}
 *
 * @param ns
 * @param divisionName
 */
export async function getProductIdArray(ns: NS, divisionName: string): Promise<number[]> {
  const products = (
    (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>
  ).products;
  return products
    .map((productName) => {
      const productNameParts = productName.split('-');
      if (productNameParts.length != 3) {
        return NaN;
      }
      return parseNumber(productNameParts[1]);
    })
    .filter((productIndex) => !Number.isNaN(productIndex));
}

/**
 * ["Tobacco-00000|1e12", "Tobacco-00001|1e12", "Tobacco-00002|1e12"] => "Tobacco-00003|1e12"
 * 1e12 is designInvest + marketingInvest
 *
 * @param ns
 * @param divisionName
 * @param productDevelopmentBudget
 */
export async function generateNextProductName(
  ns: NS,
  divisionName: string,
  productDevelopmentBudget: number,
): Promise<string> {
  if (!Number.isFinite(productDevelopmentBudget) || productDevelopmentBudget < 1e3) {
    throw new Error(`Invalid budget: ${productDevelopmentBudget}`);
  }
  const productIdArray = await getProductIdArray(ns, divisionName);
  if (productIdArray.length === 0) {
    return `${divisionName}-00000-${productDevelopmentBudget.toExponential(5)}`;
  }
  return `${divisionName}-${(Math.max(...productIdArray) + 1).toString().padStart(5, '0')}-${productDevelopmentBudget.toExponential(5)}`;
}

function parseProductBudgetFromName(productName: string): number | null {
  const lastHyphenIndex = productName.lastIndexOf('-');
  if (lastHyphenIndex < 0 || lastHyphenIndex === productName.length - 1) {
    return null;
  }
  const budget = Number(productName.slice(lastHyphenIndex + 1));
  if (!Number.isFinite(budget) || budget <= 0) {
    return null;
  }
  return budget;
}

async function getBestKnownProductBudget(
  ns: NS,
  divisionName: string,
  mainProductDevelopmentCity: CityName,
  products: string[],
): Promise<number> {
  let bestBudget = 0;
  for (const productName of products) {
    const parsedBudget = parseProductBudgetFromName(productName);
    if (parsedBudget !== null) {
      bestBudget = Math.max(bestBudget, parsedBudget);
      continue;
    }
    // Fallback for legacy products whose names do not encode budget.
    const product = (await Do(
      ns,
      'ns.corporation.getProduct',
      divisionName,
      mainProductDevelopmentCity,
      productName,
    )) as Product;
    const productBudget = product.designInvestment + product.advertisingInvestment;
    bestBudget = Math.max(bestBudget, productBudget);
  }
  return bestBudget;
}

async function getMaxNumberOfProducts(ns: NS, divisionName: string): Promise<number> {
  let maxNumberOfProducts = 3;
  if ((await Do(ns, 'ns.corporation.hasResearched', divisionName, ResearchName.UPGRADE_CAPACITY_1)) as boolean) {
    maxNumberOfProducts = 4;
  }
  if ((await Do(ns, 'ns.corporation.hasResearched', divisionName, ResearchName.UPGRADE_CAPACITY_2)) as boolean) {
    maxNumberOfProducts = 5;
  }
  return maxNumberOfProducts;
}

export async function developNewProduct(
  ns: NS,
  divisionName: string,
  mainProductDevelopmentCity: CityName,
  productDevelopmentBudget: number,
): Promise<string | null> {
  const currentFunds = (
    (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>
  ).funds;
  if (productDevelopmentBudget > currentFunds) {
    ns.print(
      `Skip developing new product: budget ${ns.format.number(productDevelopmentBudget)} ` +
        `> available funds ${ns.format.number(currentFunds)}.`,
    );
    return null;
  }

  const products = (
    (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>
  ).products;

  let hasDevelopingProduct = false;
  let bestProduct = null;
  let worstProduct = null;
  let maxProductRating = Number.MIN_VALUE;
  let minProductRating = Number.MAX_VALUE;
  for (const productName of products) {
    const product = (await Do(
      ns,
      'ns.corporation.getProduct',
      divisionName,
      mainProductDevelopmentCity,
      productName,
    )) as Product;
    //Check if there is any developing product
    if (product.developmentProgress < 100) {
      hasDevelopingProduct = true;
      break;
    }
    // Determine the best and worst product
    const productRating = product.rating;
    if (productRating < minProductRating) {
      worstProduct = product;
      minProductRating = productRating;
    }
    if (productRating > maxProductRating) {
      bestProduct = product;
      maxProductRating = productRating;
    }
  }

  // Do nothing if there is any developing product
  if (hasDevelopingProduct) {
    ns.print(`Skip developing new product: ${divisionName} already has a product in development.`);
    return null;
  }
  if (!bestProduct && products.length > 0) {
    throw new Error('Cannot find the best product');
  }
  if (!worstProduct && products.length > 0) {
    throw new Error('Cannot find the worst product to discontinue');
  }
  if (products.length > 0) {
    const bestKnownBudget = await getBestKnownProductBudget(ns, divisionName, mainProductDevelopmentCity, products);
    const minRequiredBudget = bestKnownBudget * 1.0102;
    if (productDevelopmentBudget < minRequiredBudget) {
      ns.print(
        `Skip developing new product: budget ${ns.format.number(productDevelopmentBudget)} ` +
          `< required ${ns.format.number(minRequiredBudget)} (1.02% above best budget ${ns.format.number(bestKnownBudget)}).`,
      );
      return null;
    }
  }

  if (worstProduct && products.length === (await getMaxNumberOfProducts(ns, divisionName))) {
    await Do(ns, 'ns.corporation.discontinueProduct', divisionName, worstProduct.name);
  }
  const productName = await generateNextProductName(ns, divisionName, productDevelopmentBudget);
  await Do(
    ns,
    'ns.corporation.makeProduct',
    divisionName,
    mainProductDevelopmentCity,
    productName,
    productDevelopmentBudget / 2,
    productDevelopmentBudget / 2,
  );
  return productName;
}

export async function getNewestProductName(ns: NS, divisionName: string): Promise<string | null> {
  const products = (
    (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<NS['corporation']['getDivision']>
  ).products;
  if (products.length === 0) {
    return null;
  }
  return products[products.length - 1];
}

export function estimateProductMarkup(
  designInvestment: number,
  advertisingInvestment: number,
  divisionRP: number,
  industryScienceFactor: number,
  employeeProductionByJob: {
    operationsProduction: number;
    engineerProduction: number;
    businessProduction: number;
    managementProduction: number;
    researchAndDevelopmentProduction: number;
  },
) {
  const totalCreationJobFactors =
    employeeProductionByJob.engineerProduction +
    employeeProductionByJob.managementProduction +
    employeeProductionByJob.researchAndDevelopmentProduction +
    employeeProductionByJob.operationsProduction +
    employeeProductionByJob.businessProduction;
  const engineerRatio = employeeProductionByJob.engineerProduction / totalCreationJobFactors;
  const managementRatio = employeeProductionByJob.managementProduction / totalCreationJobFactors;
  const researchAndDevelopmentRatio =
    employeeProductionByJob.researchAndDevelopmentProduction / totalCreationJobFactors;
  const operationsRatio = employeeProductionByJob.operationsProduction / totalCreationJobFactors;
  const businessRatio = employeeProductionByJob.businessProduction / totalCreationJobFactors;

  const balanceMultiplier =
    1.2 * engineerRatio +
    0.9 * managementRatio +
    1.3 * researchAndDevelopmentRatio +
    1.5 * operationsRatio +
    businessRatio;

  const designInvestmentMultiplier = 1 + Math.pow(designInvestment, 0.1) / 100;
  const researchPointMultiplier = 1 + Math.pow(divisionRP, industryScienceFactor) / 800;

  const totalMultiplier = balanceMultiplier * designInvestmentMultiplier * researchPointMultiplier;
  const productQuality =
    totalMultiplier *
    (0.1 * employeeProductionByJob.engineerProduction +
      0.05 * employeeProductionByJob.managementProduction +
      0.05 * employeeProductionByJob.researchAndDevelopmentProduction +
      0.02 * employeeProductionByJob.operationsProduction +
      0.02 * employeeProductionByJob.businessProduction);
  const advertisingInvestmentMultiplier = 1 + Math.pow(advertisingInvestment, 0.1) / 100;
  const businessManagementRatio = Math.max(businessRatio + managementRatio, 1 / totalCreationJobFactors);
  return 100 / (advertisingInvestmentMultiplier * Math.pow(productQuality + 0.001, 0.65) * businessManagementRatio);
}

export async function calculateProductMarkup(
  divisionRP: number,
  industryScienceFactor: number,
  product: Product,
  employeeProductionByJob?: {
    operationsProduction: number;
    engineerProduction: number;
    businessProduction: number;
    managementProduction: number;
    researchAndDevelopmentProduction: number;
  },
): Promise<number> {
  const designInvestmentMultiplier = 1 + Math.pow(product.designInvestment, 0.1) / 100;
  const researchPointMultiplier = 1 + Math.pow(divisionRP, industryScienceFactor) / 800;
  const k = designInvestmentMultiplier * researchPointMultiplier;
  const balanceMultiplier = function (
    creationJobFactorsEngineer: number,
    creationJobFactorsManagement: number,
    creationJobFactorsRnD: number,
    creationJobFactorsOperations: number,
    creationJobFactorsBusiness: number,
  ): number {
    const totalCreationJobFactors =
      creationJobFactorsEngineer +
      creationJobFactorsManagement +
      creationJobFactorsRnD +
      creationJobFactorsOperations +
      creationJobFactorsBusiness;
    const engineerRatio = creationJobFactorsEngineer / totalCreationJobFactors;
    const managementRatio = creationJobFactorsManagement / totalCreationJobFactors;
    const researchAndDevelopmentRatio = creationJobFactorsRnD / totalCreationJobFactors;
    const operationsRatio = creationJobFactorsOperations / totalCreationJobFactors;
    const businessRatio = creationJobFactorsBusiness / totalCreationJobFactors;
    return (
      1.2 * engineerRatio +
      0.9 * managementRatio +
      1.3 * researchAndDevelopmentRatio +
      1.5 * operationsRatio +
      businessRatio
    );
  };
  const f1 = function ([
    creationJobFactorsEngineer,
    creationJobFactorsManagement,
    creationJobFactorsRnD,
    creationJobFactorsOperations,
    creationJobFactorsBusiness,
  ]: number[]) {
    return (
      k *
        balanceMultiplier(
          creationJobFactorsEngineer,
          creationJobFactorsManagement,
          creationJobFactorsRnD,
          creationJobFactorsOperations,
          creationJobFactorsBusiness,
        ) *
        (0.1 * creationJobFactorsEngineer +
          0.05 * creationJobFactorsManagement +
          0.05 * creationJobFactorsRnD +
          0.02 * creationJobFactorsOperations +
          0.02 * creationJobFactorsBusiness) -
      product.stats.quality
    );
  };
  const f2 = function ([
    creationJobFactorsEngineer,
    creationJobFactorsManagement,
    creationJobFactorsRnD,
    creationJobFactorsOperations,
    creationJobFactorsBusiness,
  ]: number[]) {
    return (
      k *
        balanceMultiplier(
          creationJobFactorsEngineer,
          creationJobFactorsManagement,
          creationJobFactorsRnD,
          creationJobFactorsOperations,
          creationJobFactorsBusiness,
        ) *
        (0.15 * creationJobFactorsEngineer +
          0.02 * creationJobFactorsManagement +
          0.02 * creationJobFactorsRnD +
          0.02 * creationJobFactorsOperations +
          0.02 * creationJobFactorsBusiness) -
      product.stats.performance
    );
  };
  const f3 = function ([
    creationJobFactorsEngineer,
    creationJobFactorsManagement,
    creationJobFactorsRnD,
    creationJobFactorsOperations,
    creationJobFactorsBusiness,
  ]: number[]) {
    return (
      k *
        balanceMultiplier(
          creationJobFactorsEngineer,
          creationJobFactorsManagement,
          creationJobFactorsRnD,
          creationJobFactorsOperations,
          creationJobFactorsBusiness,
        ) *
        (0.05 * creationJobFactorsEngineer +
          0.02 * creationJobFactorsManagement +
          0.08 * creationJobFactorsRnD +
          0.05 * creationJobFactorsOperations +
          0.05 * creationJobFactorsBusiness) -
      product.stats.durability
    );
  };
  const f4 = function ([
    creationJobFactorsEngineer,
    creationJobFactorsManagement,
    creationJobFactorsRnD,
    creationJobFactorsOperations,
    creationJobFactorsBusiness,
  ]: number[]) {
    return (
      k *
        balanceMultiplier(
          creationJobFactorsEngineer,
          creationJobFactorsManagement,
          creationJobFactorsRnD,
          creationJobFactorsOperations,
          creationJobFactorsBusiness,
        ) *
        (0.02 * creationJobFactorsEngineer +
          0.08 * creationJobFactorsManagement +
          0.02 * creationJobFactorsRnD +
          0.05 * creationJobFactorsOperations +
          0.08 * creationJobFactorsBusiness) -
      product.stats.reliability
    );
  };
  const f5 = function ([
    creationJobFactorsEngineer,
    creationJobFactorsManagement,
    creationJobFactorsRnD,
    creationJobFactorsOperations,
    creationJobFactorsBusiness,
  ]: number[]) {
    return (
      k *
        balanceMultiplier(
          creationJobFactorsEngineer,
          creationJobFactorsManagement,
          creationJobFactorsRnD,
          creationJobFactorsOperations,
          creationJobFactorsBusiness,
        ) *
        (0.08 * creationJobFactorsManagement +
          0.05 * creationJobFactorsRnD +
          0.02 * creationJobFactorsOperations +
          0.1 * creationJobFactorsBusiness) -
      product.stats.aesthetics
    );
  };
  let solverResult: CeresSolverResult = {
    success: false,
    message: '',
    x: [],
    report: 'string',
  };
  const solver = new Ceres();
  await solver.promise.then(function () {
    solver.add_function(f1);
    solver.add_function(f2);
    solver.add_function(f3);
    solver.add_function(f4);
    solver.add_function(f5);
    // Guess the initial values of the solution
    let guess = [1, 1, 1, 1, 1];
    if (employeeProductionByJob) {
      guess = [
        employeeProductionByJob.engineerProduction,
        employeeProductionByJob.managementProduction,
        employeeProductionByJob.researchAndDevelopmentProduction,
        employeeProductionByJob.operationsProduction,
        employeeProductionByJob.businessProduction,
      ];
    }
    solverResult = solver.solve(guess)!;
    solver.remove();
  });
  if (!solverResult.success) {
    throw new Error(`ERROR: Cannot find hidden stats of product: ${JSON.stringify(product)}`);
  }
  const totalCreationJobFactors =
    solverResult.x[0] + solverResult.x[1] + solverResult.x[2] + solverResult.x[3] + solverResult.x[4];
  const managementRatio = solverResult.x[1] / totalCreationJobFactors;
  const businessRatio = solverResult.x[4] / totalCreationJobFactors;

  const advertisingInvestmentMultiplier = 1 + Math.pow(product.advertisingInvestment, 0.1) / 100;
  const businessManagementRatio = Math.max(businessRatio + managementRatio, 1 / totalCreationJobFactors);
  return (
    100 / (advertisingInvestmentMultiplier * Math.pow(product.stats.quality + 0.001, 0.65) * businessManagementRatio)
  );
}

export function isProduct(item: Material | Product): item is Product {
  return 'rating' in item;
}

export async function validateProductMarkupMap(ns: NS): Promise<void> {
  for (const productKey of productMarkupData.keys()) {
    const productKeyInfo = productKey.split('|');
    const divisionName = productKeyInfo[0];
    const productName = productKeyInfo[2];
    if (!(await hasDivision(ns, divisionName))) {
      productMarkupData.delete(productKey);
      continue;
    }
    const div = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    if (!div.products.includes(productName)) {
      productMarkupData.delete(productKey);
    }
  }
}

export async function getProductMarkup(
  division: Division,
  industryData: CorpIndustryData,
  city: CityName,
  item: Product,
  office?: Office,
): Promise<number> {
  let productMarkup;
  const productMarkupKey = `${division.name}|${city}|${item.name}`;
  productMarkup = productMarkupData.get(productMarkupKey);
  if (!productMarkup) {
    productMarkup = await calculateProductMarkup(
      division.researchPoints,
      industryData.scienceFactor!,
      item,
      office
        ? {
            operationsProduction: office.employeeProductionByJob.Operations,
            engineerProduction: office.employeeProductionByJob.Engineer,
            businessProduction: office.employeeProductionByJob.Business,
            managementProduction: office.employeeProductionByJob.Management,
            researchAndDevelopmentProduction: office.employeeProductionByJob['Research & Development'],
          }
        : undefined,
    );
    productMarkupData.set(productMarkupKey, productMarkup);
  }
  return productMarkup;
}

/**
 * Custom Market-TA.II script
 *
 * @param ns
 * @param division
 * @param industryData
 * @param city
 * @param item
 * @returns
 */
export async function getOptimalSellingPrice(
  ns: NS,
  division: Division,
  industryData: CorpIndustryData,
  city: CityName,
  item: Material | Product,
): Promise<string> {
  const itemIsProduct = isProduct(item);
  if (itemIsProduct && item.developmentProgress < 100) {
    throw new Error(`Product is not finished. Product: ${JSON.stringify(item)}`);
  }
  if (!((await Do(ns, 'ns.corporation.hasUnlock', UnlockName.MARKET_RESEARCH_DEMAND)) as boolean)) {
    throw new Error(`You must unlock "Market Research - Demand"`);
  }
  if (!((await Do(ns, 'ns.corporation.hasUnlock', UnlockName.MARKET_DATA_COMPETITION)) as boolean)) {
    throw new Error(`You must unlock "Market Data - Competition"`);
  }

  const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']> & {
    nextState?: string;
  };
  if (corp.nextState !== 'SALE') {
    return '0';
  }
  const expectedSalesVolume = item.stored / 10;
  // Do not compare with 0, there is case when item.stored is a tiny number.
  if (expectedSalesVolume < 1e-5) {
    return '0';
  }

  const office = (await Do(ns, 'ns.corporation.getOffice', division.name, city)) as ReturnType<
    NS['corporation']['getOffice']
  >;
  let productMarkup: number;
  let markupLimit: number;
  let itemMultiplier: number;
  let marketPrice: number;
  if (itemIsProduct) {
    productMarkup = await getProductMarkup(division, industryData, city, item, office);
    markupLimit = Math.max(item.effectiveRating, 0.001) / productMarkup;
    itemMultiplier = 0.5 * Math.pow(item.effectiveRating, 0.65);
    marketPrice = item.productionCost;
  } else {
    const matData = (await Do(ns, 'ns.corporation.getMaterialData', item.name)) as ReturnType<
      NS['corporation']['getMaterialData']
    >;
    markupLimit = item.quality / matData.baseMarkup;
    itemMultiplier = item.quality + 0.001;
    marketPrice = item.marketPrice;
  }

  const businessFactor = getBusinessFactor(office.employeeProductionByJob[EmployeePosition.BUSINESS]);
  const advertisingFactor = getAdvertisingFactors(
    division.awareness,
    division.popularity,
    industryData.advertisingFactor!,
  )[0];
  const marketFactor = getMarketFactor(item.demand!, item.competition!);
  const salesBotLevel = (await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.ABC_SALES_BOTS)) as number;
  const salesMultipliers =
    itemMultiplier *
    businessFactor *
    advertisingFactor *
    marketFactor *
    getUpgradeBenefit(UpgradeName.ABC_SALES_BOTS, salesBotLevel) *
    getResearchSalesMultiplier(await getDivisionResearches(ns, division.name));
  const optimalPrice = markupLimit / Math.sqrt(expectedSalesVolume / salesMultipliers) + marketPrice;
  // ns.print(`item: ${item.name}, optimalPrice: ${ns.format.number(optimalPrice)}`);

  return optimalPrice.toString();
}

export async function setOptimalSellingPriceForEverything(ns: NS): Promise<void> {
  const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']> & {
    nextState?: string;
  };
  if (corp.nextState !== 'SALE') {
    return;
  }
  if (
    !((await Do(ns, 'ns.corporation.hasUnlock', UnlockName.MARKET_RESEARCH_DEMAND)) as boolean) ||
    !((await Do(ns, 'ns.corporation.hasUnlock', UnlockName.MARKET_DATA_COMPETITION)) as boolean)
  ) {
    return;
  }
  await loopAllDivisionsAndCitiesAsyncCallback(ns, async (divisionName, city) => {
    const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    const industryData = (await Do(ns, 'ns.corporation.getIndustryData', division.industry)) as CorpIndustryData;
    const products = division.products;
    const hasMarketTA2 = (await Do(
      ns,
      'ns.corporation.hasResearched',
      divisionName,
      ResearchName.MARKET_TA_2,
    )) as boolean;
    if (industryData.makesProducts) {
      // Set sell price for products
      for (const productName of products) {
        const product = (await Do(ns, 'ns.corporation.getProduct', divisionName, city, productName)) as Product;
        if (product.developmentProgress < 100) {
          continue;
        }
        if (hasMarketTA2) {
          await Do(ns, 'ns.corporation.setProductMarketTA2', divisionName, productName, true);
          continue;
        }
        const optimalPrice = await getOptimalSellingPrice(ns, division, industryData, city, product);
        if (parseNumber(optimalPrice) > 0) {
          await Do(ns, 'ns.corporation.sellProduct', divisionName, city, productName, 'MAX', optimalPrice, false);
        }
      }
    }
    if (industryData.makesMaterials) {
      // Set sell price for output materials
      for (const materialName of industryData.producedMaterials!) {
        const material = (await Do(ns, 'ns.corporation.getMaterial', divisionName, city, materialName)) as Material;
        if (hasMarketTA2) {
          await Do(ns, 'ns.corporation.setMaterialMarketTA2', divisionName, city, materialName, true);
          continue;
        }
        const optimalPrice = await getOptimalSellingPrice(ns, division, industryData, city, material);
        if (parseNumber(optimalPrice) > 0) {
          await Do(ns, 'ns.corporation.sellMaterial', divisionName, city, materialName, 'MAX', optimalPrice);
        }
      }
    }
  });
}

export async function getResearchPointGainRate(ns: NS, divisionName: string): Promise<number> {
  let totalGainRate = 0;
  const piLevel = (await Do(ns, 'ns.corporation.getUpgradeLevel', UpgradeName.PROJECT_INSIGHT)) as number;
  const divRes = await getDivisionResearches(ns, divisionName);
  for (const city of cities) {
    const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city)) as ReturnType<
      NS['corporation']['getOffice']
    >;
    // 4 states: PURCHASE, PRODUCTION, EXPORT and SALE
    totalGainRate +=
      4 *
      0.004 *
      Math.pow(office.employeeProductionByJob[EmployeePosition.RESEARCH_DEVELOPMENT], 0.5) *
      getUpgradeBenefit(UpgradeName.PROJECT_INSIGHT, piLevel) *
      getResearchRPMultiplier(divRes);
  }
  return totalGainRate;
}

export async function buyBoostMaterials(ns: NS, division: Division): Promise<void> {
  // This method is only called in round 3+. If we don't have more than 10e9 in funds, there must be something wrong
  // in the script.
  const funds = ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>)
    .funds;
  if (funds < 10e9) {
    ns.print(`WARN: Skipping boost materials purchase — funds too low (${ns.format.number(funds)})`);
    return;
  }
  const industryData = (await Do(ns, 'ns.corporation.getIndustryData', division.industry)) as CorpIndustryData;
  let reservedSpaceRatio = 0.2;
  const ratio = 0.1;
  if (industryData.makesProducts) {
    reservedSpaceRatio = 0.1;
  }
  let count = 0;
  while (true) {
    await waitForNextTimeStateHappens(ns, CorpState.EXPORT);
    if (count === 20) {
      const warningMessage = `It takes too many cycles to buy boost materials. Division: ${division.name}.`;
      showWarning(ns, warningMessage);
      break;
    }
    let finish = true;
    const orders = [];
    for (const city of cities) {
      const warehouse = (await Do(ns, 'ns.corporation.getWarehouse', division.name, city)) as ReturnType<
        NS['corporation']['getWarehouse']
      >;
      const availableSpace = warehouse.size - warehouse.sizeUsed;
      if (availableSpace < warehouse.size * reservedSpaceRatio) {
        continue;
      }
      let effectiveRatio = ratio;
      if (
        (availableSpace / warehouse.size < 0.5 && division.industry === IndustryType.AGRICULTURE) ||
        (availableSpace / warehouse.size < 0.75 &&
          (division.industry === IndustryType.CHEMICAL || division.industry === IndustryType.TOBACCO))
      ) {
        effectiveRatio = 0.2;
      }
      const boostMaterialQuantities = getOptimalBoostMaterialQuantities(industryData, availableSpace * effectiveRatio);
      orders.push({
        city: city,
        materials: [
          {
            name: MaterialName.AI_CORES,
            count:
              ((await Do(ns, 'ns.corporation.getMaterial', division.name, city, MaterialName.AI_CORES)) as Material)
                .stored + boostMaterialQuantities[0],
          },
          {
            name: MaterialName.HARDWARE,
            count:
              ((await Do(ns, 'ns.corporation.getMaterial', division.name, city, MaterialName.HARDWARE)) as Material)
                .stored + boostMaterialQuantities[1],
          },
          {
            name: MaterialName.REAL_ESTATE,
            count:
              ((await Do(ns, 'ns.corporation.getMaterial', division.name, city, MaterialName.REAL_ESTATE)) as Material)
                .stored + boostMaterialQuantities[2],
          },
          {
            name: MaterialName.ROBOTS,
            count:
              ((await Do(ns, 'ns.corporation.getMaterial', division.name, city, MaterialName.ROBOTS)) as Material)
                .stored + boostMaterialQuantities[3],
          },
        ],
      });
      finish = false;
    }
    if (finish) {
      break;
    }
    await stockMaterials(ns, division.name, orders, true);
    ++count;
  }
}

export async function getProductMarketPrice(
  ns: NS,
  division: Division,
  industryData: CorpIndustryData,
  city: CityName,
): Promise<number> {
  let productMarketPrice = 0;
  for (const [materialName, materialCoefficient] of getRecordEntries(industryData.requiredMaterials)) {
    const materialMarketPrice = (
      (await Do(ns, 'ns.corporation.getMaterial', division.name, city, materialName)) as Material
    ).marketPrice;
    productMarketPrice += materialMarketPrice * materialCoefficient;
  }
  return productMarketPrice * productMarketPriceMultiplier;
}

export async function createDummyDivisions(ns: NS, numberOfDivisions: number): Promise<void> {
  const divisions = ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>)
    .divisions;
  const restaurantIndustryData = (await Do(
    ns,
    'ns.corporation.getIndustryData',
    IndustryType.RESTAURANT,
  )) as CorpIndustryData;
  for (let i = 0; i < numberOfDivisions; i++) {
    const dummyDivisionName = dummyDivisionNamePrefix + i.toString().padStart(2, '0');
    if (divisions.includes(dummyDivisionName)) {
      continue;
    }
    let cyclesWaited = 0;
    while (true) {
      const funds = ((await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>)
        .funds;
      if (funds >= restaurantIndustryData.startingCost) {
        break;
      }
      cyclesWaited += 10;
      if (cyclesWaited % 50 === 0) {
        ns.print(
          `Waiting to create ${dummyDivisionName}: ${ns.format.number(funds)} / ` +
            `${ns.format.number(restaurantIndustryData.startingCost)} (${cyclesWaited} cycles)`,
        );
      }
      await waitForNumberOfCycles(ns, 10);
    }
    await Do(ns, 'ns.corporation.expandIndustry', IndustryType.RESTAURANT, dummyDivisionName);
    const division = (await Do(ns, 'ns.corporation.getDivision', dummyDivisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    for (const city of cities) {
      if (!division.cities.includes(city)) {
        await Do(ns, 'ns.corporation.expandCity', dummyDivisionName, city);
      }
      if (!(await Do(ns, 'ns.corporation.hasWarehouse', dummyDivisionName, city))) {
        await Do(ns, 'ns.corporation.purchaseWarehouse', dummyDivisionName, city);
      }
    }
  }
}

export async function waitForOffer(
  ns: NS,
  numberOfInitCycles: number,
  maxAdditionalCycles: number,
  expectedOffer: number,
): Promise<void> {
  ns.print(`Waiting ${numberOfInitCycles} initial cycles for offer to stabilize...`);
  await waitForNumberOfCycles(ns, numberOfInitCycles);
  let offer = (
    (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<NS['corporation']['getInvestmentOffer']>
  ).funds;
  ns.print(`Initial offer: ${ns.format.number(offer)}`);
  for (let i = 0; i < maxAdditionalCycles; i++) {
    await waitForNumberOfCycles(ns, 1);
    const inv = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    ns.print(`Offer check ${i + 1}/${maxAdditionalCycles}: ${ns.format.number(inv.funds)}`);
    console.log(`Offer: ${ns.format.number(inv.funds)}`);
    if (inv.funds < offer * 1.001) {
      ns.print('Offer stabilized.');
      break;
    }
    offer = inv.funds;
  }
  let invFinal = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
    NS['corporation']['getInvestmentOffer']
  >;
  const maxExtraWaitCycles = 50;
  let extraCycles = 0;
  let prevOffer = invFinal.funds;
  while (invFinal.funds < expectedOffer && extraCycles < maxExtraWaitCycles) {
    ns.print(
      `Offer ${ns.format.number(invFinal.funds)} < target ${ns.format.number(expectedOffer)}, ` +
        `waiting... (${extraCycles}/${maxExtraWaitCycles} extra cycles)`,
    );
    console.log(
      `Offer ${ns.format.number(invFinal.funds)} is below expected ${ns.format.number(expectedOffer)}, ` +
        `waiting... (${extraCycles}/${maxExtraWaitCycles})`,
    );
    await waitForNumberOfCycles(ns, 5);
    extraCycles += 5;
    invFinal = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    if (invFinal.funds < expectedOffer * 0.5 && invFinal.funds < prevOffer * 1.01) {
      ns.print(
        `Offer plateaued at ${ns.format.number(invFinal.funds)}, far below target ${ns.format.number(expectedOffer)}. Accepting early.`,
      );
      console.warn(
        `Offer plateaued at ${ns.format.number(invFinal.funds)}, far below target ${ns.format.number(expectedOffer)}. Accepting early.`,
      );
      break;
    }
    prevOffer = invFinal.funds;
  }
  if (invFinal.funds < expectedOffer) {
    ns.print(
      `WARNING: Accepting offer ${ns.format.number(invFinal.funds)} below target ${ns.format.number(expectedOffer)}`,
    );
    console.warn(
      `Accepting offer ${ns.format.number(invFinal.funds)} below expected ${ns.format.number(expectedOffer)} after ${extraCycles} extra cycles`,
    );
  } else {
    ns.print(`Offer ready: ${ns.format.number(invFinal.funds)}`);
  }
}

/* eslint-disable no-unused-vars */

import { CityName, NS, Product } from '@ns';
import { mean } from '../../libs/utils';
import { Do } from '../do';
import { CorporationUpgradeLevels, DivisionResearches, formatNumber, OfficeSetup } from './corporation-formulas';
import { isTestingToolsAvailable } from './corporation-testing-tools';
import {
  cities,
  dummyDivisionNamePrefix,
  getCorporationUpgradeLevels,
  getDivisionResearches,
} from './corporation-utils';

declare global {
  var corporationEventCycle: number;

  var corporationEventData: CorporationEvent[];

  var corporationEventSnapshotData: CorporationEvent[];
}

interface DivisionData {
  name: string;
  awareness: number;
  popularity: number;
  advert: number;
  researchPoints: number;
  researches: DivisionResearches;
  warehouses: {
    city: CityName;
    level: number;
    size: number;
  }[];
  offices: OfficeSetup[];
}

interface CorporationEvent {
  cycle: number;
}

interface DefaultCorporationEvent extends CorporationEvent {
  divisions: DivisionData[];
  funds: number;
  revenue: number;
  expenses: number;
  fundingRound: number;
  fundingOffer: number;
  upgrades: CorporationUpgradeLevels;
}

interface NewProductEvent extends CorporationEvent {
  cycle: number;
  newestProduct: Product;
  lastProduct?: Product;
  researchPoints: number;
}

interface SkipDevelopingNewProductEvent extends CorporationEvent {
  cycle: number;
  revenue: number;
  expenses: number;
}

interface OfferAcceptanceEvent extends CorporationEvent {
  cycle: number;
  round: number;
  offer: number;
}

interface EmployeeRatioData {
  cycle: number;
  fundingRound: number;
  profit: number;
  nonRnDEmployees: number;
  operations: number;
  engineer: number;
  business: number;
  management: number;
  operationsRatio: number;
  engineerRatio: number;
  businessRatio: number;
  managementRatio: number;
}

class CorporationEventLogger {
  constructor() {
    if (!Number.isFinite(globalThis.corporationEventCycle)) {
      if (isTestingToolsAvailable() && globalThis.Player?.corporation) {
        globalThis.corporationEventCycle = globalThis.Player.corporation.cycleCount ?? 0;
      } else {
        globalThis.corporationEventCycle = 0;
      }
    }
    if (!globalThis.corporationEventData) {
      globalThis.corporationEventData = [];
    }
    if (!globalThis.corporationEventSnapshotData) {
      globalThis.corporationEventSnapshotData = [];
    }
  }

  get cycle(): number {
    return globalThis.corporationEventCycle ?? 0;
  }

  set cycle(value: number) {
    globalThis.corporationEventCycle = value;
  }

  get #events() {
    return globalThis.corporationEventData;
  }

  get #eventsSnapshot() {
    return globalThis.corporationEventSnapshotData;
  }

  set #eventsSnapshot(value: CorporationEvent[]) {
    globalThis.corporationEventSnapshotData = value;
  }

  private limitNumberOfEvents(): void {
    if (this.#events.length > 2000) {
      this.#events.shift();
    }
  }

  private async createDefaultEvent(ns: NS): Promise<DefaultCorporationEvent> {
    const corporation = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<
      NS['corporation']['getCorporation']
    >;
    const investmentOffer = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    const corporationEvent: DefaultCorporationEvent = {
      cycle: this.cycle,
      divisions: [],
      funds: corporation.funds,
      revenue: corporation.revenue,
      expenses: corporation.expenses,
      fundingRound: investmentOffer.round,
      fundingOffer: investmentOffer.funds,
      upgrades: await getCorporationUpgradeLevels(ns),
    };
    const divisions = corporation.divisions;
    for (const divisionName of divisions) {
      if (divisionName.startsWith(dummyDivisionNamePrefix)) {
        continue;
      }
      const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
        NS['corporation']['getDivision']
      >;
      const divisionData: DivisionData = {
        name: divisionName,
        awareness: division.awareness,
        popularity: division.popularity,
        advert: division.awareness,
        researchPoints: division.researchPoints,
        researches: await getDivisionResearches(ns, divisionName),
        warehouses: [],
        offices: [],
      };
      for (const city of division.cities) {
        if (!(await Do(ns, 'ns.corporation.hasWarehouse', divisionName, city))) {
          continue;
        }
        const warehouse = (await Do(ns, 'ns.corporation.getWarehouse', divisionName, city)) as ReturnType<
          NS['corporation']['getWarehouse']
        >;
        const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city)) as ReturnType<
          NS['corporation']['getOffice']
        >;
        divisionData.warehouses.push({
          city: city,
          level: warehouse.level,
          size: warehouse.size,
        });
        divisionData.offices.push({
          city: city,
          size: office.size,
          jobs: {
            Operations: office.employeeJobs.Operations,
            Engineer: office.employeeJobs.Engineer,
            Business: office.employeeJobs.Business,
            Management: office.employeeJobs.Management,
            'Research & Development': office.employeeJobs['Research & Development'],
          },
        });
      }
      corporationEvent.divisions.push(divisionData);
    }
    return corporationEvent;
  }

  public async generateDefaultEvent(ns: NS): Promise<void> {
    this.#events.push(await this.createDefaultEvent(ns));
    this.limitNumberOfEvents();
  }

  public async generateNewProductEvent(ns: NS, divisionName: string): Promise<void> {
    const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as ReturnType<
      NS['corporation']['getDivision']
    >;
    const products = division.products;
    if (products.length === 0) {
      throw new Error(`Division ${divisionName} does not have any product`);
    }
    let lastProduct: Product | undefined;
    if (products.length > 1) {
      lastProduct = (await Do(
        ns,
        'ns.corporation.getProduct',
        divisionName,
        ns.enums.CityName.Sector12,
        products[products.length - 2],
      )) as Product;
    }
    const newProductEvent: NewProductEvent = {
      cycle: this.cycle,
      newestProduct: (await Do(
        ns,
        'ns.corporation.getProduct',
        divisionName,
        ns.enums.CityName.Sector12,
        products[products.length - 1],
      )) as Product,
      lastProduct: lastProduct,
      researchPoints: division.researchPoints,
    };
    this.#events.push(newProductEvent);
    this.limitNumberOfEvents();
  }

  public async generateSkipDevelopingNewProductEvent(ns: NS): Promise<void> {
    const corp = (await Do(ns, 'ns.corporation.getCorporation')) as ReturnType<NS['corporation']['getCorporation']>;
    const skipDevelopingNewProductEvent: SkipDevelopingNewProductEvent = {
      cycle: this.cycle,
      revenue: corp.revenue,
      expenses: corp.expenses,
    };
    this.#events.push(skipDevelopingNewProductEvent);
    this.limitNumberOfEvents();
  }

  public async generateOfferAcceptanceEvent(ns: NS): Promise<void> {
    const offer = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as ReturnType<
      NS['corporation']['getInvestmentOffer']
    >;
    const offerAcceptanceEvent: OfferAcceptanceEvent = {
      cycle: this.cycle,
      round: offer.round,
      offer: offer.funds,
    };
    this.#events.push(offerAcceptanceEvent);
    this.limitNumberOfEvents();
  }

  public clearEventData(): void {
    this.#events.length = 0;
  }

  public exportEventData(): string {
    return JSON.stringify(this.#events);
  }

  public saveEventSnapshotData(): void {
    this.#eventsSnapshot = structuredClone(this.#events);
  }

  public exportEventSnapshotData(): string {
    return JSON.stringify(this.#eventsSnapshot);
  }
}

export const corporationEventLogger = new CorporationEventLogger();

const profitMilestones = [
  1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22, 1e23, 1e24, 1e25, 1e26, 1e27, 1e28,
  1e29, 1e30, 1e31, 1e32, 1e33, 1e34, 1e35, 1e40, 1e50, 1e60, 1e70, 1e74, 1e75, 1e78, 1e80, 1e88, 1e89, 1e90, 1e91,
  1e92, 1e93, 1e94, 1e95, 1e96, 1e97, 1e98, 1e99, 1e100,
];

function isDefaultCorporationEvent(event: CorporationEvent): event is DefaultCorporationEvent {
  return 'divisions' in event;
}

function isNewProductEvent(event: CorporationEvent): event is NewProductEvent {
  return 'newestProduct' in event;
}

function isSkipDevelopingNewProductEvent(event: CorporationEvent): event is SkipDevelopingNewProductEvent {
  return 'revenue' in event && !('funds' in event);
}

function isOfferAcceptanceEvent(event: CorporationEvent): event is OfferAcceptanceEvent {
  return 'round' in event;
}

export function analyseEventData(eventData: string): void {
  const events: CorporationEvent[] = JSON.parse(eventData);
  let currentMilestonesIndex = 0;
  for (const event of events) {
    if (isNewProductEvent(event)) {
      console.log(
        `${event.cycle}: newest product: ${event.newestProduct.name}, RP: ${formatNumber(event.researchPoints)}`,
      );
      continue;
    }
    if (isSkipDevelopingNewProductEvent(event)) {
      console.log(
        `${event.cycle}: skip developing new product, profit: ${formatNumber(event.revenue - event.expenses)}`,
      );
      continue;
    }
    if (isOfferAcceptanceEvent(event)) {
      console.log(`${event.cycle}: round: ${event.round}, offer: ${formatNumber(event.offer)}`);
      continue;
    }
    if (!isDefaultCorporationEvent(event)) {
      console.error('Invalid event:', event);
      continue;
    }
    const profit = event.revenue - event.expenses;
    if (profit >= profitMilestones[currentMilestonesIndex]) {
      console.log(`${event.cycle}: profit: ${formatNumber(profit)}`);
      ++currentMilestonesIndex;
    }
  }
}

/**
 * divisionIndex:
 * - 0: Agriculture
 * - 1: Chemical
 * - 2: Tobacco
 *
 * @param eventData
 * @param divisionIndex
 */
export function analyseEmployeeRatio(eventData: string, divisionIndex: number): void {
  const events: CorporationEvent[] = JSON.parse(eventData);
  const data = new Map<number, EmployeeRatioData>();
  const isSupportDivision = divisionIndex === 0 || divisionIndex === 1;
  const isProductDivision = !isSupportDivision;
  for (const event of events) {
    if (isNewProductEvent(event) || isSkipDevelopingNewProductEvent(event) || isOfferAcceptanceEvent(event)) {
      continue;
    }
    if (!isDefaultCorporationEvent(event)) {
      console.error('Invalid event:', event);
      continue;
    }
    const office = event.divisions[divisionIndex].offices[0];
    if (data.has(office.size)) {
      continue;
    }
    const jobs = office.jobs;
    const nonRnDEmployees = jobs.Operations + jobs.Engineer + jobs.Business + jobs.Management;
    const operationsRatio = jobs.Operations / nonRnDEmployees;
    const engineerRatio = jobs.Engineer / nonRnDEmployees;
    const businessRatio = jobs.Business / nonRnDEmployees;
    const managementRatio = jobs.Management / nonRnDEmployees;
    const dataItem: EmployeeRatioData = {
      cycle: event.cycle,
      fundingRound: event.fundingRound,
      profit: event.revenue - event.expenses,
      nonRnDEmployees: nonRnDEmployees,
      operations: jobs.Operations,
      engineer: jobs.Engineer,
      business: jobs.Business,
      management: jobs.Management,
      operationsRatio: operationsRatio,
      engineerRatio: engineerRatio,
      businessRatio: businessRatio,
      managementRatio: managementRatio,
    };
    data.set(office.size, dataItem);
    console.log(
      event.cycle,
      event.fundingRound,
      event.revenue.toExponential(),
      office.size,
      nonRnDEmployees,
      jobs.Operations,
      jobs.Engineer,
      jobs.Business,
      jobs.Management,
      operationsRatio.toFixed(3),
      engineerRatio.toFixed(3),
      businessRatio.toFixed(3),
      managementRatio.toFixed(3),
    );
  }
  const filteredData = [...data.values()].filter((value) => {
    if (isSupportDivision) {
      return value.fundingRound >= 4;
    }
    return value.operations > 0;
  });
  if (isSupportDivision) {
    console.log(
      mean(filteredData.map((value) => value.operationsRatio)).toFixed(3),
      mean(filteredData.map((value) => value.engineerRatio)).toFixed(3),
      mean(filteredData.map((value) => value.businessRatio)).toFixed(3),
      mean(filteredData.map((value) => value.managementRatio)).toFixed(3),
    );
  }
  if (isProductDivision) {
    const round3Data = filteredData.filter((value) => value.fundingRound === 3);
    console.log(
      'round 3',
      mean(round3Data.map((value) => value.operationsRatio)).toFixed(3),
      mean(round3Data.map((value) => value.engineerRatio)).toFixed(3),
      mean(round3Data.map((value) => value.businessRatio)).toFixed(3),
      mean(round3Data.map((value) => value.managementRatio)).toFixed(3),
    );
    const round4Data = filteredData.filter((value) => value.fundingRound === 4);
    console.log(
      'round 4',
      mean(round4Data.map((value) => value.operationsRatio)).toFixed(3),
      mean(round4Data.map((value) => value.engineerRatio)).toFixed(3),
      mean(round4Data.map((value) => value.businessRatio)).toFixed(3),
      mean(round4Data.map((value) => value.managementRatio)).toFixed(3),
    );
    const round5Data1 = filteredData.filter((value) => {
      return value.fundingRound === 5 && value.profit < 1e30;
    });
    console.log(
      'round 5-1',
      mean(round5Data1.map((value) => value.operationsRatio)).toFixed(3),
      mean(round5Data1.map((value) => value.engineerRatio)).toFixed(3),
      mean(round5Data1.map((value) => value.businessRatio)).toFixed(3),
      mean(round5Data1.map((value) => value.managementRatio)).toFixed(3),
    );
    const round5Data2 = filteredData.filter((value) => {
      return value.fundingRound === 5 && value.profit >= 1e30;
    });
    console.log(
      'round 5-2',
      mean(round5Data2.map((value) => value.operationsRatio)).toFixed(3),
      mean(round5Data2.map((value) => value.engineerRatio)).toFixed(3),
      mean(round5Data2.map((value) => value.businessRatio)).toFixed(3),
      mean(round5Data2.map((value) => value.managementRatio)).toFixed(3),
    );
  }
}

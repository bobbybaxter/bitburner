export enum BenchmarkType {
  STORAGE_FACTORY,
  WILSON_ADVERT,
  OFFICE,
}

export interface ComparatorCustomData {
  referenceData: OfficeBenchmarkData;
  balancingModifierForProfitProgress: {
    profit: number;
    progress: number;
  };
}

export interface OfficeBenchmarkData {
  operations: number;
  engineer: number;
  business: number;
  management: number;
  totalExperience: number;
  rawProduction: number;
  maxSalesVolume: number;
  optimalPrice: number;
  productDevelopmentProgress: number;
  estimatedRP: number;
  productRating: number;
  productMarkup: number;
  profit: number;
}

/* eslint-disable no-unused-vars */
export enum ResearchName {
  HI_TECH_RND_LABORATORY = 'Hi-Tech R&D Laboratory',
  AUTO_BREW = 'AutoBrew',
  AUTO_PARTY = 'AutoPartyManager',
  AUTO_DRUG = 'Automatic Drug Administration',
  CPH4_INJECT = 'CPH4 Injections',
  DRONES = 'Drones',
  DRONES_ASSEMBLY = 'Drones - Assembly',
  DRONES_TRANSPORT = 'Drones - Transport',
  GO_JUICE = 'Go-Juice',
  HR_BUDDY_RECRUITMENT = 'HRBuddy-Recruitment',
  HR_BUDDY_TRAINING = 'HRBuddy-Training',
  MARKET_TA_1 = 'Market-TA.I',
  MARKET_TA_2 = 'Market-TA.II',
  OVERCLOCK = 'Overclock',
  SELF_CORRECTING_ASSEMBLERS = 'Self-Correcting Assemblers',
  STIMU = 'Sti.mu',
  UPGRADE_CAPACITY_1 = 'uPgrade: Capacity.I',
  UPGRADE_CAPACITY_2 = 'uPgrade: Capacity.II',
  UPGRADE_DASHBOARD = 'uPgrade: Dashboard',
  UPGRADE_FULCRUM = 'uPgrade: Fulcrum',
}

export interface StorageFactoryBenchmarkData {
  smartStorageLevel: number;
  warehouseLevel: number;
  smartFactoriesLevel: number;
  upgradeSmartStorageCost: number;
  upgradeWarehouseCost: number;
  warehouseSize: number;
  totalCost: number;
  production: number;
  costPerProduction: number;
  boostMaterials: number[];
  boostMaterialMultiplier: number;
}

export interface WilsonAdvertBenchmarkData {
  wilsonLevel: number;
  advertLevel: number;
  totalCost: number;
  popularity: number;
  awareness: number;
  ratio: number;
  advertisingFactor: number;
  costPerAdvertisingFactor: number;
}

export type DivisionResearches = Record<ResearchName, boolean>;

import { normalizeProfit } from './normalize-profit';
import { normalizeProgress } from './normalize-progress';
import type {
  BenchmarkType,
  ComparatorCustomData,
  OfficeBenchmarkData,
  StorageFactoryBenchmarkData,
  WilsonAdvertBenchmarkData,
} from './types';

export function getComparator(
  benchmarkType: BenchmarkType,
  sortType?: string,
  customData?: ComparatorCustomData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (a: any, b: any) => number {
  switch (benchmarkType) {
    case BenchmarkType.STORAGE_FACTORY:
      return (a: StorageFactoryBenchmarkData, b: StorageFactoryBenchmarkData) => {
        if (!a || !b) {
          return 1;
        }
        if (a.production !== b.production) {
          return a.production - b.production;
        }
        return b.totalCost - a.totalCost;
      };
    case BenchmarkType.WILSON_ADVERT:
      return (a: WilsonAdvertBenchmarkData, b: WilsonAdvertBenchmarkData) => {
        if (!a || !b) {
          return 1;
        }
        if (sortType === 'totalCost') {
          return b.totalCost - a.totalCost;
        }
        if (a.advertisingFactor !== b.advertisingFactor) {
          return a.advertisingFactor - b.advertisingFactor;
        }
        return b.totalCost - a.totalCost;
      };
    case BenchmarkType.OFFICE:
      return (a: OfficeBenchmarkData, b: OfficeBenchmarkData) => {
        if (!a || !b) {
          return 1;
        }
        if (a.totalExperience !== b.totalExperience) {
          return a.totalExperience - b.totalExperience;
        }
        if (sortType === 'rawProduction') {
          return a.rawProduction - b.rawProduction;
        }
        if (sortType === 'progress') {
          return a.productDevelopmentProgress - b.productDevelopmentProgress;
        }
        if (sortType === 'profit') {
          return a.profit - b.profit;
        }
        if (!customData) {
          throw new Error(`Invalid custom data`);
        }
        const normalizedProfitOfA = normalizeProfit(a.profit, customData.referenceData.profit);
        const normalizedProgressOfA = normalizeProgress(Math.ceil(100 / a.productDevelopmentProgress));
        const normalizedProfitOfB = normalizeProfit(b.profit, customData.referenceData.profit);
        const normalizedProgressOfB = normalizeProgress(Math.ceil(100 / b.productDevelopmentProgress));
        if (!Number.isFinite(normalizedProfitOfA) || !Number.isFinite(normalizedProfitOfB)) {
          throw new Error(
            `Invalid profit: a.profit: ${a.profit.toExponential()}, b.profit: ${b.profit.toExponential()}` +
              `, referenceData.profit: ${customData.referenceData.profit.toExponential()}`,
          );
        }
        if (sortType === 'profit_progress') {
          return (
            customData.balancingModifierForProfitProgress.profit * normalizedProfitOfA -
            customData.balancingModifierForProfitProgress.progress * normalizedProgressOfA -
            (customData.balancingModifierForProfitProgress.profit * normalizedProfitOfB -
              customData.balancingModifierForProfitProgress.progress * normalizedProgressOfB)
          );
        }
        throw new Error(`Invalid sort type: ${sortType}`);
      };
    default:
      throw new Error(`Invalid benchmark type`);
  }
}

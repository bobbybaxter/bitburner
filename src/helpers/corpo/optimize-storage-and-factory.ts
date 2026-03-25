import { CorpIndustryData } from '@ns';
import { CorpUpgradeName } from '../../constants/corp';
import { getComparator } from './get-comparator';
import { getMaxAffordableUpgradeLevel } from './get-max-affordable-upgrade-level';
import { getMaxAffordableWarehouseLevel } from './get-max-affordable-warehouse-level';
import { getUpgradeCost } from './get-upgrade-cost';
import { getUpgradeWarehouseCost } from './get-upgrade-warehouse-cost';
import { getWarehouseSize } from './get-warehouse-size';
import { Logger } from './logger';
import { PriorityQueue } from './priority-queue';
import { BenchmarkType, DivisionResearches, StorageFactoryBenchmarkData } from './types';

export async function optimizeStorageAndFactory({
  industryData,
  currentSmartStorageLevel,
  currentWarehouseLevel,
  currentSmartFactoriesLevel,
  divisionResearches,
  maxCost,
  enableLogging,
  boostMaterialTotalSizeRatio,
}: {
  industryData: CorpIndustryData;
  currentSmartStorageLevel: number;
  currentWarehouseLevel: number;
  currentSmartFactoriesLevel: number;
  divisionResearches: DivisionResearches;
  maxCost: number;
  enableLogging: boolean;
  boostMaterialTotalSizeRatio: number;
}): Promise<void> {
  // if (currentSmartStorageLevel < 0 || currentWarehouseLevel < 0 || currentSmartFactoriesLevel < 0) {
  //   throw new Error('Invalid parameter');
  // }
  const logger = new Logger(enableLogging);
  const maxSmartStorageLevel = getMaxAffordableUpgradeLevel(
    CorpUpgradeName.SMART_STORAGE,
    currentSmartStorageLevel,
    maxCost,
  );
  const maxWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, maxCost / 6);
  const comparator = getComparator(BenchmarkType.STORAGE_FACTORY);
  const priorityQueue = new PriorityQueue(comparator);
  let minSmartStorageLevel = currentSmartStorageLevel;
  if (maxSmartStorageLevel - minSmartStorageLevel > 1000) {
    minSmartStorageLevel = maxSmartStorageLevel - 1000;
  }
  let minWarehouseLevel = currentWarehouseLevel;
  if (maxWarehouseLevel - minWarehouseLevel > 1000) {
    minWarehouseLevel = maxWarehouseLevel - 1000;
  }
  logger.log(`minSmartStorageLevel: ${minSmartStorageLevel}`);
  logger.log(`minWarehouseLevel: ${minWarehouseLevel}`);
  logger.log(`maxSmartStorageLevel: ${maxSmartStorageLevel}`);
  logger.log(`maxWarehouseLevel: ${maxWarehouseLevel}`);
  logger.time('StorageAndFactory benchmark');
  for (let smartStorageLevel = minSmartStorageLevel; smartStorageLevel <= maxSmartStorageLevel; smartStorageLevel++) {
    const upgradeSmartStorageCost = getUpgradeCost(
      CorpUpgradeName.SMART_STORAGE,
      currentSmartStorageLevel,
      smartStorageLevel,
    );
    for (let warehouseLevel = minWarehouseLevel; warehouseLevel <= maxWarehouseLevel; warehouseLevel++) {
      const upgradeWarehouseCost = getUpgradeWarehouseCost(currentWarehouseLevel, warehouseLevel) * 6;
      if (upgradeSmartStorageCost + upgradeWarehouseCost > maxCost) {
        break;
      }
      const warehouseSize = getWarehouseSize(smartStorageLevel, warehouseLevel, divisionResearches);
      const boostMaterials = getOptimalBoostMaterialQuantities(
        industryData,
        warehouseSize * boostMaterialTotalSizeRatio,
      );
      const boostMaterialMultiplier = getDivisionProductionMultiplier(industryData, boostMaterials);
      const budgetForSmartFactoriesUpgrade = maxCost - (upgradeSmartStorageCost + upgradeWarehouseCost);
      const maxAffordableSmartFactoriesLevel = getMaxAffordableUpgradeLevel(
        UpgradeName.SMART_FACTORIES,
        currentSmartFactoriesLevel,
        budgetForSmartFactoriesUpgrade,
      );
      const upgradeSmartFactoriesCost = getUpgradeCost(
        UpgradeName.SMART_FACTORIES,
        currentSmartFactoriesLevel,
        maxAffordableSmartFactoriesLevel,
      );
      const totalCost = upgradeSmartStorageCost + upgradeWarehouseCost + upgradeSmartFactoriesCost;
      const smartFactoriesMultiplier =
        1 + CorpUpgradesData[UpgradeName.SMART_FACTORIES].benefit * maxAffordableSmartFactoriesLevel;
      const production = boostMaterialMultiplier * smartFactoriesMultiplier;
      const dataEntry = {
        smartStorageLevel: smartStorageLevel,
        warehouseLevel: warehouseLevel,
        smartFactoriesLevel: maxAffordableSmartFactoriesLevel,
        upgradeSmartStorageCost: upgradeSmartStorageCost,
        upgradeWarehouseCost: upgradeWarehouseCost,
        warehouseSize: warehouseSize,
        totalCost: totalCost,
        production: production,
        costPerProduction: totalCost / production,
        boostMaterials: boostMaterials,
        boostMaterialMultiplier: boostMaterialMultiplier,
      };
      if (priorityQueue.size() < defaultLengthOfBenchmarkDataArray) {
        priorityQueue.push(dataEntry);
      } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
        priorityQueue.pop();
        priorityQueue.push(dataEntry);
      }
    }
  }
  logger.timeEnd('StorageAndFactory benchmark');
  const data: StorageFactoryBenchmarkData[] = priorityQueue.toArray();
  data.forEach((data) => {
    logger.log(
      `{storage:${data.smartStorageLevel}, warehouse:${data.warehouseLevel}, factory:${data.smartFactoriesLevel}, ` +
        `totalCost:${formatNumber(data.totalCost)}, ` +
        `warehouseSize:${formatNumber(data.warehouseSize)}, ` +
        `production:${formatNumber(data.production)}, ` +
        `costPerProduction:${formatNumber(data.costPerProduction)}, ` +
        `boostMaterialMultiplier:${formatNumber(data.boostMaterialMultiplier)}, ` +
        `boostMaterials:${data.boostMaterials}}`,
    );
  });
  return data;
}

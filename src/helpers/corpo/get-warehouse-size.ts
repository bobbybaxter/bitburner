import { CorpUpgradeName, CorpUpgradesData } from '/constants/corp';
import { getResearchStorageMultiplier } from './get-research-multiplier';
import { DivisionResearches } from './types';

export function getWarehouseSize(
  smartStorageLevel: number,
  warehouseLevel: number,
  divisionResearches: DivisionResearches,
): number {
  return (
    warehouseLevel *
    100 *
    (1 + CorpUpgradesData[CorpUpgradeName.SMART_STORAGE].benefit * smartStorageLevel) *
    getResearchStorageMultiplier(divisionResearches)
  );
}

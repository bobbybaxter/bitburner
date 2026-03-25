import { CorpUpgradeName } from '@ns';
import { CorpUpgradesData } from '../../constants/corp';
import { getGenericUpgradeCost } from './get-generic-upgrade-cost';

export function getUpgradeCost(upgradeName: CorpUpgradeName, fromLevel: number, toLevel: number): number {
  const upgradeData = CorpUpgradesData[upgradeName];
  if (!upgradeData) {
    throw new Error(`Cannot find data of upgrade: ${upgradeName}`);
  }
  return getGenericUpgradeCost(upgradeData.basePrice, upgradeData.priceMult, fromLevel, toLevel);
}

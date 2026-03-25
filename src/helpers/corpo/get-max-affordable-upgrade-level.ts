import { CorpUpgradeName } from '@ns';
import { CorpUpgradesData } from '../../constants/corp-upgrades-data';
import { getGenericMaxAffordableUpgradeLevel } from './get-generic-max-affordable-upgrade-level';

export function getMaxAffordableUpgradeLevel(upgradeName: CorpUpgradeName, fromLevel: number, maxCost: number): number {
  const upgradeData = CorpUpgradesData[upgradeName];
  if (!upgradeData) {
    throw new Error(`Cannot find data of upgrade: ${upgradeName}`);
  }
  return getGenericMaxAffordableUpgradeLevel(upgradeData.basePrice, upgradeData.priceMult, fromLevel, maxCost);
}

import { WAREHOUSE_UPGRADE_BASE_PRICE } from '../../constants/corp';

export function getUpgradeWarehouseCost(fromLevel: number, toLevel: number): number {
  if (fromLevel < 1) {
    throw new Error('Invalid parameter');
  }
  return WAREHOUSE_UPGRADE_BASE_PRICE * ((Math.pow(1.07, toLevel + 1) - Math.pow(1.07, fromLevel + 1)) / 0.07);
}

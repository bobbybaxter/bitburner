const WAREHOUSE_UPGRADE_BASE_PRICE = 1e9;

export function getMaxAffordableWarehouseLevel(fromLevel: number, maxCost: number): number {
  if (fromLevel < 1) {
    throw new Error('Invalid parameter');
  }
  return Math.floor(
    Math.log((maxCost * 0.07) / WAREHOUSE_UPGRADE_BASE_PRICE + Math.pow(1.07, fromLevel + 1)) / Math.log(1.07) - 1,
  );
}

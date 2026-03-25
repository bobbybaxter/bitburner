export function getGenericMaxAffordableUpgradeLevel(
  basePrice: number,
  priceMultiplier: number,
  fromLevel: number,
  maxCost: number,
  roundingWithFloor = true,
): number {
  const maxAffordableUpgradeLevel =
    Math.log((maxCost * (priceMultiplier - 1)) / basePrice + Math.pow(priceMultiplier, fromLevel)) /
    Math.log(priceMultiplier);
  if (roundingWithFloor) {
    return Math.floor(maxAffordableUpgradeLevel);
  }
  return maxAffordableUpgradeLevel;
}

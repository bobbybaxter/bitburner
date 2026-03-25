export function getGenericUpgradeCost(
  basePrice: number,
  priceMultiplier: number,
  fromLevel: number,
  toLevel: number,
): number {
  return (
    basePrice * ((Math.pow(priceMultiplier, toLevel) - Math.pow(priceMultiplier, fromLevel)) / (priceMultiplier - 1))
  );
}

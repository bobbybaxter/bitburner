export function scaleValueToRange(
  value: number,
  currentMin: number,
  currentMax: number,
  newMin: number,
  newMax: number,
): number {
  return ((value - currentMin) * (newMax - newMin)) / (currentMax - currentMin) + newMin;
}

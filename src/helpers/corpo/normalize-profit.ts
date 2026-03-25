import { scaleValueToRange } from './scale-value-to-range';

const DEFAULT_MIN_FOR_NORMALIZATION = 5;
const DEFAULT_MAX_FOR_NORMALIZATION = 200;
const REFERENCE_VALUE_MODIFIER = 10;

export function normalizeProfit(profit: number, referenceValue: number): number {
  return scaleValueToRange(
    profit,
    referenceValue / REFERENCE_VALUE_MODIFIER,
    referenceValue * REFERENCE_VALUE_MODIFIER,
    DEFAULT_MIN_FOR_NORMALIZATION,
    DEFAULT_MAX_FOR_NORMALIZATION,
  );
}

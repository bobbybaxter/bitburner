import { scaleValueToRange } from './scale-value-to-range';

const DEFAULT_MIN_FOR_NORMALIZATION = 0;
const DEFAULT_MAX_FOR_NORMALIZATION = 100;

export function normalizeProgress(progress: number): number {
  return scaleValueToRange(progress, DEFAULT_MIN_FOR_NORMALIZATION, DEFAULT_MAX_FOR_NORMALIZATION, 0, 100);
}

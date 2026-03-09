import { INVERSION_DETECTION_TOLERANCE } from './constants';

// Compute fraction of upward price movements over a range of a history array (oldest first, newest last)
export function computeForecast(history: number[], start: number, end: number): number {
  const len = end - start;
  if (len < 2) return 0.5;
  let ups = 0;
  for (let i = start + 1; i < end; i++) {
    if (history[i] > history[i - 1]) ups++;
  }
  return ups / (len - 1);
}

// Single-pass volatility as the standard deviation of per-tick returns over a range (oldest first, newest last)
export function computeVolatility(history: number[], start: number, end: number): number {
  const n = end - start - 1;
  if (n < 1) return 0;
  let sum = 0,
    sumSq = 0;
  for (let i = start + 1; i < end; i++) {
    const r = (history[i] - history[i - 1]) / history[i - 1];
    sum += r;
    sumSq += r * r;
  }
  const mean = sum / n;
  return Math.sqrt(Math.abs(sumSq / n - mean * mean));
}

// An "inversion" can be detected if two probabilities are far enough apart and are within "tolerance" of p1 being equal to 1-p2
const tol2 = INVERSION_DETECTION_TOLERANCE / 2;
export const detectInversion = (p1: number, p2: number): boolean =>
  (p1 >= 0.5 + tol2 && p2 <= 0.5 - tol2 && p2 <= 1 - p1 + INVERSION_DETECTION_TOLERANCE) ||
  /* Reverse Condition: */ (p1 <= 0.5 - tol2 && p2 >= 0.5 + tol2 && p2 >= 1 - p1 - INVERSION_DETECTION_TOLERANCE);

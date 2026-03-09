import { symbols } from './format-number-short';

/** Convert a shortened number back into a value */
export function parseShortNumber(text = '0'): number {
  const parsed = Number(text);
  if (!isNaN(parsed)) return parsed;
  const lower = text.toLowerCase();
  for (let i = 1; i < symbols.length; i++) {
    if (lower.endsWith(symbols[i]))
      return Number.parseFloat(text.slice(0, text.length - symbols[i].length)) * Math.pow(10, 3 * i);
  }
  return Number.NaN;
}

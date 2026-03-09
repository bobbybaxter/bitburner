export const symbols = ['', 'k', 'm', 'b', 't', 'q', 'Q', 's', 'S', 'o', 'n', 'e33', 'e36', 'e39'];

/**
 * Return a formatted representation of the monetary amount using scale symbols (e.g. 6.50M)
 * @param {number} num - The number to format
 * @param {number=} maxSignificantFigures - (default: 6) The maximum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} maxDecimalPlaces - (default: 3) The maximum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
export function formatNumberShort(num: number, maxSignificantFigures = 6, maxDecimalPlaces = 3): string {
  if (Math.abs(num) > 10 ** (3 * symbols.length))
    return num.toExponential(Math.min(maxDecimalPlaces, maxSignificantFigures - 1));
  let absNum = Math.abs(num);
  const sign = Math.sign(num);
  let i = 0;
  for (; absNum >= 1000 && i < symbols.length; i++) absNum /= 1000;
  // TODO: A number like 9.999 once rounded to show 3 sig figs, will become 10.00, which is now 4 sig figs.
  return (
    (sign < 0 ? '-' : '') +
    absNum.toFixed(
      Math.max(0, Math.min(maxDecimalPlaces, maxSignificantFigures - Math.floor(1 + Math.log10(absNum)))),
    ) +
    symbols[i]
  );
}

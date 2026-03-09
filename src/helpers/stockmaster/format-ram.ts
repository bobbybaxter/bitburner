/** Formats some RAM amount as a round number of GB with thousands separators e.g. `1,028 GB` */
export function formatRam(num: number): string {
  return `${Math.round(num).toLocaleString('en')} GB`;
}

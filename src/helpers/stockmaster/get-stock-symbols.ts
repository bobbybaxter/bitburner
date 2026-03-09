import type { NS } from '@ns';
import { getNsDataThroughFile } from './get-ns-data-through-file';

let cachedStockSymbols: string[] | null = null;

/** Helper function to get all stock symbols, or null if you do not have TIX api access.
 * Caches symbols the first time they are successfully requested, since symbols never change.
 * @param {NS} ns */
export async function getStockSymbols(ns: NS): Promise<string[] | null> {
  cachedStockSymbols ??= (await getNsDataThroughFile(
    ns,
    `(() => { try { return ns.stock.getSymbols(); } catch { return null; } })()`,
    '/Temp/stock-symbols.txt',
  )) as string[] | null;
  return cachedStockSymbols;
}

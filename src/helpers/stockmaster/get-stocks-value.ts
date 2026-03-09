import type { NS } from '@ns';
import { getNsDataThroughFile } from './get-ns-data-through-file';
import { getStockSymbols } from './get-stock-symbols';

/** Helper function to get the total value of stocks using as little RAM as possible.
 * @param {NS} ns */
export async function getStocksValue(ns: NS): Promise<number> {
  const stockSymbols = await getStockSymbols(ns);
  if (stockSymbols == null) return 0; // No TIX API Access
  const helper = async (fn: string) =>
    await getNsDataThroughFile(
      ns,
      `Object.fromEntries(ns.args.map(sym => [sym, ns.stock.${fn}(sym)]))`,
      `/Temp/stock-${fn}.txt`,
      stockSymbols,
    );
  const askPrices = (await helper('getAskPrice')) as Record<string, number>;
  const bidPrices = (await helper('getBidPrice')) as Record<string, number>;
  const positions = (await helper('getPosition')) as Record<string, [number, number, number, number]>;
  return stockSymbols.reduce((total: number, sym: string) => {
    const pos = positions[sym];
    const ask = askPrices[sym];
    const bid = bidPrices[sym];
    return (
      total +
      pos[0] * bid /* Long Value */ +
      pos[2] * (pos[3] * 2 - ask) /* Short Value */ -
      // Subtract commission only if we have one or more shares (this is money we won't get when we sell our position)
      // If for some crazy reason we have shares both in the short and long position, we'll have to pay the commission twice (two separate sales)
      100000 * (Math.sign(pos[0]) + Math.sign(pos[2]))
    );
  }, 0);
}

import type { NS } from '@ns';
import { COMMISSION, FOUR_S_API_BASE_COST, FOUR_S_DATA_BASE_COST } from './constants';
import { formatDuration } from './format-duration';
import { formatMoney } from './format-money';
import { formatNumberShort } from './format-number-short';
import { getStockSymbols } from './get-stock-symbols';
import {
  checkAccess,
  getPlayerInfo,
  getStockInfoDict,
  sellShortWrapper,
  sellStockWrapper,
  transactStock,
  tryBuy,
} from './stock-api';
import type { StockPosition } from './stock-position';
import type { BitNodeMults, TradingSession } from './trading-session';
import { sessionLog } from './trading-session';

export const purchaseOrder = (a: StockPosition, b: StockPosition): number =>
  Math.ceil(a.timeToCoverTheSpread()) - Math.ceil(b.timeToCoverTheSpread()) || b.absReturn() - a.absReturn();

/** Pre-4S: prefer names with the strongest modeled edge first so limited cash goes to the best signals; tie-break by spread recovery. */
export const purchaseOrderPre4sEdgeFirst = (a: StockPosition, b: StockPosition): number =>
  b.absReturn() - a.absReturn() || Math.ceil(a.timeToCoverTheSpread()) - Math.ceil(b.timeToCoverTheSpread());

export const formatBP = (fraction: number): string => formatNumberShort(fraction * 100 * 100, 3, 2) + ' BP';

export async function doBuy(ns: NS, session: TradingSession, stk: StockPosition, sharesToBuy: number): Promise<number> {
  if (!Number.isFinite(sharesToBuy) || sharesToBuy < 1) return 0;
  let price = 0;
  if (stk.owned()) session.totalProfit -= COMMISSION;
  const long = stk.bullish();
  const expectedPrice = long ? stk.ask_price : stk.bid_price;
  sessionLog(
    ns,
    session,
    `INFO: ${long ? 'Buying  ' : 'Shorting'} ${formatNumberShort(sharesToBuy, 3, 3).padStart(5)} (` +
      `${
        stk.maxShares == sharesToBuy + stk.ownedShares()
          ? '@max shares'
          : `${formatNumberShort(sharesToBuy + stk.ownedShares(), 3, 3).padStart(5)}/${formatNumberShort(
              stk.maxShares,
              3,
              3,
            ).padStart(5)}`
      }) ` +
      `${stk.sym.padEnd(5)} @ ${formatMoney(expectedPrice).padStart(9)} for ${formatMoney(
        sharesToBuy * expectedPrice,
      ).padStart(9)} (Spread:${(stk.spread_pct * 100).toFixed(2)}% ` +
      `ER:${formatBP(stk.expectedReturn()).padStart(8)}) Ticks to Profit: ${stk.timeToCoverTheSpread().toFixed(2)}`,
    session.noisy,
    'info',
  );
  try {
    price = session.mock
      ? expectedPrice
      : Number(
          await transactStock(ns, stk.sym, sharesToBuy, (long ? 'buyStock' : 'buyShort') as 'buyStock' | 'buyShort'),
        );
  } catch (err) {
    if (long) throw err;
    session.disableShorts = true;
    sessionLog(
      ns,
      session,
      `WARN: Failed to short ${stk.sym} (Shorts not available?). Disabling shorts...`,
      true,
      'warning',
    );
    return 0;
  }
  if (price == 0) {
    const playerMoney = (await getPlayerInfo(ns)).money;
    if (playerMoney < sharesToBuy * expectedPrice)
      sessionLog(
        ns,
        session,
        `WARN: Failed to ${long ? 'buy' : 'short'} ${stk.sym} because money just recently dropped to ${formatMoney(
          playerMoney,
        )} and we can no longer afford it.`,
        session.noisy,
      );
    else
      sessionLog(
        ns,
        session,
        `ERROR: Failed to ${long ? 'buy' : 'short'} ${stk.sym} @ ${formatMoney(
          expectedPrice,
        )} (0 was returned) despite having ${formatMoney(playerMoney)}.`,
        true,
        'error',
      );
    return 0;
  } else if (price != expectedPrice) {
    sessionLog(
      ns,
      session,
      `WARNING: ${long ? 'Bought' : 'Shorted'} ${stk.sym} @ ${formatMoney(price)} but expected ${formatMoney(
        expectedPrice,
      )} (spread: ${formatMoney(stk.spread)})`,
      false,
      'warning',
    );
    price = expectedPrice;
  }
  if (session.mock && long)
    stk.boughtPrice = (stk.boughtPrice * stk.sharesLong + price * sharesToBuy) / (stk.sharesLong + sharesToBuy);
  if (session.mock && !long)
    stk.boughtPriceShort =
      (stk.boughtPriceShort * stk.sharesShort + price * sharesToBuy) / (stk.sharesShort + sharesToBuy);
  if (long) stk.sharesLong += sharesToBuy;
  else stk.sharesShort += sharesToBuy;
  return sharesToBuy * price + COMMISSION;
}

export async function doSellAll(ns: NS, session: TradingSession, stk: StockPosition): Promise<number> {
  const long = stk.sharesLong > 0;
  if (long && stk.sharesShort > 0)
    sessionLog(
      ns,
      session,
      `ERROR: Somehow ended up both ${stk.sharesShort} short and ${stk.sharesLong} long on ${stk.sym}`,
      true,
      'error',
    );
  const expectedPrice = long ? stk.bid_price : stk.ask_price;
  const sharesSold = long ? stk.sharesLong : stk.sharesShort;
  let price: number = session.mock
    ? expectedPrice
    : ((await transactStock(ns, stk.sym, sharesSold, long ? 'sellStock' : 'sellShort')) as number);
  const profit =
    (long ? stk.sharesLong * (price - stk.boughtPrice) : stk.sharesShort * (stk.boughtPriceShort - price)) -
    2 * COMMISSION;
  sessionLog(
    ns,
    session,
    `${profit > 0 ? 'SUCCESS' : 'WARNING'}: Sold all ${formatNumberShort(sharesSold, 3, 3).padStart(
      5,
    )} ${stk.sym.padEnd(5)} ${long ? ' long' : 'short'} positions ` +
      `@ ${formatMoney(price).padStart(9)} for a ` +
      (profit > 0 ? `PROFIT of ${formatMoney(profit).padStart(9)}` : ` LOSS  of ${formatMoney(-profit).padStart(9)}`) +
      ` after ${stk.ticksHeld} ticks`,
    session.noisy,
    session.noisy ? (profit > 0 ? ('success' as const) : ('error' as const)) : undefined,
  );
  if (price == 0) {
    sessionLog(
      ns,
      session,
      `ERROR: Failed to sell ${sharesSold} ${stk.sym} ${long ? 'shares' : 'shorts'} @ ${formatMoney(
        expectedPrice,
      )} - 0 was returned.`,
      true,
      'error',
    );
    return 0;
  } else if (price != expectedPrice) {
    sessionLog(
      ns,
      session,
      `WARNING: Sold ${stk.sym} ${long ? 'shares' : 'shorts'} @ ${formatMoney(price)} but expected ${formatMoney(
        expectedPrice,
      )} (spread: ${formatMoney(stk.spread)})`,
      false,
      'warning',
    );
    price = expectedPrice;
  }
  if (long) stk.sharesLong -= sharesSold;
  else stk.sharesShort -= sharesSold;
  session.totalProfit += profit;
  return price * sharesSold - COMMISSION;
}

export function doStatusUpdate(
  ns: NS,
  session: TradingSession,
  stocks: StockPosition[],
  myStocks: StockPosition[],
  hudElement: HTMLElement | null = null,
): void {
  let maxReturn = -Infinity,
    minReturn = Infinity,
    est_holdings_cost = 0,
    liquidation_value = 0,
    longCount = 0,
    shortCount = 0;
  for (const stk of myStocks) {
    const ret = stk.absReturn();
    if (ret > maxReturn) maxReturn = ret;
    if (ret < minReturn) minReturn = ret;
    est_holdings_cost +=
      (stk.owned() ? COMMISSION : 0) + stk.sharesLong * stk.boughtPrice + stk.sharesShort * stk.boughtPriceShort;
    liquidation_value += stk.positionValue() - (stk.owned() ? COMMISSION : 0);
    if (stk.sharesLong > 0) longCount++;
    if (stk.sharesShort > 0) shortCount++;
  }
  const maxReturnBP = 10000 * maxReturn;
  const minReturnBP = 10000 * minReturn;
  const status =
    `Long ${longCount}, Short ${shortCount} of ${stocks.length} stocks ` +
    (myStocks.length == 0 ? '' : `(ER ${minReturnBP.toFixed(1)}-${maxReturnBP.toFixed(1)} BP) `) +
    `Profit: ${formatMoney(session.totalProfit, 3)} Holdings: ${formatMoney(liquidation_value, 3)} (Cost: ${formatMoney(
      est_holdings_cost,
      3,
    )}) ` +
    `Net: ${formatMoney(session.totalProfit + liquidation_value - est_holdings_cost, 3)}`;
  sessionLog(ns, session, status);
  if (hudElement) hudElement.innerText = formatMoney(liquidation_value, 6, 3);
}

export async function liquidate(ns: NS, session: TradingSession): Promise<void> {
  session.allStockSymbols ??= await getStockSymbols(ns);
  if (session.allStockSymbols == null) return;
  let totalStocks = 0,
    totalSharesLong = 0,
    totalSharesShort = 0,
    totalRevenue = 0;
  const dictPositions = session.mock
    ? null
    : ((await getStockInfoDict(ns, session, 'getPosition')) as Record<string, [number, number, number, number]>);
  if (dictPositions === null) return;
  for (const sym of session.allStockSymbols) {
    const [sharesLong, , sharesShort, avgShortCost] = dictPositions[sym];
    if (sharesLong + sharesShort == 0) continue;
    totalStocks++;
    totalSharesLong += sharesLong;
    totalSharesShort += sharesShort;
    if (sharesLong > 0)
      totalRevenue += ((await sellStockWrapper(ns, sym, sharesLong)) as number) * sharesLong - COMMISSION;
    if (sharesShort > 0)
      totalRevenue +=
        (2 * avgShortCost - ((await sellShortWrapper(ns, sym, sharesShort)) as number)) * sharesShort - COMMISSION;
  }
  if (totalStocks > 0)
    sessionLog(
      ns,
      session,
      `Sold ${totalSharesLong.toLocaleString('en')} long shares and ${totalSharesShort.toLocaleString(
        'en',
      )} short shares ` + `in ${totalStocks} stocks for ${formatMoney(totalRevenue, 3)}`,
      true,
      'success',
    );
}

export async function liquidateSlow(ns: NS, session: TradingSession, sleepInterval = 1000): Promise<void> {
  session.allStockSymbols ??= await getStockSymbols(ns);
  if (session.allStockSymbols == null) return;
  let totalStocks = 0,
    totalSharesLong = 0,
    totalSharesShort = 0,
    totalRevenue = 0,
    totalProfit = 0;
  while (true) {
    const dictPositions = session.mock
      ? null
      : ((await getStockInfoDict(ns, session, 'getPosition')) as Record<string, [number, number, number, number]>);
    if (dictPositions === null) return;
    const dictBid = (await getStockInfoDict(ns, session, 'getBidPrice')) as Record<string, number>;
    const dictAsk = (await getStockInfoDict(ns, session, 'getAskPrice')) as Record<string, number>;
    let openPositions = 0;
    let soldThisPass = 0;
    for (const sym of session.allStockSymbols) {
      const [sharesLong, avgLongCost, sharesShort, avgShortCost] = dictPositions[sym];
      if (sharesLong + sharesShort === 0) continue;
      openPositions++;
      if (sharesLong > 0) {
        const estProfitLong = sharesLong * (dictBid[sym] - avgLongCost) - 2 * COMMISSION;
        if (estProfitLong >= 0) {
          const sellPrice = Number(await sellStockWrapper(ns, sym, sharesLong));
          totalStocks++;
          soldThisPass++;
          totalSharesLong += sharesLong;
          totalRevenue += sellPrice * sharesLong - COMMISSION;
          totalProfit += sharesLong * (sellPrice - avgLongCost) - 2 * COMMISSION;
        }
      }
      if (sharesShort > 0) {
        const estProfitShort = sharesShort * (avgShortCost - dictAsk[sym]) - 2 * COMMISSION;
        if (estProfitShort >= 0) {
          const buybackPrice = Number(await sellShortWrapper(ns, sym, sharesShort));
          totalStocks++;
          soldThisPass++;
          totalSharesShort += sharesShort;
          totalRevenue += (2 * avgShortCost - buybackPrice) * sharesShort - COMMISSION;
          totalProfit += sharesShort * (avgShortCost - buybackPrice) - 2 * COMMISSION;
        }
      }
    }
    if (openPositions === 0) break;
    if (soldThisPass > 0)
      sessionLog(
        ns,
        session,
        `INFO: Slow liquidation sold ${soldThisPass} profitable/break-even position(s). Waiting for remaining positions to recover...`,
      );
    await ns.sleep(sleepInterval);
  }
  sessionLog(
    ns,
    session,
    `Slow-liquidated ${totalSharesLong.toLocaleString('en')} long shares and ${totalSharesShort.toLocaleString(
      'en',
    )} short shares ` +
      `across ${totalStocks} closed positions for ${formatMoney(totalRevenue, 3)} (net P/L ${formatMoney(totalProfit, 3)}).`,
    true,
    'success',
  );
}

export async function tryGet4SApi(
  ns: NS,
  session: TradingSession,
  playerStats: { money: number },
  bitnodeMults: BitNodeMults,
  budget: number,
): Promise<boolean> {
  if (await checkAccess(ns, 'has4SDataTIXAPI')) return false;
  const cost4sData = FOUR_S_DATA_BASE_COST * bitnodeMults.FourSigmaMarketDataCost;
  const cost4sApi = FOUR_S_API_BASE_COST * bitnodeMults.FourSigmaMarketDataApiCost;
  let has4S = await checkAccess(ns, 'has4SData');
  const totalCost = (has4S ? 0 : cost4sData) + cost4sApi;
  if (totalCost > budget) return false;
  let availableMoney = playerStats.money;
  if (availableMoney < totalCost) {
    await liquidate(ns, session);
    availableMoney = (await getPlayerInfo(ns)).money;
    if (availableMoney < totalCost) return false;
  }
  if (!has4S) {
    if (availableMoney < cost4sData) return false;
    if (await tryBuy(ns, 'purchase4SMarketData'))
      sessionLog(
        ns,
        session,
        `SUCCESS: Purchased 4SMarketData for ${formatMoney(cost4sData)} ` +
          `(At ${formatDuration((await ns.getResetInfo()).lastNodeReset)} into BitNode)`,
        true,
        'success',
      );
    else return false;
    has4S = true;
    availableMoney = (await getPlayerInfo(ns)).money;
  }
  if (!has4S || availableMoney < cost4sApi) return false;
  if (await tryBuy(ns, 'purchase4SMarketDataTixApi')) {
    sessionLog(
      ns,
      session,
      `SUCCESS: Purchased 4SMarketDataTixApi for ${formatMoney(cost4sApi)} ` +
        `(At ${formatDuration((await ns.getResetInfo()).lastNodeReset)} into BitNode)`,
      true,
      'success',
    );
    return true;
  } else {
    if (!(5 in session.dictSourceFiles)) {
      sessionLog(
        ns,
        session,
        'INFO: Bitnode mults are not available (SF5) - assuming everything is twice as expensive in the current bitnode.',
      );
      bitnodeMults.FourSigmaMarketDataCost *= 2;
      bitnodeMults.FourSigmaMarketDataApiCost *= 2;
    }
  }
  return false;
}

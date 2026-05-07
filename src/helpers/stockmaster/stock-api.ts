import type { NS } from '@ns';
import { TIX_API_COST, WSE_ACCOUNT_COST } from './constants';
import { formatDuration } from './format-duration';
import { formatMoney } from './format-money';
import { getNsDataThroughFile } from './get-ns-data-through-file';
import { getStockSymbols } from './get-stock-symbols';
import { StockPosition } from './stock-position';
import type { BatchedStockData, TradingSession } from './trading-session';
import { sessionLog } from './trading-session';

export async function getPlayerInfo(ns: NS): Promise<{ money: number }> {
  return (await getNsDataThroughFile(
    ns,
    `(function(){const p=ns.getPlayer();return {money:p.money};})()`,
    '/Temp/player-info.txt',
  )) as { money: number };
}

export async function getStockInfoDict(
  ns: NS,
  session: TradingSession,
  stockFunction: string,
): Promise<Record<string, number | [number, number, number, number]>> {
  session.allStockSymbols ??= await getStockSymbols(ns);
  if (session.allStockSymbols == null)
    throw new Error(`No WSE API Access yet, this call to ns.stock.${stockFunction} is premature.`);
  return (await getNsDataThroughFile(
    ns,
    `Object.fromEntries(ns.args.map(sym => [sym, ns.stock.${stockFunction}(sym)]))`,
    `/Temp/stock-${stockFunction}.txt`,
    session.allStockSymbols,
  )) as Record<string, number | [number, number, number, number]>;
}

export async function getBatchedStockData(
  ns: NS,
  session: TradingSession,
  has4s: boolean,
): Promise<Record<string, BatchedStockData>> {
  session.allStockSymbols ??= await getStockSymbols(ns);
  if (session.allStockSymbols == null)
    throw new Error('No WSE API Access yet, this call to batched stock data is premature.');
  const volPart = has4s ? ', vol: ns.stock.getVolatility(sym)' : '';
  const fcPart = has4s ? ', forecast: ns.stock.getForecast(sym)' : '';
  const posPart = session.mock ? '' : ', pos: ns.stock.getPosition(sym)';
  return (await getNsDataThroughFile(
    ns,
    `Object.fromEntries(ns.args.map(sym => [sym, { ask: ns.stock.getAskPrice(sym), bid: ns.stock.getBidPrice(sym)${volPart}${fcPart}${posPart} }]))`,
    `/Temp/stock-batch-${has4s ? '4s' : 'pre4s'}${session.mock ? '-mock' : ''}.txt`,
    session.allStockSymbols,
  )) as Record<string, BatchedStockData>;
}

export async function initAllStocks(ns: NS, session: TradingSession): Promise<StockPosition[]> {
  const dictMaxShares = (await getStockInfoDict(ns, session, 'getMaxShares')) as Record<string, number>;
  return session.allStockSymbols!.map((s: string) => new StockPosition(s, dictMaxShares[s]));
}

export async function transactStock(
  ns: NS,
  sym: string,
  numShares: number,
  action: 'buyStock' | 'buyShort' | 'sellStock' | 'sellShort',
): Promise<unknown> {
  const n = Math.floor(Number(numShares));
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`transactStock(${action}): invalid share count (${String(numShares)})`);
  }
  return await getNsDataThroughFile(ns, `ns.stock.${action}(ns.args[0], ns.args[1])`, `/Temp/stock-${action}.txt`, [
    sym,
    n,
  ]);
}

export async function sellStockWrapper(ns: NS, sym: string, numShares: number): Promise<unknown> {
  return await transactStock(ns, sym, numShares, 'sellStock');
}

export async function sellShortWrapper(ns: NS, sym: string, numShares: number): Promise<unknown> {
  return await transactStock(ns, sym, numShares, 'sellShort');
}

export async function checkAccess(
  ns: NS,
  stockFn: 'hasWseAccount' | 'hasTixApiAccess' | 'has4SData' | 'has4SDataTixApi',
): Promise<boolean> {
  return (await getNsDataThroughFile(ns, `ns.stock.${stockFn}()`, `/Temp/stock-${stockFn}.txt`)) as boolean;
}

export async function tryBuy(
  ns: NS,
  stockFn: 'purchaseWseAccount' | 'purchaseTixApi' | 'purchase4SMarketData' | 'purchase4SMarketDataTixApi',
): Promise<boolean> {
  return (await getNsDataThroughFile(ns, `ns.stock.${stockFn}()`, `/Temp/stock-${stockFn}.txt`)) as boolean;
}

export async function tryGetStockMarketAccess(ns: NS, session: TradingSession, budget: number): Promise<boolean> {
  if (await checkAccess(ns, 'hasTixApiAccess')) return true;
  const hasWSE = await checkAccess(ns, 'hasWseAccount');
  const totalCost = (hasWSE ? 0 : WSE_ACCOUNT_COST) + TIX_API_COST;
  if (totalCost > budget) return false;
  if (!hasWSE) {
    if (await tryBuy(ns, 'purchaseWseAccount'))
      sessionLog(
        ns,
        session,
        `SUCCESS: Purchased a WSE (stockmarket) account for ${formatMoney(WSE_ACCOUNT_COST)} ` +
          `(At ${formatDuration((await ns.getResetInfo()).lastNodeReset)} into BitNode)`,
        true,
        'success',
      );
    else sessionLog(ns, session, 'ERROR attempting to purchase WSE account!', false, 'error');
  }
  if (await tryBuy(ns, 'purchaseTixApi')) {
    sessionLog(
      ns,
      session,
      `SUCCESS: Purchased Tix (stockmarket) Api access for ${formatMoney(TIX_API_COST)} ` +
        `(At ${formatDuration((await ns.getResetInfo()).lastNodeReset)} into BitNode)`,
      true,
      'success',
    );
    return true;
  } else sessionLog(ns, session, 'ERROR attempting to purchase Tix Api!', false, 'error');
  return false;
}

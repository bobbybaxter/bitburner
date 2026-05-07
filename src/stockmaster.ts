import type { NS } from '@ns';
import { ALL_COMPANIES } from './constants/all-companies';
import { replaceOtherInstancesOfThisScriptOnHost } from './helpers/kill-script-instances';
import type { ArgsSchemaEntry, BitNodeMults } from './helpers/stockmaster/index';
import {
  checkAccess,
  COMMISSION,
  doBuy,
  doSellAll,
  doStatusUpdate,
  formatBP,
  formatMoney,
  formatNumberShort,
  getActiveSourceFiles,
  getConfiguration,
  getNsDataThroughFile,
  getPlayerInfo,
  getStockSymbols,
  initAllStocks,
  initializeHud,
  instanceCount,
  launchSummaryTail,
  liquidate,
  liquidateSlow,
  MARKET_CYCLE_LENGTH,
  parseShortNumber,
  purchaseOrder,
  purchaseOrderPre4sEdgeFirst,
  refresh,
  SLEEP_INTERVAL,
  tryGet4SApi,
  tryGetBitNodeMultipliers,
  tryGetStockMarketAccess,
} from './helpers/stockmaster/index';
import { StockPosition } from './helpers/stockmaster/stock-position';
import { sessionLog, TradingSession } from './helpers/stockmaster/trading-session';

let session = new TradingSession();
const MANIPULABLE_STOCK_SYMBOLS = new Set(
  ALL_COMPANIES.flatMap((company) => {
    const sym = company.stockSymbol?.trim();
    const host = company.hostname?.trim();
    return sym && host ? [sym] : [];
  }),
);
const NON_MANIPULABLE_BUY_THRESHOLD_PREMIUM = 0.0005; // +5 BP minimum edge vs baseline threshold
const NON_MANIPULABLE_DIVERSIFICATION_MULT = 0.3; // smaller max position for symbols we cannot influence via hack/grow
const PRE4S_MAX_NONPOSITIVE_ER_TICKS = 2; // if modeled edge is gone for this many ticks, exit regardless of hold timer
const PRE4S_STOP_LOSS_PCT_DEFAULT = 0.05; // emergency pre-4S per-position stop loss default (5% of position cost basis)
const PRE4S_CONFIDENCE_CAP_FLOOR = 0.2; // keep at least this fraction of diversification cap when confidence window is short

const argsSchema: ArgsSchemaEntry[] = [
  ['l', false], // Sell all stocks immediately; also stops any other running instance of this script first
  ['s', false], // Slow liquidate (break-even+); also stops any other running instance of this script first
  ['liquidate', false], // Long-form alias for the above flag.
  ['liquidate-slow', false], // Long-form alias for slow liquidation mode.
  ['mock', false], // If set to true, will "mock" buy/sell but not actually buy/sell anything
  ['noisy', false], // If set to true, tprints and announces each time stocks are bought/sold
  ['disable-shorts', false], // If set to true, will not short any stocks. Will be set depending on having SF8.2 by default.
  ['reserve', null], // Cash to hold back (number, or shorthand e.g. 250m / 1.5b); if omitted, reserve.txt or 0
  ['fracB', 0.4], // Fraction of assets to have as liquid before we consider buying more stock
  ['fracH', 0.2], // Fraction of assets to retain as cash in hand when buying
  ['buy-threshold', 0.0001], // Buy only stocks forecasted to earn better than a 0.01% return (1 Basis Point)
  ['sell-threshold', 0], // Sell stocks forecasted to earn less than this return (default 0% - which happens when prob hits 50% or worse)
  ['diversification', 0.34], // Max fraction of portfolio as a single stock (relaxed to 2x with 4S data)
  ['disableHud', true], // Disable showing stock value in the HUD panel
  ['disable-purchase-tix-api', false], // Disable purchasing the TIX API if you do not already have it.
  // The following settings are related only to tweaking pre-4s stock-market logic
  ['show-pre-4s-forecast', false], // If set to true, will always generate and display the pre-4s forecast (if false, it's only shown while we hold no stocks)
  ['show-market-summary', false], // Same effect as "show-pre-4s-forecast", this market summary has become so informative, it's valuable even with 4s
  ['pre-4s-buy-threshold-probability', 0.15], // Before we have 4S data, only buy stocks whose probability is more than this far away from 0.5, to account for imprecision
  ['pre-4s-buy-threshold-return', 0.0015], // Before we have 4S data, buy only stocks forecasted to earn better than this return (default 0.15% or 15 Basis Points)
  ['pre-4s-sell-threshold-return', 0.0005], // Before we have 4S data, sell stocks forecasted to earn less than this return (default 0.05% or 5 Basis Points)
  ['pre-4s-min-tick-history', 21], // This much history must be gathered before we will use pre-4s stock forecasts to make buy/sell decisions. (Default 21)
  ['pre-4s-forecast-window', 51], // This much history will be used to determine the historical probability of the stock (so long as no inversions are detected) (Default 51)
  ['pre-4s-inversion-detection-window', 10], // This much history will be used to detect recent negative trends and act on them immediately. (Default 10)
  ['pre-4s-min-blackout-window', 10], // Do not make any new purchases this many ticks before the detected stock market cycle tick, to avoid buying a position that reverses soon after
  ['pre-4s-minimum-hold-time', 10], // A recently bought position must be held for this long before selling, to avoid rash decisions due to noise after a fresh market cycle. (Default 10)
  ['pre-4s-prioritize-edge', false], // Pre-4S only: when buying, rank stocks by modeled edge (expected return) first so cash goes to the strongest signals; false = legacy (fastest spread recovery first)
  ['pre-4s-near-prob-weight', 0], // Pre-4S: 0..1 fraction of near-term tick-up rate blended into prob (rest is long-term). 0 = original behavior (long-term only). Values > 0 add noise.
  ['pre-4s-uncertainty-mult', 1], // Pre-4S: multiply inferred prob stddev (expectedReturn conservatism). Values below 1 (e.g. 0.75) assume less estimation error — riskier, can raise modeled edge.
  ['pre-4s-stop-loss-pct', PRE4S_STOP_LOSS_PCT_DEFAULT], // Pre-4S: emergency max unrealized loss per position before forced exit (fraction, e.g. 0.04 = 4%)
  ['pre-4s-stop-loss-rebuy-cooldown', 6], // Pre-4S: after a stop-loss exit, block re-entering the same symbol for this many market ticks
  ['pre-4s-min-sell-signal-ticks', 2], // Pre-4S: bypass minimum hold time if ER is under sell-threshold for this many consecutive ticks
  ['pre-4s-diversification-mult', 0.6], // Pre-4S: additional multiplier on position caps to reduce gross exposure before 4S
  ['pre-4s-disable-shorts', true], // Pre-4S: block opening new short positions (selling existing shorts is always allowed)
  ['pre-4s-post-rapid-tick-buy-cooldown', 3], // Pre-4S: skip new buys for this many market ticks after a rapid/catch-up tick
  ['pre-4s-post-reanchor-buy-cooldown', 5], // Pre-4S: skip new buys for this many market ticks after cycle re-anchor
  ['pre-4s-min-buy-signal-ticks', 2], // Pre-4S: require this many consecutive buy-signal ticks before entering a new position
  ['buy-4s-budget', 0.8], // Maximum corpus value we will sacrifice in order to buy 4S. Setting to 0 will never buy 4s.
];

export function autocomplete(data: { flags: (schema: ArgsSchemaEntry[]) => void }, _args: string[]): string[] {
  data.flags(argsSchema);
  return [];
}

function parseReserve(ns: NS, reserveOpt: unknown): number {
  const raw = reserveOpt != null && reserveOpt !== '' ? reserveOpt : (ns.read('reserve.txt') || '0').trim();
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const s = String(raw).trim();
  if (s === '') return 0;
  let n = parseShortNumber(s);
  if (Number.isFinite(n)) return n;
  n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function getUnrealizedLossPct(stk: StockPosition): number {
  if (stk.sharesLong > 0) {
    const costBasis = stk.sharesLong * stk.boughtPrice;
    if (!(costBasis > 0)) return 0;
    const unrealizedLoss = Math.max(0, stk.sharesLong * (stk.boughtPrice - stk.bid_price));
    return unrealizedLoss / costBasis;
  }
  if (stk.sharesShort > 0) {
    const costBasis = stk.sharesShort * stk.boughtPriceShort;
    if (!(costBasis > 0)) return 0;
    const unrealizedLoss = Math.max(0, stk.sharesShort * (stk.ask_price - stk.boughtPriceShort));
    return unrealizedLoss / costBasis;
  }
  return 0;
}

/** Not {@link NS.scriptKill}: that kills every instance of the script on the host, including this one. */
function killOtherStockmasterInstances(ns: NS, session: TradingSession): void {
  const host = ns.getHostname();
  const scriptName = ns.getScriptName();
  const killed = replaceOtherInstancesOfThisScriptOnHost(ns, host);
  sessionLog(
    ns,
    session,
    killed > 0
      ? `INFO: Stopped ${killed} other ${scriptName} instance(s) on ${host} (any args).`
      : `INFO: No other ${scriptName} instances on ${host}.`,
    false,
    'info',
  );
}

/**
 * Requires access to the TIX API. Purchases access to the 4S Mkt Data API as soon as it can
 */
export async function main(ns: NS): Promise<void> {
  const runOptions = getConfiguration(ns, argsSchema);
  if (!runOptions) return;

  const hasTixApiAccess = (await getNsDataThroughFile(ns, 'ns.stock.hasTIXAPIAccess()', '/Temp/hasTIX.txt')) as boolean;
  const immediateLiquidate = (runOptions.l as boolean) || (runOptions.liquidate as boolean);
  const slowLiquidate = (runOptions.s as boolean) || (runOptions['liquidate-slow'] as boolean);
  if (immediateLiquidate && slowLiquidate)
    return sessionLog(
      ns,
      session,
      'ERROR: Use only one liquidate mode at a time (--liquidate or --liquidate-slow).',
      true,
      'error',
    );
  if (immediateLiquidate || slowLiquidate) {
    if (!hasTixApiAccess)
      return sessionLog(
        ns,
        session,
        'ERROR: Cannot liquidate stocks because we do not have Tix Api Access',
        true,
        'error',
      );
    killOtherStockmasterInstances(ns, session);
    sessionLog(
      ns,
      session,
      `INFO: Checking for and ${slowLiquidate ? 'slow-liquidating (break-even/profit only)' : 'liquidating'} any stocks...`,
      false,
      'info',
    );
    if (slowLiquidate) await liquidateSlow(ns, session, SLEEP_INTERVAL);
    else await liquidate(ns, session);
    return;
  }
  killOtherStockmasterInstances(ns, session);
  if ((await instanceCount(ns)) > 1) return;

  ns.disableLog('ALL');
  session = new TradingSession();
  session.options = runOptions;
  session.mock = runOptions.mock as boolean;
  session.noisy = runOptions.noisy as boolean;
  const fracB = runOptions.fracB as number;
  const fracH = runOptions.fracH as number;
  const diversification = runOptions.diversification as number;
  const disableHud = !!(runOptions.disableHud as boolean) || !!(runOptions.mock as boolean);
  session.disableShorts = runOptions['disable-shorts'] as boolean;
  const pre4sBuyThresholdProbability = (runOptions['pre-4s-buy-threshold-probability'] ?? 0.15) as number;
  const pre4sMinBlackoutWindow = (runOptions['pre-4s-min-blackout-window'] ?? 1) as number;
  const pre4sMinHoldTime = (runOptions['pre-4s-minimum-hold-time'] ?? 0) as number;
  const pre4sStopLossPct = Math.max(0, Number(runOptions['pre-4s-stop-loss-pct'] ?? PRE4S_STOP_LOSS_PCT_DEFAULT));
  const pre4sStopLossRebuyCooldown = Math.max(0, Number(runOptions['pre-4s-stop-loss-rebuy-cooldown'] ?? 6));
  const pre4sMinSellSignalTicks = Math.max(1, Number(runOptions['pre-4s-min-sell-signal-ticks'] ?? 2));
  const pre4sDiversificationMult = Math.min(1, Math.max(0.1, Number(runOptions['pre-4s-diversification-mult'] ?? 0.6)));
  const pre4sMinBuySignalTicks = Math.max(1, Number(runOptions['pre-4s-min-buy-signal-ticks'] ?? 2));
  const pre4sDisableShorts = !!(runOptions['pre-4s-disable-shorts'] ?? true);
  session.minTickHistory = (runOptions['pre-4s-min-tick-history'] ?? 21) as number;
  session.nearTermForecastWindowLength = (runOptions['pre-4s-inversion-detection-window'] ?? 10) as number;
  session.longTermForecastWindowLength = (runOptions['pre-4s-forecast-window'] ?? MARKET_CYCLE_LENGTH + 1) as number;
  session.showMarketSummary = !!(runOptions['show-pre-4s-forecast'] || runOptions['show-market-summary']);
  const myStocks: StockPosition[] = [];
  let allStocks: StockPosition[] = [];
  const player = await getPlayerInfo(ns);

  if (!hasTixApiAccess) {
    if (runOptions['disable-purchase-tix-api'])
      return sessionLog(
        ns,
        session,
        'ERROR: You do not have stock market API access, and --disable-purchase-tix-api is set.',
        true,
      );
    let success = false;
    sessionLog(
      ns,
      session,
      `INFO: You are missing stock market API access. (NOTE: This is granted for free once you have SF8). ` +
        `Waiting until we can have the 5b needed to buy it. (Run with --disable-purchase-tix-api to disable this feature.)`,
      true,
    );
    do {
      await ns.sleep(SLEEP_INTERVAL);
      try {
        const reserve = parseReserve(ns, runOptions['reserve']);
        success = await tryGetStockMarketAccess(ns, session, (player as { money: number }).money - reserve);
      } catch (err: unknown) {
        sessionLog(
          ns,
          session,
          `WARNING: stockmaster.js Caught (and suppressed) an unexpected error while waiting to buy stock market access:\n` +
            (typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err)),
          false,
          'warning',
        );
      }
    } while (!success);
  }

  session.dictSourceFiles = await getActiveSourceFiles(ns);
  if (!session.disableShorts && (!(8 in session.dictSourceFiles) || session.dictSourceFiles[8] < 2)) {
    sessionLog(ns, session, 'INFO: Shorting stocks has been disabled (you have not yet unlocked access to shorting)');
    session.disableShorts = true;
  }

  session.allStockSymbols = await getStockSymbols(ns);
  allStocks = await initAllStocks(ns, session);
  const nonManipulableSymbols = allStocks.map((stk) => stk.sym).filter((sym) => !MANIPULABLE_STOCK_SYMBOLS.has(sym));
  if (nonManipulableSymbols.length > 0) {
    sessionLog(
      ns,
      session,
      `INFO: ${nonManipulableSymbols.length} symbol(s) have no server mapping and are treated as non-manipulable (stricter buy threshold + smaller position cap): ${nonManipulableSymbols.join(', ')}`,
      true,
      'info',
    );
  }

  let bitnodeMults: BitNodeMults = {
    FourSigmaMarketDataCost: 1,
    FourSigmaMarketDataApiCost: 1,
  };
  if (5 in session.dictSourceFiles) {
    const mults = await tryGetBitNodeMultipliers(ns);
    if (mults && typeof mults === 'object' && 'FourSigmaMarketDataCost' in mults) bitnodeMults = mults as BitNodeMults;
  }

  if (session.showMarketSummary) await launchSummaryTail(ns);

  let hudElement: HTMLElement | null = null;
  if (!disableHud) {
    try {
      hudElement = initializeHud();
      ns.atExit(() => {
        try {
          hudElement!.parentElement!.parentElement!.parentElement!.removeChild(
            hudElement!.parentElement!.parentElement!,
          );
        } catch {
          /* HUD element may already be removed */
        }
      });
    } catch (err) {
      sessionLog(
        ns,
        session,
        `WARNING: Failed to initialize HUD element: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  sessionLog(
    ns,
    session,
    `Welcome! Please note: all stock purchases will initially result in a Net (unrealized) Loss. This is not only due to commission, but because each stock has a 'spread' (difference in buy price and sell price). ` +
      `This script is designed to buy stocks that are most likely to surpass that loss and turn a profit, but it will take a few minutes to see the progress.\n\n` +
      `If you choose to stop the script, make sure you SELL all your stocks (can go 'run ${ns.getScriptName()} --liquidate') to get your money back.\n\nGood luck!\n~ Insight\n\n`,
  );

  let pre4s = true;
  const nonPositiveErStreak = new Map<string, number>();
  const sellSignalStreak = new Map<string, number>();
  const buySignalStreak = new Map<string, number>();
  const stopLossRebuyCooldownBySym = new Map<string, number>();
  while (true) {
    try {
      const playerStats = (await getPlayerInfo(ns)) as { money: number };
      const reserve = parseReserve(ns, session.options['reserve']);
      if (pre4s) pre4s = !(await checkAccess(ns, 'has4SDataTIXAPI'));
      const { holdings, ticked } = await refresh(ns, session, !pre4s, allStocks, myStocks);
      const corpus = holdings + playerStats.money;
      const maxHoldings = (1 - fracH) * corpus;
      if (
        pre4s &&
        !session.mock &&
        (await tryGet4SApi(
          ns,
          session,
          playerStats,
          bitnodeMults,
          corpus * (Number(session.options['buy-4s-budget'] ?? 0.8) - fracH) - reserve,
        ))
      )
        continue;
      const thresholdToBuy = (
        pre4s ? session.options['pre-4s-buy-threshold-return'] : session.options['buy-threshold']
      ) as number;
      const thresholdToSell = (
        pre4s ? session.options['pre-4s-sell-threshold-return'] : session.options['sell-threshold']
      ) as number;
      const effectiveDiversification = pre4s ? diversification : Math.min(1.0, diversification * 2);
      if (myStocks.length > 0) doStatusUpdate(ns, session, allStocks, myStocks, hudElement);
      else if (hudElement) hudElement.innerText = '$0.000 ';
      if (pre4s && allStocks[0].priceHistory.length < session.minTickHistory) {
        sessionLog(
          ns,
          session,
          `Building a history of stock prices (${allStocks[0].priceHistory.length}/${session.minTickHistory})...`,
        );
        await ns.sleep(SLEEP_INTERVAL);
        continue;
      }

      for (const stk of myStocks) {
        const edge = stk.absReturn();
        const sideFlip = (stk.bullish() && stk.sharesShort > 0) || (stk.bearish() && stk.sharesLong > 0);
        const nonPositiveEdge = edge <= 0;
        const streak = nonPositiveEdge ? (nonPositiveErStreak.get(stk.sym) ?? 0) + 1 : 0;
        const weakSellSignal = edge <= thresholdToSell;
        const weakSellSignalStreak = weakSellSignal ? (sellSignalStreak.get(stk.sym) ?? 0) + 1 : 0;
        nonPositiveErStreak.set(stk.sym, streak);
        sellSignalStreak.set(stk.sym, weakSellSignalStreak);
        const stopLossTriggered = pre4s && getUnrealizedLossPct(stk) >= pre4sStopLossPct;
        const hardInvalidation = sideFlip || stopLossTriggered || (pre4s && streak >= PRE4S_MAX_NONPOSITIVE_ER_TICKS);
        const minHoldBypass = pre4s && weakSellSignalStreak >= pre4sMinSellSignalTicks;
        const shouldSell = hardInvalidation || edge <= thresholdToSell;
        if (shouldSell) {
          if (pre4s && !hardInvalidation && !minHoldBypass && stk.ticksHeld < pre4sMinHoldTime) {
            if (!stk.warnedBadPurchase)
              sessionLog(
                ns,
                session,
                `WARNING: Thinking of selling ${stk.sym} with ER ${formatBP(
                  edge,
                )}, but holding out as it was purchased just ${stk.ticksHeld} ticks ago...`,
              );
            stk.warnedBadPurchase = true;
          } else {
            if (stopLossTriggered)
              sessionLog(
                ns,
                session,
                `WARNING: Emergency pre-4S stop-loss triggered for ${stk.sym} (${(
                  100 * getUnrealizedLossPct(stk)
                ).toFixed(2)}% unrealized loss).`,
                false,
                'warning',
              );
            else if (pre4s && streak >= PRE4S_MAX_NONPOSITIVE_ER_TICKS)
              sessionLog(
                ns,
                session,
                `WARNING: Selling ${stk.sym} because modeled edge has been non-positive for ${streak} tick(s).`,
                false,
                'warning',
              );
            else if (minHoldBypass && stk.ticksHeld < pre4sMinHoldTime)
              sessionLog(
                ns,
                session,
                `WARNING: Selling ${stk.sym} after ${weakSellSignalStreak} consecutive weak-signal tick(s) despite min hold (${stk.ticksHeld}/${pre4sMinHoldTime}).`,
                false,
                'warning',
              );
            await doSellAll(ns, session, stk);
            if (pre4s && stopLossTriggered && pre4sStopLossRebuyCooldown > 0) {
              stopLossRebuyCooldownBySym.set(stk.sym, pre4sStopLossRebuyCooldown + 1);
              buySignalStreak.delete(stk.sym);
              sessionLog(
                ns,
                session,
                `INFO: Stop-loss rebuy cooldown set for ${stk.sym} (${pre4sStopLossRebuyCooldown} tick(s)).`,
              );
            }
            nonPositiveErStreak.delete(stk.sym);
            sellSignalStreak.delete(stk.sym);
            stk.warnedBadPurchase = false;
          }
        }
      }

      const rapidTickCooldownActive = pre4s && session.rapidTickBuyCooldownRemaining > 0;
      const reanchorCooldownActive = pre4s && session.reanchorBuyCooldownRemaining > 0;
      if (playerStats.money / corpus > fracB && !rapidTickCooldownActive && !reanchorCooldownActive) {
        let cash = Math.min(playerStats.money - reserve, maxHoldings - holdings);
        const estTick = Math.max(
          session.detectedCycleTick,
          MARKET_CYCLE_LENGTH -
            (!session.marketCycleDetected
              ? 10
              : session.inversionAgreementThreshold <= 8
                ? 20
                : session.inversionAgreementThreshold <= 10
                  ? 30
                  : MARKET_CYCLE_LENGTH),
        );
        const purchaseRank =
          pre4s && runOptions['pre-4s-prioritize-edge'] ? purchaseOrderPre4sEdgeFirst : purchaseOrder;
        for (const stk of allStocks.sort(purchaseRank)) {
          if (cash <= 0) break;
          const manip = MANIPULABLE_STOCK_SYMBOLS.has(stk.sym);
          const symbolBuyThreshold = thresholdToBuy + (manip ? 0 : NON_MANIPULABLE_BUY_THRESHOLD_PREMIUM);
          const shortsBlocked = session.disableShorts || (pre4s && pre4sDisableShorts);
          const buySignal =
            stk.absReturn() > symbolBuyThreshold &&
            !(shortsBlocked && stk.bearish()) &&
            (!pre4s ||
              (stk.lastInversion >= session.minTickHistory &&
                Math.abs(stk.prob - 0.5) >= pre4sBuyThresholdProbability));
          const signalStreak = buySignal ? (buySignalStreak.get(stk.sym) ?? 0) + 1 : 0;
          buySignalStreak.set(stk.sym, signalStreak);
          if (stk.blackoutWindow() >= MARKET_CYCLE_LENGTH - estTick) continue;
          if (pre4s && Math.max(pre4sMinHoldTime, pre4sMinBlackoutWindow) >= MARKET_CYCLE_LENGTH - estTick) continue;
          if (pre4s && (stopLossRebuyCooldownBySym.get(stk.sym) ?? 0) > 0) {
            buySignalStreak.set(stk.sym, 0);
            continue;
          }
          if (
            stk.ownedShares() == stk.maxShares ||
            stk.absReturn() <= symbolBuyThreshold ||
            (shortsBlocked && stk.bearish())
          )
            continue;
          if (
            pre4s &&
            (stk.lastInversion < session.minTickHistory || Math.abs(stk.prob - 0.5) < pre4sBuyThresholdProbability)
          )
            continue;
          if (pre4s && signalStreak < pre4sMinBuySignalTicks) continue;

          let symbolDiversification = effectiveDiversification * (manip ? 1 : NON_MANIPULABLE_DIVERSIFICATION_MULT);
          if (pre4s) {
            symbolDiversification *= pre4sDiversificationMult;
            // Short inferred windows imply weaker confidence: cap position size until we gather more non-inversion history.
            const confidenceWindow = Math.max(1, Math.min(session.longTermForecastWindowLength, stk.lastInversion));
            const confidenceRatio = Math.min(1, confidenceWindow / Math.max(1, session.minTickHistory));
            const confidenceCapMult = PRE4S_CONFIDENCE_CAP_FLOOR + (1 - PRE4S_CONFIDENCE_CAP_FLOOR) * confidenceRatio;
            symbolDiversification *= confidenceCapMult;
          }
          const budget = Math.min(
            cash,
            maxHoldings * (symbolDiversification + stk.spread_pct) - stk.positionValue() * (1.01 + stk.spread_pct),
          );
          const purchasePrice = stk.bullish() ? stk.ask_price : stk.bid_price;
          if (!Number.isFinite(budget) || !(purchasePrice > 0)) continue;
          const affordableShares = Math.floor((budget - COMMISSION) / purchasePrice);
          const numShares = Math.min(stk.maxShares - stk.ownedShares(), affordableShares);
          if (!Number.isFinite(numShares) || numShares <= 0) continue;
          const ticksBeforeCycleEnd = MARKET_CYCLE_LENGTH - estTick - stk.timeToCoverTheSpread();
          if (ticksBeforeCycleEnd < 1) continue;
          const estEndOfCycleValue = numShares * purchasePrice * ((stk.absReturn() + 1) ** ticksBeforeCycleEnd - 1);
          const owned = stk.ownedShares() > 0;
          if (estEndOfCycleValue <= 2 * COMMISSION)
            sessionLog(
              ns,
              session,
              (owned
                ? ''
                : `We currently have ${formatNumberShort(stk.ownedShares(), 3, 1)} shares in ${
                    stk.sym
                  } valued at ${formatMoney(stk.positionValue())} ` +
                  `(${((100 * stk.positionValue()) / maxHoldings).toFixed(1)}% of corpus, capped at ${(
                    effectiveDiversification * 100
                  ).toFixed(1)}% by --diversification).\n`) +
                `Despite attractive ER of ${formatBP(stk.absReturn())}, ${owned ? 'more ' : ''}${
                  stk.sym
                } was not bought. ` +
                `\nBudget: ${formatMoney(budget)} can only buy ${numShares.toLocaleString('en')} ${
                  owned ? 'more ' : ''
                }shares @ ${formatMoney(purchasePrice)}. ` +
                `\nGiven an estimated ${MARKET_CYCLE_LENGTH - estTick} ticks left in market cycle, less ${stk
                  .timeToCoverTheSpread()
                  .toFixed(1)} ticks to cover the spread (${(stk.spread_pct * 100).toFixed(2)}%), ` +
                `remaining ${ticksBeforeCycleEnd.toFixed(1)} ticks would only generate ${formatMoney(
                  estEndOfCycleValue,
                )}, which is less than 2x commission (${formatMoney(2 * COMMISSION, 3)})`,
            );
          else cash -= await doBuy(ns, session, stk, numShares);
        }
      } else if (
        pre4s &&
        playerStats.money / corpus > fracB &&
        ticked &&
        (rapidTickCooldownActive || reanchorCooldownActive)
      ) {
        const reasons = [
          rapidTickCooldownActive ? `rapid-tick cooldown ${session.rapidTickBuyCooldownRemaining} tick(s)` : null,
          reanchorCooldownActive ? `re-anchor cooldown ${session.reanchorBuyCooldownRemaining} tick(s)` : null,
        ]
          .filter(Boolean)
          .join(' + ');
        sessionLog(ns, session, `INFO: Skipping new pre-4S buys due to ${reasons}.`);
      }

      if (pre4s && ticked) {
        if (session.rapidTickBuyCooldownRemaining > 0) session.rapidTickBuyCooldownRemaining--;
        if (session.reanchorBuyCooldownRemaining > 0) session.reanchorBuyCooldownRemaining--;
        for (const [sym, remaining] of stopLossRebuyCooldownBySym.entries()) {
          const next = remaining - 1;
          if (next > 0) stopLossRebuyCooldownBySym.set(sym, next);
          else stopLossRebuyCooldownBySym.delete(sym);
        }
      }
    } catch (err: unknown) {
      sessionLog(
        ns,
        session,
        `WARNING: stockmaster.js Caught (and suppressed) an unexpected error in the main loop:\n` +
          (typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err)),
        false,
        'warning',
      );
    }
    await ns.sleep(SLEEP_INTERVAL);
  }
}

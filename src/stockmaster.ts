// 3.6GB RAM

import type { NS } from '@ns';
import {
  formatDuration,
  formatMoney,
  formatNumberShort,
  getActiveSourceFiles,
  getConfiguration,
  getNsDataThroughFile,
  getStockSymbols,
  instanceCount,
  runCommand,
  tryGetBitNodeMultipliers,
} from './helpers/stockmaster-helpers';

type ArgsSchemaEntry = [string, string | number | boolean | string[] | null];

interface BitNodeMults {
  FourSigmaMarketDataCost: number;
  FourSigmaMarketDataApiCost: number;
}

// Named constants (previously magic numbers scattered throughout)
const COMMISSION = 100000;
const WSE_ACCOUNT_COST = 200e6;
const TIX_API_COST = 5e9;
const FOUR_S_DATA_BASE_COST = 1e9;
const FOUR_S_API_BASE_COST = 25e9;
const TOTAL_STOCKS = 33;
const MAX_INVERSION_THRESHOLD_CAP = 14;
const MARKET_CYCLE_LENGTH = 75;
const MAX_TICK_HISTORY = 151;
const INVERSION_DETECTION_TOLERANCE = 0.1;
const INVERSION_LAG_TOLERANCE = 5;
const EXPECTED_TICK_TIME = 6000;
const CATCH_UP_TICK_TIME = 4000;
const SLEEP_INTERVAL = 1000;
const CYCLE_DECAY_INTERVAL = 20;
const CYCLE_DECAY_FLOOR = 6;
const LOG_DEDUP_MS = 5000;

class StockPosition {
  sym: string;
  maxShares: number;
  sharesLong = 0;
  sharesShort = 0;
  boughtPrice = 0;
  boughtPriceShort = 0;
  ask_price = 0;
  bid_price = 0;
  spread = 0;
  spread_pct = 0;
  price = 0;
  vol = 0;
  prob = 0.5;
  probStdDev = 0;
  position: [number, number, number, number] | null = null;
  priceHistory: number[] = [];
  lastInversion = 0;
  ticksHeld = 0;
  warnedBadPurchase = false;
  nearTermForecast = 0.5;
  longTermForecast = 0.5;
  possibleInversionDetected = false;
  lastTickProbability = 0.5;
  debugLog = '';

  constructor(sym: string, maxShares: number) {
    this.sym = sym;
    this.maxShares = maxShares;
  }

  expectedReturn(): number {
    // Reduce probability by 1 stddev without crossing the midpoint for conservatism in pre-4S estimates
    const normalizedProb = this.prob - 0.5;
    const conservativeProb =
      normalizedProb < 0
        ? Math.min(0, normalizedProb + this.probStdDev)
        : Math.max(0, normalizedProb - this.probStdDev);
    return this.vol * conservativeProb;
  }

  absReturn(): number {
    return Math.abs(this.expectedReturn());
  }

  bullish(): boolean {
    return this.prob > 0.5;
  }

  bearish(): boolean {
    return !this.bullish();
  }

  ownedShares(): number {
    return this.sharesLong + this.sharesShort;
  }

  owned(): boolean {
    return this.ownedShares() > 0;
  }

  positionValueLong(): number {
    return this.sharesLong * this.bid_price;
  }

  positionValueShort(): number {
    return this.sharesShort * (2 * this.boughtPriceShort - this.ask_price);
  }

  positionValue(): number {
    return this.positionValueLong() + this.positionValueShort();
  }

  // Ticks needed at current expected return to recover the bid/ask spread loss.
  // Derived from compound interest: future = current * (1 + er)^n, solved for n.
  timeToCoverTheSpread(): number {
    return Math.log(this.ask_price / this.bid_price) / Math.log(1 + this.absReturn());
  }

  blackoutWindow(): number {
    return Math.ceil(this.timeToCoverTheSpread());
  }
}

interface TradingSession {
  disableShorts: boolean;
  totalProfit: number;
  lastLog: string;
  lastLogTime: number;
  ticksSinceLastInversion: number;
  allStockSymbols: string[] | null;
  mock: boolean;
  noisy: boolean;
  dictSourceFiles: Record<number, number>;
  showMarketSummary: boolean;
  minTickHistory: number;
  longTermForecastWindowLength: number;
  nearTermForecastWindowLength: number;
  marketCycleDetected: boolean;
  detectedCycleTick: number;
  inversionAgreementThreshold: number;
  lastTick: number;
  options: Record<string, unknown>;
}

function createSession(): TradingSession {
  return {
    disableShorts: false,
    totalProfit: 0,
    lastLog: '',
    lastLogTime: 0,
    ticksSinceLastInversion: 0,
    allStockSymbols: null,
    mock: false,
    noisy: false,
    dictSourceFiles: {},
    showMarketSummary: false,
    minTickHistory: 21,
    longTermForecastWindowLength: 76,
    nearTermForecastWindowLength: 10,
    marketCycleDetected: false,
    detectedCycleTick: 0,
    inversionAgreementThreshold: 6,
    lastTick: 0,
    options: {},
  };
}

let session = createSession();

const argsSchema: ArgsSchemaEntry[] = [
  ['l', false], // Stop any other running stockmaster.js instances and sell all stocks
  ['liquidate', false], // Long-form alias for the above flag.
  ['mock', false], // If set to true, will "mock" buy/sell but not actually buy/sell anything
  ['noisy', false], // If set to true, tprints and announces each time stocks are bought/sold
  ['disable-shorts', false], // If set to true, will not short any stocks. Will be set depending on having SF8.2 by default.
  ['reserve', null], // A fixed amount of money to not spend
  ['fracB', 0.4], // Fraction of assets to have as liquid before we consider buying more stock
  ['fracH', 0.2], // Fraction of assets to retain as cash in hand when buying
  ['buy-threshold', 0.0001], // Buy only stocks forecasted to earn better than a 0.01% return (1 Basis Point)
  ['sell-threshold', 0], // Sell stocks forecasted to earn less than this return (default 0% - which happens when prob hits 50% or worse)
  ['diversification', 0.34], // Max fraction of portfolio as a single stock (relaxed to 2x with 4S data)
  ['disableHud', false], // Disable showing stock value in the HUD panel
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
  ['buy-4s-budget', 0.8], // Maximum corpus value we will sacrifice in order to buy 4S. Setting to 0 will never buy 4s.
];

export function autocomplete(data: { flags: (schema: ArgsSchemaEntry[]) => void }, _args: string[]): string[] {
  data.flags(argsSchema);
  return [];
}

/**
 * Requires access to the TIX API. Purchases access to the 4S Mkt Data API as soon as it can
 */
export async function main(ns: NS): Promise<void> {
  const runOptions = getConfiguration(ns, argsSchema);
  if (!runOptions) return;

  // If given the "liquidate" command, try to kill any versions of this script trading in stocks
  // NOTE: We must do this immediately before we start resetting / overwriting global state below (which is shared between script instances)
  const hasTixApiAccess = (await getNsDataThroughFile(ns, 'ns.stock.hasTIXAPIAccess()', '/Temp/hasTIX.txt')) as boolean;
  if ((runOptions.l as boolean) || (runOptions.liquidate as boolean)) {
    if (!hasTixApiAccess)
      return log(ns, 'ERROR: Cannot liquidate stocks because we do not have Tix Api Access', true, 'error');
    log(ns, 'INFO: Killing any other stockmaster processes...', false, 'info');
    await runCommand(
      ns,
      `ns.ps().filter(proc => proc.filename == '${ns.getScriptName()}' && !proc.args.includes('-l') && !proc.args.includes('--liquidate'))` +
        `.forEach(proc => ns.kill(proc.pid))`,
      '/Temp/kill-stockmarket-scripts.js',
    );
    log(ns, 'INFO: Checking for and liquidating any stocks...', false, 'info');
    await liquidate(ns);
    return;
  } // Otherwise, prevent multiple instances of this script from being started, even with different args.
  if ((await instanceCount(ns)) > 1) return;

  ns.disableLog('ALL');
  // Reset all mutable state cleanly for this run
  session = createSession();
  session.options = runOptions;
  session.mock = runOptions.mock as boolean;
  session.noisy = runOptions.noisy as boolean;
  const fracB = runOptions.fracB as number;
  const fracH = runOptions.fracH as number;
  const diversification = runOptions.diversification as number;
  const disableHud = runOptions.disableHud || runOptions.liquidate || runOptions.mock;
  session.disableShorts = runOptions['disable-shorts'] as boolean;
  const pre4sBuyThresholdProbability = (runOptions['pre-4s-buy-threshold-probability'] ?? 0.15) as number;
  const pre4sMinBlackoutWindow = (runOptions['pre-4s-min-blackout-window'] ?? 1) as number;
  const pre4sMinHoldTime = (runOptions['pre-4s-minimum-hold-time'] ?? 0) as number;
  session.minTickHistory = (runOptions['pre-4s-min-tick-history'] ?? 21) as number;
  session.nearTermForecastWindowLength = (runOptions['pre-4s-inversion-detection-window'] ?? 10) as number;
  session.longTermForecastWindowLength = (runOptions['pre-4s-forecast-window'] ?? MARKET_CYCLE_LENGTH + 1) as number;
  session.showMarketSummary = !!(runOptions['show-pre-4s-forecast'] || runOptions['show-market-summary']);
  const myStocks: StockPosition[] = [];
  let allStocks: StockPosition[] = [];
  const player = await getPlayerInfo(ns);

  if (!hasTixApiAccess) {
    // You cannot use the stockmaster until you have API access
    if (runOptions['disable-purchase-tix-api'])
      return log(ns, 'ERROR: You do not have stock market API access, and --disable-purchase-tix-api is set.', true);
    let success = false;
    log(
      ns,
      `INFO: You are missing stock market API access. (NOTE: This is granted for free once you have SF8). ` +
        `Waiting until we can have the 5b needed to buy it. (Run with --disable-purchase-tix-api to disable this feature.)`,
      true,
    );
    do {
      await ns.sleep(SLEEP_INTERVAL);
      try {
        const reserve = (
          runOptions['reserve'] != null ? runOptions['reserve'] : Number(ns.read('reserve.txt') || 0)
        ) as number;
        success = await tryGetStockMarketAccess(ns, (player as { money: number }).money - reserve);
      } catch (err: unknown) {
        log(
          ns,
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
    log(ns, 'INFO: Shorting stocks has been disabled (you have not yet unlocked access to shorting)');
    session.disableShorts = true;
  }

  session.allStockSymbols = await getStockSymbols(ns);
  allStocks = await initAllStocks(ns);

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
      log(ns, `WARNING: Failed to initialize HUD element: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log(
    ns,
    `Welcome! Please note: all stock purchases will initially result in a Net (unrealized) Loss. This is not only due to commission, but because each stock has a 'spread' (difference in buy price and sell price). ` +
      `This script is designed to buy stocks that are most likely to surpass that loss and turn a profit, but it will take a few minutes to see the progress.\n\n` +
      `If you choose to stop the script, make sure you SELL all your stocks (can go 'run ${ns.getScriptName()} --liquidate') to get your money back.\n\nGood luck!\n~ Insight\n\n`,
  );

  let pre4s = true;
  while (true) {
    try {
      const playerStats = (await getPlayerInfo(ns)) as { money: number };
      const reserve = (
        session.options['reserve'] != null ? session.options['reserve'] : Number(ns.read('reserve.txt') || 0)
      ) as number;
      // Check whether we have 4s access yet (once we do, we can stop checking)
      if (pre4s) pre4s = !(await checkAccess(ns, 'has4SDataTIXAPI'));
      const holdings = await refresh(ns, !pre4s, allStocks, myStocks);
      const corpus = holdings + playerStats.money;
      const maxHoldings = (1 - fracH) * corpus;
      if (
        pre4s &&
        !session.mock &&
        (await tryGet4SApi(
          ns,
          playerStats,
          bitnodeMults,
          corpus * (Number(session.options['buy-4s-budget'] ?? 0.8) - fracH) - reserve,
        ))
      )
        continue; // Start the loop over if we just bought 4S API access
      // Be more conservative with our decisions if we don't have 4S data
      const thresholdToBuy = (
        pre4s ? session.options['pre-4s-buy-threshold-return'] : session.options['buy-threshold']
      ) as number;
      const thresholdToSell = (
        pre4s ? session.options['pre-4s-sell-threshold-return'] : session.options['sell-threshold']
      ) as number;
      // With 4S data we have high-confidence forecasts and can concentrate positions more
      const effectiveDiversification = pre4s ? diversification : Math.min(1.0, diversification * 2);
      if (myStocks.length > 0) doStatusUpdate(ns, allStocks, myStocks, hudElement);
      else if (hudElement) hudElement.innerText = '$0.000 ';
      if (pre4s && allStocks[0].priceHistory.length < session.minTickHistory) {
        log(
          ns,
          `Building a history of stock prices (${allStocks[0].priceHistory.length}/${session.minTickHistory})...`,
        );
        await ns.sleep(SLEEP_INTERVAL);
        continue;
      }

      // Sell forecasted-to-underperform shares (worse than some expected return threshold)
      for (const stk of myStocks) {
        if (
          stk.absReturn() <= thresholdToSell ||
          (stk.bullish() && stk.sharesShort > 0) ||
          (stk.bearish() && stk.sharesLong > 0)
        ) {
          if (pre4s && stk.ticksHeld < pre4sMinHoldTime) {
            if (!stk.warnedBadPurchase)
              log(
                ns,
                `WARNING: Thinking of selling ${stk.sym} with ER ${formatBP(
                  stk.absReturn(),
                )}, but holding out as it was purchased just ${stk.ticksHeld} ticks ago...`,
              );
            stk.warnedBadPurchase = true;
          } else {
            await doSellAll(ns, stk);
            stk.warnedBadPurchase = false;
          }
        }
      }

      // Buy phase — no longer skipped after selling; positions are refreshed next iteration anyway,
      // and this allows us to immediately reinvest proceeds from sales in the same tick.
      if (playerStats.money / corpus > fracB) {
        // Compute the cash we have to spend (such that spending it all on stock would bring us down to a liquidity of fracH)
        let cash = Math.min(playerStats.money - reserve, maxHoldings - holdings);
        // If we haven't detected the market cycle (or haven't detected it reliably), assume it might be quite soon and restrict bets to those that can turn a profit in the very-near term.
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
        // Buy shares with cash remaining in hand if exceeding some buy threshold. Prioritize targets whose expected return will cover the ask/bid spread the soonest
        for (const stk of allStocks.sort(purchaseOrder)) {
          if (cash <= 0) break;
          if (stk.blackoutWindow() >= MARKET_CYCLE_LENGTH - estTick) continue;
          if (pre4s && Math.max(pre4sMinHoldTime, pre4sMinBlackoutWindow) >= MARKET_CYCLE_LENGTH - estTick) continue;
          if (
            stk.ownedShares() == stk.maxShares ||
            stk.absReturn() <= thresholdToBuy ||
            (session.disableShorts && stk.bearish())
          )
            continue;
          if (
            pre4s &&
            (stk.lastInversion < session.minTickHistory || Math.abs(stk.prob - 0.5) < pre4sBuyThresholdProbability)
          )
            continue;

          // Enforce diversification: Don't hold more than x% of our portfolio as a single stock (as corpus increases, this naturally stops being a limiter)
          // Inflate our budget / current position value by a factor of stk.spread_pct to avoid repeated micro-buys of a stock due to the buy/ask spread making holdings appear more diversified after purchase
          const budget = Math.min(
            cash,
            maxHoldings * (effectiveDiversification + stk.spread_pct) - stk.positionValue() * (1.01 + stk.spread_pct),
          );
          const purchasePrice = stk.bullish() ? stk.ask_price : stk.bid_price;
          const affordableShares = Math.floor((budget - COMMISSION) / purchasePrice);
          const numShares = Math.min(stk.maxShares - stk.ownedShares(), affordableShares);
          if (numShares <= 0) continue;
          // Don't buy fewer shares than can beat the commission before the next stock market cycle (after covering the spread), lest the position reverse before we break-even.
          const ticksBeforeCycleEnd = MARKET_CYCLE_LENGTH - estTick - stk.timeToCoverTheSpread();
          if (ticksBeforeCycleEnd < 1) continue;
          const estEndOfCycleValue = numShares * purchasePrice * ((stk.absReturn() + 1) ** ticksBeforeCycleEnd - 1);
          const owned = stk.ownedShares() > 0;
          if (estEndOfCycleValue <= 2 * COMMISSION)
            log(
              ns,
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
          else cash -= await doBuy(ns, stk, numShares);
        }
      }
    } catch (err: unknown) {
      log(
        ns,
        `WARNING: stockmaster.js Caught (and suppressed) an unexpected error in the main loop:\n` +
          (typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err)),
        false,
        'warning',
      );
    }
    await ns.sleep(SLEEP_INTERVAL);
  }
}

async function getPlayerInfo(ns: NS): Promise<{ money: number }> {
  return (await getNsDataThroughFile(
    ns,
    `(function(){const p=ns.getPlayer();return {money:p.money};})()`,
    '/Temp/player-info.txt',
  )) as { money: number };
}

/* A sorting function to put stocks in the order we should prioritize investing in them */
const purchaseOrder = (a: StockPosition, b: StockPosition) =>
  Math.ceil(a.timeToCoverTheSpread()) - Math.ceil(b.timeToCoverTheSpread()) || b.absReturn() - a.absReturn();

/** Generic helper for dodging the hefty RAM requirements of stock functions by spawning a temporary script to collect info for us. */
async function getStockInfoDict(
  ns: NS,
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

interface BatchedStockData {
  ask: number;
  bid: number;
  vol?: number;
  forecast?: number;
  pos?: [number, number, number, number];
}

/** Fetches all stock data in a single temp-script invocation instead of 4-5 separate round trips. */
async function getBatchedStockData(ns: NS, has4s: boolean): Promise<Record<string, BatchedStockData>> {
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

async function initAllStocks(ns: NS): Promise<StockPosition[]> {
  const dictMaxShares = (await getStockInfoDict(ns, 'getMaxShares')) as Record<string, number>;
  return session.allStockSymbols!.map((s: string) => new StockPosition(s, dictMaxShares[s]));
}

async function refresh(ns: NS, has4s: boolean, allStocks: StockPosition[], myStocks: StockPosition[]): Promise<number> {
  let holdings = 0;

  const batchedData = await getBatchedStockData(ns, has4s);
  const ticked = allStocks.some((stk) => stk.ask_price != batchedData[stk.sym].ask);

  if (ticked) {
    if (Date.now() - session.lastTick < EXPECTED_TICK_TIME - SLEEP_INTERVAL) {
      if (Date.now() - session.lastTick < CATCH_UP_TICK_TIME - SLEEP_INTERVAL) {
        const changedPrices = allStocks.filter((stk) => stk.ask_price != batchedData[stk.sym].ask);
        log(
          ns,
          `WARNING: Detected a stock market tick after only ${formatDuration(
            Date.now() - session.lastTick,
          )}, but expected ~${formatDuration(EXPECTED_TICK_TIME)}. ` +
            (changedPrices.length >= TOTAL_STOCKS
              ? '(All stocks updated)'
              : `The following ${changedPrices.length} stock prices changed: ${changedPrices
                  .map((stk) => `${stk.sym} ${formatMoney(stk.ask_price)} -> ${formatMoney(batchedData[stk.sym].ask)}`)
                  .join(', ')}`),
          false,
          'warning',
        );
      } else
        log(
          ns,
          `INFO: Detected a rapid stock market tick (${formatDuration(
            Date.now() - session.lastTick,
          )}), likely to make up for lag / offline time.`,
        );
    }
    session.lastTick = Date.now();
  }

  myStocks.length = 0;
  for (const stk of allStocks) {
    const sym = stk.sym;
    const data = batchedData[sym];
    stk.ask_price = data.ask;
    stk.bid_price = data.bid;
    stk.spread = stk.ask_price - stk.bid_price;
    stk.spread_pct = stk.spread / stk.ask_price;
    stk.price = (stk.ask_price + stk.bid_price) / 2;
    stk.vol = has4s ? data.vol! : stk.vol;
    stk.prob = has4s ? data.forecast! : stk.prob;
    stk.probStdDev = has4s ? 0 : stk.probStdDev;
    // Update our current portfolio of owned stock
    const [priorLong, priorShort] = [stk.sharesLong, stk.sharesShort];
    stk.position = session.mock ? null : data.pos!;
    stk.sharesLong = session.mock ? stk.sharesLong || 0 : stk.position![0];
    stk.boughtPrice = session.mock ? stk.boughtPrice || 0 : stk.position![1];
    stk.sharesShort = session.mock ? stk.sharesShort || 0 : stk.position![2];
    stk.boughtPriceShort = session.mock ? stk.boughtPriceShort || 0 : stk.position![3];
    holdings += stk.positionValue();
    if (stk.owned()) myStocks.push(stk);
    else stk.ticksHeld = 0;
    if (ticked)
      stk.ticksHeld =
        !stk.owned() || (priorLong > 0 && stk.sharesLong == 0) || (priorShort > 0 && stk.sharesShort == 0)
          ? 0
          : 1 + stk.ticksHeld;
  }
  if (ticked) await updateForecast(ns, allStocks, has4s);
  return holdings;
}

// Compute fraction of upward price movements in a history array (most recent first)
function computeForecast(history: number[]): number {
  if (history.length < 2) return 0.5;
  let ups = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i - 1] > history[i]) ups++;
  }
  return ups / (history.length - 1);
}

// Compute volatility as the standard deviation of per-tick returns
function computeVolatility(history: number[]): number {
  if (history.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < history.length; i++) {
    returns.push((history[i - 1] - history[i]) / history[i]);
  }
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

// An "inversion" can be detected if two probabilities are far enough apart and are within "tolerance" of p1 being equal to 1-p2
const tol2 = INVERSION_DETECTION_TOLERANCE / 2;
const detectInversion = (p1: number, p2: number) =>
  (p1 >= 0.5 + tol2 && p2 <= 0.5 - tol2 && p2 <= 1 - p1 + INVERSION_DETECTION_TOLERANCE) ||
  /* Reverse Condition: */ (p1 <= 0.5 - tol2 && p2 >= 0.5 + tol2 && p2 >= 1 - p1 - INVERSION_DETECTION_TOLERANCE);

async function updateForecast(ns: NS, allStocks: StockPosition[], has4s: boolean): Promise<void> {
  const currentHistory = allStocks[0].priceHistory.length;
  const prepSummary =
    session.showMarketSummary ||
    session.mock ||
    (!has4s && (currentHistory < session.minTickHistory || allStocks.filter((stk) => stk.owned()).length == 0));
  const inversionsDetected: StockPosition[] = [];
  session.detectedCycleTick = (session.detectedCycleTick + 1) % MARKET_CYCLE_LENGTH;
  for (const stk of allStocks) {
    stk.priceHistory.unshift(stk.price);
    if (stk.priceHistory.length > MAX_TICK_HISTORY) stk.priceHistory.splice(MAX_TICK_HISTORY, 1);
    if (!has4s) stk.vol = computeVolatility(stk.priceHistory);
    stk.nearTermForecast = computeForecast(stk.priceHistory.slice(0, session.nearTermForecastWindowLength));
    const preNearTermWindowProb = computeForecast(
      stk.priceHistory.slice(
        session.nearTermForecastWindowLength,
        session.nearTermForecastWindowLength + MARKET_CYCLE_LENGTH,
      ),
    );
    stk.possibleInversionDetected = has4s
      ? detectInversion(stk.prob, stk.lastTickProbability || stk.prob)
      : detectInversion(preNearTermWindowProb, stk.nearTermForecast);
    stk.lastTickProbability = stk.prob;
    if (stk.possibleInversionDetected) inversionsDetected.push(stk);
  }
  // Detect whether our auto-detected "stock market cycle" timing should be adjusted based on the number of potential inversions observed
  let summary = '';
  if (inversionsDetected.length > 0) {
    session.ticksSinceLastInversion = 0;
    summary += `${inversionsDetected.length} Stocks appear to be reversing their outlook: ${inversionsDetected
      .map((s) => s.sym)
      .join(', ')} (threshold: ${session.inversionAgreementThreshold})\n`;
    if (
      inversionsDetected.length >= session.inversionAgreementThreshold &&
      (has4s || currentHistory >= session.minTickHistory)
    ) {
      // We believe we have detected the stock market cycle!
      const newPredictedCycleTick = has4s ? 0 : session.nearTermForecastWindowLength;
      if (session.detectedCycleTick != newPredictedCycleTick)
        log(
          ns,
          `Threshold for changing predicted market cycle met (${inversionsDetected.length} >= ${session.inversionAgreementThreshold}). ` +
            `Changing current market tick from ${session.detectedCycleTick} to ${newPredictedCycleTick}.`,
        );
      session.marketCycleDetected = true;
      session.detectedCycleTick = newPredictedCycleTick;
      session.inversionAgreementThreshold = Math.max(MAX_INVERSION_THRESHOLD_CAP, inversionsDetected.length);
    }
  } else {
    // Decay the agreement threshold if we haven't seen inversions for a while,
    // preventing it from getting "stuck" at an overly high value
    session.ticksSinceLastInversion++;
    if (
      session.ticksSinceLastInversion > CYCLE_DECAY_INTERVAL &&
      session.inversionAgreementThreshold > CYCLE_DECAY_FLOOR
    ) {
      session.inversionAgreementThreshold--;
      log(
        ns,
        `No inversions detected for ${session.ticksSinceLastInversion} ticks. ` +
          `Decaying inversion agreement threshold to ${session.inversionAgreementThreshold}.`,
      );
    }
  }
  // Act on any inversions (if trusted), compute the probability, and prepare the stock summary
  for (const stk of allStocks) {
    // Don't "trust" (act on) a detected inversion unless it's near the time when we're capable of detecting market cycle start. Avoids most false-positives.
    if (
      stk.possibleInversionDetected &&
      ((has4s && session.detectedCycleTick == 0) ||
        (!has4s &&
          session.detectedCycleTick >= session.nearTermForecastWindowLength / 2 &&
          session.detectedCycleTick <= session.nearTermForecastWindowLength + INVERSION_LAG_TOLERANCE))
    )
      stk.lastInversion = session.detectedCycleTick;
    else stk.lastInversion++;
    // Only take the stock history since after the last inversion to compute the probability of the stock.
    const probWindowLength = Math.min(session.longTermForecastWindowLength, stk.lastInversion);
    stk.longTermForecast = computeForecast(stk.priceHistory.slice(0, probWindowLength));
    if (!has4s) {
      stk.prob = stk.longTermForecast;
      stk.probStdDev = Math.sqrt((stk.prob * (1 - stk.prob)) / probWindowLength);
    }
    const signalStrength =
      1 +
      (stk.bullish()
        ? (stk.nearTermForecast > stk.prob ? 1 : 0) + (stk.prob > 0.8 ? 1 : 0)
        : (stk.nearTermForecast < stk.prob ? 1 : 0) + (stk.prob < 0.2 ? 1 : 0));
    if (prepSummary) {
      stk.debugLog =
        `${stk.sym.padEnd(5, ' ')} ${(stk.bullish() ? '+' : '-').repeat(signalStrength).padEnd(3)} ` +
        `Prob:${(stk.prob * 100).toFixed(0).padStart(3)}% (t${probWindowLength.toFixed(0).padStart(2)}:${(
          stk.longTermForecast * 100
        )
          .toFixed(0)
          .padStart(3)}%, ` +
        `t${Math.min(stk.priceHistory.length, session.nearTermForecastWindowLength).toFixed(0).padStart(2)}:${(
          stk.nearTermForecast * 100
        )
          .toFixed(0)
          .padStart(3)}%) ` +
        `tLast⇄:${(stk.lastInversion + 1).toFixed(0).padStart(3)} Vol:${(stk.vol * 100).toFixed(2)}% ER:${formatBP(
          stk.expectedReturn(),
        ).padStart(8)} ` +
        `Spread:${(stk.spread_pct * 100).toFixed(2)}% ttProfit:${stk.blackoutWindow().toFixed(0).padStart(3)}`;
      if (stk.owned())
        stk.debugLog += ` Pos: ${formatNumberShort(stk.ownedShares(), 3, 1)} (${
          stk.ownedShares() == stk.maxShares
            ? 'max'
            : ((100 * stk.ownedShares()) / stk.maxShares).toFixed(0).padStart(2) + '%'
        }) ${stk.sharesLong > 0 ? 'long ' : 'short'} (held ${stk.ticksHeld} ticks)`;
      if (stk.possibleInversionDetected) stk.debugLog += ' ⇄⇄⇄';
    }
  }
  // Print a summary of stocks as of this most recent tick (if enabled)
  if (prepSummary) {
    summary +=
      `Market day ${session.detectedCycleTick + 1}${session.marketCycleDetected ? '' : '?'} of ${MARKET_CYCLE_LENGTH} (${
        session.marketCycleDetected ? ((100 * session.inversionAgreementThreshold) / 19).toPrecision(2) : '0'
      }% certain) ` +
      `Current Stock Summary and Pre-4S Forecasts (by best payoff-time):\n` +
      allStocks
        .sort(purchaseOrder)
        .map((s) => s.debugLog)
        .join('\n');
    if (session.showMarketSummary) await updateForecastFile(ns, summary);
    else log(ns, summary);
  }
  // Write out a file of stock probabilities so that other scripts can make use of this (e.g. hack orchestrator can manipulate the stock market)
  await ns.write(
    '/Temp/stock-probabilities.txt',
    JSON.stringify(
      Object.fromEntries(
        allStocks.map((stk) => [
          stk.sym,
          {
            prob: stk.prob,
            sharesLong: stk.sharesLong,
            sharesShort: stk.sharesShort,
          },
        ]),
      ),
    ),
    'w',
  );
}

// Helpers to display the stock market summary in a separate window.
const summaryFile = '/Temp/stockmarket-summary.txt';
const updateForecastFile = async (ns: NS, summary: string) => await ns.write(summaryFile, summary, 'w');
const launchSummaryTail = async (ns: NS) => {
  const summaryTailScript = summaryFile.replace('.txt', '-tail.js');
  if (
    await getNsDataThroughFile(
      ns,
      `ns.scriptRunning('${summaryTailScript}', ns.getHostname())`,
      '/Temp/stockmarket-summary-is-running.txt',
    )
  )
    return;
  await runCommand(
    ns,
    `ns.disableLog('sleep'); ns.tail(); let lastRead = '';
      while (true) {
          let read = ns.read('${summaryFile}');
          if (lastRead != read) ns.print(lastRead = read);
          await ns.sleep(1000);
      }`,
    summaryTailScript,
  );
};

// Ram-dodging helpers that spawn temporary scripts to buy/sell rather than pay 2.5GB ram per variant
const sellStockWrapper = async (ns: NS, sym: string, numShares: number) =>
  await transactStock(ns, sym, numShares, 'sellStock');
const sellShortWrapper = async (ns: NS, sym: string, numShares: number) =>
  await transactStock(ns, sym, numShares, 'sellShort');
const transactStock = async (
  ns: NS,
  sym: string,
  numShares: number,
  action: 'buyStock' | 'buyShort' | 'sellStock' | 'sellShort',
) =>
  await getNsDataThroughFile(ns, `ns.stock.${action}(ns.args[0], ns.args[1])`, `/Temp/stock-${action}.txt`, [
    sym,
    numShares,
  ]);

/** Automatically buys either a short or long position depending on the outlook of the stock. */
async function doBuy(ns: NS, stk: StockPosition, sharesToBuy: number): Promise<number> {
  // We include -2*COMMISSION in the "holdings value" of our stock, but if we make repeated purchases of the same stock, we have to track
  // the additional commission somewhere. So only subtract it from our running profit if this isn't our first purchase of this symbol
  let price = 0;
  if (stk.owned()) session.totalProfit -= COMMISSION;
  const long = stk.bullish();
  const expectedPrice = long ? stk.ask_price : stk.bid_price;
  log(
    ns,
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
    log(ns, `WARN: Failed to short ${stk.sym} (Shorts not available?). Disabling shorts...`, true, 'warning');
    return 0;
  }
  if (price == 0) {
    const playerMoney = (await getPlayerInfo(ns)).money;
    if (playerMoney < sharesToBuy * expectedPrice)
      log(
        ns,
        `WARN: Failed to ${long ? 'buy' : 'short'} ${stk.sym} because money just recently dropped to ${formatMoney(
          playerMoney,
        )} and we can no longer afford it.`,
        session.noisy,
      );
    else
      log(
        ns,
        `ERROR: Failed to ${long ? 'buy' : 'short'} ${stk.sym} @ ${formatMoney(
          expectedPrice,
        )} (0 was returned) despite having ${formatMoney(playerMoney)}.`,
        true,
        'error',
      );
    return 0;
  } else if (price != expectedPrice) {
    log(
      ns,
      `WARNING: ${long ? 'Bought' : 'Shorted'} ${stk.sym} @ ${formatMoney(price)} but expected ${formatMoney(
        expectedPrice,
      )} (spread: ${formatMoney(stk.spread)})`,
      false,
      'warning',
    );
    price = expectedPrice; // Known Bitburner bug for now, short returns "price" instead of "bid_price". Correct this so running profit calcs are correct.
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

/** Sell our current position in this stock. */
async function doSellAll(ns: NS, stk: StockPosition): Promise<number> {
  const long = stk.sharesLong > 0;
  if (long && stk.sharesShort > 0)
    log(
      ns,
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
  log(
    ns,
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
    log(
      ns,
      `ERROR: Failed to sell ${sharesSold} ${stk.sym} ${long ? 'shares' : 'shorts'} @ ${formatMoney(
        expectedPrice,
      )} - 0 was returned.`,
      true,
      'error',
    );
    return 0;
  } else if (price != expectedPrice) {
    log(
      ns,
      `WARNING: Sold ${stk.sym} ${long ? 'shares' : 'shorts'} @ ${formatMoney(price)} but expected ${formatMoney(
        expectedPrice,
      )} (spread: ${formatMoney(stk.spread)})`,
      false,
      'warning',
    );
    price = expectedPrice; // Known Bitburner bug for now, sellShort returns "price" instead of "ask_price". Correct this so running profit calcs are correct.
  }
  if (long) stk.sharesLong -= sharesSold;
  else stk.sharesShort -= sharesSold;
  session.totalProfit += profit;
  return price * sharesSold - COMMISSION;
}

const formatBP = (fraction: number) => formatNumberShort(fraction * 100 * 100, 3, 2) + ' BP';

const log = (ns: NS, message: string, tprint = false, toastStyle = '') => {
  const now = Date.now();
  // Allow duplicate messages after enough time has passed
  if (message == session.lastLog && now - session.lastLogTime < LOG_DEDUP_MS) return;
  session.lastLog = message;
  session.lastLogTime = now;
  ns.print(message);
  if (tprint) ns.tprint(message);
  if (toastStyle) ns.toast(message, toastStyle as 'info' | 'success' | 'warning' | 'error');
};

function doStatusUpdate(
  ns: NS,
  stocks: StockPosition[],
  myStocks: StockPosition[],
  hudElement: HTMLElement | null = null,
): void {
  const maxReturnBP = 10000 * Math.max(...myStocks.map((s) => s.absReturn()));
  const minReturnBP = 10000 * Math.min(...myStocks.map((s) => s.absReturn()));
  const est_holdings_cost = myStocks.reduce(
    (sum, stk) =>
      sum + (stk.owned() ? COMMISSION : 0) + stk.sharesLong * stk.boughtPrice + stk.sharesShort * stk.boughtPriceShort,
    0,
  );
  const liquidation_value = myStocks.reduce(
    (sum, stk) => sum - (stk.owned() ? COMMISSION : 0) + stk.positionValue(),
    0,
  );
  const status =
    `Long ${myStocks.filter((s) => s.sharesLong > 0).length}, Short ${
      myStocks.filter((s) => s.sharesShort > 0).length
    } of ${stocks.length} stocks ` +
    (myStocks.length == 0 ? '' : `(ER ${minReturnBP.toFixed(1)}-${maxReturnBP.toFixed(1)} BP) `) +
    `Profit: ${formatMoney(session.totalProfit, 3)} Holdings: ${formatMoney(liquidation_value, 3)} (Cost: ${formatMoney(
      est_holdings_cost,
      3,
    )}) ` +
    `Net: ${formatMoney(session.totalProfit + liquidation_value - est_holdings_cost, 3)}`;
  log(ns, status);
  if (hudElement) hudElement.innerText = formatMoney(liquidation_value, 6, 3);
}

async function liquidate(ns: NS): Promise<void> {
  session.allStockSymbols ??= await getStockSymbols(ns);
  if (session.allStockSymbols == null) return;
  let totalStocks = 0,
    totalSharesLong = 0,
    totalSharesShort = 0,
    totalRevenue = 0;
  const dictPositions = session.mock
    ? null
    : ((await getStockInfoDict(ns, 'getPosition')) as Record<string, [number, number, number, number]>);
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
  log(
    ns,
    `Sold ${totalSharesLong.toLocaleString('en')} long shares and ${totalSharesShort.toLocaleString(
      'en',
    )} short shares ` + `in ${totalStocks} stocks for ${formatMoney(totalRevenue, 3)}`,
    true,
    'success',
  );
}

async function tryGet4SApi(
  ns: NS,
  playerStats: { money: number },
  bitnodeMults: BitNodeMults,
  budget: number,
): Promise<boolean> {
  if (await checkAccess(ns, 'has4SDataTIXAPI')) return false;
  const cost4sData = FOUR_S_DATA_BASE_COST * bitnodeMults.FourSigmaMarketDataCost;
  const cost4sApi = FOUR_S_API_BASE_COST * bitnodeMults.FourSigmaMarketDataApiCost;
  const has4S = await checkAccess(ns, 'has4SData');
  const totalCost = (has4S ? 0 : cost4sData) + cost4sApi;
  if (totalCost > budget) return false;
  if (playerStats.money < totalCost) await liquidate(ns);
  if (!has4S) {
    if (await tryBuy(ns, 'purchase4SMarketData'))
      log(
        ns,
        `SUCCESS: Purchased 4SMarketData for ${formatMoney(cost4sData)} ` +
          `(At ${formatDuration((await ns.getResetInfo()).lastNodeReset)} into BitNode)`,
        true,
        'success',
      );
    else log(ns, 'ERROR attempting to purchase 4SMarketData!', false, 'error');
  }
  if (await tryBuy(ns, 'purchase4SMarketDataTixApi')) {
    log(
      ns,
      `SUCCESS: Purchased 4SMarketDataTixApi for ${formatMoney(cost4sApi)} ` +
        `(At ${formatDuration((await ns.getResetInfo()).lastNodeReset)} into BitNode)`,
      true,
      'success',
    );
    return true;
  } else {
    log(ns, 'ERROR attempting to purchase 4SMarketDataTixApi!', false, 'error');
    if (!(5 in session.dictSourceFiles)) {
      log(
        ns,
        'INFO: Bitnode mults are not available (SF5) - assuming everything is twice as expensive in the current bitnode.',
      );
      bitnodeMults.FourSigmaMarketDataCost *= 2;
      bitnodeMults.FourSigmaMarketDataApiCost *= 2;
    }
  }
  return false;
}

async function checkAccess(
  ns: NS,
  stockFn: 'hasWSEAccount' | 'hasTIXAPIAccess' | 'has4SData' | 'has4SDataTIXAPI',
): Promise<boolean> {
  return (await getNsDataThroughFile(ns, `ns.stock.${stockFn}()`, `/Temp/stock-${stockFn}.txt`)) as boolean;
}

async function tryBuy(
  ns: NS,
  stockFn: 'purchaseWseAccount' | 'purchaseTixApi' | 'purchase4SMarketData' | 'purchase4SMarketDataTixApi',
): Promise<boolean> {
  return (await getNsDataThroughFile(ns, `ns.stock.${stockFn}()`, `/Temp/stock-${stockFn}.txt`)) as boolean;
}

async function tryGetStockMarketAccess(ns: NS, budget: number): Promise<boolean> {
  if (await checkAccess(ns, 'hasTIXAPIAccess')) return true;
  const hasWSE = await checkAccess(ns, 'hasWSEAccount');
  const totalCost = (hasWSE ? 0 : WSE_ACCOUNT_COST) + TIX_API_COST;
  if (totalCost > budget) return false;
  if (!hasWSE) {
    if (await tryBuy(ns, 'purchaseWseAccount'))
      log(
        ns,
        `SUCCESS: Purchased a WSE (stockmarket) account for ${formatMoney(WSE_ACCOUNT_COST)} ` +
          `(At ${formatDuration((await ns.getResetInfo()).lastNodeReset)} into BitNode)`,
        true,
        'success',
      );
    else log(ns, 'ERROR attempting to purchase WSE account!', false, 'error');
  }
  if (await tryBuy(ns, 'purchaseTixApi')) {
    log(
      ns,
      `SUCCESS: Purchased Tix (stockmarket) Api access for ${formatMoney(TIX_API_COST)} ` +
        `(At ${formatDuration((await ns.getResetInfo()).lastNodeReset)} into BitNode)`,
      true,
      'success',
    );
    return true;
  } else log(ns, 'ERROR attempting to purchase Tix Api!', false, 'error');
  return false;
}

function initializeHud(): HTMLElement {
  const d = eval('document') as Document;
  let htmlDisplay = d.getElementById('stock-display-1');
  if (htmlDisplay !== null) return htmlDisplay;
  const overviewHook = d.getElementById('overview-extra-hook-0');
  if (!overviewHook?.parentElement?.parentElement) throw new Error('HUD overview element not found');
  const customElements = overviewHook.parentElement.parentElement as HTMLElement;
  const stockValueTracker = customElements.cloneNode(true) as HTMLElement;
  stockValueTracker
    .querySelectorAll('p > p')
    .forEach((el: Element) => (el.parentElement as HTMLElement).removeChild(el));
  stockValueTracker
    .querySelectorAll('p')
    .forEach((el: Element, i: number) => ((el as HTMLElement).id = 'stock-display-' + i));
  htmlDisplay = stockValueTracker.querySelector('#stock-display-1') as HTMLElement | null;
  if (!htmlDisplay) throw new Error('Stock display element not found');
  (stockValueTracker.querySelectorAll('p')[0] as HTMLElement).innerText = 'Stock';
  htmlDisplay.innerText = '$0.000 ';
  const parent = customElements.parentElement;
  if (!parent) throw new Error('HUD parent element not found');
  parent.insertBefore(stockValueTracker, parent.childNodes[2]);
  return htmlDisplay;
}

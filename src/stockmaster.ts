// 3.6GB RAM

import type { NS } from '@ns';
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
  MARKET_CYCLE_LENGTH,
  purchaseOrder,
  refresh,
  runCommand,
  SLEEP_INTERVAL,
  tryGet4SApi,
  tryGetBitNodeMultipliers,
  tryGetStockMarketAccess,
} from './helpers/stockmaster/index';
import { StockPosition } from './helpers/stockmaster/stock-position';
import { sessionLog, TradingSession } from './helpers/stockmaster/trading-session';

let session = new TradingSession();

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

  const hasTixApiAccess = (await getNsDataThroughFile(ns, 'ns.stock.hasTIXAPIAccess()', '/Temp/hasTIX.txt')) as boolean;
  if ((runOptions.l as boolean) || (runOptions.liquidate as boolean)) {
    if (!hasTixApiAccess)
      return sessionLog(
        ns,
        session,
        'ERROR: Cannot liquidate stocks because we do not have Tix Api Access',
        true,
        'error',
      );
    sessionLog(ns, session, 'INFO: Killing any other stockmaster processes...', false, 'info');
    await runCommand(
      ns,
      `ns.ps().filter(proc => proc.filename == '${ns.getScriptName()}' && !proc.args.includes('-l') && !proc.args.includes('--liquidate'))` +
        `.forEach(proc => ns.kill(proc.pid))`,
      '/Temp/kill-stockmarket-scripts.js',
    );
    sessionLog(ns, session, 'INFO: Checking for and liquidating any stocks...', false, 'info');
    await liquidate(ns, session);
    return;
  }
  if ((await instanceCount(ns)) > 1) return;

  ns.disableLog('ALL');
  session = new TradingSession();
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
        const reserve = (
          runOptions['reserve'] != null ? runOptions['reserve'] : Number(ns.read('reserve.txt') || 0)
        ) as number;
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
  while (true) {
    try {
      const playerStats = (await getPlayerInfo(ns)) as { money: number };
      const reserve = (
        session.options['reserve'] != null ? session.options['reserve'] : Number(ns.read('reserve.txt') || 0)
      ) as number;
      if (pre4s) pre4s = !(await checkAccess(ns, 'has4SDataTIXAPI'));
      const holdings = await refresh(ns, session, !pre4s, allStocks, myStocks);
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
        if (
          stk.absReturn() <= thresholdToSell ||
          (stk.bullish() && stk.sharesShort > 0) ||
          (stk.bearish() && stk.sharesLong > 0)
        ) {
          if (pre4s && stk.ticksHeld < pre4sMinHoldTime) {
            if (!stk.warnedBadPurchase)
              sessionLog(
                ns,
                session,
                `WARNING: Thinking of selling ${stk.sym} with ER ${formatBP(
                  stk.absReturn(),
                )}, but holding out as it was purchased just ${stk.ticksHeld} ticks ago...`,
              );
            stk.warnedBadPurchase = true;
          } else {
            await doSellAll(ns, session, stk);
            stk.warnedBadPurchase = false;
          }
        }
      }

      if (playerStats.money / corpus > fracB) {
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

          const budget = Math.min(
            cash,
            maxHoldings * (effectiveDiversification + stk.spread_pct) - stk.positionValue() * (1.01 + stk.spread_pct),
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

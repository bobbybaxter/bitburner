import type { NS } from '@ns';
import {
  CATCH_UP_TICK_TIME,
  CYCLE_DECAY_FLOOR,
  CYCLE_DECAY_INTERVAL,
  EXPECTED_TICK_TIME,
  INVERSION_LAG_TOLERANCE,
  MARKET_CYCLE_LENGTH,
  MAX_INVERSION_THRESHOLD_CAP,
  MAX_TICK_HISTORY,
  SLEEP_INTERVAL,
  TOTAL_STOCKS,
} from './constants';
import { computeForecast, computeVolatility, detectInversion } from './forecast';
import { formatDuration } from './format-duration';
import { formatMoney } from './format-money';
import { formatNumberShort } from './format-number-short';
import { getNsDataThroughFile } from './get-ns-data-through-file';
import { runCommand } from './run-command';
import { getBatchedStockData } from './stock-api';
import type { StockPosition } from './stock-position';
import { formatBP, purchaseOrder } from './trading';
import type { TradingSession } from './trading-session';
import { sessionLog } from './trading-session';

export async function refresh(
  ns: NS,
  session: TradingSession,
  has4s: boolean,
  allStocks: StockPosition[],
  myStocks: StockPosition[],
): Promise<number> {
  let holdings = 0;

  const batchedData = await getBatchedStockData(ns, session, has4s);
  const ticked = allStocks.some((stk) => stk.ask_price != batchedData[stk.sym].ask);

  if (ticked) {
    if (Date.now() - session.lastTick < EXPECTED_TICK_TIME - SLEEP_INTERVAL) {
      if (Date.now() - session.lastTick < CATCH_UP_TICK_TIME - SLEEP_INTERVAL) {
        const changedPrices = allStocks.filter((stk) => stk.ask_price != batchedData[stk.sym].ask);
        sessionLog(
          ns,
          session,
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
        sessionLog(
          ns,
          session,
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
    stk.spread_pct = stk.ask_price > 0 ? stk.spread / stk.ask_price : 0;
    stk.price = (stk.ask_price + stk.bid_price) / 2;
    stk.vol = has4s ? data.vol! : stk.vol;
    stk.prob = has4s ? data.forecast! : stk.prob;
    stk.probStdDev = has4s ? 0 : stk.probStdDev;
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
  if (ticked) await updateForecast(ns, session, allStocks, has4s);
  return holdings;
}

export async function updateForecast(
  ns: NS,
  session: TradingSession,
  allStocks: StockPosition[],
  has4s: boolean,
): Promise<void> {
  const currentHistory = allStocks[0].priceHistory.length;
  const prepSummary =
    session.showMarketSummary ||
    session.mock ||
    (!has4s && (currentHistory < session.minTickHistory || allStocks.filter((stk) => stk.owned()).length == 0));
  const inversionsDetected: StockPosition[] = [];
  session.detectedCycleTick = (session.detectedCycleTick + 1) % MARKET_CYCLE_LENGTH;
  for (const stk of allStocks) {
    stk.priceHistory.push(stk.price);
    if (stk.priceHistory.length > 2 * MAX_TICK_HISTORY) {
      stk.priceHistory = stk.priceHistory.slice(-MAX_TICK_HISTORY);
    }
    const hLen = stk.priceHistory.length;
    if (!has4s) stk.vol = computeVolatility(stk.priceHistory, Math.max(0, hLen - MAX_TICK_HISTORY), hLen);
    stk.nearTermForecast = computeForecast(
      stk.priceHistory,
      Math.max(0, hLen - session.nearTermForecastWindowLength),
      hLen,
    );
    const preNearTermEnd = Math.max(0, hLen - session.nearTermForecastWindowLength);
    const preNearTermWindowProb = computeForecast(
      stk.priceHistory,
      Math.max(0, preNearTermEnd - MARKET_CYCLE_LENGTH),
      preNearTermEnd,
    );
    stk.possibleInversionDetected = has4s
      ? detectInversion(stk.prob, stk.lastTickProbability || stk.prob)
      : detectInversion(preNearTermWindowProb, stk.nearTermForecast);
    stk.lastTickProbability = stk.prob;
    if (stk.possibleInversionDetected) inversionsDetected.push(stk);
  }
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
      const newPredictedCycleTick = has4s ? 0 : session.nearTermForecastWindowLength;
      if (session.detectedCycleTick != newPredictedCycleTick)
        sessionLog(
          ns,
          session,
          `Threshold for changing predicted market cycle met (${inversionsDetected.length} >= ${session.inversionAgreementThreshold}). ` +
            `Changing current market tick from ${session.detectedCycleTick} to ${newPredictedCycleTick}.`,
        );
      session.marketCycleDetected = true;
      session.detectedCycleTick = newPredictedCycleTick;
      session.inversionAgreementThreshold = Math.max(MAX_INVERSION_THRESHOLD_CAP, inversionsDetected.length);
    }
  } else {
    session.ticksSinceLastInversion++;
    if (
      session.ticksSinceLastInversion > CYCLE_DECAY_INTERVAL &&
      session.inversionAgreementThreshold > CYCLE_DECAY_FLOOR
    ) {
      session.inversionAgreementThreshold--;
      sessionLog(
        ns,
        session,
        `No inversions detected for ${session.ticksSinceLastInversion} ticks. ` +
          `Decaying inversion agreement threshold to ${session.inversionAgreementThreshold}.`,
      );
    }
  }
  for (const stk of allStocks) {
    if (
      stk.possibleInversionDetected &&
      ((has4s && session.detectedCycleTick == 0) ||
        (!has4s &&
          session.detectedCycleTick >= session.nearTermForecastWindowLength / 2 &&
          session.detectedCycleTick <= session.nearTermForecastWindowLength + INVERSION_LAG_TOLERANCE))
    )
      stk.lastInversion = session.detectedCycleTick;
    else stk.lastInversion++;
    const probWindowLength = Math.min(session.longTermForecastWindowLength, stk.lastInversion);
    stk.longTermForecast = computeForecast(
      stk.priceHistory,
      Math.max(0, stk.priceHistory.length - probWindowLength),
      stk.priceHistory.length,
    );
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
    else sessionLog(ns, session, summary);
  }
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

const summaryFile = '/Temp/stockmarket-summary.txt';
export const updateForecastFile = async (ns: NS, summary: string): Promise<void> => {
  await ns.write(summaryFile, summary, 'w');
};
export const launchSummaryTail = async (ns: NS): Promise<void> => {
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
    `ns.disableLog('sleep'); ns.ui.openTail(); let lastRead = '';
      while (true) {
          let read = ns.read('${summaryFile}');
          if (lastRead != read) ns.print(lastRead = read);
          await ns.sleep(1000);
      }`,
    summaryTailScript,
  );
};

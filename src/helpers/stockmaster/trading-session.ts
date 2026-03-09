import type { NS } from '@ns';
import { LOG_DEDUP_MS } from './constants';

export interface BitNodeMults {
  FourSigmaMarketDataCost: number;
  FourSigmaMarketDataApiCost: number;
}

export interface BatchedStockData {
  ask: number;
  bid: number;
  vol?: number;
  forecast?: number;
  pos?: [number, number, number, number];
}

export class TradingSession {
  disableShorts = false;
  totalProfit = 0;
  lastLog = '';
  lastLogTime = 0;
  ticksSinceLastInversion = 0;
  allStockSymbols: string[] | null = null;
  mock = false;
  noisy = false;
  dictSourceFiles: Record<number, number> = {};
  showMarketSummary = false;
  minTickHistory = 21;
  longTermForecastWindowLength = 76;
  nearTermForecastWindowLength = 10;
  marketCycleDetected = false;
  detectedCycleTick = 0;
  inversionAgreementThreshold = 6;
  lastTick = 0;
  options: Record<string, unknown> = {};

  serialize(): string {
    return JSON.stringify({
      disableShorts: this.disableShorts,
      totalProfit: this.totalProfit,
      ticksSinceLastInversion: this.ticksSinceLastInversion,
      allStockSymbols: this.allStockSymbols,
      mock: this.mock,
      noisy: this.noisy,
      dictSourceFiles: this.dictSourceFiles,
      showMarketSummary: this.showMarketSummary,
      minTickHistory: this.minTickHistory,
      longTermForecastWindowLength: this.longTermForecastWindowLength,
      nearTermForecastWindowLength: this.nearTermForecastWindowLength,
      marketCycleDetected: this.marketCycleDetected,
      detectedCycleTick: this.detectedCycleTick,
      inversionAgreementThreshold: this.inversionAgreementThreshold,
      lastTick: this.lastTick,
      options: this.options,
    });
  }

  static deserialize(json: string): TradingSession {
    const data = JSON.parse(json) as Record<string, unknown>;
    const session = new TradingSession();
    for (const key of Object.keys(data)) {
      if (key in session) {
        (session as unknown as Record<string, unknown>)[key] = data[key];
      }
    }
    return session;
  }
}

export function sessionLog(ns: NS, session: TradingSession, message: string, tprint = false, toastStyle = ''): void {
  const now = Date.now();
  if (message == session.lastLog && now - session.lastLogTime < LOG_DEDUP_MS) return;
  session.lastLog = message;
  session.lastLogTime = now;
  ns.print(message);
  if (tprint) ns.tprint(message);
  if (toastStyle) ns.toast(message, toastStyle as 'info' | 'success' | 'warning' | 'error');
}

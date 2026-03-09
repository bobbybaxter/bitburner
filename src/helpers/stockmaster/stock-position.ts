export class StockPosition {
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

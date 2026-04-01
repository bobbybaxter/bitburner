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
  // When absReturn is 0, log(1+er) is 0 → divide-by-zero NaN; when ask<=bid, log(ask/bid)<=0 — use a large sentinel.
  timeToCoverTheSpread(): number {
    const bid = this.bid_price;
    const ask = this.ask_price;
    if (!(bid > 0) || !(ask > 0) || ask <= bid) return 1e9;
    const ar = this.absReturn();
    const numer = Math.log(ask / bid);
    if (!Number.isFinite(numer) || numer <= 0) return 1e9;
    const denom = Math.log(1 + ar);
    if (!(denom > 0) || !Number.isFinite(denom)) return 1e9;
    const n = numer / denom;
    return Number.isFinite(n) && n >= 0 ? n : 1e9;
  }

  blackoutWindow(): number {
    return Math.ceil(this.timeToCoverTheSpread());
  }
}

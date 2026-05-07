/**
 * Kills stockmaster.js and sells off stock positions as soon as they become profitable.
 * Waits for each position to turn profitable before selling (never sells at a loss).
 *
 * RAM: ~2.5 GB (stock API usage)
 */
import type { NS } from '@ns';

export async function main(ns: NS): Promise<void> {
  if (!ns.stock.hasTixApiAccess()) {
    ns.tprint('ERROR: Cannot run kill-stocks - no TIX API access.');
    return;
  }

  // Kill all stockmaster.js instances
  const procs = ns.ps().filter((p) => p.filename === 'stockmaster.js');
  for (const proc of procs) {
    ns.kill(proc.pid);
    ns.tprint(`Killed stockmaster.js (PID ${proc.pid})`);
  }
  if (procs.length > 0) {
    await ns.sleep(500); // Brief pause after killing
  }

  const symbols = ns.stock.getSymbols();
  let hasPositions = true;

  ns.tprint('Monitoring positions - will sell each as soon as it becomes profitable...');

  while (hasPositions) {
    hasPositions = false;

    for (const sym of symbols) {
      const [sharesLong, , sharesShort] = ns.stock.getPosition(sym);

      if (sharesLong > 0) {
        const gain = ns.stock.getSaleGain(sym, sharesLong, 'Long');
        if (gain > 0) {
          const price = ns.stock.sellStock(sym, sharesLong);
          if (price > 0) {
            ns.tprint(
              `Sold ${sharesLong.toLocaleString()} long ${sym} @ $${ns.format.number(price)} (gain: $${ns.format.number(gain)})`,
            );
          } else {
            hasPositions = true;
          }
        } else {
          hasPositions = true;
        }
      }

      if (sharesShort > 0) {
        const gain = ns.stock.getSaleGain(sym, sharesShort, 'Short');
        if (gain > 0) {
          const price = ns.stock.sellShort(sym, sharesShort);
          if (price > 0) {
            ns.tprint(
              `Covered ${sharesShort.toLocaleString()} short ${sym} @ $${ns.format.number(price)} (gain: $${ns.format.number(gain)})`,
            );
          } else {
            hasPositions = true;
          }
        } else {
          hasPositions = true;
        }
      }
    }

    if (hasPositions) {
      await ns.sleep(6000); // Stock market tick interval
    }
  }

  ns.tprint('All positions liquidated. Done.');
}

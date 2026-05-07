import type { NS } from '@ns';
import { ALL_COMPANIES } from '/constants/all-companies.js';

/** Written by stockmaster on each market tick (see refresh.ts). */
export const STOCK_PROBABILITIES_PATH = '/Temp/stock-probabilities.txt';

/** One tradable symbol → hackable server hostname (from ALL_COMPANIES). */
export const STOCK_SYMBOL_TO_HOSTNAME: Readonly<Record<string, string>> = (() => {
  const m: Record<string, string> = {};
  for (const row of ALL_COMPANIES) {
    const sym = row.stockSymbol?.trim();
    const host = row.hostname?.trim();
    if (sym && host) m[sym] = host;
  }
  return m;
})();

export type StockProbabilitiesEntry = {
  prob: number;
  sharesLong: number;
  sharesShort: number;
};

export type HostnameStockPolicy = { hackStock: boolean; growStock: boolean };

/** Build per-hostname flags: long → grow+stock; short → hack+stock; both or flat → no manipulation. */
export function buildHostnameStockPolicy(
  parsed: Record<string, StockProbabilitiesEntry>,
): Map<string, HostnameStockPolicy> {
  const map = new Map<string, HostnameStockPolicy>();
  for (const [sym, row] of Object.entries(parsed)) {
    const hostname = STOCK_SYMBOL_TO_HOSTNAME[sym];
    if (!hostname) continue;
    const long = (row.sharesLong ?? 0) > 0;
    const short = (row.sharesShort ?? 0) > 0;
    if (long && short) continue;
    if (!long && !short) continue;
    if (long) map.set(hostname, { hackStock: false, growStock: true });
    else map.set(hostname, { hackStock: true, growStock: false });
  }
  return map;
}

function getUnmappedActiveSymbols(parsed: Record<string, StockProbabilitiesEntry>): string[] {
  return Object.entries(parsed)
    .filter(([sym, row]) => {
      if (STOCK_SYMBOL_TO_HOSTNAME[sym]) return false;
      const long = (row.sharesLong ?? 0) > 0;
      const short = (row.sharesShort ?? 0) > 0;
      return long || short;
    })
    .map(([sym]) => sym)
    .sort();
}

function isProbabilitiesFileStale(ns: NS, staleMs: number): boolean {
  if (staleMs <= 0) return false;
  try {
    const nsExt = ns as NS & { getFileMetadata?: (path: string) => { mtime?: number } };
    const meta = nsExt.getFileMetadata?.(STOCK_PROBABILITIES_PATH);
    if (!meta || typeof meta.mtime !== 'number') return false;
    return Date.now() - meta.mtime > staleMs;
  } catch {
    return false;
  }
}

export type LoadStockCoordResult = {
  active: boolean;
  policy: Map<string, HostnameStockPolicy>;
  summary: string;
};

/**
 * Load stock coordination policy from stockmaster's snapshot. When inactive, callers use no stock: flags.
 */
export function loadStockCoordPolicy(ns: NS, options: { disabled: boolean; staleMs: number }): LoadStockCoordResult {
  if (options.disabled) {
    return { active: false, policy: new Map(), summary: 'stock coord off (--no-stock-coord)' };
  }
  if (!ns.fileExists(STOCK_PROBABILITIES_PATH)) {
    return { active: false, policy: new Map(), summary: 'stock coord off (no stock-probabilities.txt)' };
  }
  if (isProbabilitiesFileStale(ns, options.staleMs)) {
    return {
      active: false,
      policy: new Map(),
      summary: `stock coord off (stale file > ${Math.round(options.staleMs / 60000)}m)`,
    };
  }
  let raw: string;
  try {
    raw = ns.read(STOCK_PROBABILITIES_PATH);
  } catch {
    return { active: false, policy: new Map(), summary: 'stock coord off (read failed)' };
  }
  if (!raw || !raw.trim()) {
    return { active: false, policy: new Map(), summary: 'stock coord off (empty file)' };
  }
  let parsed: Record<string, StockProbabilitiesEntry>;
  try {
    parsed = JSON.parse(raw) as Record<string, StockProbabilitiesEntry>;
  } catch {
    return { active: false, policy: new Map(), summary: 'stock coord off (invalid JSON)' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { active: false, policy: new Map(), summary: 'stock coord off (bad JSON shape)' };
  }
  const policy = buildHostnameStockPolicy(parsed);
  const longHosts = [...policy.entries()].filter(([, p]) => p.growStock).length;
  const shortHosts = [...policy.entries()].filter(([, p]) => p.hackStock).length;
  const unmappedActiveSymbols = getUnmappedActiveSymbols(parsed);
  const unmappedSummary =
    unmappedActiveSymbols.length === 0
      ? ''
      : `; ${unmappedActiveSymbols.length} unmapped position symbol(s): ${unmappedActiveSymbols.slice(0, 8).join(', ')}${
          unmappedActiveSymbols.length > 8 ? ', ...' : ''
        }`;
  return {
    active: true,
    policy,
    summary: `stock coord on (${policy.size} host(s): ${longHosts} long, ${shortHosts} short${unmappedSummary})`,
  };
}

export function stockFlagsForHostname(
  policy: ReadonlyMap<string, HostnameStockPolicy> | null,
  hostname: string,
): HostnameStockPolicy {
  if (!policy) return { hackStock: false, growStock: false };
  return policy.get(hostname) ?? { hackStock: false, growStock: false };
}

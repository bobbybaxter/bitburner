import type { NS } from '@ns';
import { DARKNET_AUTH_LOG_PATH } from '/helpers/darknet/diagnostics.js';

type DarknetLogEvent = {
  ts?: number;
  hostname?: string;
  modelId?: string;
  event?: string;
  message?: string;
  passwordHint?: string;
  passwordLength?: number;
  passwordFormat?: string;
  heartbleedLogs?: string[];
  cacheFile?: string;
  cacheOpenSuccess?: boolean;
  karmaLoss?: number;
  notes?: string;
};

const LEGACY_LOG_PATH = '/helpers/darknet/darknet-auth-log.jsonl';

function readAvailableLog(ns: NS): string {
  const current = ns.read(DARKNET_AUTH_LOG_PATH).trim();
  if (current.length > 0) return current;
  return ns.read(LEGACY_LOG_PATH).trim();
}

function countBy(values: string[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ['top', 10],
    ['tail', 2000],
  ]) as { top: number; tail: number };

  const raw = readAvailableLog(ns);
  if (!raw) {
    ns.tprint(`No darknet auth logs found at ${DARKNET_AUTH_LOG_PATH}`);
    return;
  }

  const lines = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(-Math.max(1, Math.floor(flags.tail)));

  const events: DarknetLogEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as DarknetLogEvent);
    } catch {
      // Skip malformed lines so one bad write doesn't kill analysis.
    }
  }

  if (events.length === 0) {
    ns.tprint('No parseable darknet log events were found.');
    return;
  }

  const top = Math.max(1, Math.floor(flags.top));
  const byEvent = countBy(events.map((e) => e.event ?? 'unknown'));
  const unsupportedModels = countBy(
    events.filter((e) => e.event === 'solver-unsupported').map((e) => e.modelId ?? 'unknown-model'),
  );
  const failingHosts = countBy(
    events
      .filter((e) => e.event === 'auth-failure' || e.event === 'connect-session-failure')
      .map((e) => e.hostname ?? 'unknown-host'),
  );
  const cacheMessages = events
    .filter((e) => e.event === 'cache-opened')
    .map((e) => `${e.hostname ?? '?'} :: ${e.cacheFile ?? '?'} :: ${e.message ?? ''}`)
    .slice(-top);
  const recentHeartbleedHints = events
    .filter((e) => e.event === 'heartbleed-sample' || e.event === 'heartbleed-ambient')
    .flatMap((e) => e.heartbleedLogs ?? [])
    .slice(-top);

  ns.tprint(`Darknet log analysis over ${events.length} events`);
  ns.tprint('--- Top event types ---');
  for (const [name, count] of byEvent.slice(0, top)) ns.tprint(`${name}: ${count}`);

  ns.tprint('--- Unsupported models ---');
  if (unsupportedModels.length === 0) ns.tprint('none');
  for (const [name, count] of unsupportedModels.slice(0, top)) ns.tprint(`${name}: ${count}`);

  ns.tprint('--- Hosts with most auth failures ---');
  if (failingHosts.length === 0) ns.tprint('none');
  for (const [name, count] of failingHosts.slice(0, top)) ns.tprint(`${name}: ${count}`);

  ns.tprint('--- Recent cache events ---');
  if (cacheMessages.length === 0) ns.tprint('none');
  for (const line of cacheMessages) ns.tprint(line);

  ns.tprint('--- Recent heartbleed hints ---');
  if (recentHeartbleedHints.length === 0) ns.tprint('none');
  for (const hint of recentHeartbleedHints) ns.tprint(hint);
}

export function autocomplete(): string[] {
  return ['--top', '--tail'];
}

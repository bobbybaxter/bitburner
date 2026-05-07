import type { NS } from '@ns';
import { art } from '/helpers/art.js';
import { getServerNames } from '/helpers/get-server-names.js';

const REFRESH_MS = 2000;

const C_TITLE = 255;
const C_MUTED = 81;
const C_OK = 10;
const C_BAD = 196;
/** Box-drawing (UTF-8) — escaped so the source file stays portable. */
const TREE_MID = '\u2523';

function isNetworkTarget(
  hostname: string,
  purchased: ReadonlySet<string>,
  server: ReturnType<NS['getServer']>,
): boolean {
  if (hostname === 'home') return false;
  if (purchased.has(hostname)) return false;
  if (server.purchasedByPlayer) return false;
  if (hostname.startsWith('hacknet')) return false;
  return true;
}

function padL(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

function padR(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function moneyColumn(ns: NS, avail: number, max: number): string {
  const a = ns.format.number(avail);
  const m = ns.format.number(max);
  if (max > 0) {
    const pct = ((100 * avail) / max).toFixed(1);
    return `${a} / ${m} (${pct}%)`;
  }
  return `${a} / ${m}`;
}

function securityColumn(current: number, minimum: number): string {
  return `${current.toFixed(2)} / ${minimum.toFixed(2)}`;
}

function ynCell(v: boolean, w: number): string {
  const t = v ? 'Y' : 'N';
  return art(padL(t, w), { color: v ? C_OK : C_BAD });
}

/** Sort: backdoor Y first, then hostname A–Z within each backdoor group. */
function compareWorldServerRows(a: { host: string; bd: boolean }, b: { host: string; bd: boolean }): number {
  if (a.bd !== b.bd) return a.bd ? -1 : 1;
  return a.host.localeCompare(b.host);
}

export async function main(ns: NS): Promise<void> {
  const [width, height] = [920, 640];
  ns.ui.openTail();
  ns.disableLog('ALL');
  ns.ui.resizeTail(width, height);
  ns.clearLog();
  ns.ui.setTailTitle('World servers');

  while (true) {
    ns.ui.resizeTail(width, height);
    ns.clearLog();
    const purchased = new Set(ns.cloud.getServerNames());
    const rows = getServerNames(ns)
      .map(({ hostname }) => {
        const server = ns.getServer(hostname);
        if (!isNetworkTarget(hostname, purchased, server)) return null;
        const req = server.requiredHackingSkill ?? 0;
        const admin = server.hasAdminRights;
        const bd = server.backdoorInstalled ?? false;
        const sec = server.hackDifficulty ?? 0;
        const secMin = server.minDifficulty ?? 0;
        const avail = server.moneyAvailable ?? 0;
        const max = server.moneyMax ?? 0;
        return {
          host: hostname,
          reqStr: String(req),
          admin,
          bd,
          secStr: securityColumn(sec, secMin),
          moneyStr: moneyColumn(ns, avail, max),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort(compareWorldServerRows);

    const hHost = 'hostname';
    const hReq = 'hackLvl';
    const hAdmin = 'nuke';
    const hBd = 'backdoor';
    const hSec = 'security';
    const hMoney = 'cash';

    const wHost = Math.max(8, ...rows.map((r) => r.host.length), hHost.length);
    const wReq = Math.max(4, ...rows.map((r) => r.reqStr.length), hReq.length);
    const wAdmin = Math.max(1, hAdmin.length);
    const wBd = Math.max(1, hBd.length);
    const wSec = Math.max(3, ...rows.map((r) => r.secStr.length), hSec.length);
    const wMoney = Math.max(12, ...rows.map((r) => r.moneyStr.length), hMoney.length);

    const headerLine =
      art(padR(hHost, wHost), { color: C_MUTED }) +
      '  ' +
      art(padL(hReq, wReq), { color: C_MUTED }) +
      '  ' +
      art(padL(hAdmin, wAdmin), { color: C_MUTED }) +
      '  ' +
      art(padL(hBd, wBd), { color: C_MUTED }) +
      '  ' +
      art(padL(hSec, wSec), { color: C_MUTED }) +
      '  ' +
      art(padR(hMoney, wMoney), { color: C_MUTED });

    const rule =
      '─'.repeat(wHost) +
      '  ' +
      '─'.repeat(wReq) +
      '  ' +
      '─'.repeat(wAdmin) +
      '  ' +
      '─'.repeat(wBd) +
      '  ' +
      '─'.repeat(wSec) +
      '  ' +
      '─'.repeat(wMoney);

    const divider = '═'.repeat(Math.min(100, Math.max(40, rule.length)));

    ns.print(headerLine);
    ns.print(rule);

    for (const r of rows) {
      ns.print(
        art(padR(r.host, wHost), { color: C_TITLE }) +
          '  ' +
          art(padL(r.reqStr, wReq), { color: C_TITLE }) +
          '  ' +
          ynCell(r.admin, wAdmin) +
          '  ' +
          ynCell(r.bd, wBd) +
          '  ' +
          art(padL(r.secStr, wSec), { color: C_TITLE }) +
          '  ' +
          art(padR(r.moneyStr, wMoney), { color: C_TITLE }),
      );
    }

    ns.print(divider);
    ns.print(` ${art(TREE_MID, { color: C_TITLE })} ${art(`Refresh every ${REFRESH_MS / 1000}s`, { color: C_MUTED })}`);

    await ns.sleep(REFRESH_MS);
  }
}

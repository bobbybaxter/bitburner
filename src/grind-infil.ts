/**
 * Repeatedly infiltrates a company until faction rep or total money reaches a target.
 * Requires the infiltrate automation timer to be active (`infiltrate.js` stores its interval on
 * `window.tmrAutoInf` and then exits — it does not stay in `ns.ps()`, so we detect that flag, not the process list).
 *
 * Usage:
 *   run grind-infil.js <locationName> <factionName|money> <valueNeeded>
 *
 * Examples:
 *   run grind-infil.js MegaCorp Illuminati 250000
 *   run grind-infil.js MegaCorp Illuminati 250k
 *   run grind-infil.js ECorp money 500m
 *   run grind-infil.js ECorp "The Covenant" 1.25m
 *
 * Faction arg must match `ns.getFactionRep` / the game dropdown (e.g. "The Covenant"). The success
 * screen uses a **Trade for … reputation** button; the faction name is usually only in the dropdown.
 */
import type { NS } from '@ns';
import { parseShortNumber } from '/helpers/stockmaster/parse-short-number.js';

type SingularityTravelCity = Parameters<NS['singularity']['travelToCity']>[0];
type SingularityGoLocation = Parameters<NS['singularity']['goToLocation']>[0];

const doc = eval('document') as Document;

/** Same signal as `run infiltrate.js --status`: the script exits after installing this interval. */
function isInfiltrateAutomationActive(): boolean {
  const wnd = eval('window') as Window & { tmrAutoInf?: ReturnType<typeof setInterval> };
  return wnd.tmrAutoInf !== undefined;
}

const INFILTRATE_WAIT_MS = 12 * 60 * 1000;
const POLL_MS = 300;

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Uses {@link parseShortNumber} (same as stock UI helpers) plus comma stripping. */
function parseValueNeeded(raw: string | number | boolean): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : Number.NaN;
  }
  const s = String(raw).trim().replace(/,/g, '');
  return parseShortNumber(s);
}

function clickReactButton(btn: HTMLElement): boolean {
  const reactPropsKey = Object.keys(btn).find((k) => k.startsWith('__reactProps'));
  if (!reactPropsKey) return false;
  const props = (btn as unknown as Record<string, Record<string, (e: unknown) => void>>)[reactPropsKey];
  if (typeof props?.onClick !== 'function') return false;
  props.onClick({
    isTrusted: true,
    preventDefault: () => {},
    stopPropagation: () => {},
    currentTarget: btn,
    target: btn,
    type: 'click',
    nativeEvent: { isTrusted: true, stopImmediatePropagation: () => {} },
  });
  return true;
}

function findInfiltrateButton(): HTMLElement | undefined {
  return [...doc.querySelectorAll('button')].find((b: Element) => (b.textContent ?? '').includes('Infiltrate')) as
    | HTMLElement
    | undefined;
}

function isInfiltrationSuccessScreen(): boolean {
  const blob = doc.body?.innerText ?? '';
  return /\binfiltration\s+successful/i.test(blob);
}

/**
 * Trade-for-rep reward: `button.MuiButton-root` with text like "Trade for 1.746k reputation".
 * The amount lives in a nested `span` (hashed class, often `…-reputation`); `&nbsp;` in markup does
 * not affect `textContent`. Faction choice is only in the adjacent MUI Select — do not match on faction
 * name here.
 */
function tradeForReputationLabelMatches(b: Element): boolean {
  const t = normalize(b.textContent ?? '');
  return t.includes('trade') && t.includes('for') && t.includes('reputation');
}

function findTradeForReputationButton(): HTMLElement | undefined {
  const mui = [...doc.querySelectorAll('button.MuiButton-root')] as HTMLElement[];
  const withRepSpan = mui.find(
    (b) => b.querySelector('span[class*="reputation"]') !== null && tradeForReputationLabelMatches(b),
  );
  if (withRepSpan) return withRepSpan;
  const anyMui = mui.find(tradeForReputationLabelMatches);
  if (anyMui) return anyMui;
  return [...doc.querySelectorAll('button')].find(tradeForReputationLabelMatches) as HTMLElement | undefined;
}

/**
 * Cash reward: `button.MuiButton-root` with text like "Sell for $3.175m". The amount is in a nested
 * `span` (hashed class, often `…-money`). Same MUI stack as the rep trade button; not "Trade for … reputation".
 */
function tradeForMoneyLabelMatches(b: Element): boolean {
  const t = normalize(b.textContent ?? '');
  return t.includes('sell') && t.includes('for');
}

function findTradeForMoneyButton(): HTMLElement | undefined {
  const mui = [...doc.querySelectorAll('button.MuiButton-root')] as HTMLElement[];
  const withMoneySpan = mui.find(
    (b) => b.querySelector('span[class*="money"]') !== null && tradeForMoneyLabelMatches(b),
  );
  if (withMoneySpan) return withMoneySpan;
  const anyMui = mui.find(tradeForMoneyLabelMatches);
  if (anyMui) return anyMui;
  return [...doc.querySelectorAll('button')].find(tradeForMoneyLabelMatches) as HTMLElement | undefined;
}

function findRewardButton(mode: 'money' | 'faction', faction: string): HTMLElement | undefined {
  const buttons = [...doc.querySelectorAll('button')];
  if (mode === 'money') {
    return findTradeForMoneyButton();
  }
  const byTradeRep = findTradeForReputationButton();
  if (byTradeRep) return byTradeRep;
  const needle = normalize(faction);
  if (!needle) return undefined;
  return buttons.find((b: Element) => normalize(b.textContent ?? '').includes(needle)) as HTMLElement | undefined;
}

/**
 * Infiltration reward uses MUI Select: a single div with role=combobox, class MuiSelect-select, direct
 * text for the chosen faction (e.g. "Netburners"), and aria-controls="mui-…" pointing at the listbox
 * when the menu is open. Prefer this over other [role=combobox] widgets (Autocomplete, etc.).
 */
function queryMuiSelectTriggers(root: ParentNode): HTMLElement[] {
  const primary = [...root.querySelectorAll('[role="combobox"].MuiSelect-select')] as HTMLElement[];
  if (primary.length > 0) return primary;
  const byTab = [...root.querySelectorAll('.MuiSelect-select[tabindex]')] as HTMLElement[];
  if (byTab.length > 0) return byTab;
  return [...root.querySelectorAll('[role="combobox"]')] as HTMLElement[];
}

/**
 * Prefer the select on the same row/card as the Trade-for-rep button so we never drive an unrelated
 * combobox (city, filters, etc.).
 */
function findInfiltrationFactionCombobox(): HTMLElement | undefined {
  const tradeBtn = findTradeForReputationButton();
  if (tradeBtn) {
    let node: HTMLElement | null = tradeBtn;
    for (let depth = 0; depth < 12 && node; depth++) {
      const combos = queryMuiSelectTriggers(node);
      if (combos.length > 0) {
        return combos[0];
      }
      node = node.parentElement;
    }
  }
  const all = queryMuiSelectTriggers(doc);
  const nearTrade = all.find((el) => {
    const block = el.closest('.MuiBox-root, .MuiGrid-container, .MuiDialogContent-root') ?? el.parentElement;
    const t = block?.textContent ?? '';
    return /\btrade\b/i.test(t) && /\breputation\b/i.test(t);
  });
  return nearTrade ?? all[0];
}

function collapseWs(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** True if the visible label already matches the desired faction (handles minor formatting differences). */
function factionLabelMatches(visible: string, want: string): boolean {
  const v = normalize(collapseWs(visible));
  const w = normalize(collapseWs(want));
  if (!v || !w) return false;
  if (v === w) return true;
  if (v.includes(w) || w.includes(v)) return true;
  return false;
}

/**
 * MUI portals the menu to `document.body`. The Select trigger keeps `aria-controls="mui-…"`; when the
 * menu opens, that id is the listbox (or a wrapper containing it). Options must not be queried globally.
 */
function getOpenListboxForTrigger(trigger: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = trigger;
  for (let i = 0; i < 6 && el; i++) {
    const id = el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns');
    if (id) {
      const byId = doc.getElementById(id);
      if (byId) {
        if (byId.getAttribute('role') === 'listbox') return byId as HTMLElement;
        const inner = byId.querySelector('[role="listbox"]');
        if (inner) return inner as HTMLElement;
        return byId as HTMLElement;
      }
    }
    el = el.parentElement;
  }
  const visible = doc.querySelector('[role="listbox"]:not([aria-hidden="true"])');
  return visible as HTMLElement | null;
}

/** If the faction dropdown is visible and does not show `faction`, open it and pick the option. */
async function ensureInfiltrationFactionDropdown(ns: NS, faction: string): Promise<void> {
  const trigger = findInfiltrationFactionCombobox();
  if (!trigger) return;

  const currentLabel = collapseWs(trigger.textContent ?? '');
  if (factionLabelMatches(currentLabel, faction)) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (!clickReactButton(trigger)) return;

    let listbox: HTMLElement | null = null;
    for (let i = 0; i < 40; i++) {
      await ns.sleep(80);
      listbox = getOpenListboxForTrigger(trigger);
      if (listbox) {
        const opts = listbox.querySelectorAll('[role="option"], .MuiMenuItem-root');
        if (opts.length > 0) break;
      }
    }
    if (!listbox) continue;

    const options = [...listbox.querySelectorAll('[role="option"], .MuiMenuItem-root')] as HTMLElement[];
    const wantCollapsed = normalize(collapseWs(faction));
    const opt =
      options.find((o) => normalize(collapseWs(o.textContent ?? '')) === wantCollapsed) ??
      options.find((o) => {
        const t = normalize(collapseWs(o.textContent ?? ''));
        return t.includes(wantCollapsed) || wantCollapsed.includes(t);
      });
    if (opt) {
      clickReactButton(opt);
      await ns.sleep(150);
      if (factionLabelMatches(collapseWs(trigger.textContent ?? ''), faction)) return;
    }
  }
}

function resolveInfiltratableLocation(ns: NS, raw: string): { location: string; city: string } | null {
  const want = normalize(raw);
  const possible = ns.infiltration.getPossibleLocations();
  for (const loc of possible) {
    if (normalize(loc.name) === want || normalize(loc.name).includes(want) || want.includes(normalize(loc.name))) {
      return { location: loc.name, city: loc.city };
    }
  }
  return null;
}

function goalMet(ns: NS, mode: 'money' | 'faction', faction: string, target: number): boolean {
  if (mode === 'money') {
    return ns.getPlayer().money >= target;
  }
  return ns.singularity.getFactionRep(faction) >= target;
}

function ensureInfiltrateHelperActive(ns: NS): void {
  if (!isInfiltrateAutomationActive()) {
    ns.tprint(
      'WARN: Infiltrate automation is inactive (no window.tmrAutoInf). Minigames will not auto-complete. Run: run infiltrate.js',
    );
  }
}

export async function main(ns: NS): Promise<void> {
  const rawLocation = ns.args[0];
  const rawReward = ns.args[1];
  const rawTarget = ns.args[2];

  if (typeof rawLocation !== 'string' || typeof rawReward !== 'string' || rawTarget === undefined) {
    ns.tprint('Usage: run grind-infil.js <locationName> <factionName|money> <valueNeeded>');
    return;
  }

  const valueNeeded = parseValueNeeded(rawTarget);
  if (!Number.isFinite(valueNeeded) || valueNeeded < 0) {
    ns.tprint(`Invalid valueNeeded: ${String(rawTarget)} (use a number or e.g. 250k, 1.5m)`);
    return;
  }

  const resolved = resolveInfiltratableLocation(ns, rawLocation);
  if (!resolved) {
    ns.tprint(
      `Could not resolve infiltratable location from "${rawLocation}". Try e.g. MegaCorp, ECorp, KuaiGong International.`,
    );
    return;
  }

  const mode = normalize(rawReward) === 'money' ? 'money' : 'faction';
  const factionName = mode === 'faction' ? rawReward : '';

  if (mode === 'faction' && !factionName) {
    ns.tprint('Faction name cannot be empty when not using money.');
    return;
  }

  ns.tprint(
    `Grinding infiltration at ${resolved.location} (${resolved.city}) — ${mode === 'money' ? 'money' : `rep for ${factionName}`} ≥ ${ns.formatNumber(valueNeeded)}`,
  );

  ensureInfiltrateHelperActive(ns);

  let iteration = 0;
  while (!goalMet(ns, mode, factionName, valueNeeded)) {
    iteration += 1;
    const beforeMoney = ns.getPlayer().money;
    const beforeRep = mode === 'faction' ? ns.singularity.getFactionRep(factionName) : 0;

    if (!ns.singularity.travelToCity(resolved.city as SingularityTravelCity)) {
      ns.tprint(`travelToCity(${resolved.city}) failed — check access and funds.`);
      await ns.sleep(5000);
      continue;
    }
    if (!ns.singularity.goToLocation(resolved.location as SingularityGoLocation)) {
      ns.tprint(`goToLocation(${resolved.location}) failed.`);
      await ns.sleep(5000);
      continue;
    }

    await ns.sleep(400);

    let infiltrateBtn: HTMLElement | undefined;
    for (let i = 0; i < 40 && !infiltrateBtn; i++) {
      await ns.sleep(200);
      infiltrateBtn = findInfiltrateButton();
    }

    if (!infiltrateBtn) {
      ns.tprint('Infiltrate button not found — are you at the company location?');
      await ns.sleep(3000);
      continue;
    }

    if (!clickReactButton(infiltrateBtn)) {
      ns.tprint('Could not click Infiltrate (no React handler).');
      await ns.sleep(3000);
      continue;
    }

    const deadline = Date.now() + INFILTRATE_WAIT_MS;
    let rewardBtn: HTMLElement | undefined;
    while (Date.now() < deadline && !rewardBtn) {
      await ns.sleep(POLL_MS);
      if (mode === 'faction' && isInfiltrationSuccessScreen()) {
        await ensureInfiltrationFactionDropdown(ns, factionName);
      }
      rewardBtn = findRewardButton(mode, factionName);
      if (goalMet(ns, mode, factionName, valueNeeded)) break;
    }

    if (goalMet(ns, mode, factionName, valueNeeded)) {
      ns.tprint('Target reached during infiltration wait.');
      break;
    }

    if (!rewardBtn) {
      ns.tprint('Timed out waiting for infiltration reward buttons (Sell / faction). Retrying…');
      await ns.sleep(2000);
      continue;
    }

    if (!clickReactButton(rewardBtn)) {
      ns.tprint('Could not click reward button.');
      await ns.sleep(2000);
      continue;
    }

    await ns.sleep(1500);

    const afterMoney = ns.getPlayer().money;
    const afterRep = mode === 'faction' ? ns.singularity.getFactionRep(factionName) : 0;

    if (mode === 'money') {
      ns.print(
        `Run ${iteration}: money ${ns.formatNumber(beforeMoney)} → ${ns.formatNumber(afterMoney)} (target ${ns.formatNumber(valueNeeded)})`,
      );
    } else {
      ns.print(
        `Run ${iteration}: ${factionName} rep ${ns.formatNumber(beforeRep)} → ${ns.formatNumber(afterRep)} (target ${ns.formatNumber(valueNeeded)})`,
      );
    }

    if (mode === 'money' && afterMoney <= beforeMoney) {
      ns.tprint('WARN: Money did not increase after Sell — wrong button or failed run?');
    }
    if (mode === 'faction' && afterRep <= beforeRep) {
      ns.tprint('WARN: Faction rep did not increase — check faction name matches a reward option.');
    }
  }

  if (mode === 'money') {
    ns.tprint(`Done. Money is ${ns.formatNumber(ns.getPlayer().money)} (needed ≥ ${ns.formatNumber(valueNeeded)}).`);
  } else {
    ns.tprint(
      `Done. ${factionName} rep is ${ns.formatNumber(ns.singularity.getFactionRep(factionName))} (needed ≥ ${ns.formatNumber(valueNeeded)}).`,
    );
  }
}

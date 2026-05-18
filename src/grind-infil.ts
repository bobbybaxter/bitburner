/**
 * Repeatedly infiltrates a company until faction rep or total money reaches a target.
 * Requires the infiltrate automation timer to be active (`infiltrate.js` stores its interval on
 * `window.tmrAutoInf` and then exits — it does not stay in `ns.ps()`, so we detect that flag, not the process list).
 *
 * Usage:
 *   run grind-infil.js
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
 *
 * Pass `--debug` for detailed logs: faction dropdown, travel/location each loop (JSON-quoted strings help spot mismatches).
 *
 * If infiltration ends with a dialog containing "Infiltration was cancelled because you were hospitalized",
 * the script dismisses it and starts a new run (travel + Infiltrate again). It does **not** auto-retry on
 * manual cancel or generic timeout — those stop the script so you can kill it or fix the UI.
 *
 * With **no positional arguments** (optional `--debug` only), the script prompts for a joined faction that still
 * sells augmentations you do not have (`ns.getResetInfo().ownedAugs`), then a reputation target from the remaining aug
 * rep requirements. The infiltratable **company location** is chosen automatically from `getPossibleLocations()` /
 * `getInfiltration()` (see {@link pickAutoInfiltrationLocation}; v3+ UI bar ≈ `difficulty × (100/3.5)` vs API).
 */

import type { FactionName, NS } from '@ns';
import { INFILTRATION_API_DIFFICULTY_AT_UI_100, toInfiltrationUiDifficulty } from '/helpers/infiltration-difficulty.js';
import { parseShortNumber } from '/helpers/stockmaster/parse-short-number.js';
import { formatNumberShort } from './helpers/gangs/helpers';

type SingularityTravelCity = Parameters<NS['singularity']['travelToCity']>[0];
type SingularityGoLocation = Parameters<NS['singularity']['goToLocation']>[0];
type InfiltrationVenue = { location: string; city: string };
type GrindTarget =
  | { mode: 'money'; valueNeeded: number }
  | { mode: 'faction'; factionName: FactionName; valueNeeded: number };
type GrindTargetParseResult = { ok: true; target: GrindTarget } | { ok: false; error: string };
type GrindInfiltrationLoopInput = {
  venue: InfiltrationVenue;
  target: GrindTarget;
  debugFaction: boolean;
};

const doc = eval('document') as Document;

/** Same signal as `run infiltrate.js --status`: the script exits after installing this interval. */
function isInfiltrateAutomationActive(): boolean {
  const wnd = eval('window') as Window & { tmrAutoInf?: ReturnType<typeof setInterval> };
  return wnd.tmrAutoInf !== undefined;
}

const INFILTRATE_WAIT_MS = 12 * 60 * 1000;
const POLL_MS = 300;
/** Below this balance, interactive mode avoids picking a venue in another city (typical one-way travel cost). */
const MIN_MONEY_ASSUME_TRAVEL_OK = 200_000;

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

function parseGrindTarget(ns: NS, rawReward: string, rawTarget: string | number | boolean): GrindTargetParseResult {
  const valueNeeded = typeof rawTarget === 'number' ? rawTarget : parseValueNeeded(rawTarget);
  if (!Number.isFinite(valueNeeded) || valueNeeded < 0) {
    return {
      ok: false,
      error: `Invalid valueNeeded: ${String(rawTarget)} (use a number or e.g. 250k, 1.5m)`,
    };
  }

  if (normalize(rawReward) === 'money') {
    return { ok: true, target: { mode: 'money', valueNeeded } };
  }

  const factionName = rawReward.trim() as FactionName;
  const knownFactions = Object.values(ns.enums.FactionName) as FactionName[];
  if (!knownFactions.includes(factionName)) {
    return { ok: false, error: `Invalid faction name: ${rawReward}` };
  }

  return { ok: true, target: { mode: 'faction', factionName, valueNeeded } };
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

const HOSPITAL_CANCEL_INFIL_MSG = 'Infiltration was cancelled because you were hospitalized';
const HOSPITAL_AUTOMATION_MSG = 'Do not try to automate infiltration';
const HOSPITAL_DIALOG_HINTS = [HOSPITAL_CANCEL_INFIL_MSG, HOSPITAL_AUTOMATION_MSG] as const;

type InfilHospitalDialogReason = 'hospitalized' | 'anti-automation';

function getInfilHospitalDialogReason(): InfilHospitalDialogReason | null {
  for (const sel of ['[role="dialog"]', '.MuiModal-root']) {
    for (const el of doc.querySelectorAll(sel)) {
      const node = el as HTMLElement;
      const text = node.textContent ?? '';
      if (HOSPITAL_DIALOG_HINTS.every((hint) => !text.includes(hint))) continue;
      if (text.includes(HOSPITAL_AUTOMATION_MSG)) return 'anti-automation';
      if (text.includes(HOSPITAL_CANCEL_INFIL_MSG)) return 'hospitalized';
    }
  }
  return null;
}

function hospitalCancelInfilDialogRoot(): HTMLElement | null {
  for (const sel of ['[role="dialog"]', '.MuiModal-root']) {
    for (const el of doc.querySelectorAll(sel)) {
      const node = el as HTMLElement;
      if (HOSPITAL_DIALOG_HINTS.some((hint) => (node.textContent ?? '').includes(hint))) return node;
    }
  }
  return null;
}

async function dismissHospitalCancelInfilDialog(ns: NS): Promise<void> {
  const root = hospitalCancelInfilDialogRoot();
  if (!root) return;
  const buttons = [...root.querySelectorAll('button')] as HTMLElement[];
  const ok =
    buttons.find((b) => {
      const t = normalize(b.textContent ?? '');
      return t === 'ok' || t === 'close' || t.includes('ok');
    }) ?? buttons[0];
  if (!ok) return;
  if (!clickReactButton(ok)) ok.click();
  await ns.sleep(400);
}

function getReactInternalProps(el: HTMLElement): Record<string, unknown> | undefined {
  const reactPropsKey = Object.keys(el).find((k) => k.startsWith('__reactProps'));
  if (!reactPropsKey) return undefined;
  return (el as unknown as Record<string, Record<string, unknown>>)[reactPropsKey] as Record<string, unknown>;
}

/**
 * MUI Select triggers are `div[role=combobox]`; they usually wire `onMouseDown` / `onPointerDown`, not
 * `onClick`, so {@link clickReactButton} alone fails. Walks a few ancestors for handlers, then native `click()`.
 */
function clickReactOrDom(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el, depth = 0; node && depth < 5; node = node.parentElement, depth++) {
    const props = getReactInternalProps(node);
    if (!props) continue;
    for (const name of ['onMouseDown', 'onPointerDown', 'onClick'] as const) {
      const fn = props[name];
      if (typeof fn === 'function') {
        (fn as (e: unknown) => void).call(node, {
          isTrusted: true,
          preventDefault: () => {},
          stopPropagation: () => {},
          currentTarget: node,
          target: el,
          type: name.slice(2).toLowerCase(),
          button: 0,
          buttons: 1,
          nativeEvent: { isTrusted: true, stopImmediatePropagation: () => {} },
        });
        return true;
      }
    }
  }
  if (clickReactButton(el)) return true;
  el.click();
  return true;
}

/**
 * MUI `MenuItem` / `[role="option"]`: never use {@link clickReactOrDom} — walking ancestors hits the
 * Menu/Popover `onMouseDown` first, returns early, and the option is never selected. Native `click()`
 * dispatches to the correct node's listeners.
 */
function clickMuiMenuItem(el: HTMLElement): void {
  el.click();
}

function findInfiltrateButton(): HTMLElement | undefined {
  return [...doc.querySelectorAll('button')].find((b: Element) => (b.textContent ?? '').includes('Infiltrate')) as
    | HTMLElement
    | undefined;
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

function findRewardButton(target: GrindTarget): HTMLElement | undefined {
  const buttons = [...doc.querySelectorAll('button')];
  if (target.mode === 'money') {
    return findTradeForMoneyButton();
  }
  const byTradeRep = findTradeForReputationButton();
  if (byTradeRep) return byTradeRep;
  const needle = normalize(target.factionName);
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
  return nearTrade;
}

/** Combobox trigger labels on the page (for --debug). */
function debugMuiSelectTriggerSummaries(limit = 8): string[] {
  const triggers = queryMuiSelectTriggers(doc);
  return triggers.slice(0, limit).map((el, i) => {
    const label = collapseWs(el.textContent ?? '').slice(0, 80);
    return `#${i} "${label}"`;
  });
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
async function ensureInfiltrationFactionDropdown(
  ns: NS,
  faction: string,
  log: ((msg: string) => void) | undefined,
): Promise<void> {
  const tradeBtn = findTradeForReputationButton();
  const trigger = findInfiltrationFactionCombobox();

  if (!trigger) {
    log?.(
      `faction dropdown: no combobox (trade-for-rep button: ${tradeBtn ? 'yes' : 'no'}; ` +
        `page comboboxes: ${debugMuiSelectTriggerSummaries(12).join(' | ') || '(none)'})`,
    );
    return;
  }

  const currentLabel = collapseWs(trigger.textContent ?? '');
  if (factionLabelMatches(currentLabel, faction)) {
    log?.(`faction dropdown: already "${currentLabel}" (want "${faction}")`);
    return;
  }

  log?.(`faction dropdown: want "${faction}", trigger shows "${currentLabel}" (opening menu…)`);

  for (let guess = 0; guess < 3; guess++) {
    clickReactOrDom(trigger);

    let listbox: HTMLElement | null = null;
    for (let i = 0; i < 40; i++) {
      await ns.sleep(80);
      listbox = getOpenListboxForTrigger(trigger);
      if (listbox) {
        const opts = listbox.querySelectorAll('[role="option"], .MuiMenuItem-root');
        if (opts.length > 0) break;
      }
    }
    if (!listbox) {
      log?.(`faction dropdown: attempt ${guess + 1}/3 — no listbox/options after opening (aria-controls / portal?)`);
      continue;
    }

    const options = [...listbox.querySelectorAll('[role="option"], .MuiMenuItem-root')] as HTMLElement[];
    const optionLabels = options.map((o) => collapseWs(o.textContent ?? '').slice(0, 64));
    log?.(
      `faction dropdown: attempt ${guess + 1}/3 — ${options.length} option(s): ${optionLabels.join(' · ') || '(empty)'}`,
    );

    const wantCollapsed = normalize(collapseWs(faction));
    const opt =
      options.find((o) => normalize(collapseWs(o.textContent ?? '')) === wantCollapsed) ??
      options.find((o) => {
        const t = normalize(collapseWs(o.textContent ?? ''));
        return t.includes(wantCollapsed) || wantCollapsed.includes(t);
      });
    if (opt) {
      const picked = collapseWs(opt.textContent ?? '');
      clickMuiMenuItem(opt);
      log?.(`faction dropdown: picked option "${picked}" (native click on MenuItem)`);
      await ns.sleep(280);
      const after = collapseWs(findInfiltrationFactionCombobox()?.textContent ?? trigger.textContent ?? '');
      if (factionLabelMatches(after, faction)) {
        log?.(`faction dropdown: trigger now "${after}" — ok`);
        return;
      }
      log?.(`faction dropdown: after pick, trigger still "${after}" (wanted "${faction}")`);
    } else {
      log?.(`faction dropdown: no option matching "${faction}" (normalized want: "${wantCollapsed}")`);
    }
  }

  log?.(
    `faction dropdown: gave up after 3 attempts; trigger still "${collapseWs(findInfiltrationFactionCombobox()?.textContent ?? trigger.textContent ?? '')}"`,
  );
}

function resolveInfiltratableLocation(ns: NS, raw: string): InfiltrationVenue | null {
  const want = normalize(raw);
  const possible = ns.infiltration.getPossibleLocations();
  for (const loc of possible) {
    if (normalize(loc.name) === want || normalize(loc.name).includes(want) || want.includes(normalize(loc.name))) {
      return { location: loc.name, city: loc.city };
    }
  }
  return null;
}

function goalMet(ns: NS, target: GrindTarget): boolean {
  if (target.mode === 'money') {
    return ns.getPlayer().money >= target.valueNeeded;
  }
  return ns.singularity.getFactionRep(target.factionName) >= target.valueNeeded;
}

function ensureInfiltrateHelperActive(ns: NS): void {
  if (!isInfiltrateAutomationActive()) {
    ns.run('infiltrate.js', 1);
  }
}

type UnownedFactionAug = { name: string; repReq: number; price: number };

/** Joined factions with at least one aug not in `getResetInfo().ownedAugs`; each faction's list sorted by price desc. */
function buildFactionUnownedAugLists(ns: NS): Map<FactionName, UnownedFactionAug[]> {
  const owned = ns.getResetInfo().ownedAugs;
  const out = new Map<FactionName, UnownedFactionAug[]>();
  for (const faction of ns.getPlayer().factions) {
    const rows: UnownedFactionAug[] = [];
    for (const augName of ns.singularity.getAugmentationsFromFaction(faction)) {
      if (owned.has(augName)) continue;
      rows.push({
        name: augName,
        repReq: ns.singularity.getAugmentationRepReq(augName),
        price: ns.singularity.getAugmentationPrice(augName),
      });
    }
    rows.sort((a, b) => b.price - a.price);
    if (rows.length > 0) out.set(faction, rows);
  }
  return out;
}

/** Auto-pick only venues at or below ~100 on the v3 UI-equivalent bar; see `helpers/infiltration-difficulty.ts`. */
const MAX_AUTO_INFILTRATION_API_DIFFICULTY = INFILTRATION_API_DIFFICULTY_AT_UI_100;

type InfilVenueCandidate = { name: string; city: string; tradeRep: number; difficulty: number };

function bestVenueForRepNeed(
  candidates: InfilVenueCandidate[],
  repStillNeeded: number,
): InfilVenueCandidate | undefined {
  if (candidates.length === 0) return undefined;
  const canFinish = candidates.filter((c) => c.tradeRep >= repStillNeeded);
  if (canFinish.length > 0) {
    return canFinish.reduce((a, b) => (a.tradeRep <= b.tradeRep ? a : b));
  }
  return candidates.reduce((a, b) => (a.tradeRep >= b.tradeRep ? a : b));
}

/**
 * Picks an infiltratable location name: among venues whose trade rep reaches the goal in one run, the smallest such
 * rep (least overshoot); otherwise the highest trade rep. If that best is abroad and money &lt; {@link MIN_MONEY_ASSUME_TRAVEL_OK},
 * uses the same rule restricted to the player's current city (or null if there are none).
 */
function pickAutoInfiltrationLocation(ns: NS, faction: FactionName, targetRep: number): string | null {
  const locs = ns.infiltration.getPossibleLocations();
  if (locs.length === 0) return null;

  const currentRep = ns.singularity.getFactionRep(faction);
  const repStillNeeded = Math.max(0, targetRep - currentRep);

  const allCandidates: InfilVenueCandidate[] = locs.map((loc) => {
    const infil = ns.infiltration.getInfiltration(loc.name);
    return {
      name: loc.name,
      city: loc.city,
      tradeRep: infil.reward.tradeRep,
      difficulty: infil.difficulty,
    };
  });
  const candidates = allCandidates.filter((c) => c.difficulty <= MAX_AUTO_INFILTRATION_API_DIFFICULTY);
  if (candidates.length === 0) {
    const easiest = allCandidates.reduce((a, b) => (a.difficulty <= b.difficulty ? a : b));
    const easiestUi = toInfiltrationUiDifficulty(easiest.difficulty);
    ns.tprint(
      `Cannot auto-pick an infiltratable venue: all available options are above API difficulty ` +
        `${MAX_AUTO_INFILTRATION_API_DIFFICULTY.toFixed(2)} (~${toInfiltrationUiDifficulty(MAX_AUTO_INFILTRATION_API_DIFFICULTY).toFixed(0)} on the infiltration UI bar). Easiest currently is ` +
        `"${easiest.name}" in ${easiest.city} at API ${easiest.difficulty.toFixed(3)} (~${easiestUi.toFixed(1)} UI).`,
    );
    return null;
  }

  const bestGlobal = bestVenueForRepNeed(candidates, repStillNeeded);
  if (!bestGlobal) return null;

  const player = ns.getPlayer();
  if (bestGlobal.city !== player.city && player.money < MIN_MONEY_ASSUME_TRAVEL_OK) {
    const inCity = candidates.filter((c) => c.city === player.city);
    const bestLocal = bestVenueForRepNeed(inCity, repStillNeeded);
    if (!bestLocal) {
      ns.tprint(
        `Cannot auto-pick a venue: best option "${bestGlobal.name}" is in ${bestGlobal.city}, but you have ` +
          `${ns.format.number(player.money)} (< ${ns.format.number(MIN_MONEY_ASSUME_TRAVEL_OK)} for travel) and no ` +
          `infiltratable locations in ${player.city}.`,
      );
      return null;
    }
    return bestLocal.name;
  }

  return bestGlobal.name;
}

async function promptInteractiveGrindParams(ns: NS): Promise<{
  rawLocation: string;
  target: GrindTarget;
} | null> {
  const byFaction = buildFactionUnownedAugLists(ns);
  if (byFaction.size === 0) {
    ns.tprint('No joined factions with augmentations left to buy (per ResetInfo.ownedAugs).');
    return null;
  }

  const factionChoices = [...byFaction.keys()].sort((a, b) => a.localeCompare(b));
  const factionPick = (await ns.prompt('Pick a faction', {
    type: 'select',
    choices: factionChoices,
  })) as FactionName;
  if (!factionPick) {
    ns.tprint('Cancelled faction selection.');
    return null;
  }

  const rows = byFaction.get(factionPick);
  if (!rows?.length) {
    ns.tprint(`Internal error: no rows for faction "${factionPick}".`);
    return null;
  }

  const repTiers = [...new Set(rows.map((r) => r.repReq))].sort((a, b) => b - a);
  const repLabels = repTiers.map((r) => `${formatNumberShort(r)} (${ns.format.number(r)})`);
  const repPick = await ns.prompt(`Select a reputation target`, {
    type: 'select',
    choices: repLabels,
  });
  if (typeof repPick !== 'string' || repPick === '') {
    ns.tprint('Cancelled reputation target.');
    return null;
  }
  const repIdx = repLabels.indexOf(repPick);
  const repTarget = repIdx >= 0 ? repTiers[repIdx]! : parseValueNeeded(repPick);
  if (!Number.isFinite(repTarget) || repTarget < 0) {
    ns.tprint(`Invalid reputation target: ${repPick}`);
    return null;
  }

  const autoLoc = pickAutoInfiltrationLocation(ns, factionPick, repTarget);
  if (!autoLoc) return null;

  return { rawLocation: autoLoc, target: { mode: 'faction', factionName: factionPick, valueNeeded: repTarget } };
}

async function grindInfiltrationLoop(ns: NS, input: GrindInfiltrationLoopInput): Promise<void> {
  const { venue, target, debugFaction } = input;
  const dbg = debugFaction ? (msg: string) => ns.tprint(`[grind-infil] ${msg}`) : undefined;
  if (debugFaction) {
    dbg?.('diagnostics enabled (--debug): faction dropdown + travel/location');
  }

  ensureInfiltrateHelperActive(ns);

  let iteration = 0;
  while (!goalMet(ns, target)) {
    iteration += 1;
    const beforeMoney = ns.getPlayer().money;
    const beforeRep = target.mode === 'faction' ? ns.singularity.getFactionRep(target.factionName) : 0;

    const playerBefore = ns.getPlayer();
    dbg?.(
      `iter ${iteration}: player city=${JSON.stringify(playerBefore.city)} location=${JSON.stringify(playerBefore.location)} | want city=${JSON.stringify(venue.city)} location=${JSON.stringify(venue.location)}`,
    );

    if (playerBefore.city !== venue.city) {
      dbg?.(`iter ${iteration}: city mismatch → travelToCity(${venue.city})`);
      if (!ns.singularity.travelToCity(venue.city as SingularityTravelCity)) {
        ns.tprint(`travelToCity(${venue.city}) failed — check access and funds.`);
        await ns.sleep(5000);
        continue;
      }
      dbg?.(`iter ${iteration}: travelToCity OK`);
    } else {
      dbg?.(`iter ${iteration}: already in target city, skip travel`);
    }

    const playerAfterTravel = ns.getPlayer();
    dbg?.(
      `iter ${iteration}: after travel step city=${JSON.stringify(playerAfterTravel.city)} location=${JSON.stringify(playerAfterTravel.location)}`,
    );

    // Always goToLocation: getPlayer().location can already match while the UI is elsewhere (City tab,
    // work, etc.), so the Infiltrate button never mounts until we navigate to the venue again.
    dbg?.(
      `iter ${iteration}: goToLocation(${venue.location})` +
        (playerAfterTravel.location === venue.location ? ' (API already at target — sync UI)' : ''),
    );
    if (!ns.singularity.goToLocation(venue.location as SingularityGoLocation)) {
      ns.tprint(`goToLocation(${venue.location}) failed.`);
      dbg?.(
        `iter ${iteration}: goToLocation failed; player still at city=${JSON.stringify(ns.getPlayer().city)} location=${JSON.stringify(ns.getPlayer().location)}`,
      );
      await ns.sleep(5000);
      continue;
    }
    dbg?.(`iter ${iteration}: goToLocation OK`);

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
    let hospitalDialogReason: InfilHospitalDialogReason | null = null;
    let debugLoggedTradeUi = false;
    while (Date.now() < deadline && !rewardBtn) {
      await ns.sleep(POLL_MS);
      hospitalDialogReason = getInfilHospitalDialogReason();
      if (hospitalDialogReason) {
        ns.tprint('Hospital cancellation dialog detected; dismissing and restarting infiltration.');
        await dismissHospitalCancelInfilDialog(ns);
        break;
      }
      // Switch faction as soon as the rep trade row is visible — do not gate on body text like
      // "infiltration successful"; that can appear later or differ, so the dropdown never updated.
      if (target.mode === 'faction' && findTradeForReputationButton()) {
        if (debugFaction && !debugLoggedTradeUi) {
          debugLoggedTradeUi = true;
          dbg?.('wait loop: Trade-for-rep button visible; running ensureInfiltrationFactionDropdown');
        }
        await ensureInfiltrationFactionDropdown(ns, target.factionName, dbg);
      }
      rewardBtn = findRewardButton(target);
      if (goalMet(ns, target)) break;
    }

    if (goalMet(ns, target)) {
      ns.tprint('Target reached during infiltration wait.');
      break;
    }

    if (hospitalDialogReason === 'anti-automation') {
      ns.tprint(
        'Detected anti-automation hospitalization from infiltration minigame input checks. ' +
          'Stopping grind-infil: manual infiltration is required on this game version.',
      );
      return;
    }

    if (hospitalDialogReason === 'hospitalized') {
      await ns.sleep(500);
      continue;
    }

    if (!rewardBtn) {
      ns.tprint(
        'WARN: Timed out waiting for infiltration reward (no hospital cancellation dialog). Stopping grind-infil — cancel or stall without hospital will not auto-retry.',
      );
      return;
    }

    if (!clickReactButton(rewardBtn)) {
      ns.tprint('Could not click reward button.');
      await ns.sleep(2000);
      continue;
    }

    await ns.sleep(1500);

    const afterMoney = ns.getPlayer().money;
    const afterRep = target.mode === 'faction' ? ns.singularity.getFactionRep(target.factionName) : 0;

    if (target.mode === 'money') {
      ns.tprint(
        `Run ${iteration}: money ${ns.format.number(beforeMoney)} → ${ns.format.number(afterMoney)} (target ${ns.format.number(target.valueNeeded)})`,
      );
    } else {
      ns.tprint(
        `Run ${iteration}: ${target.factionName} rep ${ns.format.number(beforeRep)} → ${ns.format.number(afterRep)} (target ${ns.format.number(target.valueNeeded)})`,
      );
    }

    if (target.mode === 'money' && afterMoney <= beforeMoney) {
      ns.tprint('WARN: Money did not increase after Sell — wrong button or failed run?');
    }
    if (target.mode === 'faction' && afterRep <= beforeRep) {
      ns.tprint('WARN: Faction rep did not increase — check faction name matches a reward option.');
    }
  }

  if (target.mode === 'money') {
    ns.tprint(
      `Done. Money is ${ns.format.number(ns.getPlayer().money)} (needed ≥ ${ns.format.number(target.valueNeeded)}).`,
    );
  } else {
    ns.tprint(
      `Done. ${target.factionName} rep is ${ns.format.number(ns.singularity.getFactionRep(target.factionName))} (needed ≥ ${ns.format.number(target.valueNeeded)}).`,
    );
  }
}

export async function main(ns: NS): Promise<void> {
  const debugFaction = ns.args.includes('--debug');
  const posArgs = ns.args.filter((a) => a !== '--debug');

  let rawLocation: string;
  let target: GrindTarget;

  if (posArgs.length >= 3) {
    const a0 = posArgs[0];
    const a1 = posArgs[1];
    const a2 = posArgs[2];
    if (typeof a0 !== 'string' || typeof a1 !== 'string' || a2 === undefined) {
      ns.tprint('Usage: run grind-infil.js <locationName> <factionName|money> <valueNeeded>');
      return;
    }
    rawLocation = a0;
    const parsedTarget = parseGrindTarget(ns, a1, a2);
    if (!parsedTarget.ok) {
      ns.tprint(parsedTarget.error);
      return;
    }
    target = parsedTarget.target;
  } else {
    const picked = await promptInteractiveGrindParams(ns);
    if (!picked) return;
    rawLocation = picked.rawLocation;
    target = picked.target;
  }

  const resolved = resolveInfiltratableLocation(ns, rawLocation);
  if (!resolved) {
    ns.tprint(
      `Could not resolve infiltratable location from "${rawLocation}". Try e.g. MegaCorp, ECorp, KuaiGong International.`,
    );
    return;
  }

  ns.tprint(
    `Grinding infiltration at ${resolved.location} (${resolved.city}) — ${target.mode === 'money' ? 'money' : `rep for ${target.factionName}`} ≥ ${ns.format.number(target.valueNeeded)}`,
  );

  await grindInfiltrationLoop(ns, { venue: resolved, target, debugFaction });
}

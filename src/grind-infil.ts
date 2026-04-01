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
 *
 * Pass `--debug` for detailed logs: faction dropdown, travel/location each loop (JSON-quoted strings help spot mismatches).
 *
 * If infiltration ends with a dialog containing "Infiltration was cancelled because you were hospitalized",
 * the script dismisses it and starts a new run (travel + Infiltrate again). It does **not** auto-retry on
 * manual cancel or generic timeout — those stop the script so you can kill it or fix the UI.
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

const HOSPITAL_CANCEL_INFIL_MSG = 'Infiltration was cancelled because you were hospitalized';

function hospitalCancelInfilDialogRoot(): HTMLElement | null {
  for (const sel of ['[role="dialog"]', '.MuiModal-root']) {
    for (const el of doc.querySelectorAll(sel)) {
      const node = el as HTMLElement;
      if ((node.textContent ?? '').includes(HOSPITAL_CANCEL_INFIL_MSG)) return node;
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

  for (let attempt = 0; attempt < 3; attempt++) {
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
      log?.(`faction dropdown: attempt ${attempt + 1}/3 — no listbox/options after opening (aria-controls / portal?)`);
      continue;
    }

    const options = [...listbox.querySelectorAll('[role="option"], .MuiMenuItem-root')] as HTMLElement[];
    const optionLabels = options.map((o) => collapseWs(o.textContent ?? '').slice(0, 64));
    log?.(
      `faction dropdown: attempt ${attempt + 1}/3 — ${options.length} option(s): ${optionLabels.join(' · ') || '(empty)'}`,
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

  const debugFaction = ns.args.includes('--debug');
  const dbg = debugFaction ? (msg: string) => ns.tprint(`[grind-infil] ${msg}`) : undefined;
  if (debugFaction) {
    dbg?.('diagnostics enabled (--debug): faction dropdown + travel/location');
  }

  ensureInfiltrateHelperActive(ns);

  let iteration = 0;
  while (!goalMet(ns, mode, factionName, valueNeeded)) {
    iteration += 1;
    const beforeMoney = ns.getPlayer().money;
    const beforeRep = mode === 'faction' ? ns.singularity.getFactionRep(factionName) : 0;

    const playerBefore = ns.getPlayer();
    dbg?.(
      `iter ${iteration}: player city=${JSON.stringify(playerBefore.city)} location=${JSON.stringify(playerBefore.location)} | want city=${JSON.stringify(resolved.city)} location=${JSON.stringify(resolved.location)}`,
    );

    if (playerBefore.city !== resolved.city) {
      dbg?.(`iter ${iteration}: city mismatch → travelToCity(${resolved.city})`);
      if (!ns.singularity.travelToCity(resolved.city as SingularityTravelCity)) {
        ns.tprint(`travelToCity(${resolved.city}) failed — check access and funds.`);
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
      `iter ${iteration}: goToLocation(${resolved.location})` +
        (playerAfterTravel.location === resolved.location ? ' (API already at target — sync UI)' : ''),
    );
    if (!ns.singularity.goToLocation(resolved.location as SingularityGoLocation)) {
      ns.tprint(`goToLocation(${resolved.location}) failed.`);
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
    let sawHospitalCancelDialog = false;
    let debugLoggedTradeUi = false;
    while (Date.now() < deadline && !rewardBtn) {
      await ns.sleep(POLL_MS);
      if (hospitalCancelInfilDialogRoot()) {
        sawHospitalCancelDialog = true;
        ns.tprint('Hospital cancellation dialog detected; dismissing and restarting infiltration.');
        await dismissHospitalCancelInfilDialog(ns);
        break;
      }
      // Switch faction as soon as the rep trade row is visible — do not gate on body text like
      // "infiltration successful"; that can appear later or differ, so the dropdown never updated.
      if (mode === 'faction' && findTradeForReputationButton()) {
        if (debugFaction && !debugLoggedTradeUi) {
          debugLoggedTradeUi = true;
          dbg?.('wait loop: Trade-for-rep button visible; running ensureInfiltrationFactionDropdown');
        }
        await ensureInfiltrationFactionDropdown(ns, factionName, dbg);
      }
      rewardBtn = findRewardButton(mode, factionName);
      if (goalMet(ns, mode, factionName, valueNeeded)) break;
    }

    if (goalMet(ns, mode, factionName, valueNeeded)) {
      ns.tprint('Target reached during infiltration wait.');
      break;
    }

    if (sawHospitalCancelDialog) {
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
    const afterRep = mode === 'faction' ? ns.singularity.getFactionRep(factionName) : 0;

    if (mode === 'money') {
      ns.tprint(
        `Run ${iteration}: money ${ns.formatNumber(beforeMoney)} → ${ns.formatNumber(afterMoney)} (target ${ns.formatNumber(valueNeeded)})`,
      );
    } else {
      ns.tprint(
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

import { NS, ProgramName } from '@ns';
import { Do } from '/helpers/do.js';
import { INFILTRATION_API_DIFFICULTY_AT_UI_100, toInfiltrationUiDifficulty } from '/helpers/infiltration-difficulty.js';

/**
 * Starts all scripts on the home server
 * Requires 25.25 GB RAM
 */

type InfiltrationLocation = { name: string; city: string };
type InfiltrationReward = { tradeRep?: number; sellCash?: number; cash?: number };
type InfiltrationData = { reward?: InfiltrationReward; difficulty?: number };

/** Sector-12 startup infiltrations: cap at ~100 on the v3 UI-equivalent bar. */
const MAX_STARTUP_INFILTRATION_API_DIFFICULTY = INFILTRATION_API_DIFFICULTY_AT_UI_100;

/** TOR router list price (grind money target until Tor is owned; `purchaseTor` has no cost API). */
const TOR_ROUTER_PRICE = 200_000;

/** Startup toolkit after Tor: port crackers + Formulas.exe (purchase order). */
const STARTUP_TOOLKIT_PROGRAMS: readonly ProgramName[] = [
  'BruteSSH.exe',
  'FTPCrack.exe',
  'relaySMTP.exe',
  'HTTPWorm.exe',
  'SQLInject.exe',
  'Formulas.exe',
];

async function hasCompleteStartupHackToolkit(ns: NS): Promise<boolean> {
  if (!(await Do(ns, 'ns.hasTorRouter'))) return false;
  return STARTUP_TOOLKIT_PROGRAMS.every((name) => ns.fileExists(name, 'home'));
}

async function costOfNextStartupToolkitProgramPurchase(ns: NS): Promise<number | null> {
  for (const programName of STARTUP_TOOLKIT_PROGRAMS) {
    if (ns.fileExists(programName, 'home')) continue;
    const cost = (await Do(ns, 'ns.singularity.getDarkwebProgramCost', programName)) as number;
    if (cost > 0) return cost;
  }
  return null;
}

async function tryBuyNextStartupToolkitPurchase(ns: NS): Promise<void> {
  if (!(await Do(ns, 'ns.hasTorRouter'))) {
    ns.tprint('Purchasing Tor router (startup toolkit)...');
    await Do(ns, 'ns.singularity.purchaseTor');
    return;
  }
  for (const programName of STARTUP_TOOLKIT_PROGRAMS) {
    if (ns.fileExists(programName, 'home')) continue;
    const cost = (await Do(ns, 'ns.singularity.getDarkwebProgramCost', programName)) as number;
    if (cost <= 0) continue;
    ns.tprint(`Purchasing program: ${programName}`);
    await Do(ns, 'ns.singularity.purchaseProgram', programName).then(
      () => ns.tprint(`SUCCESS: Purchased program: ${programName}`),
      (e) => ns.tprint(`WARN: Failed to purchase program: ${programName}: ${e}`),
    );
    return;
  }
}

function pickBestSector12InfiltrationLocation(ns: NS): InfiltrationLocation | null {
  const sector12Locations = ns.infiltration.getPossibleLocations().filter((location) => location.city === 'Sector-12');
  if (sector12Locations.length === 0) return null;

  const scored = sector12Locations.map((location) => {
    const infiltration = ns.infiltration.getInfiltration(location.name) as InfiltrationData;
    const moneyReward = infiltration.reward?.sellCash ?? infiltration.reward?.cash ?? 0;
    const repReward = infiltration.reward?.tradeRep ?? 0;
    const difficulty = infiltration.difficulty ?? Number.POSITIVE_INFINITY;
    return { location, moneyReward, repReward, difficulty };
  });
  const viable = scored.filter((entry) => entry.difficulty <= MAX_STARTUP_INFILTRATION_API_DIFFICULTY);
  if (viable.length === 0) {
    const easiest = scored.reduce((a, b) => (a.difficulty <= b.difficulty ? a : b));
    const easiestUi = toInfiltrationUiDifficulty(easiest.difficulty);
    ns.tprint(
      `WARN: No Sector-12 infiltrations are viable (API difficulty <= ${MAX_STARTUP_INFILTRATION_API_DIFFICULTY.toFixed(2)}, ~${toInfiltrationUiDifficulty(MAX_STARTUP_INFILTRATION_API_DIFFICULTY).toFixed(0)} UI). ` +
        `Easiest is ${easiest.location.name} at API ${easiest.difficulty.toFixed(3)} (~${easiestUi.toFixed(1)} UI).`,
    );
    return null;
  }

  viable.sort((a, b) => {
    if (b.moneyReward !== a.moneyReward) return b.moneyReward - a.moneyReward;
    if (b.repReward !== a.repReward) return b.repReward - a.repReward;
    return a.location.name.localeCompare(b.location.name);
  });

  return viable[0]?.location ?? null;
}

export async function main(ns: NS): Promise<void> {
  // disableNoisyLogs(ns);
  const hasCorporationDivision = async (divisionName: string): Promise<boolean> => {
    try {
      await Do(ns, 'ns.corporation.getDivision', divisionName);
      return true;
    } catch {
      return false;
    }
  };

  await ns.run('infiltrate.js', 1);
  await ns.run('open-all-ports.js', 1);

  const resetInfo = ns.getResetInfo();
  const ownedSFString = [...resetInfo.ownedSF.entries()]
    .sort(([a], [b]) => a - b)
    .map(([k, v]) => `SF${k}: ${v}`)
    .join(', ');
  ns.tprint(`current node: ${resetInfo.currentNode} | ${ownedSFString}`);

  const hasSF2 = resetInfo.currentNode === 2 || resetInfo.ownedSF.has(2);
  if (hasSF2 && !ns.isRunning('gangs.js')) {
    await ns.run('gangs.js', 1);
  }

  const hasSF3 = resetInfo.currentNode === 3 || resetInfo.ownedSF.has(3);
  if (hasSF3 && !ns.isRunning('workaround.js')) {
    await ns.run('workaround.js', 1, '--hud');
  }

  if ((resetInfo.currentNode === 3 || resetInfo.ownedSF.has(3)) && !ns.isRunning('corporation.js')) {
    const canCreateCorporationSelfFund = (await Do(ns, 'ns.corporation.canCreateCorporation', true)) as boolean;
    const canCreateCorporationBorrowFunds = (await Do(ns, 'ns.corporation.canCreateCorporation', false)) as boolean;
    const hasCorporation = (await Do(ns, 'ns.corporation.hasCorporation')) as boolean;

    if (hasCorporation) {
      if (!(await hasCorporationDivision('Chemical'))) {
        if (ns.run('corporation.js', 1, '--round2', '--benchmark') === 0) {
          ns.toast('Failed to run corporation.js --round2 --benchmark');
        }
      } else if (!(await hasCorporationDivision('T0'))) {
        if (ns.run('corporation.js', 1, '--round3', '--benchmark') === 0) {
          ns.toast('Failed to run corporation.js --round3 --benchmark');
        }
      } else {
        if (ns.run('corporation.js', 1, '--improveAllDivisions', '--benchmark') === 0) {
          ns.toast('Failed to run corporation.js --improveAllDivisions --benchmark');
        }
      }
    } else if (canCreateCorporationSelfFund) {
      await ns.run('corporation.js', 1, '--round1', '--auto', '--selfFund');
      ns.run('daemon.js', 1, '--maintainCorporation');
    } else if (canCreateCorporationBorrowFunds) {
      await ns.run('corporation.js', 1, '--round1', '--auto');
      ns.run('daemon.js', 1, '--maintainCorporation');
    }
    ns.run('daemon.js', 1, '--maintainCorporation');
  }

  const hasSF4 = resetInfo.ownedSF.has(4) || resetInfo.currentNode === 4;

  if (hasSF4) {
    let torMoneyTarget = TOR_ROUTER_PRICE;

    while (!(await hasCompleteStartupHackToolkit(ns))) {
      const hasTor = (await Do(ns, 'ns.hasTorRouter')) as boolean;
      const nextCost = hasTor ? await costOfNextStartupToolkitProgramPurchase(ns) : torMoneyTarget;

      if (nextCost === null) {
        ns.tprint('WARN: Startup toolkit incomplete but could not resolve next program price; continuing startup.');
        break;
      }

      const playerMoney = ns.getPlayer().money;
      if (playerMoney < nextCost) {
        const bestSector12Location = pickBestSector12InfiltrationLocation(ns);
        if (!bestSector12Location) {
          ns.tprint('WARN: No infiltratable locations found in Sector-12 for toolkit grind; retry in 60s.');
          await ns.sleep(60_000);
          continue;
        }

        const grindPid = await ns.run('grind-infil.js', 1, bestSector12Location.name, 'money', String(nextCost));
        if (grindPid === 0) {
          ns.tprint('WARN: grind-infil.js did not start (RAM or missing script). Sleeping 60s before retry.');
          await ns.sleep(60_000);
          continue;
        }
        ns.tprint(
          `Startup toolkit grind at ${bestSector12Location.name} (${bestSector12Location.city}) until ${ns.format.number(nextCost)}.`,
        );
        while (ns.isRunning('grind-infil.js')) {
          await ns.sleep(500);
        }
      }

      await tryBuyNextStartupToolkitPurchase(ns);

      if (!(await Do(ns, 'ns.hasTorRouter'))) {
        torMoneyTarget = Math.max(torMoneyTarget, Math.ceil(ns.getPlayer().money + 50_000));
      }

      if (!(await hasCompleteStartupHackToolkit(ns))) {
        await ns.sleep(10_000);
      }
    }
  }

  if (!ns.isRunning('stockmaster.js')) await ns.run('stockmaster.js', 1);
  if (!ns.isRunning('hacknet-opt.js')) await ns.run('hacknet-opt.js', 1, 1, 100);
  if (!ns.isRunning('home-opt.js')) await ns.run('home-opt.js', 1);
  if (ns.cloud.getServerLimit() > 0 && !ns.isRunning('cloud-opt.js')) {
    await ns.run('cloud-opt.js', 1);
  }
  if (!ns.isRunning('backdoor.js')) await ns.run('backdoor.js', 1);
  if (!ns.isRunning('augs.js')) await ns.run('augs.js', 1);
  if (!ns.isRunning('hack3.js')) await ns.run('hack3.js', 1);

  if (!hasSF4) return;

  if (
    resetInfo.currentNode === 6 ||
    resetInfo.currentNode === 7 ||
    resetInfo.ownedSF.has(6) ||
    resetInfo.ownedSF.has(7)
  ) {
    if (!ns.isRunning('bladeburner.js')) await ns.run('bladeburner.js', 1);
  }

  const hasSF9 = resetInfo.currentNode === 9 || resetInfo.ownedSF.has(9);
  if (hasSF9) {
    if (!ns.isRunning('setup-hashnet.js')) {
      await ns.run('setup-hashnet.js', 1);
    }
    if (!ns.isRunning('hash-servers.js')) {
      await ns.run('hash-servers.js', 1);
      await ns.scriptKill('hacknet-opt.js', 'home');
    }
  }
}

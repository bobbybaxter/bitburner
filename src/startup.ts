import { NS } from '@ns';
import { Do } from '/helpers/do.js';
import { DivisionName, hasDivision } from './helpers/corpo/corporation-utils';

/**
 * Starts all scripts on the home server
 * Requires 25.25 GB RAM
 */
export async function main(ns: NS): Promise<void> {
  // disableNoisyLogs(ns);

  await ns.run('infiltrate.js', 1);
  await ns.run('open-all-ports.js', 1);
  if (!ns.isRunning('stockmaster.js')) await ns.run('stockmaster.js', 1);
  if (!ns.isRunning('hacknet-opt.js')) await ns.run('hacknet-opt.js', 1, 1, 100);
  if (!ns.isRunning('home-opt.js')) await ns.run('home-opt.js', 1);
  if (ns.getPurchasedServerLimit() > 0 && !ns.isRunning('pserv-opt.js')) {
    await ns.run('pserv-opt.js', 1);
  }

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
    const canCreateCorporationSelfFund = ns.corporation.canCreateCorporation(true);
    const canCreateCorporationBorrowFunds = ns.corporation.canCreateCorporation(false);

    if (ns.corporation.hasCorporation()) {
      if (!hasDivision(ns, DivisionName.CHEMICAL)) {
        if (ns.exec('corporation.js', 'home', 1, '--round2', '--benchmark') === 0) {
          ns.toast('Failed to run corporation.js --round2 --benchmark');
        }
      } else if (!hasDivision(ns, DivisionName.TOBACCO_0)) {
        if (ns.exec('corporation.js', 'home', 1, '--round3', '--benchmark') === 0) {
          ns.toast('Failed to run corporation.js --round3 --benchmark');
        }
      } else {
        if (ns.exec('corporation.js', 'home', 1, '--improveAllDivisions', '--benchmark') === 0) {
          ns.toast('Failed to run corporation.js --improveAllDivisions --benchmark');
        }
      }
    } else if (canCreateCorporationSelfFund) {
      await ns.run('corporation.js', 1, '--round1', '--auto', '--selfFund');
    } else if (canCreateCorporationBorrowFunds) {
      await ns.run('corporation.js', 1, '--round1', '--auto');
    }
  }

  const hasSF4 = resetInfo.ownedSF.has(4) || resetInfo.currentNode === 4;
  if (!hasSF4) return;

  const infilGrindMoneyTarget = 1e9;
  if (ns.getPlayer().money < infilGrindMoneyTarget) {
    const grindPid = await ns.run('grind-infil.js', 1, 'MegaCorp', 'money', String(infilGrindMoneyTarget));
    if (grindPid === 0) {
      ns.tprint('WARN: grind-infil.js did not start (RAM or missing script). Skipping MegaCorp infiltration grind.');
    } else {
      while (ns.isRunning('grind-infil.js')) {
        await ns.sleep(500);
      }
    }
  }

  if (!ns.isRunning('backdoor.js')) await ns.run('backdoor.js', 1);
  // if (!ns.isRunning('augs.js')) await ns.run('augs.js', 1);
  if (!ns.isRunning('hack3.js')) await ns.run('hack3.js', 1);
  if (
    resetInfo.currentNode === 6 ||
    resetInfo.currentNode === 7 ||
    resetInfo.ownedSF.has(6) ||
    resetInfo.ownedSF.has(7)
  ) {
    if (!ns.isRunning('bladeburner.js')) await ns.run('bladeburner.js', 1);
  }

  while (!ns.hasTorRouter()) {
    await Do(ns, 'ns.singularity.purchaseTor');
    if (ns.hasTorRouter()) break;
    await ns.sleep(60_000);
  }

  while (true) {
    const programs: string[] = (await Do(ns, 'ns.singularity.getDarkwebPrograms')) as string[];
    const programsToPurchase: string[] = [];
    for (const program of programs) {
      const cost = (await Do(ns, 'ns.singularity.getDarkwebProgramCost', program)) as number;
      if (cost > 0) {
        programsToPurchase.push(program);
      }
    }

    if (programsToPurchase.length === 0) return;

    await Promise.all(
      programsToPurchase.map(async (program: string) => {
        ns.tprint(`Purchasing program: ${program}`);
        await Do(ns, 'ns.singularity.purchaseProgram', program).then(
          () => ns.tprint(`SUCCESS: Purchased program: ${program}`),
          (e) => ns.tprint(`WARN: Failed to purchase program: ${program}: ${e}`),
        );
      }),
    );

    await ns.sleep(60_000);
  }
}

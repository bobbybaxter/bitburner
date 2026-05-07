import { NS } from '@ns';
import { Do } from '/helpers/do.js';

/**
 * Starts all scripts on the home server
 * Requires 25.25 GB RAM
 */

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
  if (!ns.isRunning('stockmaster.js')) await ns.run('stockmaster.js', 1);
  if (!ns.isRunning('hacknet-opt.js')) await ns.run('hacknet-opt.js', 1, 1, 100);
  if (!ns.isRunning('home-opt.js')) await ns.run('home-opt.js', 1);
  if (ns.cloud.getServerLimit() > 0 && !ns.isRunning('cloud-opt.js')) {
    await ns.run('cloud-opt.js', 1);
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
  if (!ns.isRunning('augs.js')) await ns.run('augs.js', 1);
  if (!ns.isRunning('hack3.js')) await ns.run('hack3.js', 1);
  if (
    resetInfo.currentNode === 6 ||
    resetInfo.currentNode === 7 ||
    resetInfo.ownedSF.has(6) ||
    resetInfo.ownedSF.has(7)
  ) {
    if (!ns.isRunning('bladeburner.js')) await ns.run('bladeburner.js', 1);
  }

  while (!(await Do(ns, 'ns.hasTorRouter'))) {
    await Do(ns, 'ns.singularity.purchaseTor');
    if (await Do(ns, 'ns.hasTorRouter')) break;
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

    if (programsToPurchase.length === 0) break;

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

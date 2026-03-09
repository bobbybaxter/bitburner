import { NS } from '@ns';
import { Do } from '/helpers/do.js';

/**
 * Starts all scripts on the home server
 * Requires 25.25 GB RAM
 */
export async function main(ns: NS): Promise<void> {
  //
  // disableNoisyLogs(ns);

  await ns.run('open-all-ports.js', 1); // 4.2GB RAM
  await ns.run('infiltrate.js', 1); // 1.5GB RAM
  await ns.run('stockmaster.js', 1); // 3.6GB RAM
  await ns.run('hacknet-opt.js', 1, 1, 100); // 7.45GB RAM
  await ns.run('pserv-opt.js', 1); // 8.5GB RAM

  const hasSF4 = ns.getResetInfo().ownedSF.has(4);
  if (!hasSF4) return;

  await ns.run('backdoor.js', 1);

  while (!ns.hasTorRouter()) {
    ns.singularity.purchaseTor();
    if (ns.hasTorRouter()) break;
    await ns.sleep(60_000);
  }

  const programs: string[] = (await Do(ns, 'ns.singularity.getDarkwebPrograms')) as string[];
  programs.forEach(async (program: string) => {
    await Do(ns, 'ns.singularity.purchaseProgram', program);
  });
}

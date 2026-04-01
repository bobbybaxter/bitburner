import { NS } from '@ns';
import { CHAOS_LIMIT } from './constants';
import { addLog, printLog } from './logger';

export async function chaosEater(ns: NS) {
  const city = ns.bladeburner.getCity(),
    act = 'Diplomacy';
  if (ns.bladeburner.getCityChaos(city) > CHAOS_LIMIT) {
    while (ns.bladeburner.getCityChaos(city) > 0) {
      printLog(ns);
      await ns.sleep(500); //precautionary sleep incase it gets caught in returning below
      if (ns.bladeburner.getCurrentAction()?.name == act) continue;
      if (!ns.singularity.getOwnedAugmentations().includes("The Blade's Simulacrum")) ns.singularity.stopAction();
      ns.bladeburner.startAction('General', act);
      addLog(ns, 'action', `ACT: ${act}`);
    }
    addLog(ns, 'action', 'INFO: Chaos reduced to 0.');
  }
}

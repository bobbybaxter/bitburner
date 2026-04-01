import { BladeburnerGeneralActionName, NS } from '@ns';
import { addLog } from './logger';

export async function healthCheck(ns: NS) {
  if (ns.getPlayer().hp.current / ns.getPlayer().hp.max < 0.5) {
    while (ns.getPlayer().hp.current / ns.getPlayer().hp.max < 1) {
      await ns.sleep(20);
      if (ns.getPlayer().hp.current / ns.getPlayer().hp.max === 1) continue;
      if (ns.bladeburner.getCurrentAction()?.name === 'Hyperbolic Regeneration Chamber') continue;
      if (!ns.singularity.getOwnedAugmentations().includes("The Blade's Simulacrum")) ns.singularity.stopAction();
      if (ns.bladeburner.startAction('General', 'Hyperbolic Regeneration Chamber'))
        addLog(ns, 'action', 'ACT: Hyperbolic Regeneration Chamber');
    }
  }
  if (ns.bladeburner.getStamina()[0] / ns.bladeburner.getStamina()[1] < 0.7) {
    const initStam = ns.bladeburner.getStamina()[0],
      startTime = new Date().getTime(),
      possibleActions: BladeburnerGeneralActionName[] = [
        'Training' as BladeburnerGeneralActionName,
        'Hyperbolic Regeneration Chamber' as BladeburnerGeneralActionName,
      ];
    let action = possibleActions[0];
    while (ns.bladeburner.getStamina()[0] / ns.bladeburner.getStamina()[1] < 0.99) {
      if (startTime + 60000 * 2 <= Date.now() && initStam >= ns.bladeburner.getStamina()[0])
        action = possibleActions[1];
      await ns.sleep(20);
      if (ns.bladeburner.getCurrentAction()?.name === action) continue;
      if (!ns.singularity.getOwnedAugmentations().includes("The Blade's Simulacrum")) ns.singularity.stopAction();
      if (ns.bladeburner.startAction('General', action)) addLog(ns, 'action', `ACT: ${action}`);
    }
  }
}

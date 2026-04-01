import { NS } from '@ns';
import { ASS_TARGET } from './constants';
import { addLog, printLog } from './logger';

export async function violence(ns: NS, GLOBAL_CHAR_LIMIT: number) {
  const assLevel = () => ns.bladeburner.getActionCountRemaining('Operations', 'Assassination');
  const act = 'Incite Violence';

  if (ns.getPlayer().skills.charisma < GLOBAL_CHAR_LIMIT) return; //we only wanna act after if we have the charisma to correct it. Testing 1e6.
  if (assLevel() <= 5) {
    while (assLevel() < ASS_TARGET) {
      printLog(ns);
      await ns.sleep(500); //precautionary sleep when it gets caught in 'continue' below
      if (ns.bladeburner.getCurrentAction()?.name == act) continue;
      if (!ns.singularity.getOwnedAugmentations().includes("The Blade's Simulacrum")) ns.singularity.stopAction();
      ns.bladeburner.startAction('General', act);
      addLog(ns, 'action', `ACT: ${act}`);
    }
    addLog(ns, 'action', `Violence protocol - Complete`);
  }
}

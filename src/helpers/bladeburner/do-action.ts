import {
  BladeburnerActionName,
  BladeburnerActionType,
  BladeburnerContractName,
  BladeburnerGeneralActionName,
  BladeburnerOperationName,
  NS,
} from '@ns';
import { addLog } from './logger';

export async function doAction(ns: NS, aSuccessChance: number = 1) {
  for (const act of ns.bladeburner.getBlackOpNames()) {
    if (ns.bladeburner.getActionCountRemaining('Black Operations', act) < 1) continue;
    if (
      ns.bladeburner.getActionEstimatedSuccessChance('Black Operations', act)[0] < aSuccessChance ||
      ns.bladeburner.getBlackOpRank(act) > ns.bladeburner.getRank()
    )
      break;
    if (ns.bladeburner.getCurrentAction()?.name == act) return;
    if (!ns.singularity.getOwnedAugmentations().includes("The Blade's Simulacrum")) ns.singularity.stopAction();
    if (ns.bladeburner.startAction('Black Operations', act)) {
      addLog(ns, 'action', `ACT: ${act}`);
      await ns.sleep(
        ns.bladeburner.getActionTime('Black Operations', act) / (ns.bladeburner.getBonusTime() > 1000 ? 5 : 1),
      );
      return;
    }
  }

  const acts: {
    name: BladeburnerActionName;
    type: BladeburnerActionType;
    requireSuccessChance?: boolean;
    requireCountRemaining?: boolean;
  }[] = [
    { name: 'Assassination' as BladeburnerOperationName, type: 'Operation' as BladeburnerActionType },
    { name: 'Undercover Operation' as BladeburnerOperationName, type: 'Operation' as BladeburnerActionType },
    { name: 'Investigation' as BladeburnerOperationName, type: 'Operation' as BladeburnerActionType },
    { name: 'Retirement' as BladeburnerContractName, type: 'Contract' as BladeburnerActionType },
    { name: 'Bounty Hunter' as BladeburnerContractName, type: 'Contract' as BladeburnerActionType },
    { name: 'Tracking' as BladeburnerContractName, type: 'Contract' as BladeburnerActionType },
    {
      name: 'Field Analysis' as BladeburnerGeneralActionName,
      type: 'General' as BladeburnerActionType,
      requireSuccessChance: false,
      requireCountRemaining: false,
    },
  ];

  for (const act of acts) {
    const needSuccess = act.requireSuccessChance !== false;
    const needCount = act.requireCountRemaining !== false;
    if (needSuccess && ns.bladeburner.getActionEstimatedSuccessChance(act.type, act.name)[0] < aSuccessChance) continue;
    if (needCount && ns.bladeburner.getActionCountRemaining(act.type, act.name) < 1) continue;
    if (ns.bladeburner.getCurrentAction()?.name == act.name) return;
    if (!ns.singularity.getOwnedAugmentations().includes("The Blade's Simulacrum")) ns.singularity.stopAction();
    if (ns.bladeburner.startAction(act.type, act.name)) {
      addLog(ns, 'action', `ACT: ${act.name}`);
      await ns.sleep(ns.bladeburner.getActionTime(act.type, act.name) / (ns.bladeburner.getBonusTime() > 1000 ? 5 : 1));
      return;
    }
  }
}

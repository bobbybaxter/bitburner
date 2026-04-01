import { NS } from '@ns';
import { addLog } from './logger';

export function hyperdriveBulkBuyer(ns: NS) {
  if (ns.bladeburner.getSkillPoints() < 1e5) return;
  const skill = 'Hyperdrive';
  let count = 1;
  while (ns.bladeburner.getSkillUpgradeCost(skill, count * 2) < ns.bladeburner.getSkillPoints()) count *= 2;
  for (let i = count; i >= 1; i /= 2)
    if (ns.bladeburner.getSkillUpgradeCost(skill, count + i) < ns.bladeburner.getSkillPoints()) count += i;
  if (ns.bladeburner.getSkillLevel(skill) + count > ns.bladeburner.getSkillLevel(skill))
    if (ns.bladeburner.upgradeSkill(skill, count)) {
      addLog(
        ns,
        'skill',
        `Got ${ns.formatNumber(count, 2, 2)} ${skill}${count >= 2 ? 's' : ''} for ${ns.formatNumber(ns.bladeburner.getSkillUpgradeCost(skill, count), 2, 2)} sp`,
      );
    }
}

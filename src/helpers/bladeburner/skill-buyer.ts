import { BladeburnerSkillName, NS } from '@ns';
import { addLog, printLog } from './logger';

export async function skillBuyer(ns: NS) {
  let i = 0;
  while (
    getSkill(ns) !== false &&
    (getSkill(ns) as { name: string; upgradeCost: number }[])[0].upgradeCost < ns.bladeburner.getSkillPoints()
  ) {
    const cheapestSkill = (getSkill(ns) as { name: string; upgradeCost: number }[])[0];
    if (ns.bladeburner.upgradeSkill(cheapestSkill.name as BladeburnerSkillName))
      addLog(ns, 'skill', `Got 1 ${cheapestSkill.name} for ${cheapestSkill.upgradeCost} SP`);
    if (i % 1000 === 0) {
      printLog(ns);
      await ns.sleep(0);
    }
    i++;
  }
}

export function getSkill(ns: NS): { name: string; upgradeCost: number }[] | false {
  const bbSkills: { name: string; upgradeCost: number }[] = [];
  if (ns.bladeburner.getSkillLevel('Overclock') < 20) {
    const x: { name: string; upgradeCost: number } = {
      name: 'Overclock',
      upgradeCost: ns.bladeburner.getSkillUpgradeCost('Overclock'),
    };
    bbSkills.push(x as { name: string; upgradeCost: number });
    return bbSkills;
  }

  for (const skill of ns.bladeburner.getSkillNames()) {
    if (skillLimiter(ns, skill)) continue;
    const x: { name: string; upgradeCost: number } = {
      name: skill,
      upgradeCost: ns.bladeburner.getSkillUpgradeCost(skill),
    };
    bbSkills.push(x as { name: string; upgradeCost: number });
  }
  if (bbSkills.length == 0) return false;
  bbSkills.sort((a, b) => a.upgradeCost - b.upgradeCost);
  return bbSkills;
}

function skillLimiter(ns: NS, skill: BladeburnerSkillName): boolean {
  const comStats = ns.bladeburner.getRank() > 4e5 ? Math.max(Math.min(2e6, ns.bladeburner.getRank() * 1e-4), 1e3) : 400, // experimental scaling for combat skills post 400k rank
    stamStats = ns.bladeburner.getRank() > 4e5 ? Math.max(Math.min(2e4, ns.bladeburner.getRank() * 1e-4), 1e3) : 200, // same as comStats, but for Cyber's Edge
    opStats = ns.bladeburner.getRank() > 4e5 ? Math.max(Math.min(2e4, ns.bladeburner.getRank() * 7.5e-5), 1e3) : 200, // same as comStats, but for operation success chance
    skillLimits = [
      { name: "Blade's Intuition", limit: opStats }, //Each level of this skill increases your success chance for all Contracts, Operations, and BlackOps by 3%
      { name: 'Cloak', limit: opStats }, //Each level of this skill increases your success chance in stealth-related Contracts, Operations, and BlackOps by 5.5%
      { name: 'Short-Circuit', limit: 100 }, //Each level of this skill increases your success chance in Contracts, Operations, and BlackOps that involve retirement by 5.5%
      { name: 'Digital Observer', limit: opStats }, //Each level of this skill increases your success chance in all Operations and BlackOps by 4%
      { name: 'Tracer', limit: 20 }, //Each level of this skill increases your success chance in all Contracts by 4%
      { name: 'Overclock', limit: 90 }, //Each level of this skill decreases the time it takes to attempt a Contract, Operation, and BlackOp by 1% (Max Level: 90)
      { name: 'Reaper', limit: comStats }, //Each level of this skill increases your effective combat stats for Bladeburner actions by 2%
      { name: 'Evasive System', limit: comStats }, //Each level of this skill increases your effective dexterity and agility for Bladeburner actions by 4%
      { name: 'Datamancer', limit: 80 }, //Each level of this skill increases your effectiveness in synthoid population analysis and investigation by 5%. This affects all actions that can potentially increase the accuracy of your synthoid population/community estimates.
      { name: "Cyber's Edge", limit: stamStats }, //Each level of this skill increases your max stamina by 2%
      { name: 'Hands of Midas', limit: 200 }, //Each level of this skill increases the amount of money you receive from Contracts by 10%
      { name: 'Hyperdrive', limit: 200 }, //Each level of this skill increases the experience earned from Contracts, Operations, and BlackOps by 10%
    ];
  if (skillLimits.find(({ name }) => name === skill) != undefined)
    return (skillLimits.find(({ name }) => name === skill)?.limit ?? 0) <= ns.bladeburner.getSkillLevel(skill);
  else return false;
}

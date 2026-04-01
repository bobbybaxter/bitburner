import { NS } from '@ns';
import { addLog } from './logger';

export function joiner(ns: NS) {
  if (ns.bladeburner.joinBladeburnerDivision() && !ns.bladeburner.inBladeburner())
    addLog(ns, 'action', '-Joined Bladeburner Division'); //attempt to join bladeburners
  if (
    ns.bladeburner.inBladeburner() &&
    ns.bladeburner.joinBladeburnerFaction() &&
    !ns.getPlayer().factions.includes('Bladeburners')
  )
    addLog(ns, 'action', '-Joined Bladeburner Faction'); //attempt to join bladeburners faction
}

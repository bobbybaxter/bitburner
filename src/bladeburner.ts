import { NS } from '@ns';
import { chaosEater } from 'helpers/bladeburner/chaos-eater';
import { cleanUp } from 'helpers/bladeburner/clean-up';
import { SLEEP_TIME } from 'helpers/bladeburner/constants';
import { doAction } from 'helpers/bladeburner/do-action';
import { healthCheck } from 'helpers/bladeburner/health-check';
import { hyperdriveBulkBuyer } from 'helpers/bladeburner/hyperdrive-bulk-buyer';
import { joiner } from 'helpers/bladeburner/joiner';
import { printLog } from 'helpers/bladeburner/logger';
import { skillBuyer } from 'helpers/bladeburner/skill-buyer';
import { violence } from 'helpers/bladeburner/violence';
import { tem } from 'helpers/tem';

export async function main(ns: NS) {
  ns.disableLog('ALL');
  ns.clearLog();
  ns.ui.openTail();
  ns.ui.setTailTitle(tem('💀BladeBurner:Headquarters', { fontFamily: 'Brush Script MT, cursive' }));

  const DO_VIOLENCE = ns.args.includes('violence');
  const GLOBAL_CHAR_LIMIT = DO_VIOLENCE ? 1e5 : 1e6;

  if (!ns.scriptRunning('bladeburner-info.js', ns.getHostname())) ns.exec('bladeburner-info.js', ns.getHostname());

  while (1) {
    printLog(ns);
    if (!ns.bladeburner.inBladeburner()) {
      joiner(ns);
    } else {
      await violence(ns, GLOBAL_CHAR_LIMIT);
      await healthCheck(ns);
      await skillBuyer(ns);
      await cleanUp(ns, GLOBAL_CHAR_LIMIT);
      await chaosEater(ns);
      await doAction(ns);
      hyperdriveBulkBuyer(ns);
    }
    await ns.sleep(SLEEP_TIME);
  }
}

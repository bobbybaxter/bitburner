import { NS } from '@ns';
import { Do } from '../do';

export async function createCorporation(ns: NS): Promise<void> {
  const hasCorporation = (await Do(ns, 'ns.corporation.hasCorporation')) as boolean;
  if (!hasCorporation) {
    ns.tprint('No corporation found, creating one...');
    const money = ns.getPlayer().money;
    let corporation = false;
    const corpName = 'GloboCorp';

    if (money >= 150e9) {
      corporation = (await Do(ns, 'ns.corporation.createCorporation', corpName, true)) as boolean;
    } else {
      corporation = (await Do(ns, 'ns.corporation.createCorporation', corpName, false)) as boolean;
    }

    if (corporation) {
      ns.tprint(`Corporation (${corpName}) created successfully`);
    } else {
      ns.tprint(`Failed to create corporation (${corpName})`);
    }
  } else {
    ns.tprint('Corporation already exists');
  }
}

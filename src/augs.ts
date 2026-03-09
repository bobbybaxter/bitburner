/*

/augs.js (77.2 / / 69.7 GB)

Long-running script that works to unlock and buy augmentations automatically.
Loops between gaining faction reputation and purchasing available augmentations.

Usage:
run /augs.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ]

*/

import type { NS } from '@ns';
import { buyAugs } from 'augmentations/buy.js';
import { DOMAINS } from 'augmentations/info.js';
import { getFutureAugs, unlockAugs } from 'augmentations/unlock.js';

const FLAGS: [string, string | number | boolean | string[]][] = [['help', false]];

export function autocomplete(
  data: { flags: (schema: [string, string | number | boolean | string[]][]) => void },
  _args: string[],
): string[] {
  data.flags(FLAGS);
  return Object.keys(DOMAINS);
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog('sleep');
  ns.clearLog();

  const flags = ns.flags(FLAGS);
  let domains: string[] = Array.isArray(flags._) ? (flags._ as string[]) : [flags._ as string];
  if (domains.length === 0) {
    domains = ['all'];
  }

  if (flags.help) {
    ns.tprint(
      [
        'Long-running script that works to unlock and buy augmentations automatically.',
        '',
        'Usage: ',
        `> ${ns.getScriptName()} [ ${Object.keys(DOMAINS).join(' | ')} ... ]`,
        '',
        'Example: Automatically unlock and buy all hacking augmentations.',
        `> run ${ns.getScriptName()} hacking`,
        ' ',
      ].join('\n'),
    );
    return;
  }

  for (const domain of domains) {
    if (!(domain in DOMAINS)) {
      ns.tprint(`Unknown augmentation type: '${domain}'`);
      return;
    }
  }

  ns.tprint(`Augmentation auto-pilot started for: ${domains.join(', ')}`);
  ns.ui.openTail();

  while (true) {
    const futureAugs = await getFutureAugs(ns, { domains });
    if (futureAugs.length === 0) {
      ns.tprint('No more augmentations to unlock or buy. Exiting.');
      break;
    }

    await unlockAugs(ns, domains);
    await buyAugs(ns, domains);
    await ns.sleep(10_000);
  }
}

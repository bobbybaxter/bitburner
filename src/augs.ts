/*

/augs.js (77.2 / / 69.7 GB)

Long-running script that works to unlock and buy augmentations automatically.
Loops between gaining faction reputation and purchasing available augmentations.

Usage:
run /augs.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ]

*/

import type { NS } from '@ns';
import { buyAugs, buyNfgAndInstall } from 'augmentations/buy.js';
import { DOMAINS } from 'augmentations/info.js';
import { getFutureAugs, unlockAugs } from 'augmentations/unlock.js';
import { Do } from 'helpers/do.js';

/** Purchased but not yet installed (since last install). */
async function countPurchasedPendingInstall(ns: NS): Promise<number> {
  const installed = new Set((await Do(ns, 'ns.singularity.getOwnedAugmentations', false)) as string[]);
  const allOwned = (await Do(ns, 'ns.singularity.getOwnedAugmentations', true)) as string[];
  return allOwned.filter((name) => !installed.has(name)).length;
}

const FLAGS: [string, string | number | boolean | string[]][] = [
  ['help', false],
  ['threshold', 10],
  ['cheap', false],
];

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

  const threshold = flags.threshold as number;

  if (flags.help) {
    ns.tprint(
      [
        'Long-running script that works to unlock and buy augmentations automatically.',
        '',
        'Usage: ',
        `> ${ns.getScriptName()} [ ${Object.keys(DOMAINS).join(' | ')} ... ] [ --threshold N ]`,
        '',
        'Example: Automatically unlock and buy all hacking augmentations.',
        `> run ${ns.getScriptName()} hacking`,
        '',
        'Example: Trigger endgame (NFG + reset) when cheapest remaining aug > 5x current money.',
        `> run ${ns.getScriptName()} all --threshold 5`,
        '',
        'Example: Buy the cheapest hacking augmentations first.',
        `> run ${ns.getScriptName()} hacking --cheap`,
        '  With --cheap, also resets when ≥10 augmentations are purchased pending install',
        '  (in addition to the --threshold multiple on next aug price).',
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

  let moneyOnlyLogged = false;

  while (true) {
    const futureAugs = await getFutureAugs(ns, { domains });
    if (futureAugs.length === 0) {
      ns.tprint('No more non-NFG augmentations to unlock or buy. Starting endgame...');
      await buyNfgAndInstall(ns);
      break;
    }

    await buyAugs(ns, domains, { cheap: !!flags.cheap });

    if (flags.cheap) {
      const pendingInstall = await countPurchasedPendingInstall(ns);
      if (pendingInstall >= 10) {
        ns.tprint(`--cheap: ${pendingInstall} augmentations purchased pending install (≥10). Starting endgame...`);
        await buyNfgAndInstall(ns);
        break;
      }
    }

    const refreshedAugs = await getFutureAugs(ns, { domains });
    const hasRepWork = !refreshedAugs[0].moneyOnly;
    const nextAug = refreshedAugs[0];

    if (!hasRepWork && refreshedAugs.length > 0) {
      const nextPrice = nextAug.price ?? Infinity;
      const money = ns.getPlayer().money;
      if (nextAug.name !== 'The Red Pill' && nextPrice > money * threshold) {
        ns.tprint(
          `Next aug "${nextAug.name}" costs ${ns.formatNumber(nextPrice)} ` +
            `(>${threshold}x current ${ns.formatNumber(money)}). Starting endgame...`,
        );
        await buyNfgAndInstall(ns);
        break;
      }
    }

    if (hasRepWork) {
      moneyOnlyLogged = false;
      await unlockAugs(ns, domains);
    } else if (!moneyOnlyLogged) {
      ns.tprint(
        `Waiting for money to buy: ${nextAug.name} at location: ${
          typeof nextAug.canPurchaseFrom === 'string'
            ? nextAug.canPurchaseFrom
            : ((nextAug.canPurchaseFrom as { name?: string })?.name ?? 'unknown')
        } for ${ns.formatNumber(nextAug.price ?? 0)}`,
      );
      moneyOnlyLogged = true;
    }

    await ns.sleep(10_000);
  }
}

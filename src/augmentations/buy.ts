/*

/augmentations/buy.js (38.1 / / 35.6 GB)

List augmentations that boost a given kind of stats, starting with the most expensive.
Optionally buy them. Use --cheap to buy cheapest first instead.

Usage:
run /augmentations/buy.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ] [ --begin ] [ --cheap ]

*/

import type { NS } from '@ns';
import type { AugmentationInfo } from 'augmentations/info.js';
import { averageValue, DOMAINS, getAllAugmentations, getAugmentationInfo } from 'augmentations/info.js';
import { Do } from 'helpers/do.js';

const FLAGS: [string, string | number | boolean | string[]][] = [
  ['help', false],
  ['begin', false],
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
  const domains: string[] = Array.isArray(flags._) ? (flags._ as string[]) : [flags._ as string];
  if (flags.help || domains.length === 0) {
    ns.tprint(
      [
        `List augmentations that boost a given kind of stats, starting with the most expensive. Optionally buy them.`,
        '',
        'Usage: ',
        `${ns.getScriptName()} [ ${Object.keys(DOMAINS).join(' | ')} ... ] [ --begin ] [ --cheap ]`,
        '',
        `Example: List all augs that increase hacking stats or faction rep gain`,
        `> run ${ns.getScriptName()} hacking faction`,
        '',
        `Example: Buy all augs that increase hacking, including NeuroFlux Governor repeatedly`,
        `> run ${ns.getScriptName()} hacking --begin`,
        '',
        `Example: Buy the cheapest hacking augs first`,
        `> run ${ns.getScriptName()} hacking --begin --cheap`,
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

  const cheap = !!flags.cheap;
  const augPlan = await planAugs(ns, domains, { cheap });
  const summary = [`Augmentation Buying Plan: ${domains.join(', ')}${cheap ? ' (cheapest first)' : ''}`];
  for (const aug of augPlan) {
    const augValue = averageValue(aug as { value?: Record<string, number> }, domains);
    const value = augValue.toFixed(2);
    const factionName = typeof aug.canPurchaseFrom === 'string' ? aug.canPurchaseFrom : aug.canPurchaseFrom?.name;
    summary.push(`  '${aug.name}' (${value}x) from ${factionName} for ${ns.formatNumber(aug.price ?? 0)}`);
  }
  ns.tprint(summary.join('\n'), '\n');

  if (flags.begin) {
    await buyAugs(ns, domains, { cheap });
  } else {
    ns.ui.openTail();
  }
}

export async function buyAugs(ns: NS, domains: string[], { cheap = false } = {}): Promise<void> {
  const plannedAugs: Record<string, boolean> = {};
  let selectedAugs = (await selectAugs(ns, domains, plannedAugs, { cheap })).filter(
    (a) => a.name !== 'NeuroFlux Governor',
  );
  while (selectedAugs.length > 0) {
    const aug = selectedAugs.shift()!;
    plannedAugs[aug.name] = true;
    const factionName = typeof aug.canPurchaseFrom === 'string' ? aug.canPurchaseFrom : aug.canPurchaseFrom?.name;
    const price = aug.price ?? 0;
    if (factionName && price <= ns.getPlayer().money) {
      const success = (await Do(ns, 'ns.singularity.purchaseAugmentation', factionName, aug.name)) as boolean;
      if (success) {
        ns.tprint(`Purchased '${aug.name}' from ${factionName} for ${ns.formatNumber(price)}`);
      } else {
        ns.print(`WARN: Failed to purchase '${aug.name}' from ${factionName} (API returned false)`);
      }
    } else if (!factionName) {
      ns.print(`WARN: Skipped '${aug.name}' — no valid faction to purchase from`);
    } else {
      ns.print(
        `WARN: Skipped '${aug.name}' — costs ${ns.formatNumber(price)} but only have ${ns.formatNumber(ns.getPlayer().money)}`,
      );
    }
    selectedAugs = (await selectAugs(ns, domains, plannedAugs, { cheap })).filter(
      (a) => a.name !== 'NeuroFlux Governor',
    );
    while (selectedAugs.length > 0 && selectedAugs[0].name in plannedAugs) {
      selectedAugs.shift();
    }
    await ns.sleep(100);
  }
}

export async function buyNfgAndInstall(ns: NS): Promise<void> {
  ns.tprint('Liquidating stocks...');
  ns.run('stockmaster.js', 1, '-l');
  await ns.sleep(10_000);

  ns.tprint('Buying NeuroFlux Governors...');
  let nfgBought = 0;
  while (true) {
    const nfgInfo = await getAugmentationInfo(ns, 'NeuroFlux Governor');
    const nfgPrice = nfgInfo.price ?? 0;
    if (nfgPrice > ns.getPlayer().money) break;

    const faction = await canPurchaseFrom(ns, nfgInfo);
    const factionName = typeof faction === 'string' ? faction : faction?.name;
    if (!factionName) break;

    const success = (await Do(ns, 'ns.singularity.purchaseAugmentation', factionName, 'NeuroFlux Governor')) as boolean;
    if (success) {
      nfgBought++;
      ns.tprint(`Purchased NeuroFlux Governor #${nfgBought} from ${factionName} for ${ns.formatNumber(nfgPrice)}`);
    } else {
      break;
    }
    await ns.sleep(100);
  }
  ns.tprint(`Bought ${nfgBought} NeuroFlux Governors total.`);

  ns.tprint('Installing augmentations and resetting...');
  await Do(ns, 'ns.singularity.installAugmentations', 'startup.js');
}

export async function planAugs(
  ns: NS,
  domains: string[],
  { cheap = false } = {},
): Promise<
  Array<AugmentationInfo & { canPurchaseFrom?: string | { name: string }; price?: number; sortKey?: number }>
> {
  type PlannedAug = AugmentationInfo & {
    canPurchaseFrom?: string | { name: string };
    price?: number;
    sortKey?: number;
  };
  const plannedAugs: Record<string, PlannedAug> = {};
  let selectedAugs = await selectAugs(ns, domains, plannedAugs, { cheap });
  while (selectedAugs.length > 0) {
    const aug = selectedAugs.shift()!;
    plannedAugs[aug.name] = aug;
    selectedAugs = await selectAugs(ns, domains, plannedAugs, { cheap });
    while (selectedAugs.length > 0 && selectedAugs[0].name in plannedAugs) {
      selectedAugs.shift();
    }
  }
  return Object.values(plannedAugs);
}

export async function selectAugs(
  ns: NS,
  domains: string[],
  plannedAugs: Record<string, unknown> | Record<string, boolean>,
  { cheap = false } = {},
): Promise<
  Array<
    AugmentationInfo & {
      canPurchaseFrom?: string | { name: string };
      price?: number;
      sortKey?: number;
    }
  >
> {
  const exclude: Record<string, boolean> = {};
  for (const aug of Object.keys(plannedAugs)) {
    exclude[aug] = true;
  }
  const ownedAugs = (await Do(ns, 'ns.singularity.getOwnedAugmentations', true)) as string[];
  for (const aug of ownedAugs) {
    exclude[aug] = true;
  }
  exclude['NeuroFlux Governor'] = false;
  const knownAugs = await getKnownAugs(ns, plannedAugs, { cheap });
  const buyableAugs = Object.values(knownAugs)
    .filter((aug) => {
      return (
        aug.canPurchaseFrom != null &&
        averageValue(aug as { value: Record<string, number> }, domains) > 1.0 &&
        !exclude[aug.name]
      );
    })
    .sort((a, b) => {
      return cheap ? (a.sortKey ?? 0) - (b.sortKey ?? 0) : (b.sortKey ?? 0) - (a.sortKey ?? 0);
    });
  return buyableAugs;
}

export async function getKnownAugs(
  ns: NS,
  plannedAugs: Record<string, unknown>,
  { cheap = false } = {},
): Promise<
  Record<
    string,
    AugmentationInfo & {
      canPurchaseFrom?: string | { name: string };
      sortKey?: number;
    }
  >
> {
  const augs = (await getAllAugmentations(ns)) as Record<
    string,
    AugmentationInfo & { canPurchaseFrom?: string | { name: string }; sortKey?: number }
  >;
  for (const [, aug] of Object.entries(augs)) {
    const canPurchase = await canPurchaseFrom(ns, aug, plannedAugs);
    (aug as AugmentationInfo & { canPurchaseFrom?: string | { name: string } | null }).canPurchaseFrom =
      canPurchase ?? undefined;
    (aug as AugmentationInfo & { sortKey?: number }).sortKey = aug.price;
    if (aug.name === 'NeuroFlux Governor') {
      (aug as AugmentationInfo & { sortKey?: number }).sortKey = 1e3;
    }
  }
  if (!cheap) {
    // Adjust sortKey of prerequisites so they sort before their dependents (expensive-first)
    for (const [, aug] of Object.entries(augs)) {
      for (const prereq of aug.prereqs ?? []) {
        const plan: Record<string, boolean> = {};
        plan[prereq] = true;
        const prereqAug = augs[prereq as keyof typeof augs];
        if (prereqAug?.canPurchaseFrom && (await canPurchaseFrom(ns, aug, plan))) {
          const newSortKey = (aug.sortKey ?? 0) + (prereqAug.sortKey ?? 0);
          (aug as AugmentationInfo & { sortKey?: number }).sortKey = newSortKey;
          prereqAug.sortKey = newSortKey + 1;
        }
      }
    }
  }
  return augs;
}

export async function canPurchaseFrom(
  ns: NS,
  aug: AugmentationInfo,
  plannedAugs: Record<string, unknown> = {},
): Promise<string | { name: string } | null> {
  const ownedAugs = (await Do(ns, 'ns.singularity.getOwnedAugmentations', true)) as string[];
  for (const prereq of aug.prereqs ?? []) {
    if (!(ownedAugs.includes(prereq) || prereq in plannedAugs)) {
      return null;
    }
  }
  for (const faction of aug.factions ?? []) {
    if (faction.rep >= faction.repReq) {
      return faction;
    }
  }
  return null;
}

/*

/augmentations/buy.js (38.1 / / 35.6 GB)

List augmentations that boost a given kind of stats, starting with the most expensive.
Optionally buy them.

Usage:
run /augmentations/buy.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ] [ --begin ]

*/

import type { NS } from '@ns';
import type { AugmentationInfo } from 'augmentations/info.js';
import { averageValue, DOMAINS, getAllAugmentations } from 'augmentations/info.js';
import { Do } from 'helpers/do.js';

const FLAGS: [string, string | number | boolean | string[]][] = [
  ['help', false],
  ['begin', false],
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
        `${ns.getScriptName()} [ ${Object.keys(DOMAINS).join(' | ')} ... ] [ --begin ]`,
        '',
        `Example: List all augs that increase hacking stats or faction rep gain`,
        `> run ${ns.getScriptName()} hacking faction`,
        '',
        `Example: Buy all augs that increase hacking, including NeuroFlux Governor repeatedly`,
        `> run ${ns.getScriptName()} hacking --begin`,
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

  const augPlan = await planAugs(ns, domains);
  const summary = [`Augmentation Buying Plan: ${domains.join(', ')}`];
  for (const aug of augPlan) {
    const augValue = averageValue(aug as { value?: Record<string, number> }, domains);
    const value = augValue.toFixed(2);
    summary.push(`  '${aug.name}' (${value}x) from ${aug.canPurchaseFrom} for ${ns.formatNumber(aug.price ?? 0)}`);
  }
  ns.print(summary.join('\n'), '\n');

  if (flags.begin) {
    await buyAugs(ns, domains);
  } else {
    ns.ui.openTail();
  }
}

export async function buyAugs(ns: NS, domains: string[]): Promise<void> {
  const plannedAugs: Record<string, boolean> = {};
  let selectedAugs = await selectAugs(ns, domains, plannedAugs);
  while (selectedAugs.length > 0) {
    const aug = selectedAugs.shift()!;
    plannedAugs[aug.name] = true;
    const factionName = typeof aug.canPurchaseFrom === 'string' ? aug.canPurchaseFrom : aug.canPurchaseFrom?.name;
    const price = aug.price ?? 0;
    if (factionName && price < ns.getPlayer().money) {
      ns.singularity.purchaseAugmentation(factionName, aug.name);
      ns.tprint(`Purchased '${aug.name}' from ${factionName} for ${ns.formatNumber(price)}`);
    }
    selectedAugs = await selectAugs(ns, domains, plannedAugs);
    const neuroFluxPrice = (await Do(ns, 'ns.singularity.getAugmentationPrice', 'NeuroFlux Governor')) as number;
    if (neuroFluxPrice < ns.getPlayer().money) {
      delete plannedAugs['NeuroFlux Governor'];
    }
    while (selectedAugs.length > 0 && selectedAugs[0].name in plannedAugs) {
      selectedAugs.shift();
    }
    await ns.sleep(100);
  }
  // ns.tprint(
  //   [
  //     "Finished buying augmentations. Don't forget:",
  //     '  - Buy augmentations for sleeves',
  //     '  - Buy equipment for gang members',
  //     '  - Upgrade home server',
  //     '  - Spend hacknet hashes on Bladeburner rank and SP',
  //     '  - Spend hacknet hashes on corporation research and funds',
  //     '  - Buyback corporation shares',
  //   ].join('\n'),
  // );
}

export async function planAugs(
  ns: NS,
  domains: string[],
): Promise<
  Array<AugmentationInfo & { canPurchaseFrom?: string | { name: string }; price?: number; sortKey?: number }>
> {
  type PlannedAug = AugmentationInfo & {
    canPurchaseFrom?: string | { name: string };
    price?: number;
    sortKey?: number;
  };
  const plannedAugs: Record<string, PlannedAug> = {};
  let selectedAugs = await selectAugs(ns, domains, plannedAugs);
  while (selectedAugs.length > 0) {
    const aug = selectedAugs.shift()!;
    plannedAugs[aug.name] = aug;
    selectedAugs = await selectAugs(ns, domains, plannedAugs);
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
  const knownAugs = await getKnownAugs(ns, plannedAugs);
  const buyableAugs = Object.values(knownAugs)
    .filter((aug) => {
      return (
        aug.canPurchaseFrom != null &&
        averageValue(aug as { value: Record<string, number> }, domains) > 1.0 &&
        !exclude[aug.name]
      );
    })
    .sort((a, b) => {
      return (b.sortKey ?? 0) - (a.sortKey ?? 0);
    });
  return buyableAugs;
}

export async function getKnownAugs(
  ns: NS,
  plannedAugs: Record<string, unknown>,
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
  // Fill in purchasing info
  for (const [, aug] of Object.entries(augs)) {
    const canPurchase = await canPurchaseFrom(ns, aug, plannedAugs);
    (aug as AugmentationInfo & { canPurchaseFrom?: string | { name: string } | null }).canPurchaseFrom =
      canPurchase ?? undefined;
    (aug as AugmentationInfo & { sortKey?: number }).sortKey = aug.price;
    if (aug.name === 'NeuroFlux Governor') {
      (aug as AugmentationInfo & { sortKey?: number }).sortKey = 1e3;
    }
  }
  // Adjust sortKey of prerequisites if their successors could be bought immediately
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

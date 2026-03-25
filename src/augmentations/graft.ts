/*

/augmentations/graft.js (50.1 / / 43.1 GB)

List the best augmentations available to graft.
Optionally graft them. Use --cheap to graft cheapest first.

run /augmentations/graft.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ] [ --begin ] [ --cheap ]

*/

import type { NS } from '@ns';
import { averageValue, DOMAINS, getAllAugmentations } from 'augmentations/info.js';
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
  let domains: string[] = Array.isArray(flags._) ? (flags._ as string[]) : [flags._ as string];
  if (domains.length === 0) {
    domains = ['all'];
  }

  if (flags.help) {
    ns.tprint(
      [
        'List the best augmentations available to graft, sorted by (multipliers / time). Optionally graft them.',
        '',
        'Usage: ',
        `${ns.getScriptName()} [ ${Object.keys(DOMAINS).join(' | ')} ... ] [ --begin ] [ --cheap ]`,
        '',
        'Example: List all augmentations that increase charisma or faction rep gain.',
        `> run ${ns.getScriptName()} charisma faction`,
        '',
        'Example: Graft all augmentations that increase hacking stats.',
        `> run ${ns.getScriptName()} hacking --begin`,
        '',
        'Example: Graft the cheapest hacking augmentations first.',
        `> run ${ns.getScriptName()} hacking --begin --cheap`,
        ' ',
      ].join('\n'),
    );
    return;
  }

  const cheap = !!flags.cheap;
  const graftableAugs = await getGraftableAugs(ns, { domains, cheap });
  const summary = [`Augmentation Grafting Plan: ${domains.join(', ')}${cheap ? ' (cheapest first)' : ''}`];
  for (const aug of graftableAugs) {
    const price = ns.sprintf('%10s', ns.formatNumber(aug.price));
    summary.push(
      `${price} (${(aug.time / 60 / 60 / 1000).toFixed(1)} hr) for (${aug.totalValue.toFixed(2)}x) '${aug.name}'`,
    );
  }
  ns.print(summary.join('\n'), '\n');

  if (flags.begin) {
    await graftAugs(ns, domains, { cheap });
  } else {
    ns.ui.openTail();
  }
}

export async function graftAugs(ns: NS, domains: string[], { cheap = false } = {}): Promise<void> {
  let augs = await getGraftableAugs(ns, { domains, canAfford: true, cheap });
  while (augs.length > 0) {
    const aug = augs[0];
    const player = ns.getPlayer() as { city?: string; isWorking?: boolean; workType?: string };
    if (player.isWorking) {
      if (player.workType === 'Grafting an Augmentation') {
        ns.print(`Waiting to finish ${player.workType}...`);
        while ((ns.getPlayer() as { workType?: string }).workType === 'Grafting an Augmentation') {
          await ns.sleep(60 * 1000);
        }
        continue;
      } else {
        ns.tprint(`Not starting grafting because player is already ${player.workType}.`);
        return;
      }
    }
    if (player.city !== 'New Tokyo') {
      ns.singularity.travelToCity('New Tokyo');
    }
    const success = ns.grafting.graftAugmentation(aug.name);
    if (success) {
      ns.print(`Started to graft '${aug.name}'.`);
      await ns.sleep(aug.time);
    } else {
      ns.print(`Failed to graft '${aug.name}'.`);
      await ns.sleep(1000);
    }
    augs = await getGraftableAugs(ns, { domains, canAfford: true, cheap });
  }
  ns.tprint('Grafted all affordable net-positive augmentations.');
}

export async function getGraftableAugs(
  ns: NS,
  { domains, canAfford, cheap = false }: { domains: string[]; canAfford?: boolean; cheap?: boolean },
): Promise<
  Array<{
    name: string;
    price: number;
    time: number;
    totalValue: number;
    sortKey: number;
    prereqsMet: boolean;
    prereqs: string[];
    isSpecial?: boolean;
  }>
> {
  const allAugs = Object.values(await getAllAugmentations(ns));
  const ownedAugs = (await Do(ns, 'ns.singularity.getOwnedAugmentations', true)) as string[];
  const exclude = ['The Red Pill', 'NeuroFlux Governor'];

  let graftableAugs: Array<{
    name: string;
    price: number;
    time: number;
    totalValue: number;
    sortKey: number;
    prereqsMet: boolean;
    prereqs: string[];
    isSpecial?: boolean;
  }> = [];
  for (const aug of allAugs.filter(
    (aug) => !aug.isSpecial && !exclude.includes(aug.name) && !ownedAugs.includes(aug.name),
  )) {
    await estimateGraftValues(
      ns,
      aug as unknown as { name: string; stats: Record<string, number>; value: Record<string, number> },
    );
    const augExt = aug as unknown as {
      totalValue: number;
      price: number;
      time: number;
      sortKey: number;
      prereqsMet: boolean;
      prereqs: string[];
    };
    augExt.totalValue = averageValue(aug, domains);
    augExt.price = ns.grafting.getAugmentationGraftPrice(aug.name);
    augExt.time = ns.grafting.getAugmentationGraftTime(aug.name);
    augExt.sortKey = (augExt.totalValue - 1) / (augExt.time + 15 * 60 * 1000);
    augExt.prereqsMet = (aug.prereqs ?? []).every((a) => ownedAugs.includes(a));
    graftableAugs.push(
      aug as unknown as {
        name: string;
        price: number;
        time: number;
        totalValue: number;
        sortKey: number;
        prereqsMet: boolean;
        prereqs: string[];
      },
    );
  }
  if (cheap) {
    graftableAugs.sort((a, b) => a.price - b.price);
  } else {
    graftableAugs.sort((a, b) => b.sortKey - a.sortKey);
  }

  if (canAfford) {
    graftableAugs = graftableAugs.filter(
      (aug) => aug.prereqsMet && aug.price < ns.getPlayer().money && aug.totalValue > 1.0,
    );
  }

  return graftableAugs;
}

export async function estimateGraftValues(
  ns: NS,
  aug: { name: string; stats: Record<string, number>; value: Record<string, number> },
): Promise<void> {
  const entropy = {
    name: 'Entropy',
    stats: entropyStats,
    value: {},
  };
  aug.stats = {};
  for (const [key, value] of Object.entries(
    (await Do(ns, 'ns.singularity.getAugmentationStats', aug.name)) as Record<string, number>,
  )) {
    aug.stats[key] = value * EntropyEffect;
    // TODO: check whether 'cost' ones get inverted in future versions
  }
  aug.value = {};
  for (const [domain, estimate] of Object.entries(DOMAINS)) {
    aug.value[domain] = estimate(aug) * estimate(entropy);
  }
}

export const EntropyEffect = 0.98;
export const entropyStats = {
  hacking_chance_mult: EntropyEffect,
  hacking_speed_mult: EntropyEffect,
  hacking_money_mult: EntropyEffect,
  hacking_grow_mult: EntropyEffect,

  hacking_mult: EntropyEffect,
  strength_mult: EntropyEffect,
  defense_mult: EntropyEffect,
  dexterity_mult: EntropyEffect,
  agility_mult: EntropyEffect,
  charisma_mult: EntropyEffect,

  // exp is less important for grafting because it doesn't get reset
  hacking_exp_mult: Math.sqrt(EntropyEffect),
  strength_exp_mult: Math.sqrt(EntropyEffect),
  defense_exp_mult: Math.sqrt(EntropyEffect),
  dexterity_exp_mult: Math.sqrt(EntropyEffect),
  agility_exp_mult: Math.sqrt(EntropyEffect),
  charisma_exp_mult: Math.sqrt(EntropyEffect),

  company_rep_mult: EntropyEffect,
  faction_rep_mult: EntropyEffect,

  crime_money_mult: EntropyEffect,
  crime_success_mult: EntropyEffect,

  hacknet_node_money_mult: EntropyEffect,
  hacknet_node_purchase_cost_mult: EntropyEffect,
  hacknet_node_ram_cost_mult: EntropyEffect,
  hacknet_node_core_cost_mult: EntropyEffect,
  hacknet_node_level_cost_mult: EntropyEffect,

  work_money_mult: EntropyEffect,

  bladeburner_max_stamina_mult: EntropyEffect,
  bladeburner_stamina_gain_mult: EntropyEffect,
  bladeburner_analysis_mult: EntropyEffect,
  bladeburner_success_chance_mult: EntropyEffect,
};

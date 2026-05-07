/*

/augmentations/info.js (37.6 / / 32.6 GB)

List owned augmentations or show stats of a named augmentation.

Example: List installed augmentations
> run /augmentations/info.js

Example: Show stats of a specific augmentation (supports autocomplete)
> run /augmentations/info.js NeuroFlux Governor`,

*/
import type { NS } from '@ns';
import { Do } from 'helpers/do.js';

export interface AugmentationInfo {
  name: string;
  installed?: boolean;
  purchased?: boolean;
  repReq?: number;
  price?: number;
  prereqs?: string[];
  stats?: Record<string, number>;
  value?: Record<string, number>;
  factions?: Array<{ name: string; rep: number; repReq: number }>;
  isUnique?: boolean;
  isSpecial?: boolean;
  canAccess?: boolean;
}

const FLAGS: [string, string | number | boolean | string[]][] = [['help', false]];

export function autocomplete(
  data: { flags: (schema: [string, string | number | boolean | string[]][]) => void },
  _args: string[],
): string[] {
  data.flags(FLAGS);
  return ALL_AUGMENTATIONS;
}

export async function main(ns: NS): Promise<void> {
  const args = ns.flags(FLAGS);
  const augName = (Array.isArray(args._) ? args._ : [args._]).join(' ');

  if (args.help) {
    ns.tprint(
      [
        `List owned augmentations or show stats of a named augmentation.`,
        '',
        'Example: List installed augmentations',
        `> run ${ns.getScriptName()}`,
        '',
        'Example: Show stats of a specific augmentation (supports autocomplete)',
        `> run ${ns.getScriptName()} NeuroFlux Governor`,
        ' ',
      ].join('\n'),
    );
    return;
  }

  ns.clearLog();
  ns.ui.openTail();

  if (augName) {
    ns.print(await reportOnAugmentation(ns, augName));
  } else {
    ns.print(await reportOnPlayer(ns));
  }
}

export async function reportOnAugmentation(ns: NS, augName: string): Promise<string> {
  const aug = await getAugmentationInfo(ns, augName);
  const summary = [aug.name];
  const ownedAugmentations = (await Do(ns, 'ns.singularity.getOwnedAugmentations', true)) as string[];

  summary.push(' ');
  summary.push(`Status: ${aug.installed ? 'Installed' : aug.purchased ? 'Purchased' : 'Not Owned'}`);
  summary.push(' ');
  summary.push(`Price: ${ns.format.number(aug.price ?? 0)}`);
  summary.push(' ');
  summary.push('Value:');
  for (const [domain, value] of Object.entries(aug.value ?? {})) {
    summary.push(`  ${domain}: ${value.toFixed(3)}`);
  }
  summary.push(' ');
  summary.push(`Stats: ${JSON.stringify(aug.stats, null, 2)}`);
  summary.push(' ');
  summary.push(
    `Prereqs: ${JSON.stringify(aug.prereqs ?? [], null, 2)} ${
      (aug.prereqs ?? []).every((prereq) => ownedAugmentations.includes(prereq)) ? '✓' : '✗'
    }`,
  );
  summary.push(' ');
  summary.push('Factions:');
  for (const factionInfo of aug.factions ?? []) {
    const repStr = ns.format.number(factionInfo.rep);
    const repReqStr = ns.format.number(factionInfo.repReq);
    summary.push(
      `  ${factionInfo.name}: ${repStr} / ${repReqStr} rep ${factionInfo.rep >= factionInfo.repReq ? '✓' : '✗'}`,
    );
  }
  summary.push(' ');

  return summary.join('\n');
}

export async function reportOnPlayer(ns: NS): Promise<string> {
  const report: string[] = [];
  const sourceFiles: Record<string, number> = {};
  const ownedSourceFiles = (await Do(ns, 'ns.singularity.getOwnedSourceFiles')) as Array<{ n: number; lvl: number }>;
  for (const sourceFile of ownedSourceFiles.sort((a, b) => a.n - b.n)) {
    sourceFiles[`SourceFile${sourceFile.n}`] = sourceFile.lvl;
  }
  report.push('Source Files: ' + JSON.stringify(sourceFiles, null, 2));

  let ownedAugmentations = (await Do(ns, 'ns.singularity.getOwnedAugmentations', false)) as string[];
  const installedAugs = ownedAugmentations;
  report.push('Installed Augmentations: ' + JSON.stringify(installedAugs, null, 2));

  ownedAugmentations = (await Do(ns, 'ns.singularity.getOwnedAugmentations', true)) as string[];
  const purchasedAugs = ownedAugmentations.filter(function (aug) {
    return !installedAugs.includes(aug);
  });
  report.push('Purchased Augmentations: ' + JSON.stringify(purchasedAugs, null, 2));
  report.push(' ');
  return report.join('\n');
}

// -------------------- utility functions --------------------

export async function getAllAugmentations(ns: NS): Promise<Record<string, AugmentationInfo>> {
  const augs: Record<string, AugmentationInfo> = {};
  // const factions = ns.getPlayer().factions;
  for (const faction of ALL_FACTIONS) {
    const augmentations = (await Do(ns, 'ns.singularity.getAugmentationsFromFaction', faction)) as string[];
    for (const augName of augmentations) {
      augs[augName] ||= await getAugmentationInfo(ns, augName);
    }
  }
  return augs;
}

export async function getAugmentationInfo(ns: NS, augName: string): Promise<AugmentationInfo> {
  const aug: AugmentationInfo = {} as AugmentationInfo;
  const ownedAugs = await Do(ns, 'ns.singularity.getOwnedAugmentations', true);

  aug.name = augName;
  aug.installed = (ownedAugs as string[]).includes(aug.name);
  aug.purchased = !aug.installed && (ownedAugs as string[]).includes(aug.name);

  aug.repReq = (await Do(ns, 'ns.singularity.getAugmentationRepReq', aug.name)) as number;
  aug.price = (await Do(ns, 'ns.singularity.getAugmentationPrice', aug.name)) as number;
  aug.prereqs = (await Do(ns, 'ns.singularity.getAugmentationPrereq', aug.name)) as string[];

  aug.stats = (await Do(ns, 'ns.singularity.getAugmentationStats', aug.name)) as Record<string, number>;
  aug.value = getAugmentationValue(ns, aug);

  aug.factions = await getAugmentationFactions(ns, aug.name);

  aug.isUnique = aug.factions.length === 1;

  const { isSpecial, canAccess } = await isAugmentationSpecial(ns, aug);
  aug.isSpecial = isSpecial;
  aug.canAccess = canAccess;

  return aug;
}

export async function isAugmentationSpecial(
  ns: NS,
  aug: AugmentationInfo,
): Promise<{ isSpecial: boolean; canAccess: boolean }> {
  const resetInfo = (await Do(ns, 'ns.getResetInfo')) as { currentNode: number };
  const currentNode = resetInfo.currentNode;
  const sourceFiles = (await Do(ns, 'ns.singularity.getOwnedSourceFiles')) as Array<{ n: number }>;

  const specialFactions = [
    { name: 'Bladeburners', nodeReq: 7 },
    { name: 'Church of the Machine God', nodeReq: 13 },
  ];

  const augFactions = (aug.factions ?? []).map((faction) => faction.name);
  const isUnique = augFactions.length === 1;
  const specialFaction = specialFactions.find((specialFaction) => augFactions.includes(specialFaction.name));

  const isSpecial = !!specialFaction;
  let canAccess = true;

  if (isSpecial && specialFaction) {
    const requiredNode = specialFaction.nodeReq;
    const hasSourceFile = sourceFiles.some((sf) => sf.n === requiredNode);
    canAccess = currentNode === requiredNode || hasSourceFile;
  }

  if (isUnique && isSpecial && !canAccess) {
    canAccess = false;
  }

  return {
    isSpecial,
    canAccess,
  };
}

export async function getAugmentationFactions(
  ns: NS,
  augName: string,
): Promise<Array<{ name: string; rep: number; repReq: number }>> {
  const factions: Array<{ name: string; rep: number; repReq: number }> = [];
  for (const faction of ALL_FACTIONS) {
    const augmentations = (await Do(ns, 'ns.singularity.getAugmentationsFromFaction', faction)) as string[];
    if (augmentations.includes(augName)) {
      factions.push({
        name: faction,
        rep: (await Do(ns, 'ns.singularity.getFactionRep', faction)) as number,
        repReq: (await Do(ns, 'ns.singularity.getAugmentationRepReq', augName)) as number,
        // inviteReqs: await Do(ns, 'ns.singularity.getFactionInviteRequirements', faction),
      });
    }
  }
  return factions;
}

export function getAugmentationValue(
  ns: NS,
  aug: AugmentationInfo & { value?: Record<string, number> },
): Record<string, number> {
  aug.value = {};
  for (const [domain, estimate] of Object.entries(DOMAINS)) {
    aug.value[domain] = (
      estimate as (a: { name?: string; stats?: Record<string, number>; value?: Record<string, number> }) => number
    )(aug);
  }
  return aug.value;
}

// -------------------- value estimators --------------------

export const DOMAINS = {
  hacking: estimateHackingValue,
  charisma: estimateCharismaValue,
  combat: estimateCombatValue,
  crime: estimateCrimeValue,
  faction: estimateFactionValue,
  hacknet: estimateHacknetValue,
  bladeburner: estimateBladeburnerValue,
  all: estimateAllValue,
};

export function estimateHackingValue(aug: { name: string; stats?: Record<string, number> }): number {
  const stats = aug.stats ?? {};
  let value =
    (stats.hacking || 1) *
    Math.sqrt(stats.hacking || 1) *
    Math.sqrt(stats.hacking_chance || 1) *
    ((stats.hacking_money || 1) + (stats.hacking_grow || 1) - 1) *
    (stats.hacking_speed || 1);
  if (aug.name === 'BitRunners Neurolink') {
    value += 0.05;
  }
  if (aug.name === 'CashRoot Starter Kit') {
    value += 0.05;
  }
  if (aug.name === 'PCMatrix') {
    value += 0.05;
  }
  if (aug.name === 'The Red Pill') {
    value += 9;
  }
  return value;
}

export function estimateCombatValue(aug: { stats?: Record<string, number> }): number {
  const stats = aug.stats ?? {};
  return (
    Math.sqrt(stats.agility || 1) * (stats.agility || 1) -
    1 +
    Math.sqrt(stats.defense || 1) * (stats.defense || 1) -
    1 +
    Math.sqrt(stats.strength || 1) * (stats.strength || 1) -
    1 +
    Math.sqrt(stats.dexterity || 1) * (stats.dexterity || 1) -
    1 +
    1
  );
}

export function estimateCharismaValue(aug: { stats?: Record<string, number> }): number {
  const stats = aug.stats ?? {};
  return Math.sqrt(stats.charisma || 1) * (stats.charisma || 1);
}

export function estimateCrimeValue(aug: { stats?: Record<string, number> }): number {
  const stats = aug.stats ?? {};
  return (stats.crime_money || 1) * (stats.crime_success || 1) - 1 + 1;
}

export function estimateFactionValue(aug: { name: string; stats?: Record<string, number> }): number {
  const stats = aug.stats ?? {};
  let value = (stats.company_rep || 1) - 1 + Math.sqrt(stats.work_money || 1) - 1 + (stats.faction_rep || 1) - 1 + 1;
  if (aug.name === 'Neuroreceptor Management Implant') {
    // Always get "focus" bonus
    value *= 1 / 0.8;
  }
  return value;
}

export function estimateHacknetValue(aug: { stats?: Record<string, number> }): number {
  const stats = aug.stats ?? {};
  return (
    1 / (stats.hacknet_node_purchase_cost || 1) -
    1 +
    (stats.hacknet_node_money || 1) *
      (1 / (stats.hacknet_node_level_cost || 1)) *
      (1 / (stats.hacknet_node_core_cost || 1)) *
      (1 / (stats.hacknet_node_ram_cost || 1)) -
    1 +
    1
  );
}

export function estimateBladeburnerValue(aug: { name: string; stats?: Record<string, number> }): number {
  const stats = aug.stats ?? {};
  let value =
    Math.sqrt(stats.agility || 1) * (stats.agility || 1) -
    1 +
    Math.sqrt(stats.dexterity || 1) * (stats.dexterity || 1) -
    1 +
    (stats.bladeburner_success_chance || 1) * (stats.bladeburner_stamina_gain || 1) -
    1 +
    (stats.bladeburner_max_stamina || 1) -
    1 +
    (stats.bladeburner_analysis || 1) -
    1 +
    1;
  if (aug.name === "The Blade's Simulacrum") {
    value += 0.7;
  }
  return value;
}

export function estimateAllValue(aug: { value: Record<string, number> }): number {
  // assume this runs after other values have been populated.
  delete aug.value.all;
  return averageValue(aug);
}

export function averageValue(aug: { value?: Record<string, number> }, domains?: string[]): number {
  const augValue = aug.value ?? {};
  if (!domains || domains.length === 0) {
    domains = Object.keys(augValue);
  }
  if (domains.length === 0) {
    return 1.0;
  }
  let total = 1.0;
  for (const domain of domains) {
    total *= augValue[domain] ?? 1;
  }
  return total ** (1 / domains.length);
}

/* -------------------- constants -------------------- */

export const ALL_FACTIONS = [
  'Illuminati',
  'Daedalus',
  'The Covenant',
  'ECorp',
  'MegaCorp',
  'Bachman & Associates',
  'Blade Industries',
  'NWO',
  'Clarke Incorporated',
  'OmniTek Incorporated',
  'Four Sigma',
  'KuaiGong International',
  'Fulcrum Secret Technologies',
  'BitRunners',
  'The Black Hand',
  'NiteSec',
  'CyberSec',
  'Aevum',
  'Chongqing',
  'Ishima',
  'New Tokyo',
  'Sector-12',
  'Volhaven',
  'Speakers for the Dead',
  'The Dark Army',
  'The Syndicate',
  'Silhouette',
  'Tetrads',
  'Slum Snakes',
  'Tian Di Hui',
  'Netburners',
  'Bladeburners',
  'Church of the Machine God',
];

export const ALL_AUGMENTATIONS = [
  'Augmented Targeting I',
  'Augmented Targeting II',
  'Augmented Targeting III',
  'Synthetic Heart',
  'Synfibril Muscle',
  'Combat Rib I',
  'Combat Rib II',
  'Combat Rib III',
  'Nanofiber Weave',
  'NEMEAN Subdermal Weave',
  'Wired Reflexes',
  'Graphene Bone Lacings',
  'Bionic Spine',
  'Graphene Bionic Spine Upgrade',
  'Bionic Legs',
  'Graphene Bionic Legs Upgrade',
  'Speech Processor Implant',
  'TITN-41 Gene-Modification Injection',
  'Enhanced Social Interaction Implant',
  'BitWire',
  'Artificial Bio-neural Network Implant',
  'Artificial Synaptic Potentiation',
  'Enhanced Myelin Sheathing',
  'Synaptic Enhancement Implant',
  'Neural-Retention Enhancement',
  'DataJack',
  'Embedded Netburner Module',
  'Embedded Netburner Module Core Implant',
  'Embedded Netburner Module Core V2 Upgrade',
  'Embedded Netburner Module Core V3 Upgrade',
  'Embedded Netburner Module Analyze Engine',
  'Embedded Netburner Module Direct Memory Access Upgrade',
  'Neuralstimulator',
  'Neural Accelerator',
  'Cranial Signal Processors - Gen I',
  'Cranial Signal Processors - Gen II',
  'Cranial Signal Processors - Gen III',
  'Cranial Signal Processors - Gen IV',
  'Cranial Signal Processors - Gen V',
  'Neuronal Densification',
  'Neuroreceptor Management Implant',
  'Nuoptimal Nootropic Injector Implant',
  'Speech Enhancement',
  'FocusWire',
  'PC Direct-Neural Interface',
  'PC Direct-Neural Interface Optimization Submodule',
  'PC Direct-Neural Interface NeuroNet Injector',
  'PCMatrix',
  'ADR-V1 Pheromone Gene',
  'ADR-V2 Pheromone Gene',
  "The Shadow's Simulacrum",
  'Hacknet Node CPU Architecture Neural-Upload',
  'Hacknet Node Cache Architecture Neural-Upload',
  'Hacknet Node NIC Architecture Neural-Upload',
  'Hacknet Node Kernel Direct-Neural Interface',
  'Hacknet Node Core Direct-Neural Interface',
  'NeuroFlux Governor',
  'Neurotrainer I',
  'Neurotrainer II',
  'Neurotrainer III',
  'HyperSight Corneal Implant',
  'LuminCloaking-V1 Skin Implant',
  'LuminCloaking-V2 Skin Implant',
  'HemoRecirculator',
  'SmartSonar Implant',
  'Power Recirculation Core',
  'QLink',
  'The Red Pill',
  'SPTN-97 Gene Modification',
  'ECorp HVMind Implant',
  'CordiARC Fusion Reactor',
  'SmartJaw',
  'Neotra',
  'Xanipher',
  'nextSENS Gene Modification',
  'OmniTek InfoLoad',
  'Photosynthetic Cells',
  'BitRunners Neurolink',
  'The Black Hand',
  'Unstable Circadian Modulator',
  'CRTX42-AA Gene Modification',
  'Neuregen Gene Modification',
  'CashRoot Starter Kit',
  'NutriGen Implant',
  'INFRARET Enhancement',
  'DermaForce Particle Barrier',
  'Graphene BrachiBlades Upgrade',
  'Graphene Bionic Arms Upgrade',
  'BrachiBlades',
  'Bionic Arms',
  'Social Negotiation Assistant (S.N.A)',
  'Hydroflame Left Arm',
  'EsperTech Bladeburner Eyewear',
  'EMS-4 Recombination',
  'ORION-MKIV Shoulder',
  'Hyperion Plasma Cannon V1',
  'Hyperion Plasma Cannon V2',
  'GOLEM Serum',
  'Vangelis Virus',
  'Vangelis Virus 3.0',
  'I.N.T.E.R.L.I.N.K.E.D',
  "Blade's Runners",
  'BLADE-51b Tesla Armor',
  'BLADE-51b Tesla Armor: Power Cells Upgrade',
  'BLADE-51b Tesla Armor: Energy Shielding Upgrade',
  'BLADE-51b Tesla Armor: Unibeam Upgrade',
  'BLADE-51b Tesla Armor: Omnibeam Upgrade',
  'BLADE-51b Tesla Armor: IPU Upgrade',
  "The Blade's Simulacrum",
  "Stanek's Gift - Genesis",
  "Stanek's Gift - Awakening",
  "Stanek's Gift - Serenity",
];

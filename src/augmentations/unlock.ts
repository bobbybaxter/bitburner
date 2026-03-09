/*

/augmentations/unlock.js (39.1 / / 34.1 GB)

List augmentations that can be unlocked soon, sorted by least reputation required.
Optionally work to unlock them.

Usage:
run /augmentations/unlock.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ] [ --begin ]

*/

import type { NS, PlayerRequirement, Server } from '@ns';
import { canPurchaseFrom } from 'augmentations/buy.js';
import { type AugmentationInfo, averageValue, DOMAINS, getAllAugmentations } from 'augmentations/info.js';
import { Do } from 'helpers/do.js';
import { ALL_CORPORATIONS } from '/constants/all-companies.js';
import { ALL_FACTIONS, ALL_LOCATION_FACTIONS, LOCATION_FACTION_GROUPS } from '/constants/all-factions.js';
import { installBackdoor } from '/helpers/install-backdoor.js';

interface FactionWithRep {
  name: string;
  rep: number;
  repNeeded?: number;
  inviteReqs?: PlayerRequirement[];
}

interface ExtendedPlayer {
  factions: string[];
  skills: { hacking: number; strength: number; [key: string]: number };
  jobs: Partial<Record<string, string>>;
  city: string;
  money: number;
  currentNode?: number;
  sourceFiles?: Array<{ n: number }>;
  augmentations?: string[];
  isWorking?: boolean;
  workType?: string;
}

type GangInfo = { faction: string };

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
  let domains: string[] = Array.isArray(flags._) ? (flags._ as string[]) : [flags._ as string];
  if (domains.length === 0) {
    domains = ['all'];
  }

  if (flags.help) {
    ns.tprint(
      [
        'List augmentations that can be unlocked soon, sorted by least reputation required. Optionally work to unlock them.',
        '',
        'Usage: ',
        `> ${ns.getScriptName()} [ ${Object.keys(DOMAINS).join(' | ')} ... ] [ --begin ]`,
        '',
        'Example: List all augmentations that increase combat or crime stats.',
        `> run ${ns.getScriptName()} combat crime`,
        '',
        'Example: Work for all factions that will unlock hacking augmentations.',
        `> run ${ns.getScriptName()} hacking --begin`,
        ' ',
      ].join('\n'),
    );
    return;
  }

  const futureAugs = await getFutureAugs(ns, { domains });

  // REVIEW: may need to abstract this summary logic, so i can reuse it when an aug is purchased
  const summary = [`Augmentation Unlocking Plan: ${domains?.join(', ') ?? 'all'}`];
  for (const aug of futureAugs) {
    const faction = aug.neededFactions[0];
    if (!faction) continue;
    const rep = `\t ${ns.formatNumber(faction.repNeeded ?? 0, 3)}`;
    const value = averageValue(aug as { value?: Record<string, number> }, domains).toFixed(2);
    summary.push(`${rep} more rep - ${faction.name} for '${aug.name}' (${value}x)`);
  }
  ns.tprint(summary.join('\n'), '\n');

  if (flags.begin) {
    await unlockAugs(ns, domains);
  } else {
    // ns.tail();
  }
}

export async function unlockAugs(ns: NS, domains: string[]): Promise<void> {
  let joinableAugs = await getFutureAugs(ns, { domains });

  // while (joinableAugs.length > 0) {
  for (let i = 0; i < 5; i++) {
    // TODO: may need to put some logic in here to prestige (apply augs) when a certain condition is met, like time passing since an aug was purchased
    let futureAugs = await getFutureAugs(ns, { domains, requireWorkable: true });

    while (futureAugs.length > 0) {
      const aug = futureAugs[0];
      const faction = aug.workableFaction;
      const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;
      if (player.isWorking && player.workType !== 'Working for Faction') {
        ns.tprint(`Not starting faction work because player is already ${player.workType}.`);
        console.log(`Not starting faction work because player is already ${player.workType}.`);
        return;
      }
      for (const workType of getWorkTypes(player)) {
        if (faction && (await Do(ns, 'ns.singularity.workForFaction', faction.name, workType, false))) {
          console.log(`Started working for ${faction.name} as ${workType}.`);
          break;
        }
      }

      console.log('Waiting for player to finish work.');
      await ns.sleep(60 * 1000);
      if (!player.isWorking) {
        console.log('Player is not working anymore.');
        // Support manually exiting the process.
        return;
      } else {
        console.log('WORKING');
      }
      futureAugs = await getFutureAugs(ns, { domains, requireWorkable: true });
    }

    joinableAugs = await getFutureAugs(ns, { domains });
    if (joinableAugs.length === 0) break;
    const nextAug = joinableAugs[0];
    const joinableFaction = nextAug.joinableFaction;
    if (!joinableFaction) break;

    const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;
    const currentlyInFaction = player.factions.includes(joinableFaction.name);
    if (!currentlyInFaction) {
      console.log(`Taking action to join faction: ${joinableFaction.name}`);
      console.log('nextAug.joinableFaction :>> ', joinableFaction);
      await takeActionToJoinFaction(ns, joinableFaction);
    } else {
      console.log(`Already in faction: ${joinableFaction.name}`);
    }

    continue;
  }
}

interface HacknetTotals {
  totalLevels: number;
  totalRAM: number;
  totalCores: number;
}

async function getHacknetTotals(ns: NS): Promise<HacknetTotals> {
  const numNodes = (await Do(ns, 'ns.hacknet.numNodes')) as number;
  let totalLevels = 0;
  let totalRAM = 0;
  let totalCores = 0;
  for (let i = 0; i < numNodes; i++) {
    const stats = (await Do(ns, 'ns.hacknet.getNodeStats', i)) as { level: number; ram: number; cores: number };
    totalLevels += stats.level;
    totalRAM += stats.ram;
    totalCores += stats.cores;
  }
  return { totalLevels, totalRAM, totalCores };
}

export async function getUnmetRequirements(
  ns: NS,
  faction: FactionWithRep & { name: string; inviteReqs: PlayerRequirement[] },
): Promise<PlayerRequirement[]> {
  const unmetRequirements: PlayerRequirement[] = [];

  const handledTypes = new Set([
    'backdoorInstalled',
    'money',
    'city',
    'skills',
    'someCondition',
    'hacknetLevels',
    'hacknetRAM',
    'hacknetCores',
  ]);

  for (const req of faction.inviteReqs) {
    if (!handledTypes.has(req.type)) {
      unmetRequirements.push(req);
      continue;
    }

    if (req.type === 'hacknetLevels' || req.type === 'hacknetRAM' || req.type === 'hacknetCores') {
      const totals = await getHacknetTotals(ns);
      const statMap: Record<string, { current: number; required: number }> = {
        hacknetLevels: {
          current: totals.totalLevels,
          required: (req as PlayerRequirement & { hacknetLevels: number }).hacknetLevels,
        },
        hacknetRAM: {
          current: totals.totalRAM,
          required: (req as PlayerRequirement & { hacknetRAM: number }).hacknetRAM,
        },
        hacknetCores: {
          current: totals.totalCores,
          required: (req as PlayerRequirement & { hacknetCores: number }).hacknetCores,
        },
      };
      const { current, required } = statMap[req.type];
      if (current < required) {
        unmetRequirements.push(req);
      }
    }

    if (req.type === 'backdoorInstalled') {
      const server = (await Do(ns, 'ns.getServer', req.server)) as Server;
      if (!server.backdoorInstalled) {
        unmetRequirements.push(req);
      }
    }

    if (req.type === 'money') {
      const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;
      const required = (req as PlayerRequirement & { money: number }).money;
      if (player.money < required) {
        unmetRequirements.push(req);
      }
    }

    if (req.type === 'city') {
      const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;
      const city = (req as PlayerRequirement & { city: string }).city;
      if (player.city !== city) {
        unmetRequirements.push(req);
      }
    }

    if (req.type === 'skills') {
      const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;
      const skillReq = (req as PlayerRequirement & { skills: Record<string, number> }).skills;
      const meetsAll = skillReq
        ? Object.keys(skillReq).every((skill) => player.skills[skill] >= skillReq[skill])
        : true;
      if (!meetsAll) {
        unmetRequirements.push(req);
      }
    }

    if (req.type === 'someCondition') {
      // NOTE: this solution could be improved by handling any type of someCondition that could be added in the future, but for now it's just handling the cases we know
      const conditionTypes = req.conditions.map((condition: PlayerRequirement) => condition.type);
      const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;

      if (conditionTypes.includes('city')) {
        const cities = req.conditions.map((condition: PlayerRequirement & { city?: string }) => condition.city);
        if (!cities.includes(player.city)) {
          unmetRequirements.push(req.conditions[0]);
        }
      }

      if (conditionTypes.includes('skills')) {
        const meetsReq = req.conditions.some((condition: PlayerRequirement) => {
          const skillReq = (condition as PlayerRequirement & { skills?: Record<string, number> }).skills;
          return skillReq
            ? Object.keys(skillReq).every((skill) => {
                return player.skills[skill] >= skillReq[skill];
              })
            : false;
        });

        if (!meetsReq) {
          const skillDiffs: { biggestDiff: number; condition: PlayerRequirement }[] = [];
          /*
            {
              biggestDiff: 100,
              skills: {
                strength: {
                  req: 200,
                  current: 100,
                },
                defense: {
                  req: 200,
                  current: 300,
                },
                dexterity: {
                  req: 150,
                  current: 150,
                },
                agility: {
                  req: 150,
                  current: 100,
                }
              }
            }
          */

          for (const condition of req.conditions) {
            const skillCondition = condition as PlayerRequirement & { skills?: Record<string, number> };
            const skills = skillCondition.skills ?? {};
            const skillDiff = Object.keys(skills).reduce((diff, skill) => {
              const current = player.skills[skill];
              const reqVal = skills[skill];
              const deficit = Math.max(0, reqVal - current);
              return Math.max(diff, deficit);
            }, 0);

            skillDiffs.push({ biggestDiff: skillDiff, condition });
          }

          skillDiffs.sort((a, b) => {
            return a.biggestDiff - b.biggestDiff;
          });

          unmetRequirements.push(skillDiffs[0].condition);
        }
      }

      if (conditionTypes.includes('jobTitle')) {
        const jobTitles = req.conditions.map(
          (condition: PlayerRequirement & { jobTitle?: string }) => condition.jobTitle,
        );
        const currentJobTitles = Object.values(player.jobs ?? {}).filter(Boolean) as string[];
        const meetsReq = jobTitles.some((jobTitle: string | undefined) =>
          jobTitle ? currentJobTitles.includes(jobTitle) : false,
        );

        // find which jobTitle condition is closest to the player's job title
        if (!meetsReq) {
          // get company with the highest reputation
          const corps = await Promise.all(
            ALL_CORPORATIONS.map(async (name) => {
              const rep = (await Do(ns, 'ns.getCompanyRep', name)) as number;
              return { name, rep };
            }),
          );
          corps.sort((a, b) => b.rep - a.rep);
        }
      }
      /*
      someCondition: at least one of the conditions must be met, so we'll need to choose the best one
       - cases:
         - city: just pick the first one
         - skills: will need to pick the closest one
         - jobTitle: will try to pick a company where the player is already working and has a higher reputation or job title
    */
    }
  }

  // TODO: after unmetRequirements are compiled, sort them by the best way to fulfill them
  //  for example, city should be last since it doesn't make sense to move to a city if the other requirements aren't filled
  //  on the other hand, this could possibly be handled in fulfillUnmetRequirements()

  return unmetRequirements;
}

async function fulfillUnmetRequirements(ns: NS, reqs: PlayerRequirement[]): Promise<void> {
  const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;

  for (const req of reqs) {
    if (req.type === 'backdoorInstalled') {
      const server = (await Do(ns, 'ns.getServer', req.server)) as Server;
      const requiredHacking = server.requiredHackingSkill ?? 0;
      if (requiredHacking > player.skills.hacking) {
        ns.tprint(`Can't backdoor ${req.server}: need ${requiredHacking} hacking (have ${player.skills.hacking}).`);
      } else {
        const result = await installBackdoor(ns, req.server as string);
        if (result !== null) {
          ns.tprint(`Backdoor installed on ${req.server}`);
        }
      }
    }

    if (req.type === 'city') {
      const city = (req as PlayerRequirement & { city: string }).city;
      if (player.city !== city) {
        const traveled = await Do(ns, 'ns.singularity.travelToCity', city);
        if (traveled) {
          ns.tprint(`Traveled to ${city}`);
        } else {
          ns.tprint(`Failed to travel to ${city} (need $200k).`);
        }
      }
    }

    if (req.type === 'money') {
      const required = (req as PlayerRequirement & { money: number }).money;
      ns.tprint(`Need ${ns.formatNumber(required)} money (have ${ns.formatNumber(player.money)}).`);
    }

    if (req.type === 'skills') {
      const skillReq = (req as PlayerRequirement & { skills: Record<string, number> }).skills;
      if (skillReq) {
        const deficits = Object.entries(skillReq)
          .filter(([skill, required]) => player.skills[skill] < required)
          .map(([skill, required]) => `${skill}: ${player.skills[skill]}/${required}`);
        if (deficits.length > 0) {
          ns.tprint(`Skills needed: ${deficits.join(', ')}`);
        }
      }
    }

    if (req.type === 'hacknetLevels' || req.type === 'hacknetRAM' || req.type === 'hacknetCores') {
      await fulfillHacknetRequirement(ns, req);
    }

    const handledTypes = new Set([
      'backdoorInstalled',
      'money',
      'city',
      'skills',
      'hacknetLevels',
      'hacknetRAM',
      'hacknetCores',
    ]);
    if (!handledTypes.has(req.type)) {
      ns.tprint(`Unhandled requirement for ${req.type}: ${JSON.stringify(req)}`);
    }
  }
}

async function fulfillHacknetRequirement(ns: NS, req: PlayerRequirement): Promise<void> {
  const typeToStat: Record<string, { key: keyof HacknetTotals; upgradeFn: string; costFn: string }> = {
    hacknetLevels: {
      key: 'totalLevels',
      upgradeFn: 'ns.hacknet.upgradeLevel',
      costFn: 'ns.hacknet.getLevelUpgradeCost',
    },
    hacknetRAM: {
      key: 'totalRAM',
      upgradeFn: 'ns.hacknet.upgradeRam',
      costFn: 'ns.hacknet.getRamUpgradeCost',
    },
    hacknetCores: {
      key: 'totalCores',
      upgradeFn: 'ns.hacknet.upgradeCore',
      costFn: 'ns.hacknet.getCoreUpgradeCost',
    },
  };

  const config = typeToStat[req.type];
  if (!config) return;

  const required = (req as PlayerRequirement & Record<string, number>)[req.type] as number;

  let numNodes = (await Do(ns, 'ns.hacknet.numNodes')) as number;
  if (numNodes === 0) {
    const newIndex = (await Do(ns, 'ns.hacknet.purchaseNode')) as number;
    if (newIndex === -1) {
      ns.tprint(`Can't afford a hacknet node to meet ${req.type} >= ${required}.`);
      return;
    }
    ns.tprint(`Purchased hacknet node #${newIndex}.`);
    numNodes = 1;
  }

  let totals = await getHacknetTotals(ns);
  while (totals[config.key] < required) {
    let cheapestCost = Infinity;
    let cheapestNode = -1;

    for (let i = 0; i < numNodes; i++) {
      const cost = (await Do(ns, config.costFn, i, 1)) as number;
      if (cost < cheapestCost) {
        cheapestCost = cost;
        cheapestNode = i;
      }
    }

    const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;
    if (cheapestNode === -1 || cheapestCost > player.money) {
      ns.tprint(
        `Can't afford hacknet upgrade for ${req.type}: need ${ns.formatNumber(cheapestCost)} (have ${ns.formatNumber(player.money)}). Current: ${totals[config.key]}/${required}.`,
      );
      return;
    }

    const success = await Do(ns, config.upgradeFn, cheapestNode, 1);
    if (!success) {
      ns.tprint(`Failed to upgrade hacknet node #${cheapestNode} for ${req.type}.`);
      return;
    }

    totals = await getHacknetTotals(ns);
  }

  ns.tprint(`Hacknet requirement met: ${req.type} = ${totals[config.key]}/${required}.`);
}

export async function takeActionToJoinFaction(
  ns: NS,
  faction: FactionWithRep & { name: string; inviteReqs?: PlayerRequirement[] },
): Promise<void> {
  const factionWithReqs: FactionWithRep & { name: string; inviteReqs: PlayerRequirement[] } =
    faction.inviteReqs !== undefined
      ? (faction as FactionWithRep & { name: string; inviteReqs: PlayerRequirement[] })
      : {
          ...faction,
          inviteReqs: (await Do(
            ns,
            'ns.singularity.getFactionInviteRequirements',
            faction.name,
          )) as PlayerRequirement[],
        };
  let unmetRequirements = await getUnmetRequirements(ns, factionWithReqs);

  if (unmetRequirements.length > 0) {
    await fulfillUnmetRequirements(ns, unmetRequirements);
    unmetRequirements = await getUnmetRequirements(ns, factionWithReqs);
  }

  if (unmetRequirements.length === 0) {
    ns.tprint(`Joining faction: ${faction.name}`);
    await Do(ns, 'ns.singularity.joinFaction', faction.name);
  }
}

interface FutureAug {
  name: string;
  canAccess?: boolean;
  canPurchaseFrom?: unknown;
  neededFactions: FactionWithRep[];
  workableFaction?: FactionWithRep | null;
  joinableFaction?: FactionWithRep | null;
  sortKey?: number;
  factions: FactionWithRep[];
  repReq: number;
  value?: Record<string, number>;
}

export async function getFutureAugs(
  ns: NS,
  { domains, requireWorkable = false }: { domains?: string[]; requireWorkable?: boolean } = {},
): Promise<FutureAug[]> {
  const allAugs = Object.values(await getAllAugmentations(ns));
  const factionOrderMap: Record<string, number> = ALL_FACTIONS.reduce((map: Record<string, number>, faction, index) => {
    map[faction] = index;
    return map;
  }, {});
  const player = (await Do(ns, 'ns.getPlayer')) as ExtendedPlayer;
  player.augmentations = (await Do(ns, 'ns.singularity.getOwnedAugmentations', true)) as string[];

  const resetInfo = (await Do(ns, 'ns.getResetInfo')) as { currentNode: number };
  player.currentNode = resetInfo.currentNode;
  player.sourceFiles = (await Do(ns, 'ns.singularity.getOwnedSourceFiles')) as Array<{ n: number }>;

  type AugWithUnlock = AugmentationInfo & {
    canPurchaseFrom?: unknown;
    neededFactions: FactionWithRep[];
    workableFaction?: FactionWithRep | null;
    joinableFaction?: FactionWithRep | null;
    sortKey?: number;
  };
  const futureAugs = await Promise.all(
    allAugs.map(async (aug): Promise<AugWithUnlock> => {
      const augExt = aug as AugWithUnlock;
      augExt.canPurchaseFrom = await canPurchaseFrom(ns, aug);
      augExt.neededFactions = factionsToWork(
        aug as { canPurchaseFrom?: unknown; factions?: FactionWithRep[]; repReq?: number },
        factionOrderMap,
      );

      const { workableFaction, joinableFaction } = await findBestFactionToWorkFor(ns, augExt.neededFactions, player);
      augExt.workableFaction = workableFaction;
      augExt.joinableFaction = joinableFaction;

      return augExt;
    }),
  );

  const filteredFutureAugs = futureAugs
    .filter((aug) => {
      return (
        aug.canAccess &&
        (!requireWorkable || aug.workableFaction) &&
        !player.augmentations?.includes(aug.name) &&
        aug.neededFactions.length > 0 &&
        averageValue(aug, domains ?? []) > 1.0
      );
    })
    .map((aug) => {
      aug.sortKey = averageValue(aug, domains ?? []) / (aug.neededFactions[0].repNeeded ?? 1);
      return aug;
    })
    .sort((a, b) => {
      return (b.sortKey ?? 0) - (a.sortKey ?? 0);
    })
    .sort((a, b) => {
      return (factionOrderMap[a.neededFactions[0]?.name] ?? 0) - (factionOrderMap[b.neededFactions[0]?.name] ?? 0);
    });

  return filteredFutureAugs as FutureAug[];
}

export function factionsToWork(
  aug: { canPurchaseFrom?: unknown; factions?: FactionWithRep[]; repReq?: number },
  factionOrderMap: Record<string, number>,
): FactionWithRep[] {
  if (aug.canPurchaseFrom || !aug.factions) return [];

  const neededFactions = aug.factions
    .map((faction: FactionWithRep) => ({
      ...faction,
      repNeeded: (aug.repReq ?? 0) - faction.rep,
    }))
    .filter((faction: FactionWithRep) => {
      return (faction.repNeeded ?? 0) > 0;
    })
    .sort((a: FactionWithRep, b: FactionWithRep) => {
      return (a.repNeeded ?? 0) - (b.repNeeded ?? 0);
    })
    .sort((a: FactionWithRep, b: FactionWithRep) => {
      return (factionOrderMap[a.name] ?? 0) - (factionOrderMap[b.name] ?? 0);
    });

  return neededFactions;
}

export async function findBestFactionToWorkFor(
  ns: NS,
  factions: FactionWithRep[],
  player: ExtendedPlayer,
): Promise<{ workableFaction: FactionWithRep | null; joinableFaction: FactionWithRep | null }> {
  // if already in a faction, return the first one
  const playerFactions = player.factions;
  const alreadyJoinedFaction = factions.find((faction) => playerFactions.includes(faction.name));
  if (alreadyJoinedFaction) return { workableFaction: alreadyJoinedFaction, joinableFaction: null };

  // if it is not a special faction, return the first one that the player is in
  const specialFactions: string[] = ['Church of the Machine God', 'Bladeburners'];
  if (await Do(ns, 'ns.gang.inGang')) {
    const gangInfo = (await Do(ns, 'ns.gang.getGangInformation')) as GangInfo;
    specialFactions.push(gangInfo.faction);
  }
  const nonSpecialFactions = factions.filter((faction) => !specialFactions.includes(faction.name));
  const workableFaction = nonSpecialFactions.find((faction) => player.factions.includes(faction.name)) || null;

  // add inviteReqs to factions
  const playerLocationFactionGroup = getPlayerLocationFactionGroup(player);
  const factionsWithInviteReqs = await Promise.all(
    factions.map(async (faction) => {
      faction.inviteReqs = (await Do(
        ns,
        'ns.singularity.getFactionInviteRequirements',
        faction.name,
      )) as PlayerRequirement[];
      return faction;
    }),
  );

  function extractCriticalRequirements(
    requirements: PlayerRequirement[],
    criticalRequirements: PlayerRequirement[] = [],
  ): PlayerRequirement[] {
    for (const requirement of requirements) {
      switch (requirement.type) {
        case 'bitNodeN':
        case 'sourceFile':
          criticalRequirements.push(requirement);
          break;
        case 'not':
          extractCriticalRequirements(
            [(requirement as PlayerRequirement & { condition: PlayerRequirement }).condition],
            criticalRequirements,
          );
          break;
        case 'someCondition':
        case 'everyCondition':
          extractCriticalRequirements(
            (requirement as PlayerRequirement & { conditions: PlayerRequirement[] }).conditions,
            criticalRequirements,
          );
          break;
      }
    }
    return criticalRequirements;
  }

  function evaluateCriticalRequirements(requirements: PlayerRequirement[]): boolean {
    return requirements.every((requirement: PlayerRequirement) => {
      switch (requirement.type) {
        case 'bitNodeN':
          return player.currentNode === (requirement as PlayerRequirement & { bitNodeN: number }).bitNodeN;
        case 'sourceFile':
          return (
            player.sourceFiles?.some(
              (sf: { n: number }) => sf.n === (requirement as PlayerRequirement & { sourceFile: number }).sourceFile,
            ) ?? false
          );
        default:
          return true;
      }
    });
  }

  // filter out factions the player can't join
  const joinableFactions = factionsWithInviteReqs
    .filter((faction) => {
      const criticalRequirements = extractCriticalRequirements(faction.inviteReqs ?? []);
      return evaluateCriticalRequirements(criticalRequirements);
    })
    .filter((faction) => {
      const isFactionALocation = ALL_LOCATION_FACTIONS.includes(faction.name);
      if (!isFactionALocation) {
        return true;
      } else if (
        isFactionALocation &&
        playerLocationFactionGroup?.length > 0 &&
        playerLocationFactionGroup?.some((group) => group.includes(faction.name))
      ) {
        return true;
      } else {
        return false;
      }
    });

  const joinableFaction = joinableFactions?.length > 0 ? joinableFactions[0] : null;

  return { workableFaction, joinableFaction };
}

export function getWorkTypes(player: ExtendedPlayer): string[] {
  if (player.skills.hacking > player.skills.strength) {
    return ['hacking contracts', 'field work', 'security'];
  } else {
    return ['field work', 'security', 'hacking contracts'];
  }
}

/**
 * Returns the faction location group that the player is currently in
 */
export function getPlayerLocationFactionGroup(player: ExtendedPlayer): string[][] {
  const currentFactions = player.factions;
  return LOCATION_FACTION_GROUPS.filter((factions) => {
    return factions.some((faction) => currentFactions.includes(faction));
  });
}

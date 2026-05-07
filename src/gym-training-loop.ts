import type { NS } from '@ns';

/**
 * Rotates training so every stat gets the same time per full cycle:
 * Powerhouse Gym: str → def → dex → agi, then ZB Institute: Algorithms (hacking), Leadership (charisma).
 *
 * Requires singularity (Source-File 4). Sufficient money for gym fees and tuition each step.
 *
 * Usage: run balanced-gym-zb-training.js [secondsPerStep]
 * Default: 120 seconds per activity before switching to the next.
 */
const POWERHOUSE = 'Powerhouse Gym';
const ZB = 'ZB Institute of Technology';
const SECTOR12 = 'Sector-12';
const VOLHAVEN = 'Volhaven';

/** All gym workout types at Powerhouse, in a fixed order. */
const GYM_STATS = ['strength', 'defense', 'dexterity', 'agility'] as const;

/** Best hacking and charisma classes at ZB Institute of Technology (Volhaven). */
const ZB_HACK = 'Algorithms';
const ZB_CHARISMA = 'Leadership';

type TrainingStep =
  | { kind: 'gym'; stat: (typeof GYM_STATS)[number] }
  | { kind: 'uni'; course: typeof ZB_HACK | typeof ZB_CHARISMA };

function buildCycle(): TrainingStep[] {
  const steps: TrainingStep[] = [];
  for (const stat of GYM_STATS) {
    steps.push({ kind: 'gym', stat });
  }
  steps.push({ kind: 'uni', course: ZB_HACK });
  steps.push({ kind: 'uni', course: ZB_CHARISMA });
  return steps;
}

const CYCLE = buildCycle();

function ensureCity(ns: NS, city: typeof SECTOR12 | typeof VOLHAVEN): boolean {
  if (ns.getPlayer().city === city) {
    return true;
  }
  if (ns.singularity.travelToCity(city)) {
    return true;
  }
  ns.tprint(`ERROR: Could not travel to ${city} (need $ for travel?).`);
  return false;
}

function startStep(ns: NS, step: TrainingStep, focus: boolean): boolean {
  if (step.kind === 'gym') {
    return ns.singularity.gymWorkout(POWERHOUSE, step.stat, focus);
  }
  return ns.singularity.universityCourse(ZB, step.course, focus);
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog('sleep');
  ns.clearLog();

  const raw = ns.args[0];
  const stepSec = typeof raw === 'number' && raw > 0 ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  const secondsPerStep = Number.isFinite(stepSec) && stepSec > 0 ? stepSec : 120;
  const stepMs = Math.floor(secondsPerStep * 1000);

  /** Full focus for maximum exp rate on this dedicated trainer. */
  const focus = true;

  ns.tprint(
    `Balanced training: ${CYCLE.length} steps × ${secondsPerStep}s — ` +
      `Powerhouse [${GYM_STATS.join(', ')}], ZB [${ZB_HACK}, ${ZB_CHARISMA}]. Ctrl+C to stop.`,
  );

  let i = 0;
  while (true) {
    const step = CYCLE[i % CYCLE.length];
    const label = step.kind === 'gym' ? `Gym ${step.stat.toUpperCase()}` : `ZB ${step.course}`;

    const city = step.kind === 'gym' ? SECTOR12 : VOLHAVEN;
    if (!ensureCity(ns, city)) {
      await ns.sleep(30_000);
      continue;
    }

    if (!startStep(ns, step, focus)) {
      ns.tprint(`ERROR: Failed to start ${label} (money for fees/tuition?). Retrying in 30s.`);
      await ns.sleep(30_000);
      continue;
    }

    const p = ns.getPlayer();
    ns.print(
      `${label} | ` +
        `str ${p.skills.strength.toFixed(0)} def ${p.skills.defense.toFixed(0)} ` +
        `dex ${p.skills.dexterity.toFixed(0)} agi ${p.skills.agility.toFixed(0)} | ` +
        `hack ${p.skills.hacking.toFixed(0)} cha ${p.skills.charisma.toFixed(0)}`,
    );

    await ns.sleep(stepMs);
    i++;
  }
}

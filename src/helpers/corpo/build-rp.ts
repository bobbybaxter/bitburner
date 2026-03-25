import { CityName, CorpEmployeePosition, Division, NS, Office } from '@ns';
import { Do } from '../do';

/** Target role counts when RP threshold is met. Omit Unassigned. */
export type FinalRoles = Partial<Record<Exclude<CorpEmployeePosition, 'Unassigned'>, number>>;

const ALL_JOBS: CorpEmployeePosition[] = [
  'Intern',
  'Operations',
  'Engineer',
  'Business',
  'Management',
  'Research & Development',
];

/**
 * Sets all employees in a city to R&D until the division's research points
 * reach rpThreshold, then assigns them to finalRoles.
 *
 * - If more employees than slots in finalRoles: extra employees stay in R&D.
 * - If fewer employees than slots: assigns as many as possible in finalRoles order.
 */
export async function buildRp({
  ns,
  divName,
  city,
  rpThreshold,
  finalRoles,
}: {
  ns: NS;
  divName: string;
  city: CityName;
  rpThreshold: number;
  finalRoles: FinalRoles;
}): Promise<void> {
  const allJobs = [...ALL_JOBS];
  const cityTyped = city as CityName;

  // Set all employees to R&D
  for (const job of allJobs) {
    ns.corporation.setAutoJobAssignment(divName, cityTyped, job, 0);
  }
  const office = (await Do(ns, 'ns.corporation.getOffice', divName, cityTyped)) as Office;
  const numEmployees = office.numEmployees;
  await Do(ns, 'ns.corporation.setAutoJobAssignment', divName, cityTyped, 'Research & Development', numEmployees);
  await ns.corporation.nextUpdate();

  // Wait until division RP reaches threshold
  while (true) {
    const division = (await Do(ns, 'ns.corporation.getDivision', divName)) as Division;
    if (division.researchPoints >= rpThreshold) break;
    await ns.corporation.nextUpdate();
  }

  ns.tprint(`Division ${divName} reached RP threshold ${rpThreshold} in ${city}. Assigning final roles.`);

  // Clear all jobs so employees are unassigned, then assign final roles
  for (const job of allJobs) {
    ns.corporation.setAutoJobAssignment(divName, cityTyped, job, 0);
  }
  await ns.corporation.nextUpdate();

  // Distribute employees: if fewer than total slots, fill in order; if more, extra stay in R&D
  let remaining = numEmployees;
  for (const [role, count] of Object.entries(finalRoles)) {
    const n = typeof count === 'number' && count > 0 ? count : 0;
    const toAssign = Math.min(n, remaining);
    if (toAssign > 0) {
      await Do(ns, 'ns.corporation.setAutoJobAssignment', divName, cityTyped, role, toAssign);
      remaining -= toAssign;
    }
    if (remaining <= 0) break;
  }

  // Any leftover employees stay in R&D
  if (remaining > 0) {
    await Do(ns, 'ns.corporation.setAutoJobAssignment', divName, cityTyped, 'Research & Development', remaining);
  }

  await ns.corporation.nextUpdate();
}

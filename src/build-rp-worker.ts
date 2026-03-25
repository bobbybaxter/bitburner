import type { CityName, NS } from '@ns';
import { buildRp, type FinalRoles } from './helpers/corpo/build-rp';

/** Worker: sets employees to R&D until rpThreshold, then assigns finalRoles. Runs independently. */
export async function main(ns: NS): Promise<void> {
  const [divName, city, rpThreshold, finalRolesJson] = ns.args as [string, string, number, string];

  if (
    typeof divName !== 'string' ||
    typeof city !== 'string' ||
    typeof rpThreshold !== 'number' ||
    typeof finalRolesJson !== 'string'
  ) {
    ns.tprint('build-rp-worker: invalid args. Expected (divName, city, rpThreshold, finalRolesJson)');
    return;
  }

  let finalRoles: FinalRoles;
  try {
    finalRoles = JSON.parse(finalRolesJson) as FinalRoles;
  } catch {
    ns.tprint('build-rp-worker: invalid finalRoles JSON');
    return;
  }

  await buildRp({ ns, divName, city: city as CityName, rpThreshold, finalRoles });
}

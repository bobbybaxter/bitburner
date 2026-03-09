import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';
import { getActiveSourceFiles_Custom } from './get-active-source-files-custom';
import type { FnGetNsDataThroughFile } from './types';

/** @param {NS} ns
 * tryGetBitNodeMultipliers Helper that allows the user to pass in their chosen implementation of getNsDataThroughFile to minimize RAM usage **/
export async function tryGetBitNodeMultipliers_Custom(
  ns: NS,
  fnGetNsDataThroughFile: FnGetNsDataThroughFile,
): Promise<unknown> {
  checkNsInstance(ns, '"tryGetBitNodeMultipliers"');
  let canGetBitNodeMultipliers = false;
  try {
    canGetBitNodeMultipliers = 5 in (await getActiveSourceFiles_Custom(ns, fnGetNsDataThroughFile));
  } catch {
    /* expected when source files unavailable */
  }
  if (!canGetBitNodeMultipliers) return null;
  try {
    return await fnGetNsDataThroughFile(ns, 'ns.getBitNodeMultipliers()', '/Temp/bitnode-multipliers.txt');
  } catch {
    /* expected when bitnode multipliers unavailable */
  }
  return null;
}

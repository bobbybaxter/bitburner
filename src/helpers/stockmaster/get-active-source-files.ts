import type { NS } from '@ns';
import { getActiveSourceFiles_Custom } from './get-active-source-files-custom';
import { getNsDataThroughFile } from './get-ns-data-through-file';

/** @param {NS} ns
 * Get a dictionary of active source files, taking into account the current active bitnode as well (optionally disabled). **/
export async function getActiveSourceFiles(
  ns: NS,
  includeLevelsFromCurrentBitnode = true,
): Promise<Record<number, number>> {
  return await getActiveSourceFiles_Custom(ns, getNsDataThroughFile, includeLevelsFromCurrentBitnode);
}

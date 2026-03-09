import type { NS } from '@ns';
import { getNsDataThroughFile } from './get-ns-data-through-file';
import { tryGetBitNodeMultipliers_Custom } from './try-get-bit-node-multipliers-custom';

/** @param {NS} ns
 * Return bitnode multiplers, or null if they cannot be accessed. **/
export async function tryGetBitNodeMultipliers(ns: NS): Promise<unknown> {
  return await tryGetBitNodeMultipliers_Custom(ns, getNsDataThroughFile);
}

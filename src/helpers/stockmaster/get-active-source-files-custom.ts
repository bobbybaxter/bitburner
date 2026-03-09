import type { NS } from '@ns';
import { Do } from '/helpers/do.js';
import { checkNsInstance } from './check-ns-instance';
import type { FnGetNsDataThroughFile } from './types';

/** @param {NS} ns
 * @param {(ns: NS, command: string, fName?: string, args?: any, verbose?: any, maxRetries?: number, retryDelayMs?: number) => Promise<any>} fnGetNsDataThroughFile
 * getActiveSourceFiles Helper that allows the user to pass in their chosen implementation of getNsDataThroughFile to minimize RAM usage **/
export async function getActiveSourceFiles_Custom(
  ns: NS,
  fnGetNsDataThroughFile: FnGetNsDataThroughFile,
  includeLevelsFromCurrentBitnode = true,
): Promise<Record<number, number>> {
  checkNsInstance(ns, '"getActiveSourceFiles"');
  // Find out what source files the user has unlocked
  let dictSourceFiles: Record<number, number>;
  try {
    dictSourceFiles = (await fnGetNsDataThroughFile(
      ns,
      `Object.fromEntries(await Do(ns, 'ns.singularity.getOwnedSourceFiles').map(sf => [sf.n, sf.lvl]))`,
      '/Temp/owned-source-files.txt',
    )) as Record<number, number>;
  } catch {
    dictSourceFiles = {};
  } // If this fails (e.g. low RAM), return an empty dictionary
  // If the user is currently in a given bitnode, they will have its features unlocked
  if (includeLevelsFromCurrentBitnode) {
    try {
      const resetInfo = (await Do(ns, 'ns.getResetInfo')) as { currentNode: number };
      const bitNodeN = resetInfo.currentNode;
      // const bitNodeN = (await fnGetNsDataThroughFile(ns, 'ns.getPlayer()', '/Temp/player-info.txt')).bitNodeN;
      dictSourceFiles[bitNodeN] = Math.max(3, dictSourceFiles[bitNodeN] || 0);
    } catch {
      /* We are expected to be fault-tolerant in low-ram conditions */
    }
  }
  return dictSourceFiles;
}

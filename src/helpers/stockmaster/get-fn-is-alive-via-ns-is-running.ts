import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';

/** @param {NS} ns
 *  Use where a function is required to run a script and you have already referenced ns.run in your script  */
export function getFnIsAliveViaNsIsRunning(ns: NS): (pid: number) => boolean {
  return checkNsInstance(ns, '"getFnIsAliveViaNsIsRunning"').isRunning;
}

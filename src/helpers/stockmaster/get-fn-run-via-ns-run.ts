import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';

/** @param {NS} ns
 *  Use where a function is required to run a script and you have already referenced ns.run in your script **/
export function getFnRunViaNsRun(ns: NS): (script: string, threadOrOptions?: number, ...args: unknown[]) => number {
  return checkNsInstance(ns, '"getFnRunViaNsRun"').run as (
    script: string,
    threadOrOptions?: number,
    ...args: unknown[]
  ) => number;
}

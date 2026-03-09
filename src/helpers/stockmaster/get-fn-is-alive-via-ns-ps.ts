import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';

/** @param {NS} ns
 *  Use where a function is required to run a script and you have already referenced ns.ps in your script  */
export function getFnIsAliveViaNsPs(ns: NS) {
  checkNsInstance(ns, '"getFnIsAliveViaNsPs"');
  return function (pid: number, host: string) {
    return ns.ps(host).some((p) => p.pid === pid);
  };
}

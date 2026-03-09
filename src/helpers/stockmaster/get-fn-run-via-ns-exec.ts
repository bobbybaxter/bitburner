import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';

/** @param {NS} ns
 *  Use where a function is required to run a script and you have already referenced ns.exec in your script **/
export function getFnRunViaNsExec(ns: NS, host = 'home') {
  checkNsInstance(ns, '"getFnRunViaNsExec"');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args passed through to ns.exec
  return function (scriptPath: string, ...args: any[]) {
    return ns.exec(scriptPath, host, ...args);
  };
}

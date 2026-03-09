import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';
import { getNsDataThroughFile } from './get-ns-data-through-file';
import { log } from './log';

/** @param {NS} ns
 * Returns the number of instances of the current script running on the specified host. */
export async function instanceCount(ns: NS, onHost = 'home', warn = true, tailOtherInstances = true): Promise<number> {
  checkNsInstance(ns, '"alreadyRunning"');
  const scriptName = ns.getScriptName();
  const others = (await getNsDataThroughFile(
    ns,
    'ns.ps(ns.args[0]).filter(p => p.filename == ns.args[1]).map(p => p.pid)',
    '/Temp/ps-other-instances.txt',
    [onHost, scriptName],
  )) as number[];
  if (others.length >= 2) {
    if (warn)
      log(
        ns,
        `WARNING: You cannot start multiple versions of this script (${scriptName}). Please shut down the other instance first.` +
          (tailOtherInstances ? ' (To help with this, a tail window for the other instance will be opened)' : ''),
        true,
        'warning' as const,
      );
    if (tailOtherInstances)
      // Tail all but the last pid, since it will belong to the current instance (which will be shut down)
      others.slice(0, others.length - 1).forEach((pid) => ns.ui.openTail(pid));
  }
  return others.length;
}

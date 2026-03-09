import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';
import { disableLogs } from './disable-logs';
import { waitForProcessToComplete_Custom } from './wait-for-process-to-complete-custom';

/**
 * Wait for a process id to complete running
 * Importing incurs a maximum of 0.1 GB RAM (for ns.isRunning)
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {int} pid - The process id to monitor
 * @param {bool=} verbose - (default false) If set to true, pid and result of command are logged.
 **/
export async function waitForProcessToComplete(ns: NS, pid: number, verbose?: boolean): Promise<void> {
  checkNsInstance(ns, '"waitForProcessToComplete"');
  if (!verbose) disableLogs(ns, ['isRunning']);
  return await waitForProcessToComplete_Custom(ns, ns.isRunning, pid, verbose);
}

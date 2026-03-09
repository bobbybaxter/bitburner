import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';
import { disableLogs } from './disable-logs';
import { getNsDataThroughFile_Custom } from './get-ns-data-through-file-custom';
import type { FnRun } from './types';

/**
 * Retrieve the result of an ns command by executing it in a temporary .js script, writing the result to a file, then shuting it down
 * Importing incurs a maximum of 1.1 GB RAM (0 GB for ns.read, 1 GB for ns.run, 0.1 GB for ns.isRunning).
 * Has the capacity to retry if there is a failure (e.g. due to lack of RAM available). Not recommended for performance-critical code.
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {string} command - The ns command that should be invoked to get the desired data (e.g. "ns.getServer('home')" )
 * @param {string=} fName - (default "/Temp/{commandhash}-data.txt") The name of the file to which data will be written to disk by a temporary process
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 * @param {bool=} verbose - (default false) If set to true, pid and result of command are logged.
 **/
export async function getNsDataThroughFile(
  ns: NS,
  command: string,
  fName?: string,
  args: unknown[] = [],
  verbose = false,
  maxRetries = 5,
  retryDelayMs = 50,
): Promise<unknown> {
  checkNsInstance(ns, '"getNsDataThroughFile"');
  if (!verbose) disableLogs(ns, ['run', 'isRunning']);
  return await getNsDataThroughFile_Custom(
    ns,
    ns.run as FnRun,
    command,
    fName,
    args,
    verbose,
    maxRetries,
    retryDelayMs,
  );
}

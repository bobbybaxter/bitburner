import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';
import { disableLogs } from './disable-logs';
import { runCommand_Custom } from './run-command-custom';
import type { FnRun } from './types';

/** Evaluate an arbitrary ns command by writing it to a new script and then running or executing it.
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {string} command - The ns command that should be invoked to get the desired data (e.g. "ns.getServer('home')" )
 * @param {string=} fileName - (default "/Temp/{commandhash}-data.txt") The name of the file to which data will be written to disk by a temporary process
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 * @param {bool=} verbose - (default false) If set to true, the evaluation result of the command is printed to the terminal
 */
export async function runCommand(
  ns: NS,
  command: string,
  fileName?: string,
  args: unknown[] = [],
  verbose = false,
  maxRetries = 5,
  retryDelayMs = 50,
): Promise<number> {
  checkNsInstance(ns, '"runCommand"');
  if (!verbose) disableLogs(ns, ['run']);
  return await runCommand_Custom(ns, ns.run as FnRun, command, fileName, args, verbose, maxRetries, retryDelayMs);
}

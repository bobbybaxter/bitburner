import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';
import { disableLogs } from './disable-logs';
import { formatDuration } from './format-duration';
import type { FnIsAlive } from './types';

/**
 * An advanced version of waitForProcessToComplete that lets you pass your own "isAlive" test to reduce RAM requirements
 * Importing incurs 0 GB RAM (assuming fnIsAlive is implemented using another ns function you already reference elsewhere like ns.ps)
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {(pid: number) => Promise<boolean>} fnIsAlive - A single-argument function used to start the new sript, e.g. `ns.isRunning` or `pid => ns.ps("home").some(process => process.pid === pid)`
 **/
export async function waitForProcessToComplete_Custom(
  ns: NS,
  fnIsAlive: FnIsAlive,
  pid: number,
  verbose?: boolean,
): Promise<void> {
  checkNsInstance(ns, '"waitForProcessToComplete_Custom"');
  if (!verbose) disableLogs(ns, ['sleep']);
  // Wait for the PID to stop running (cheaper than e.g. deleting (rm) a possibly pre-existing file and waiting for it to be recreated)
  const start = Date.now();
  let sleepMs = 1;
  let done = false;
  for (let retries = 0; retries < 1000; retries++) {
    if (!(await fnIsAlive(pid))) {
      done = true;
      break; // Script is done running
    }
    if (verbose && retries % 100 === 0)
      ns.print(`Waiting for pid ${pid} to complete... (${formatDuration(Date.now() - start)})`);
    await ns.sleep(sleepMs);
    sleepMs = Math.min(sleepMs * 2, 200);
  }
  // Make sure that the process has shut down and we haven't just stopped retrying
  if (!done) {
    const errorMessage = `run-command pid ${pid} is running much longer than expected. Max retries exceeded.`;
    ns.print(errorMessage);
    throw new Error(errorMessage);
  }
}

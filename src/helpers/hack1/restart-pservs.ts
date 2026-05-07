import { NS } from '@ns';

/**
 * Restarts all pservs on the home server
 */
export async function main(ns: NS): Promise<void> {
  const OPTIMAL_TARGET = ns.read('/constants/optimal-target.txt');
  const HACK_SCRIPT_PATH = '/hack1-helpers/hack1-script.js';
  const HACK_SCRIPT_SIZE = 2.4;
  const pservs = ns.cloud.getServerNames();

  pservs.forEach((hostname) => {
    const maxRam = ns.getServerMaxRam(hostname);
    ns.killall(hostname);

    const timesToRun = Math.floor(maxRam / HACK_SCRIPT_SIZE);
    ns.scp(HACK_SCRIPT_PATH, hostname);
    ns.exec(HACK_SCRIPT_PATH, hostname, timesToRun, OPTIMAL_TARGET);
  });
}

import { NS } from '@ns';

/**
 * Kills all scripts running on the home server and restarts the hack script
 */
export async function main(ns: NS): Promise<void> {
  // const OPTIMAL_TARGET = ns.read('/constants/optimal-target.txt');
  const OPTIMAL_TARGET = 'n00dles';
  const HACK_SCRIPT_PATH = '/hack1-helpers/hack1-script.js';
  const HACK_SCRIPT_SIZE = 2.4;
  const hostname = 'home';

  const maxRam = (ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname)) * 0.9;
  const timesToRun = Math.floor(maxRam / HACK_SCRIPT_SIZE / 4);

  ns.scp(HACK_SCRIPT_PATH, hostname);
  ns.exec(HACK_SCRIPT_PATH, hostname, timesToRun, OPTIMAL_TARGET);
}

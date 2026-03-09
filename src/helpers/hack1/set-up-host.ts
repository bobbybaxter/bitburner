import { NS, Server } from '@ns';
import { main as findOptimalTarget } from '/find-optimal-target.js';

/**
 * Sets up a host for hacking
 */
export async function setUpHost(ns: NS, host: Server, target?: string): Promise<void> {
  try {
    findOptimalTarget(ns);
    const OPTIMAL_TARGET =
      (target ?? ns.read('/constants/optimal-target.txt') ?? 'n00dles').toString().trim() || 'n00dles';
    const HACK_SCRIPT_PATH = '/hack1-helpers/hack1-script.js';
    const HACK_SCRIPT_SIZE = 2.4;
    const { hostname, maxRam, ramUsed } = host;

    const ramAvailable = maxRam - ramUsed;
    if (ramAvailable >= HACK_SCRIPT_SIZE) {
      const timesToRun = Math.floor(ramAvailable / HACK_SCRIPT_SIZE);

      if (host.hostname !== 'home') {
        ns.killall(hostname);
        ns.scp(HACK_SCRIPT_PATH, hostname, 'home');
      }

      ns.exec(HACK_SCRIPT_PATH, hostname, timesToRun, OPTIMAL_TARGET);
    }
  } catch (e) {
    console.error(`Error with setUpHost on ${host.hostname}`, e);
  }
}

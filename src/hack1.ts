import { NS, Server } from '@ns';
import { disableNoisyLogs, getAllServers } from '/helpers/index.js';
import { setUpHost } from './helpers/hack1/set-up-host';

/**
 * Hacks all servers with a hacking level less than the player's hacking level
 * When calling the script, you can specify if you want a dedicated host and target
 * (42.3GB RAM)
 * Examples:
 * $ run hack1.js // finds all available hosts and uses optimal target
 * $ run hack1.js home // only uses home as a host and uses optimal target
 * $ run hack1.js home n00dles // only uses home as a host and n00dles as a target
 */
export async function main(ns: NS): Promise<void> {
  disableNoisyLogs(ns);

  try {
    const dedicatedHost = typeof ns.args[0] === 'number' || typeof ns.args[0] === 'boolean' ? null : ns.args[0];
    const dedicatedTarget = typeof ns.args[1] === 'number' || typeof ns.args[1] === 'boolean' ? null : ns.args[1];
    const baseHosts = dedicatedHost ? [ns.getServer(dedicatedHost)] : getAllServers(ns);
    const cloudServers = ns.cloud
      .getServerNames()
      .filter((name) => !name.includes('share'))
      .map((name) => ns.getServer(name));
    const allHosts = [...baseHosts, ...cloudServers] as Server[];

    const HACKING_LVL = ns.getHackingLevel();

    allHosts.forEach((server: Server) => {
      const { hostname, maxRam } = server;
      const isWithinHackLvl = HACKING_LVL >= ns.getServerRequiredHackingLevel(hostname);
      if (maxRam > 0 && isWithinHackLvl) {
        console.info(`${Date.now()} - Setting up server for: ${hostname}`);
        setUpHost(ns, server, dedicatedTarget ?? undefined);
      }
    });
  } catch (e) {
    console.error('Error with hack1.js', e);
  }
}

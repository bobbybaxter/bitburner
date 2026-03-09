import { NS, Server } from '@ns';
import { disableNoisyLogs } from '/helpers/disable-noisy-logs';
import { getAllServers } from '/helpers/get-all-servers';
import { setUpHost } from './set-up-host';

/**
 * Restarts all hacks on the home server
 */
export async function main(ns: NS): Promise<void> {
  disableNoisyLogs(ns);
  const HACKING_LVL = ns.getHackingLevel();
  const allServers = getAllServers(ns);

  allServers.forEach(async (server: Server) => {
    const { hostname, maxRam } = server;
    const isWithinHackLvl = HACKING_LVL >= (server?.requiredHackingSkill ?? 0);
    if (maxRam > 0 && isWithinHackLvl) {
      ns.killall(hostname);
      console.info(`${Date.now()} - Setting up server for: ${hostname}`);
      setUpHost(ns, server);
    }
  });
}

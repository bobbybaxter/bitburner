import { NS, Server } from '@ns';
import { getServerNames } from './get-server-names.js';
import { openPorts } from './open-ports.js';

/**
 * Opens every port we have a cracker for on each reachable network server,
 * then nukes any server whose port requirement is met. Skips servers we
 * already root, and servers we own (home / purchased / hacknet — all flagged
 * via Server.purchasedByPlayer in NetscriptDefinitions).
 */
export async function main(ns: NS): Promise<void> {
  const serverNames = getServerNames(ns).map((server) => server.hostname);

  serverNames.forEach((serverName) => {
    const server = ns.getServer(serverName) as Server;

    if (server.purchasedByPlayer) return;
    if (server.hasAdminRights) return;

    const newlyOpened = openPorts(ns, server);
    const totalOpenPorts = (server.openPortCount ?? 0) + newlyOpened;
    if (totalOpenPorts < (server.numOpenPortsRequired ?? 0)) return;

    try {
      ns.nuke(serverName);
    } catch (e) {
      console.error(e);
    }
  });
}

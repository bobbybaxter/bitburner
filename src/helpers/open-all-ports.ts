import { NS, Server } from '@ns';
import { getServerNames } from './get-server-names.js';
import { openPorts } from './open-ports.js';

export async function main(ns: NS): Promise<void> {
  const serverNames = getServerNames(ns).map((server) => server.hostname);

  serverNames.forEach((serverName) => {
    if (serverName === 'home' || serverName.includes('pserv')) return;

    const hydratedServer: Server = ns.getServer(serverName);
    openPorts(ns, hydratedServer);
    try {
      ns.nuke(serverName);
    } catch (e) {
      console.error(e);
    }
  });
}

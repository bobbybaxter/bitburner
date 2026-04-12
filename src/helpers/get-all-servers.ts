import { NS, Server } from '@ns';
import { getServerNames } from '/constants/seen-server-names.js';

/**
 * Gets all servers on the network
 */
export function getAllServers(ns: NS, serverNames: string[] = []): Server[] {
  if (serverNames.length === 0) {
    return getServerNames().map((serverName: string) => {
      return ns.getServer(serverName);
    });
  } else {
    return serverNames.map((serverName: string) => {
      return ns.getServer(serverName);
    });
  }
}

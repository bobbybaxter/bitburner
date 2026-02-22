import { NS, Server } from '@ns';
import { getServerNames } from '/constants/seen-server-names.js';

/**
 * Gets all servers on the network
 */
export function getAllServers(ns: NS): Server[] {
  return getServerNames().map((serverName: string) => {
    return ns.getServer(serverName);
  });
}

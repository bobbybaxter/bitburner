import type { NS } from '@ns';
import type { ServerScanResult } from '/helpers/get-server-names.js';

export type HostServer = ServerScanResult & { availableRam: number };

export function getHostServers(ns: NS, allServerNames: ServerScanResult[], threadCost: number): HostServer[] {
  return allServerNames
    .filter((server) => !server.hostname.includes('share'))
    .filter((server) => ns.hasRootAccess(server.hostname))
    .map((server) => {
      const maxRam =
        server.hostname === 'home' ? ns.getServerMaxRam(server.hostname) / 1.25 : ns.getServerMaxRam(server.hostname);

      return {
        ...server,
        availableRam: maxRam - ns.getServerUsedRam(server.hostname),
      };
    })
    .filter((server) => server.availableRam > threadCost)
    .sort((a, b) => b.availableRam - a.availableRam);
}

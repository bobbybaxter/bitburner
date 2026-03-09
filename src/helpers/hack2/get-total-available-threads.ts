import type { HostServer } from './get-host-servers.js';

export function getTotalAvailableThreads(hostServers: HostServer[], threadCost: number): number {
  const serverAvailableRam = hostServers.map((x) => Math.floor(x.availableRam / threadCost));
  if (serverAvailableRam.every((server) => server === 0)) {
    return 0;
  } else {
    return serverAvailableRam.reduce((a, b) => a + b);
  }
}

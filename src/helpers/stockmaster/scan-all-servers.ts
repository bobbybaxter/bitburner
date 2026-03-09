import type { NS } from '@ns';
import { Stack } from '/helpers/Stack.js';
import { checkNsInstance } from './check-ns-instance';

/** Helper to get a list of all hostnames on the network
 * @param {NS} ns - The nestcript instance passed to your script's main entry point */
export function scanAllServers(ns: NS): string[] {
  checkNsInstance(ns, '"scanAllServers"');
  const discoveredHosts: string[] = [];
  const seen = new Set<string>();
  const hostsToScan = new Stack<string>();
  hostsToScan.push('home');
  let infiniteLoopProtection = 9999;
  while (!hostsToScan.isEmpty() && infiniteLoopProtection-- > 0) {
    const hostName = hostsToScan.pop()!;
    if (seen.has(hostName)) continue;
    seen.add(hostName);
    discoveredHosts.push(hostName);
    for (const connectedHost of ns.scan(hostName)) if (!seen.has(connectedHost)) hostsToScan.push(connectedHost);
  }
  return discoveredHosts;
}

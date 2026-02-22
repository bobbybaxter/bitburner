import type { NS } from '@ns';

export type ServerScanResult = {
  hostname: string;
  name: string;
  depth: number;
};

/**
 * Returns all reachable servers via BFS from home, with hostname, name, and depth.
 */
export function getServerNames(ns: NS): ServerScanResult[] {
  const result: ServerScanResult[] = [];
  const visited: Record<string, number> = { home: 1 };
  const queue = Object.keys(visited);
  while (queue.length > 0) {
    const current = queue.pop()!;
    result.push({ hostname: current, name: current, depth: visited[current] });
    ns.scan(current)
      .reverse()
      .filter((e) => !visited[e])
      .forEach((server) => {
        queue.push(server);
        visited[server] = visited[current] + 1;
      });
  }
  return result;
}

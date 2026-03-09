import type { NS } from '@ns';
import { Stack } from '/helpers/Stack.js';

export type ServerScanResult = {
  hostname: string;
  name: string;
  depth: number;
};

/**
 * Returns all reachable servers via DFS from home, with hostname, name, and depth.
 */
export function getServerNames(ns: NS): ServerScanResult[] {
  const result: ServerScanResult[] = [];
  const visited: Record<string, number> = { home: 1 };
  const stack = new Stack<string>();
  stack.push('home');
  while (!stack.isEmpty()) {
    const current = stack.pop()!;
    result.push({ hostname: current, name: current, depth: visited[current] });
    ns.scan(current)
      .reverse()
      .filter((e) => !visited[e])
      .forEach((server) => {
        stack.push(server);
        visited[server] = visited[current] + 1;
      });
  }
  return result;
}

import { NS } from '@ns';
import { Queue } from '/helpers/Queue.js';

/**
 * Shortest path from `home` to `target`: `[firstHop, …, target]`, or `null` if unreachable.
 */
export function getPathFromHomeTo(ns: NS, target: string): string[] | null {
  const paths: Record<string, string[]> = { home: [] };
  const queue = new Queue<string>();
  queue.enqueue('home');

  while (!queue.isEmpty()) {
    const current = queue.dequeue()!;
    ns.scan(current)
      .filter((e) => !paths[e])
      .forEach((server) => {
        queue.enqueue(server);
        paths[server] = paths[current]?.concat([server]) ?? [server];
      });
  }

  const path = paths[target];
  return path !== undefined ? path : null;
}

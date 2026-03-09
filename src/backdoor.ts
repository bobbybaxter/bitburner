import { NS } from '@ns';
import { getServerNames } from '/helpers/get-server-names.js';
import { Queue } from '/helpers/Queue.js';

const FIVE_MINUTES = 5 * 60 * 1000;

function getPath(ns: NS, target: string): string[] | null {
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

  return paths[target] ?? null;
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog('ALL');

  while (true) {
    const servers = getServerNames(ns)
      .map((s) => s.hostname)
      .filter((name) => name !== 'home' && !name.includes('pserv'));

    const hackLevel = ns.getHackingLevel();
    let remaining = 0;

    for (const hostname of servers) {
      const server = ns.getServer(hostname);

      if (server.backdoorInstalled) continue;
      if (!server.hasAdminRights) {
        remaining++;
        continue;
      }
      if ((server.requiredHackingSkill ?? Infinity) > hackLevel) {
        remaining++;
        continue;
      }

      const path = getPath(ns, hostname);
      if (!path) {
        remaining++;
        continue;
      }

      try {
        for (const hop of path) {
          ns.singularity.connect(hop);
        }
        await ns.singularity.installBackdoor();
        ns.print(`SUCCESS: Backdoor installed on ${hostname}`);
      } catch (e) {
        ns.print(`WARN: Failed to backdoor ${hostname}: ${e}`);
        remaining++;
      }

      ns.singularity.connect('home');
    }

    if (remaining === 0) {
      ns.print('All servers backdoored. Exiting.');
      return;
    }

    ns.print(`${remaining} servers remaining. Retrying in 5 minutes.`);
    await ns.sleep(FIVE_MINUTES);
  }
}

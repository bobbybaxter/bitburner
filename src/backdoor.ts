import { NS, Server } from '@ns';
import { getServerNames } from '/helpers/get-server-names.js';
import { Queue } from '/helpers/Queue.js';
import { Do } from './helpers/do';

const FIVE_MINUTES = 1 * 60 * 1000;

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
  // ns.disableLog('ALL');

  while (true) {
    ns.exec('/helpers/open-all-ports.js', 'home');

    const servers = getServerNames(ns).map((s) => s.hostname);
    const hackLevel = ns.getHackingLevel();
    let serversBackdoored = 0;

    for (const hostname of servers) {
      let server = ns.getServer(hostname) as Server;

      if (server.purchasedByPlayer) continue;

      if (server.backdoorInstalled) {
        serversBackdoored++;
        continue;
      }

      if (!server.hasAdminRights || (server.requiredHackingSkill ?? Infinity) > hackLevel) {
        ns.print(`${hostname} does not have admin rights or required hacking skill, skipping.`);
        continue;
      }

      const path = getPath(ns, hostname);
      if (!path) {
        ns.print(`${hostname} has no path to home, skipping.`);
        continue;
      }

      try {
        for (const hop of path) {
          await Do(ns, 'ns.singularity.connect', hop);
        }
        server = ns.getServer(hostname) as Server;
        try {
          await Do(ns, 'ns.singularity.installBackdoor');
          ns.tprint(`SUCCESS: Backdoor installed on ${hostname}`);
        } catch (e) {
          ns.tprint(`WARN: Backdoor failed on ${hostname}: ${e}`);
        }
      } catch (e) {
        ns.tprint(`WARN: Failed to navigate to ${hostname}: ${e}`);
      }

      await Do(ns, 'ns.singularity.connect', 'home');
    }

    if (serversBackdoored === servers.length) {
      ns.tprint('All servers backdoored. Exiting.');
      return;
    }

    ns.tprint(`${serversBackdoored}/${servers.length} servers backdoored. Retrying in 1 minute.`);
    await ns.sleep(FIVE_MINUTES);
  }
}

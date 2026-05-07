import { NS } from '@ns';

/**
 * Shares RAM on each server (args + always `cloud-share`).
 */
export async function main(ns: NS): Promise<void> {
  const fromArgs = ns.args.filter((a): a is string => typeof a === 'string');
  const servers = [...new Set([...fromArgs, 'cloud-share'])];

  for (const server of servers) {
    const serverAvailableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    const threads = Math.floor(serverAvailableRam / ns.getScriptRam('helpers/share-loop.js'));
    if (threads <= 0) {
      ns.tprint(`WARN: ${server} has no available RAM for share-loop`);
      continue;
    }
    ns.scp('helpers/share-loop.js', server);
    ns.exec('helpers/share-loop.js', server, { threads });
  }
}

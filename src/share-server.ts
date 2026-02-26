import { NS } from '@ns';

/**
 * Shares a server
 */
export async function main(ns: NS): Promise<void> {
  const server = (ns.args[0] as string) ?? 'pserv-share';
  const serverAvailableRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
  const threads = Math.floor(serverAvailableRam / ns.getScriptRam('helpers/share-loop.js'));
  ns.scp('helpers/share-loop.js', server);
  ns.exec('helpers/share-loop.js', server, { threads });
}

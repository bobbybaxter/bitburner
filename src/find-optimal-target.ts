import { NS } from '@ns';
import { getServerNames } from '/helpers/get-server-names.js';

/**
 * Finds the optimal target to hack and restarts all scripts if the target has changed
 */
export async function main(ns: NS): Promise<void> {
  const currentHackingLevel = ns.getHackingLevel();
  const currentTarget = ns.read('/constants/optimal-target.txt') || 'n00dles';

  const availableServers = getServerNames(ns)
    .map((server) => ns.getServer(server.name))
    .filter((server) => server.hasAdminRights === true)
    .filter((server) => (server.requiredHackingSkill ?? 0) <= currentHackingLevel / 2)
    .sort((a, b) => ((a?.moneyMax ?? 0) > (b?.moneyMax ?? 0) ? -1 : 1));

  const shouldRestartAll = currentTarget !== availableServers[0].hostname;

  if (availableServers.length > 0) {
    ns.write('/constants/optimal-target.txt', availableServers[0].hostname, 'w');
  }

  if (shouldRestartAll) {
    ns.tprint(`optimal target has updated from ${currentTarget} to ${availableServers[0].hostname}`);
    ns.exec('/hack-lvl-1-helpers/restart-all.js', 'home');
  } else {
    ns.tprint('optimal target remains ', availableServers[0].hostname);
  }
}

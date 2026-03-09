import { NS } from '@ns';

/**
 * Restarts all hacks on the home server
 */
export async function main(ns: NS): Promise<void> {
  const server = 'home';

  ns.exec('/hack1-helpers/restart-pservs.js', server);
  ns.exec('/hack1-helpers/restart-hacks.js', server);
  ns.exec('/hack1-helpers/restart-home-hacks.js', server);
}

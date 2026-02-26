import { NS } from '@ns';

/**
 * Starts all scripts on the home server
 */
export async function main(ns: NS): Promise<void> {
  ns.exec('helpers/open-all-ports.js', 'home');
  ns.exec('infiltrate.js', 'home');
  ns.exec('stockmaster.js', 'home');
  ns.exec('hacknet-opt.js', 'home', 1, 1, 100);
  ns.exec('pserv-opt.js', 'home');
}

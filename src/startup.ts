import { NS } from '@ns';

/**
 * Starts all scripts on the home server
 * Requires 25.25 GB RAM
 */
export async function main(ns: NS): Promise<void> {
  ns.exec('helpers/open-all-ports.js', 'home'); // 4.2GB RAM
  ns.exec('infiltrate.js', 'home'); // 1.5GB RAM
  ns.exec('stockmaster.js', 'home'); // 3.6GB RAM
  ns.exec('hacknet-opt.js', 'home', 1, 1, 100); // 7.45GB RAM
  ns.exec('pserv-opt.js', 'home'); // 8.5GB RAM
}

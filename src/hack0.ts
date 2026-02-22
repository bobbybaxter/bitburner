import { NS } from '@ns';

const HACK_SCRIPT_PATH = '/hack1-helpers/hack1-script.js';
const HACK_SCRIPT_RAM = 2.4;

/**
 * Lightweight hack launcher (6.4GB RAM). Discovers servers via scan, then runs
 * hack1-script on each with available RAM. Use hack1.ts when you have more RAM.
 *
 * Usage:
 *   run hack0.js                    // scan + use optimal target
 *   run hack0.js home               // home only
 *   run hack0.js home n00dles       // home + target n00dles
 */
export async function main(ns: NS): Promise<void> {
  ns.tprint('hack0: starting');
  try {
    ns.disableLog('ALL');
    ns.clearLog();

    const dedicatedHost = typeof ns.args[0] === 'string' ? ns.args[0] : null;
    let target =
      typeof ns.args[1] === 'string' ? ns.args[1] : (ns.read('/constants/optimal-target.txt') ?? 'n00dles').trim();
    if (!target) target = 'n00dles';

    const hackLvl = ns.getHackingLevel();

    const hosts = dedicatedHost ? [ns.getServer(dedicatedHost)] : scanServers(ns).map((name) => ns.getServer(name));
    ns.tprint(`hack0: target=${target} hackLvl=${hackLvl} hosts=${hosts.length}`);

    for (const server of hosts) {
      if (server.maxRam <= 0) {
        ns.tprint(`  skip ${server.hostname}: no RAM`);
        continue;
      }
      const reqLvl = ns.getServerRequiredHackingLevel(server.hostname);
      if (hackLvl < reqLvl) {
        ns.tprint(`  skip ${server.hostname}: need lvl ${reqLvl}`);
        continue;
      }

      const free = server.maxRam - server.ramUsed;
      const threads = Math.floor(free / HACK_SCRIPT_RAM);
      if (threads < 1) {
        ns.tprint(`  skip ${server.hostname}: only ${free.toFixed(1)}GB free (need ${HACK_SCRIPT_RAM}GB)`);
        continue;
      }

      if (server.hostname !== 'home') {
        if (server.hostname !== ns.getHostname()) ns.killall(server.hostname);
        ns.scp(HACK_SCRIPT_PATH, server.hostname, 'home');
      }

      ns.exec(HACK_SCRIPT_PATH, server.hostname, threads, target);
      ns.tprint(`  ${server.hostname}: launched ${threads} thread(s)`);
    }
  } catch (e) {
    ns.tprint(`hack0 ERROR: ${e}`);
  }
}

function scanServers(ns: NS): string[] {
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  const queue = ['home'];

  while (queue.length > 0) {
    const name = queue.pop()!;
    if (seen[name]) continue;
    seen[name] = true;
    out.push(name);
    for (const next of ns.scan(name)) {
      if (!seen[next]) queue.push(next);
    }
  }
  return out;
}

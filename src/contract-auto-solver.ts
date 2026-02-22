import { NS } from '@ns';
import { solveContract } from '/helpers/solve-contract.js';

export async function main(ns: NS): Promise<void> {
  await dfs(ns, null, 'home', trySolveContracts, 0);
}

async function dfs(
  ns: NS,
  parent: string | null,
  current: string,
  f: (ns: NS, host: string, depth: number, ...args: unknown[]) => Promise<void>,
  depth: number,
  ...args: unknown[]
): Promise<void> {
  const hosts = ns.scan(current);
  if (parent != null) {
    const index = hosts.indexOf(parent);
    if (index > -1) {
      hosts.splice(index, 1);
    }
  }

  await f(ns, current, depth, ...args);

  for (let index = 0, len = hosts.length; index < len; ++index) {
    const host = hosts[index];
    await dfs(ns, current, host, f, depth + 1, ...args);
  }
}

/**
 * Automatically solve contracts on a given host. (27GB RAM)
 */
async function trySolveContracts(ns: NS, host: string): Promise<void> {
  const contracts = ns.ls(host, 'cct');
  for (const contract of contracts) {
    solveContract(ns, host, contract, 0);
  }
}

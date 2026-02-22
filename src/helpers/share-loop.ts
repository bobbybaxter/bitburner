import { NS } from '@ns';

/**
 * Shares a server
 */
export async function main(ns: NS): Promise<void> {
  while (true) {
    await ns.share();
  }
}

import type { NS } from '@ns';

export async function main(ns: NS): Promise<void> {
  const [rawFile] = ns.args;
  const file = String(rawFile ?? '');

  if (!file) {
    ns.tprint("Usage: run helpers/darknet/open-cache.js '<cache-file>'");
    return;
  }

  // Intentionally do not suppress the toast so rewards are visible.
  ns.dnet.openCache(file, false);
}

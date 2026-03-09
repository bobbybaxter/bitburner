import type { NS } from '@ns';

export async function main(ns: NS): Promise<void> {
  await ns.hack(String(ns.args[0]), {
    threads: Number(ns.args[1]),
    ...(ns.args[2] != null ? { additionalMsec: Number(ns.args[2]) } : {}),
  });
}

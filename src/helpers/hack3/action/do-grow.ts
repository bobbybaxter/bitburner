import type { NS } from '@ns';

export async function main(ns: NS): Promise<void> {
  const stock = ns.args[3] === 1 || ns.args[3] === true;
  await ns.grow(String(ns.args[0]), {
    threads: Number(ns.args[1]),
    ...(ns.args[2] != null ? { additionalMsec: Number(ns.args[2]) } : {}),
    ...(stock ? { stock: true } : {}),
  });
}

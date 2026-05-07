/** @param {NS} ns */
export async function main(ns) {
  const stock = ns.args[3] === 1 || ns.args[3] === true;
  await ns.grow(ns.args[0], {
    threads: ns.args[1],
    ...(ns.args[2] ? { additionalMsec: ns.args[2] } : {}),
    ...(stock ? { stock: true } : {}),
  });
}

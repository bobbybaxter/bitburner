import { NS } from '@ns';

/**
 * Hacks a target server until the money threshold is reached or the security threshold is reached
 */
export async function main(ns: NS): Promise<void> {
  const target = ((ns.args[0] as string) ?? '').toString().trim() || 'n00dles';
  const moneyThreshold = ns.getServerMaxMoney(target) * 0.98;
  const securityThreshold = ns.getServerMinSecurityLevel(target) + 1;
  ns.tprint(`hack1-script: target=${target} moneyThreshold=${moneyThreshold} securityThreshold=${securityThreshold}`);

  while (true) {
    await ns.sleep(Math.random() * 500 + 1000);
    if (ns.getServerSecurityLevel(target) > securityThreshold) {
      await ns.weaken(target);
    } else if (ns.getServerMoneyAvailable(target) < moneyThreshold) {
      await ns.grow(target);
    } else {
      await ns.hack(target);
    }
  }
}

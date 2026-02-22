import type { NS } from '@ns';

/** Worker that only calls ns.weaken - single-function script for correct static RAM (1.75GB). */
export async function main(ns: NS): Promise<void> {
  const [target, time] = ns.args;

  if (typeof time === 'number') {
    await ns.sleep(time);
  }

  if (typeof target !== 'string') {
    return;
  }

  await ns.weaken(target);
}

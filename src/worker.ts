import type { NS } from '@ns';

type HackMethod = 'hack' | 'grow' | 'weaken';

function isHackMethod(m: unknown): m is HackMethod {
  return m === 'hack' || m === 'grow' || m === 'weaken';
}

export async function main(ns: NS): Promise<void> {
  const [target, method, time] = ns.args;

  if (typeof time === 'number') {
    await ns.sleep(time);
  }

  if (typeof target !== 'string' || !isHackMethod(method)) {
    return;
  }

  await ns[method](target);
}

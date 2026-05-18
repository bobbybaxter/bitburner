import type { NS } from '@ns';

type TaskResult<T> = {
  ok: boolean;
  value?: T;
  error?: string;
};

export async function main(ns: NS): Promise<void> {
  const hostArg = ns.args[0];
  const host = typeof hostArg === 'string' ? hostArg : '';
  if (!host) {
    ns.writePort(ns.pid, JSON.stringify({ ok: false, error: 'missing host' } satisfies TaskResult<null>));
    return;
  }
  try {
    const value = await ns.dnet.memoryReallocation(host);
    ns.writePort(ns.pid, JSON.stringify({ ok: true, value } satisfies TaskResult<unknown>));
  } catch (error) {
    ns.writePort(
      ns.pid,
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies TaskResult<null>),
    );
  }
}

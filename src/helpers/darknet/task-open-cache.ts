import type { NS } from '@ns';

type TaskResult<T> = {
  ok: boolean;
  value?: T;
  error?: string;
};

export async function main(ns: NS): Promise<void> {
  const fileArg = ns.args[0];
  const file = typeof fileArg === 'string' ? fileArg : '';
  if (!file) {
    ns.writePort(ns.pid, JSON.stringify({ ok: false, error: 'missing cache filename' } satisfies TaskResult<null>));
    return;
  }
  try {
    const value = ns.dnet.openCache(file, false);
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

//
import type { NS } from '@ns';

type TaskResult<T> = {
  ok: boolean;
  value?: T;
  error?: string;
};

type DnetWithLabradar = {
  labradar: () => unknown | Promise<unknown>;
  labreport: () => unknown | Promise<unknown>;
  isDarknetServer: (host: string) => boolean;
};

/**
 * Runs dnet.labradar on the server where this script executes.
 * Must be started on a darknet host (e.g. `connect host; run helpers/darknet/task-labradar.js`).
 * After editing this file, run `darknet-labradar.js` on home so copies on darknet hosts are overwritten from home.
 */
export async function main(ns: NS): Promise<void> {
  const dnet = ns.dnet as unknown as DnetWithLabradar;
  const here = ns.getHostname();
  if (!dnet.isDarknetServer(here)) {
    ns.writePort(
      ns.pid,
      JSON.stringify({
        ok: false,
        error: `dnet.labradar only works on a darknet server; this script is on ${here}. Connect to the target host first, then run this file there.`,
      } satisfies TaskResult<null>),
    );
    return;
  }

  try {
    // openTail targets this process; tprint so the terminal shows activity (ns.print is tail-only).
    ns.ui.openTail(ns.pid);
    ns.ui.setTailTitle('Lab Report');
    await ns.sleep(10);
    ns.tprint(`Opening Lab Report tail (PID ${ns.pid})…`);
    ns.print('Running dnet.labradar / dnet.labreport…');
    const radarValue = await dnet.labradar();
    const reportValue = await dnet.labreport();
    ns.writePort(
      ns.pid,
      JSON.stringify({
        ok: true,
        value: { radar: radarValue, report: reportValue },
      } satisfies TaskResult<{ radar: unknown; report: unknown }>),
    );
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

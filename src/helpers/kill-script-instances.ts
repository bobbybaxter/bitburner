import type { NS, ScriptArg } from '@ns';

/**
 * Kill every process on `host` running `script` (any args), except `exceptPid`.
 *
 * Use when you start a *new* instance of a script and need the old instance(s) gone.
 * Unlike {@link NS.scriptKill}, this does not kill the current process — needed because
 * `scriptKill` terminates all instances of that filename on the server, including the caller.
 */
export function killOtherInstancesOfScript(ns: NS, host: string, script: string, exceptPid = ns.pid): number {
  let killed = 0;
  for (const p of ns.ps(host)) {
    if (p.filename === script && p.pid !== exceptPid) {
      ns.kill(p.pid);
      killed++;
    }
  }
  return killed;
}

/** Same as {@link killOtherInstancesOfScript} for the running script on `host`. */
export function replaceOtherInstancesOfThisScriptOnHost(ns: NS, host: string): number {
  return killOtherInstancesOfScript(ns, host, ns.getScriptName(), ns.pid);
}

/**
 * {@link NS.scriptKill} then {@link NS.exec}. Safe only when the caller is *not* `script`
 * (e.g. startup or a tiny launcher); otherwise the new process can be killed too.
 */
export function scriptKillThenExec(
  ns: NS,
  host: string,
  script: string,
  threads: number,
  ...args: ScriptArg[]
): number {
  ns.scriptKill(script, host);
  return ns.exec(script, host, threads, ...args);
}

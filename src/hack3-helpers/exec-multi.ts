import type { NS, ScriptArg } from '@ns';
import { replaceArgs } from '/hack3-helpers/lib/arguments.js';
import { getMaxThreads } from '/hack3-helpers/lib/calculations.js';
import { expandPath } from '/hack3-helpers/lib/files.js';

export function main(ns: NS): void {
  ns.tprint('\n');

  if (ns.args.length < 3) {
    ns.tprint(
      'usage: run exec-multi.js <host> <threads> <script> [ <args>... ]\n',
      "Where threads is an int or the string 'max', default to 'max'.\n",
      'This script is designed to run on home machine.\n',
    );
    ns.exit();
  }

  const [argHost, argThd, argScript, ...restArgs] = ns.args as [ScriptArg, ScriptArg, ScriptArg, ...ScriptArg[]];
  execMultiAutoKill(ns, argHost, argThd, argScript, ...restArgs);

  ns.tprint('Execution started.');
}

export function execMultiAutoKill(
  ns: NS,
  argHost: ScriptArg,
  argThd: ScriptArg,
  argScript: ScriptArg,
  ...args: ScriptArg[]
): void {
  const host = String(argHost);
  const script = expandPath(ns.getScriptName(), String(argScript));

  if (ns.scriptRunning(script, host)) {
    ns.scriptKill(script, host);
    ns.tprint('killed running scripts for host.');
  }

  execMulti(ns, argHost, argThd, argScript, ...args);
}

export function execMulti(
  ns: NS,
  argHost: ScriptArg,
  argThd: ScriptArg,
  argScript: ScriptArg,
  ...args: ScriptArg[]
): void {
  const host = String(argHost);
  const script = expandPath(ns.getScriptName(), String(argScript));

  if (!ns.serverExists(host)) {
    ns.tprint('host not exists: ', host);
    ns.exit();
  }
  if (!ns.fileExists(script)) {
    ns.tprint('file not exists: ', script);
    ns.exit();
  }

  let threads: number;
  if (argThd === 'max') {
    threads = getMaxThreads(ns, host, script);
  } else {
    if (typeof argThd !== 'number' || !Number.isInteger(argThd)) {
      ns.tprint('arg <threads> accepts a integer, got ', argThd);
      ns.exit();
    }
    threads = argThd;
  }

  if (threads < 1) {
    ns.tprint('threads not valid: ', threads);
    ns.exit();
  }

  const scriptArgs = replaceArgs(args, { $threads: threads });

  ns.scp(script, host);
  ns.exec(script, host, threads, ...scriptArgs);
}

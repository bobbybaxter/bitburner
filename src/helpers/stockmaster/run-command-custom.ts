import type { NS } from '@ns';
import { autoRetry } from './auto-retry';
import { checkNsInstance } from './check-ns-instance';
import { disableLogs } from './disable-logs';
import { getFilePath } from './get-file-path';
import { hashCode } from './hash-code';
import { log } from './log';
import type { FnRun } from './types';

const _cachedExports: string[] = [];
let _cachedExportPattern: RegExp | null = null;
/** @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @returns {string[]} The set of all funciton names exported by this file. */
function getExports(ns: NS): string[] {
  if (_cachedExports.length > 0) return _cachedExports;
  const scriptHelpersRows = ns.read(getFilePath('helpers.js')).split('\n');
  for (const row of scriptHelpersRows) {
    if (!row.startsWith('export')) continue;
    const funcNameStart = row.indexOf('function') + 'function'.length + 1;
    const funcNameEnd = row.indexOf('(', funcNameStart);
    _cachedExports.push(row.substring(funcNameStart, funcNameEnd));
  }
  _cachedExportPattern = new RegExp(_cachedExports.map((e) => `${e}\\(`).join('|'), 'g');
  return _cachedExports;
}

/** Scan the command once with a single regex and return the set of matched export names. */
function getRequiredExports(ns: NS, command: string): string[] {
  const exports = getExports(ns);
  if (exports.length === 0 || !_cachedExportPattern) return [];
  const matches = command.match(_cachedExportPattern);
  if (!matches) return [];
  const matchedNames = new Set(matches.map((m) => m.slice(0, -1)));
  return exports.filter((e) => matchedNames.has(e));
}

/**
 * An advanced version of runCommand that lets you pass your own "isAlive" test to reduce RAM requirements (e.g. to avoid referencing ns.isRunning)
 * Importing incurs 0 GB RAM (assuming fnRun, fnWrite are implemented using another ns function you already reference elsewhere like ns.exec)
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {function} fnRun - A single-argument function used to start the new sript, e.g. `ns.run` or `(f,...args) => ns.exec(f, "home", ...args)`
 * @param {string} command - The ns command that should be invoked to get the desired data (e.g. "ns.getServer('home')" )
 * @param {string=} fileName - (default "/Temp/{commandhash}-data.txt") The name of the file to which data will be written to disk by a temporary process
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 **/
export async function runCommand_Custom(
  ns: NS,
  fnRun: FnRun,
  command: string,
  fileName?: string,
  args: unknown[] = [],
  verbose = false,
  maxRetries = 5,
  retryDelayMs = 50,
): Promise<number> {
  checkNsInstance(ns, '"runCommand_Custom"');
  if (!Array.isArray(args)) throw new Error(`args specified were a ${typeof args}, but an array is required.`);
  if (!verbose) disableLogs(ns, ['sleep']);
  // Auto-import any helpers that the temp script attempts to use
  const required = getRequiredExports(ns, command);
  const script =
    (required.length > 0 ? `import { ${required.join(', ')} } from 'helpers.js'\n` : '') +
    `export async function main(ns) { ${command} }`;
  fileName = fileName || `/Temp/${hashCode(command)}-command.js`;
  if (verbose)
    log(
      ns,
      `INFO: Using a temporary script (${fileName}) to execute the command:` +
        `\n  ${command}\nWith the following arguments:    ${JSON.stringify(args)}`,
    );
  // It's possible for the file to be deleted while we're trying to execute it, so even wrap writing the file in a retry
  return await autoRetry(
    ns,
    async () => {
      // To improve performance, don't re-write the temp script if it's already in place with the correct contents.
      const oldContents = ns.read(fileName);
      if (oldContents != script) {
        if (oldContents)
          // Create some noise if temp scripts are being created with the same name but different contents
          ns.tprint(
            `WARNING: Had to overwrite temp script ${fileName}\nOld Contents:\n${oldContents}\nNew Contents:\n${script}` +
              `\nThis warning is generated as part of an effort to switch over to using only 'immutable' temp scripts. ` +
              `Please paste a screenshot in Discord at https://discord.com/channels/415207508303544321/935667531111342200`,
          );
        ns.write(fileName, script, 'w');
        // Wait for the script to appear and be readable (game can be finicky on actually completing the write)
        await autoRetry(
          ns,
          () => ns.read(fileName),
          (c: string) => c == script,
          (): string =>
            `Temporary script ${fileName} is not available, ` +
            `despite having written it. (Did a competing process delete or overwrite it?)`,
          maxRetries,
          retryDelayMs,
          undefined,
          verbose,
          verbose,
        );
      }
      // Run the script, now that we're sure it is in place
      return fnRun(fileName, 1 /* Always 1 thread */, ...args);
    },
    (pid: number) => pid !== 0,
    (): string =>
      `The temp script was not run (likely due to insufficient RAM).` +
      `\n  Script:  ${fileName}\n  Args:    ${JSON.stringify(args)}\n  Command: ${command}` +
      `\nThe script that ran this will likely recover and try again later once you have more free ram.`,
    maxRetries,
    retryDelayMs,
    undefined,
    verbose,
    verbose,
  );
}

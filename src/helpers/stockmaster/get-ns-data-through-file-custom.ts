import type { NS } from '@ns';
import { autoRetry } from './auto-retry';
import { checkNsInstance } from './check-ns-instance';
import { disableLogs } from './disable-logs';
import { hashCode } from './hash-code';
import { log } from './log';
import { runCommand_Custom } from './run-command-custom';
import type { FnRun } from './types';
import { waitForProcessToComplete_Custom } from './wait-for-process-to-complete-custom';

/** Matches gangs/helpers getNsDataThroughFile temp-script JSON so shared /Temp/*.txt paths do not fight. */
function jsonReviver(_key: string, val: unknown) {
  if (val == null || typeof val !== 'object' || !('$type' in val) || (val as { $type?: unknown }).$type == null)
    return val;
  const v = val as { $type: string; $value: unknown };
  if (v.$type == 'number') return Number.parseFloat(String(v.$value));
  if (v.$type == 'bigint') return BigInt(String(v.$value));
  if (v.$type === 'Map') return new Map(v.$value as Iterable<readonly [unknown, unknown]>);
  if (v.$type === 'Set') return new Set(v.$value as Iterable<unknown>);
  return val;
}

/**
 * An advanced version of getNsDataThroughFile that lets you pass your own "fnRun" implementation to reduce RAM requirements
 * Importing incurs no RAM (now that ns.read is free) plus whatever fnRun you provide it
 * Has the capacity to retry if there is a failure (e.g. due to lack of RAM available). Not recommended for performance-critical code.
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {function} fnRun - A single-argument function used to start the new sript, e.g. `ns.run` or `(f,...args) => ns.exec(f, "home", ...args)`
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 **/
export async function getNsDataThroughFile_Custom(
  ns: NS,
  fnRun: FnRun,
  command: string,
  fName?: string,
  args: unknown[] = [],
  verbose = false,
  maxRetries = 5,
  retryDelayMs = 50,
): Promise<unknown> {
  checkNsInstance(ns, '"getNsDataThroughFile_Custom"');
  if (!verbose) disableLogs(ns, ['read']);
  const commandHash = hashCode(command);
  fName = fName || `/Temp/${commandHash}-data.txt`;
  const fNameCommand = (fName || `/Temp/${commandHash}-command`) + '.js';
  // Pre-write contents to the file that will allow us to detect if our temp script never got run
  const initialContents = '<Insufficient RAM>';
  ns.write(fName, initialContents, 'w');
  // Prepare a command that will write out a new file containing the results of the command
  // unless it already exists with the same contents (saves time/ram to check first)
  // If an error occurs, it will write the error message to the file (detected when we read the result).
  // Anonymous replacer must stay in sync with helpers/gangs/helpers.ts getNsDataThroughFile_Custom
  // so the same fName + .js temp script is byte-identical across both code paths.
  const commandToFile =
    `let r;try{r=JSON.stringify(\n` +
    `    ${command}\n` +
    `,function(_key,val){` +
    `if(val===Infinity)return{$type:'number',$value:'Infinity'};` +
    `if(val===-Infinity)return{$type:'number',$value:'-Infinity'};` +
    `if(typeof val==='number'&&Number.isNaN(val))return{$type:'number',$value:'NaN'};` +
    `if(typeof val==='bigint')return{$type:'bigint',$value:val.toString()};` +
    `if(val instanceof Map)return{$type:'Map',$value:[...val]};` +
    `if(val instanceof Set)return{$type:'Set',$value:[...val]};` +
    `return val;` +
    `});}catch(e){r="ERROR: "+(typeof e=='string'?e:e?.message??JSON.stringify(e));}\n` +
    `const f="${fName}"; if(ns.read(f)!==r) ns.write(f,r,'w')`;
  // Run the command with auto-retries if it fails
  const pid = await runCommand_Custom(ns, fnRun, commandToFile, fNameCommand, args, verbose, maxRetries, retryDelayMs);
  // Wait for the process to complete. Note, as long as the above returned a pid, we don't actually have to check it, just the file contents
  const fnIsAlive = (_ignoredPid: number) => ns.read(fName) === initialContents;
  await waitForProcessToComplete_Custom(ns, fnIsAlive, pid, verbose);
  if (verbose) log(ns, `Process ${pid} is done. Reading the contents of ${fName}...`);
  // Read the file, with auto-retries if it fails // TODO: Unsure reading a file can fail or needs retrying.
  let lastRead: string | undefined;
  const fileData = await autoRetry(
    ns,
    () => ns.read(fName),
    (f: string) =>
      (lastRead = f) !== undefined &&
      f !== '' &&
      f !== initialContents &&
      !(typeof f == 'string' && f.startsWith('ERROR: ')),
    (): string =>
      `\nns.read('${fName}') returned a bad result: "${lastRead}".` +
      `\n  Script:  ${fNameCommand}\n  Args:    ${JSON.stringify(args)}\n  Command: ${command}` +
      (lastRead == undefined
        ? '\nThe developer has no idea how this could have happened. Please post a screenshot of this error on discord.'
        : lastRead == initialContents
          ? `\nThe script that ran this will likely recover and try again later once you have more free ram.`
          : lastRead == ''
            ? `\nThe file appears to have been deleted before a result could be retrieved. Perhaps there is a conflicting script.`
            : `\nThe script was likely passed invalid arguments. Please post a screenshot of this error on discord.`),
    maxRetries,
    retryDelayMs,
    undefined,
    verbose,
    verbose,
  );
  if (verbose) log(ns, `Read the following data for command ${command}:\n${fileData}`);
  return JSON.parse(fileData, jsonReviver);
}

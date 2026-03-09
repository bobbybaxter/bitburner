import type { NS } from '@ns';
import { Do } from '/helpers/do.js';
import { Stack } from '/helpers/Stack.js';

/**
 * Return a formatted representation of the monetary amount using scale symbols (e.g. $6.50M)
 * @param {number} num - The number to format
 * @param {number=} maxSignificantFigures - (default: 6) The maximum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} maxDecimalPlaces - (default: 3) The maximum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
export function formatMoney(num: number, maxSignificantFigures = 6, maxDecimalPlaces = 3): string {
  const numberShort = formatNumberShort(num, maxSignificantFigures, maxDecimalPlaces);
  return num >= 0 ? '$' + numberShort : numberShort.replace('-', '-$');
}

const symbols = ['', 'k', 'm', 'b', 't', 'q', 'Q', 's', 'S', 'o', 'n', 'e33', 'e36', 'e39'];

/**
 * Return a formatted representation of the monetary amount using scale sympols (e.g. 6.50M)
 * @param {number} num - The number to format
 * @param {number=} maxSignificantFigures - (default: 6) The maximum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} maxDecimalPlaces - (default: 3) The maximum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
export function formatNumberShort(num: number, maxSignificantFigures = 6, maxDecimalPlaces = 3): string {
  if (Math.abs(num) > 10 ** (3 * symbols.length))
    // If we've exceeded our max symbol, switch to exponential notation
    return num.toExponential(Math.min(maxDecimalPlaces, maxSignificantFigures - 1));
  let absNum = Math.abs(num);
  const sign = Math.sign(num);
  let i = 0;
  for (; absNum >= 1000 && i < symbols.length; i++) absNum /= 1000;
  // TODO: A number like 9.999 once rounded to show 3 sig figs, will become 10.00, which is now 4 sig figs.
  return (
    (sign < 0 ? '-' : '') +
    absNum.toFixed(
      Math.max(0, Math.min(maxDecimalPlaces, maxSignificantFigures - Math.floor(1 + Math.log10(absNum)))),
    ) +
    symbols[i]
  );
}

/** Convert a shortened number back into a value */
export function parseShortNumber(text = '0'): number {
  const parsed = Number(text);
  if (!isNaN(parsed)) return parsed;
  for (const sym of symbols.slice(1))
    if (text.toLowerCase().endsWith(sym))
      return Number.parseFloat(text.slice(0, text.length - sym.length)) * Math.pow(10, 3 * symbols.indexOf(sym));
  return Number.NaN;
}

/**
 * Return a number formatted with the specified number of significatnt figures or decimal places, whichever is more limiting.
 * @param {number} num - The number to format
 * @param {number=} minSignificantFigures - (default: 6) The minimum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} minDecimalPlaces - (default: 3) The minimum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
export function formatNumber(num: number, minSignificantFigures = 3, minDecimalPlaces = 1): number | string {
  return num == 0.0
    ? num
    : num.toFixed(Math.max(minDecimalPlaces, Math.max(0, minSignificantFigures - Math.ceil(Math.log10(num)))));
}

/** Formats some RAM amount as a round number of GB with thousands separators e.g. `1,028 GB` */
export function formatRam(num: number): string {
  return `${Math.round(num).toLocaleString('en')} GB`;
}

/** Return a datatime in ISO format */
export function formatDateTime(datetime: Date): string {
  return datetime.toISOString();
}

/** Format a duration (in milliseconds) as e.g. '1h 21m 6s' for big durations or e.g '12.5s' / '23ms' for small durations */
export function formatDuration(duration: number): string {
  if (duration < 1000) return `${duration.toFixed(0)}ms`;
  if (!isFinite(duration)) return 'forever (Infinity)';
  const portions = [];
  const msInHour = 1000 * 60 * 60;
  const hours = Math.trunc(duration / msInHour);
  if (hours > 0) {
    portions.push(hours + 'h');
    duration -= hours * msInHour;
  }
  const msInMinute = 1000 * 60;
  const minutes = Math.trunc(duration / msInMinute);
  if (minutes > 0) {
    portions.push(minutes + 'm');
    duration -= minutes * msInMinute;
  }
  const secondsNum = duration / 1000.0;
  // Include millisecond precision if we're on the order of seconds
  const secondsStr = hours === 0 && minutes === 0 ? secondsNum.toPrecision(3) : secondsNum.toFixed(0);
  if (secondsNum > 0) {
    portions.push(secondsStr + 's');
  }
  return portions.join(' ');
}

/** Generate a hashCode for a string that is pretty unique most of the time */
export function hashCode(s: string): number {
  return s.split('').reduce(function (a: number, b: string) {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
}

/** @param {NS} ns **/
export function disableLogs(ns: NS, listOfLogs: string[]): void {
  ['disableLog'].concat(...listOfLogs).forEach((log) => checkNsInstance(ns, '"disableLogs"').disableLog(log));
}

/** Joins all arguments as components in a path, e.g. pathJoin("foo", "bar", "/baz") = "foo/bar/baz" **/
export function pathJoin(...args: (string | undefined)[]): string {
  return args
    .filter((s) => !!s)
    .join('/')
    .replace(/\/\/+/g, '/');
}

/** Gets the path for the given local file, taking into account optional subfolder relocation via git-pull.js **/
export function getFilePath(file: string): string {
  const subfolder = ''; // git-pull.js optionally modifies this when downloading
  return pathJoin(subfolder, file);
}

// FUNCTIONS THAT PROVIDE ALTERNATIVE IMPLEMENTATIONS TO EXPENSIVE NS FUNCTIONS
// VARIATIONS ON NS.RUN

/** @param {NS} ns
 *  Use where a function is required to run a script and you have already referenced ns.run in your script **/
export function getFnRunViaNsRun(ns: NS): (script: string, threadOrOptions?: number, ...args: unknown[]) => number {
  return checkNsInstance(ns, '"getFnRunViaNsRun"').run as (
    script: string,
    threadOrOptions?: number,
    ...args: unknown[]
  ) => number;
}

/** @param {NS} ns
 *  Use where a function is required to run a script and you have already referenced ns.exec in your script **/
export function getFnRunViaNsExec(ns: NS, host = 'home') {
  checkNsInstance(ns, '"getFnRunViaNsExec"');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args passed through to ns.exec
  return function (scriptPath: string, ...args: any[]) {
    return ns.exec(scriptPath, host, ...args);
  };
}
// VARIATIONS ON NS.ISRUNNING

/** @param {NS} ns
 *  Use where a function is required to run a script and you have already referenced ns.run in your script  */
export function getFnIsAliveViaNsIsRunning(ns: NS): (pid: number) => boolean {
  return checkNsInstance(ns, '"getFnIsAliveViaNsIsRunning"').isRunning;
}

/** @param {NS} ns
 *  Use where a function is required to run a script and you have already referenced ns.ps in your script  */
export function getFnIsAliveViaNsPs(ns: NS) {
  checkNsInstance(ns, '"getFnIsAliveViaNsPs"');
  return function (pid: number, host: string) {
    return ns.ps(host).some((p) => p.pid === pid);
  };
}

/**
 * Retrieve the result of an ns command by executing it in a temporary .js script, writing the result to a file, then shuting it down
 * Importing incurs a maximum of 1.1 GB RAM (0 GB for ns.read, 1 GB for ns.run, 0.1 GB for ns.isRunning).
 * Has the capacity to retry if there is a failure (e.g. due to lack of RAM available). Not recommended for performance-critical code.
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {string} command - The ns command that should be invoked to get the desired data (e.g. "ns.getServer('home')" )
 * @param {string=} fName - (default "/Temp/{commandhash}-data.txt") The name of the file to which data will be written to disk by a temporary process
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 * @param {bool=} verbose - (default false) If set to true, pid and result of command are logged.
 **/
export async function getNsDataThroughFile(
  ns: NS,
  command: string,
  fName?: string,
  args: unknown[] = [],
  verbose = false,
  maxRetries = 5,
  retryDelayMs = 50,
): Promise<unknown> {
  checkNsInstance(ns, '"getNsDataThroughFile"');
  if (!verbose) disableLogs(ns, ['run', 'isRunning']);
  return await getNsDataThroughFile_Custom(
    ns,
    ns.run as FnRun,
    command,
    fName,
    args,
    verbose,
    maxRetries,
    retryDelayMs,
  );
}

/**
 * An advanced version of getNsDataThroughFile that lets you pass your own "fnRun" implementation to reduce RAM requirements
 * Importing incurs no RAM (now that ns.read is free) plus whatever fnRun you provide it
 * Has the capacity to retry if there is a failure (e.g. due to lack of RAM available). Not recommended for performance-critical code.
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {function} fnRun - A single-argument function used to start the new sript, e.g. `ns.run` or `(f,...args) => ns.exec(f, "home", ...args)`
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 **/
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ns.run compatibility
type FnRun = (script: string, threadOrOptions?: number, ...args: any[]) => number;

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
  // If an error occurs, it will write an empty file to avoid old results being misread.
  const commandToFile =
    `let r;try{r=JSON.stringify(\n` +
    `    ${command}\n` +
    `);}catch(e){r="ERROR: "+(typeof e=='string'?e:e.message||JSON.stringify(e));}\n` +
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
  return JSON.parse(fileData); // Deserialize it back into an object/array and return
}

/** Evaluate an arbitrary ns command by writing it to a new script and then running or executing it.
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {string} command - The ns command that should be invoked to get the desired data (e.g. "ns.getServer('home')" )
 * @param {string=} fileName - (default "/Temp/{commandhash}-data.txt") The name of the file to which data will be written to disk by a temporary process
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 * @param {bool=} verbose - (default false) If set to true, the evaluation result of the command is printed to the terminal
 */
export async function runCommand(
  ns: NS,
  command: string,
  fileName?: string,
  args: unknown[] = [],
  verbose = false,
  maxRetries = 5,
  retryDelayMs = 50,
): Promise<number> {
  checkNsInstance(ns, '"runCommand"');
  if (!verbose) disableLogs(ns, ['run']);
  return await runCommand_Custom(ns, ns.run as FnRun, command, fileName, args, verbose, maxRetries, retryDelayMs);
}

const _cachedExports: string[] = [];
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
  return _cachedExports;
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
  const required = getExports(ns).filter((e) => command.includes(`${e}(`));
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

/**
 * Wait for a process id to complete running
 * Importing incurs a maximum of 0.1 GB RAM (for ns.isRunning)
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {int} pid - The process id to monitor
 * @param {bool=} verbose - (default false) If set to true, pid and result of command are logged.
 **/
export async function waitForProcessToComplete(ns: NS, pid: number, verbose?: boolean): Promise<void> {
  checkNsInstance(ns, '"waitForProcessToComplete"');
  if (!verbose) disableLogs(ns, ['isRunning']);
  return await waitForProcessToComplete_Custom(ns, ns.isRunning, pid, verbose);
}
/**
 * An advanced version of waitForProcessToComplete that lets you pass your own "isAlive" test to reduce RAM requirements (e.g. to avoid referencing ns.isRunning)
 * Importing incurs 0 GB RAM (assuming fnIsAlive is implemented using another ns function you already reference elsewhere like ns.ps)
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {(pid: number) => Promise<boolean>} fnIsAlive - A single-argument function used to start the new sript, e.g. `ns.isRunning` or `pid => ns.ps("home").some(process => process.pid === pid)`
 **/
type FnIsAlive = (pid: number) => boolean | Promise<boolean>;

export async function waitForProcessToComplete_Custom(
  ns: NS,
  fnIsAlive: FnIsAlive,
  pid: number,
  verbose?: boolean,
): Promise<void> {
  checkNsInstance(ns, '"waitForProcessToComplete_Custom"');
  if (!verbose) disableLogs(ns, ['sleep']);
  // Wait for the PID to stop running (cheaper than e.g. deleting (rm) a possibly pre-existing file and waiting for it to be recreated)
  const start = Date.now();
  let sleepMs = 1;
  let done = false;
  for (let retries = 0; retries < 1000; retries++) {
    if (!(await fnIsAlive(pid))) {
      done = true;
      break; // Script is done running
    }
    if (verbose && retries % 100 === 0)
      ns.print(`Waiting for pid ${pid} to complete... (${formatDuration(Date.now() - start)})`);
    await ns.sleep(sleepMs);
    sleepMs = Math.min(sleepMs * 2, 200);
  }
  // Make sure that the process has shut down and we haven't just stopped retrying
  if (!done) {
    const errorMessage = `run-command pid ${pid} is running much longer than expected. Max retries exceeded.`;
    ns.print(errorMessage);
    throw new Error(errorMessage);
  }
}

/** If the argument is an Error instance, returns it as is, otherwise, returns a new Error instance. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

/** Helper to retry something that failed temporarily (can happen when e.g. we temporarily don't have enough RAM to run)
 * @param {NS} ns - The nestcript instance passed to your script's main entry point */
export async function autoRetry<T>(
  ns: NS,
  fnFunctionThatMayFail: () => T | Promise<T>,
  fnSuccessCondition: (result: T) => boolean,
  errorContext: string | (() => string) = 'Success condition not met',
  maxRetries = 5,
  initialRetryDelayMs = 50,
  backoffRate = 3,
  verbose = false,
  tprintFatalErrors = true,
): Promise<T> {
  checkNsInstance(ns, '"autoRetry"');
  let retryDelayMs = initialRetryDelayMs,
    attempts = 0;
  while (attempts++ <= maxRetries) {
    try {
      const result = (await Promise.resolve(fnFunctionThatMayFail())) as T;
      const errorMsg = typeof errorContext === 'string' ? errorContext : errorContext();
      if (!fnSuccessCondition(result)) throw asError(errorMsg);
      return result;
    } catch (caughtError: unknown) {
      const fatal = attempts >= maxRetries;
      const errMsg =
        typeof caughtError === 'string'
          ? caughtError
          : caughtError instanceof Error
            ? caughtError.message
            : JSON.stringify(caughtError);
      log(
        ns,
        `${fatal ? 'FAIL' : 'INFO'}: Attempt ${attempts} of ${maxRetries} failed` +
          (fatal ? `: ${errMsg}` : `. Trying again in ${retryDelayMs}ms...`),
        tprintFatalErrors && fatal,
        !verbose ? undefined : fatal ? 'error' : 'info',
      );
      if (fatal) throw asError(caughtError);
      await ns.sleep(retryDelayMs);
      retryDelayMs *= backoffRate;
    }
  }
  throw new Error('autoRetry: unreachable');
}

/** Helper to log a message, and optionally also tprint it and toast it
 * @param {NS} ns - The nestcript instance passed to your script's main entry point */
export function log(
  ns: NS,
  message = '',
  alsoPrintToTerminal = false,
  toastStyle?: string,
  maxToastLength = Number.MAX_SAFE_INTEGER,
): string {
  checkNsInstance(ns, '"log"');
  ns.print(message);
  if (toastStyle)
    ns.toast(
      message.length <= maxToastLength ? message : message.substring(0, maxToastLength - 3) + '...',
      toastStyle as 'info' | 'success' | 'warning' | 'error',
    );
  if (alsoPrintToTerminal) {
    ns.tprint(message);
    // TODO: Find a way write things logged to the terminal to a "permanent" terminal log file, preferably without this becoming an async function.
    //       Perhaps we copy logs to a port so that a separate script can optionally pop and append them to a file.
    //ns.write("log.terminal.txt", message + '\n', 'a'); // Note: we should get away with not awaiting this promise since it's not a script file
  }
  return message;
}

/** Helper to get a list of all hostnames on the network
 * @param {NS} ns - The nestcript instance passed to your script's main entry point */
export function scanAllServers(ns: NS): string[] {
  checkNsInstance(ns, '"scanAllServers"');
  const discoveredHosts: string[] = [];
  const seen = new Set<string>();
  const hostsToScan = new Stack<string>();
  hostsToScan.push('home');
  let infiniteLoopProtection = 9999;
  while (!hostsToScan.isEmpty() && infiniteLoopProtection-- > 0) {
    const hostName = hostsToScan.pop()!;
    if (seen.has(hostName)) continue;
    seen.add(hostName);
    discoveredHosts.push(hostName);
    for (const connectedHost of ns.scan(hostName)) if (!seen.has(connectedHost)) hostsToScan.push(connectedHost);
  }
  return discoveredHosts; // The list of scanned hosts should now be the set of all hosts in the game!
}

/** @param {NS} ns
 * Get a dictionary of active source files, taking into account the current active bitnode as well (optionally disabled). **/
export async function getActiveSourceFiles(
  ns: NS,
  includeLevelsFromCurrentBitnode = true,
): Promise<Record<number, number>> {
  return await getActiveSourceFiles_Custom(ns, getNsDataThroughFile, includeLevelsFromCurrentBitnode);
}

type FnGetNsDataThroughFile = (
  ns: NS,
  command: string,
  fName?: string,
  args?: unknown[],
  verbose?: boolean,
  maxRetries?: number,
  retryDelayMs?: number,
) => Promise<unknown>;

// TODO: update singularity to use Do.js
/** @param {NS} ns
 * @param {(ns: NS, command: string, fName?: string, args?: any, verbose?: any, maxRetries?: number, retryDelayMs?: number) => Promise<any>} fnGetNsDataThroughFile
 * getActiveSourceFiles Helper that allows the user to pass in their chosen implementation of getNsDataThroughFile to minimize RAM usage **/
export async function getActiveSourceFiles_Custom(
  ns: NS,
  fnGetNsDataThroughFile: FnGetNsDataThroughFile,
  includeLevelsFromCurrentBitnode = true,
): Promise<Record<number, number>> {
  checkNsInstance(ns, '"getActiveSourceFiles"');
  // Find out what source files the user has unlocked
  let dictSourceFiles: Record<number, number>;
  try {
    dictSourceFiles = (await fnGetNsDataThroughFile(
      ns,
      `Object.fromEntries(ns.singularity.getOwnedSourceFiles().map(sf => [sf.n, sf.lvl]))`,
      '/Temp/owned-source-files.txt',
    )) as Record<number, number>;
  } catch {
    dictSourceFiles = {};
  } // If this fails (e.g. low RAM), return an empty dictionary
  // If the user is currently in a given bitnode, they will have its features unlocked
  if (includeLevelsFromCurrentBitnode) {
    try {
      const resetInfo = (await Do(ns, 'ns.getResetInfo')) as { currentNode: number };
      const bitNodeN = resetInfo.currentNode;
      // const bitNodeN = (await fnGetNsDataThroughFile(ns, 'ns.getPlayer()', '/Temp/player-info.txt')).bitNodeN;
      dictSourceFiles[bitNodeN] = Math.max(3, dictSourceFiles[bitNodeN] || 0);
    } catch {
      /* We are expected to be fault-tolerant in low-ram conditions */
    }
  }
  return dictSourceFiles;
}

/** @param {NS} ns
 * Return bitnode multiplers, or null if they cannot be accessed. **/
export async function tryGetBitNodeMultipliers(ns: NS): Promise<unknown> {
  return await tryGetBitNodeMultipliers_Custom(ns, getNsDataThroughFile);
}

/** @param {NS} ns
 * tryGetBitNodeMultipliers Helper that allows the user to pass in their chosen implementation of getNsDataThroughFile to minimize RAM usage **/
export async function tryGetBitNodeMultipliers_Custom(
  ns: NS,
  fnGetNsDataThroughFile: FnGetNsDataThroughFile,
): Promise<unknown> {
  checkNsInstance(ns, '"tryGetBitNodeMultipliers"');
  let canGetBitNodeMultipliers = false;
  try {
    canGetBitNodeMultipliers = 5 in (await getActiveSourceFiles_Custom(ns, fnGetNsDataThroughFile));
  } catch {
    /* expected when source files unavailable */
  }
  if (!canGetBitNodeMultipliers) return null;
  try {
    return await fnGetNsDataThroughFile(ns, 'ns.getBitNodeMultipliers()', '/Temp/bitnode-multipliers.txt');
  } catch {
    /* expected when bitnode multipliers unavailable */
  }
  return null;
}

/** @param {NS} ns
 * Returns the number of instances of the current script running on the specified host. */
export async function instanceCount(ns: NS, onHost = 'home', warn = true, tailOtherInstances = true): Promise<number> {
  checkNsInstance(ns, '"alreadyRunning"');
  const scriptName = ns.getScriptName();
  const others = (await getNsDataThroughFile(
    ns,
    'ns.ps(ns.args[0]).filter(p => p.filename == ns.args[1]).map(p => p.pid)',
    '/Temp/ps-other-instances.txt',
    [onHost, scriptName],
  )) as number[];
  if (others.length >= 2) {
    if (warn)
      log(
        ns,
        `WARNING: You cannot start multiple versions of this script (${scriptName}). Please shut down the other instance first.` +
          (tailOtherInstances ? ' (To help with this, a tail window for the other instance will be opened)' : ''),
        true,
        'warning' as const,
      );
    if (tailOtherInstances)
      // Tail all but the last pid, since it will belong to the current instance (which will be shut down)
      others.slice(0, others.length - 1).forEach((pid) => ns.tail(pid));
  }
  return others.length;
}

let cachedStockSymbols: string[] | null = null; // Cache of stock symbols since these never change

/** Helper function to get all stock symbols, or null if you do not have TIX api access.
 * Caches symbols the first time they are successfully requested, since symbols never change.
 * @param {NS} ns */
export async function getStockSymbols(ns: NS): Promise<string[] | null> {
  cachedStockSymbols ??= (await getNsDataThroughFile(
    ns,
    `(() => { try { return ns.stock.getSymbols(); } catch { return null; } })()`,
    '/Temp/stock-symbols.txt',
  )) as string[] | null;
  return cachedStockSymbols;
}

/** Helper function to get the total value of stocks using as little RAM as possible.
 * @param {NS} ns */
export async function getStocksValue(ns: NS): Promise<number> {
  const stockSymbols = await getStockSymbols(ns);
  if (stockSymbols == null) return 0; // No TIX API Access
  const helper = async (fn: string) =>
    await getNsDataThroughFile(
      ns,
      `Object.fromEntries(ns.args.map(sym => [sym, ns.stock.${fn}(sym)]))`,
      `/Temp/stock-${fn}.txt`,
      stockSymbols,
    );
  const askPrices = (await helper('getAskPrice')) as Record<string, number>;
  const bidPrices = (await helper('getBidPrice')) as Record<string, number>;
  const positions = (await helper('getPosition')) as Record<string, [number, number, number, number]>;
  return stockSymbols
    .map((sym: string) => ({
      sym,
      pos: positions[sym],
      ask: askPrices[sym],
      bid: bidPrices[sym],
    }))
    .reduce(
      (total: number, stk) =>
        total +
        stk.pos[0] * stk.bid /* Long Value */ +
        stk.pos[2] * (stk.pos[3] * 2 - stk.ask) /* Short Value */ -
        // Subtract commission only if we have one or more shares (this is money we won't get when we sell our position)
        // If for some crazy reason we have shares both in the short and long position, we'll have to pay the commission twice (two separate sales)
        100000 * (Math.sign(stk.pos[0]) + Math.sign(stk.pos[2])),
      0,
    );
}

/** @param {NS} ns
 * Returns a helpful error message if we forgot to pass the ns instance to a function */
export function checkNsInstance(ns: NS | undefined, fnName = 'this function'): NS {
  if (ns === undefined || !ns.print) throw new Error(`The first argument to ${fnName} should be a 'ns' instance.`);
  return ns;
}

type ArgsSchemaEntry = [string, string | number | boolean | string[] | null];

/** A helper to parse the command line arguments with a bunch of extra features, such as
 * - Loading a persistent defaults override from a local config file named after the script.
 * - Rendering "--help" output without all scripts having to explicitly specify it
 * @param {NS} ns
 * @param {[string, string | number | boolean | string[]][]} argsSchema - Specification of possible command line args. **/
export function getConfiguration(ns: NS, argsSchema: ArgsSchemaEntry[]): Record<string, unknown> | null {
  checkNsInstance(ns, '"getConfig"');
  const scriptName = ns.getScriptName();
  // If the user has a local config file, override the defaults in the argsSchema
  const confName = `${scriptName}.config.txt`;
  const overrides = ns.read(confName);
  const overriddenSchema = overrides ? [...argsSchema] : argsSchema; // Clone the original args schema
  if (overrides) {
    try {
      let parsedOverrides: Record<string, unknown> = JSON.parse(overrides) as Record<string, unknown>;
      if (Array.isArray(parsedOverrides)) parsedOverrides = Object.fromEntries(parsedOverrides as [string, unknown][]);
      log(
        ns,
        `INFO: Applying ${Object.keys(parsedOverrides).length} overriding default arguments from "${confName}"...`,
      );
      for (const key in parsedOverrides) {
        const override = parsedOverrides[key];
        const matchIndex = overriddenSchema.findIndex((o: ArgsSchemaEntry) => o[0] == key);
        const match = matchIndex === -1 ? null : overriddenSchema[matchIndex];
        if (!match)
          throw new Error(
            `Unrecognized key "${key}" does not match of this script's options: ` +
              JSON.stringify(argsSchema.map((a) => a[0])),
          );
        else if (override === undefined)
          throw new Error(
            `The key "${key}" appeared in the config with no value. Some value must be provided. Try null?`,
          );
        else if (match && JSON.stringify(match[1]) != JSON.stringify(override)) {
          if (typeof match[1] !== typeof override)
            log(
              ns,
              `WARNING: The "${confName}" overriding "${key}" value: ${JSON.stringify(
                override,
              )} has a different type (${typeof override}) than the ` +
                `current default value ${JSON.stringify(
                  match[1],
                )} (${typeof match[1]}). The resulting behaviour may be unpredictable.`,
              false,
              'warning',
            );
          else log(ns, `INFO: Overriding "${key}" value: ${JSON.stringify(match[1])}  ->  ${JSON.stringify(override)}`);
          overriddenSchema[matchIndex] = [match[0], override as string | number | boolean | string[] | null]; // Update the value in the schema
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
      log(
        ns,
        `ERROR: There's something wrong with your config file "${confName}", it cannot be loaded.` +
          `\nThe error encountered was: ${errMsg}` +
          `\nYour config file should either be a dictionary e.g.: { "string-opt": "value", "num-opt": 123, "array-opt": ["one", "two"] }` +
          `\nor an array of dict entries (2-element arrays) e.g.: [ ["string-opt", "value"], ["num-opt", 123], ["array-opt", ["one", "two"]] ]` +
          `\n"${confName}" contains:\n${overrides}`,
        true,
        'error',
        80,
      );
      return null;
    }
  }
  // Return the result of using the in-game args parser to combine the defaults with the command line args provided
  try {
    const flagsSchema = overriddenSchema as [string, string | number | boolean | string[]][];
    const finalOptions = ns.flags(flagsSchema);
    log(
      ns,
      `INFO: Running ${scriptName} with the following settings:` +
        Object.keys(finalOptions)
          .filter((a: string) => a != '_')
          .map(
            (a) =>
              `\n  ${a.length == 1 ? '-' : '--'}${a} = ${
                finalOptions[a] === null ? 'null' : JSON.stringify(finalOptions[a])
              }`,
          )
          .join('') +
        `\nrun ${scriptName} --help  to get more information about these options.`,
    );
    return finalOptions;
  } catch (err: unknown) {
    // Detect if the user passed invalid arguments, and return help text
    const error =
      ns.args.includes('help') || ns.args.includes('--help')
        ? null // Detect if the user explictly asked for help and suppress the error
        : err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : JSON.stringify(err);
    // Try to parse documentation about each argument from the source code's comments
    const source = ns.read(scriptName).split('\n');
    let argsRow = 1 + source.findIndex((row: string) => row.includes('argsSchema ='));
    const optionDescriptions: Record<string, string> = {};
    while (argsRow && argsRow < source.length) {
      const nextArgRow = source[argsRow++].trim();
      if (nextArgRow.length == 0) continue;
      if (nextArgRow[0] == ']' || nextArgRow.includes(';')) break; // We've reached the end of the args schema
      const commentSplit = nextArgRow.split('//').map((e: string) => e.trim());
      if (commentSplit.length != 2) continue; // This row doesn't appear to be in the format: [option...], // Comment
      const optionSplit = commentSplit[0].split("'"); // Expect something like: ['name', someDefault]. All we need is the name
      if (optionSplit.length < 2) continue;
      optionDescriptions[optionSplit[1] as string] = commentSplit[1];
    }
    log(
      ns,
      (error ? `ERROR: There was an error parsing the script arguments provided: ${error}\n` : 'INFO: ') +
        `${scriptName} possible arguments:` +
        argsSchema
          .map(
            (a: ArgsSchemaEntry) =>
              `\n  ${a[0].length == 1 ? ' -' : '--'}${a[0].padEnd(30)} ` +
              `Default: ${(a[1] === null ? 'null' : JSON.stringify(a[1])).padEnd(10)}` +
              (a[0] in optionDescriptions ? ` // ${optionDescriptions[a[0]]}` : ''),
          )
          .join('') +
        '\n' +
        `\nTip: All argument names, and some values support auto-complete. Hit the <tab> key to autocomplete or see possible options.` +
        `\nTip: Array arguments are populated by specifying the argument multiple times, e.g.:` +
        `\n       run ${scriptName} --arrayArg first --arrayArg second --arrayArg third  to run the script with arrayArg=[first, second, third]` +
        (!overrides
          ? `\nTip: You can override the default values by creating a config file named "${confName}" containing e.g.: { "arg-name": "preferredValue" }`
          : overrides && !error
            ? `\nNote: The default values are being modified by overrides in your local "${confName}":\n${overrides}`
            : `\nThis error may have been caused by your local overriding "${confName}" (especially if you changed the types of any options):\n${overrides}`),
      true,
    );
    return null; // Caller should handle null and shut down elegantly.
  }
}

/** In order to pass in args to pass along to the startup/completion script, they may have to be quoted, when given as
 * parameters to this script, but those quotes will have to be stripped when passing these along to a subsequent script as raw strings.
 * @param {string[]} args - The the array-argument passed to the script.
 * @returns {string[]} The the array-argument unescaped (or deserialized if a single argument starting with '[' was supplied]). */
export function unEscapeArrayArgs(args: string[]): string[] {
  // For convenience, also support args as a single stringified array
  if (args.length == 1 && args[0].startsWith('[')) return JSON.parse(args[0]);
  // Otherwise, args wrapped in quotes should have those quotes removed.
  const escapeChars = ['"', "'", '`'];
  return args.map((arg: string) =>
    escapeChars.some((c) => arg.startsWith(c) && arg.endsWith(c)) ? arg.slice(1, -1) : arg,
  );
}

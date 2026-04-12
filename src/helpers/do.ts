import { NS } from '@ns';

// Hash function by @Insight from the Bitburner Discord
export function hashCode(s: string): number {
  return s.split('').reduce(function (a, b) {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
}

// Write the content to the file if it's different than what is already there
export function writeIfNotSame(ns: NS, filename: string, content: string): void {
  if (ns.read(filename) != content) {
    ns.write(filename, content, 'w');
  }
}

// Generates a very-very-likely to be unique ID.
function uniqueID(s: string, random = false): string {
  let answer = '';
  let remainder: number | string = '';
  if (random) {
    remainder = Math.floor(1e30 * Math.random());
  } else {
    remainder = hashCode(s);
  }
  if (remainder < 0) {
    remainder = -remainder;
  }
  while (remainder > 0) {
    answer = answer + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'[remainder % 64];
    remainder = Math.floor(remainder / 64);
  }
  return answer;
}

const DO_ERROR_MARKER = '__doError';

/** Player keys that warn when read (e.g. by JSON.stringify of full getPlayer() result). */
const DEPRECATED_PLAYER_SERIALIZE_KEYS = JSON.stringify([
  'playtimeSinceLastAug',
  'playtimeSinceLastBitnode',
  'bitNodeN',
]);

/** CorporationInfo keys that warn when read (JSON.stringify in Do() enumerates every property). */
const DEPRECATED_CORPORATION_SERIALIZE_KEYS = JSON.stringify(['state']);

function doMainBodyForCommand(command: string): string {
  if (command === 'ns.getPlayer') {
    return `const _raw = await ns.getPlayer(...JSON.parse(ns.args[0]));
    const _exc = ${DEPRECATED_PLAYER_SERIALIZE_KEYS};
    const result =
      _raw == null
        ? "UnDeFiNeDaF"
        : Object.keys(_raw).reduce((copy, key) => {
            if (!_exc.includes(key)) copy[key] = _raw[key];
            return copy;
          }, {});`;
  }
  if (command === 'ns.corporation.getCorporation') {
    return `const _raw = await ns.corporation.getCorporation(...JSON.parse(ns.args[0]));
    const _exc = ${DEPRECATED_CORPORATION_SERIALIZE_KEYS};
    const result =
      _raw == null
        ? "UnDeFiNeDaF"
        : Object.keys(_raw).reduce((copy, key) => {
            if (!_exc.includes(key)) copy[key] = _raw[key];
            return copy;
          }, {});`;
  }
  return `const result = (await ${command}(...JSON.parse(ns.args[0]))) ?? "UnDeFiNeDaF";`;
}

// Writes a command to a file, runs it, and then returns the result. On failure, logs and rethrows.
export async function Do(ns: NS, command: string, ...args: unknown[]): Promise<unknown> {
  //FFIGNORE
  const progname = '/temp/proc-' + uniqueID(command);
  writeIfNotSame(
    ns,
    progname + '.js',
    `export async function main(ns) {
  try {
    ${doMainBodyForCommand(command)}
    ns.writePort(ns.pid, JSON.stringify(result), 'w');
  } catch (e) {
    ns.writePort(ns.pid, JSON.stringify({ ${DO_ERROR_MARKER}: true, message: (e && e.message) || String(e) }), 'w');
  }
}`,
  );
  let pid = ns.run(progname + '.js', 1, JSON.stringify(args));
  let z = -1;
  while (0 == pid) {
    z += 1;
    await ns.asleep(z);
    pid = ns.run(progname + '.js', 1, JSON.stringify(args));
  }
  await ns.getPortHandle(pid).nextWrite();
  const answer = JSON.parse(ns.readPort(pid));
  if (answer && typeof answer === 'object' && answer[DO_ERROR_MARKER] === true) {
    const msg = answer.message ?? 'Unknown error';
    ns.tprint(`Do(${command}) error: ${msg}`);
    throw new Error(msg);
  }
  return answer === 'UnDeFiNeDaF' ? null : answer;
}

/** Walk from `pathFromHome[pathFromHome.length-1]` to `home` using only neighbor connects. */
const SINGULARITY_WALK_TO_HOME_FROM_PATH = `const pathFromHome = JSON.parse(ns.args[0]);
    for (let _i = pathFromHome.length - 2; _i >= 0; _i--) {
      if (!ns.singularity.connect(pathFromHome[_i])) {
        throw new Error('connect failed toward ' + pathFromHome[_i]);
      }
    }
    if (!ns.singularity.connect('home')) {
      throw new Error('connect home failed');
    }`;

/**
 * Moves the terminal to home using only neighbor connects (required by the singularity API).
 * @param pathFromHome Shortest path from home to the server you are on (`getPathFromHomeTo` in `/helpers/get-path-from-home`).
 */
export async function DoSingularityConnectToHome(ns: NS, pathFromHome: string[]): Promise<unknown> {
  const command = 'connectToHome';
  const progname = '/temp/proc-' + uniqueID(command);
  writeIfNotSame(
    ns,
    progname + '.js',
    `export async function main(ns) {
  try {
    ${SINGULARITY_WALK_TO_HOME_FROM_PATH}
    ns.writePort(ns.pid, JSON.stringify(null), 'w');
  } catch (e) {
    ns.writePort(ns.pid, JSON.stringify({ ${DO_ERROR_MARKER}: true, message: (e && e.message) || String(e) }), 'w');
  }
}`,
  );
  let pid = ns.run(progname + '.js', 1, JSON.stringify(pathFromHome));
  let z = -1;
  while (0 == pid) {
    z += 1;
    await ns.asleep(z);
    pid = ns.run(progname + '.js', 1, JSON.stringify(pathFromHome));
  }
  await ns.getPortHandle(pid).nextWrite();
  const answer = JSON.parse(ns.readPort(pid));
  if (answer && typeof answer === 'object' && answer[DO_ERROR_MARKER] === true) {
    const msg = answer.message ?? 'Unknown error';
    ns.tprint(`DoSingularityConnectToHome error: ${msg}`);
    throw new Error(msg);
  }
  return answer === 'UnDeFiNeDaF' ? null : answer;
}

/**
 * After navigating to the target with {@link Do}(connect, …), installs a backdoor, waits for the
 * install to finish, then walks the terminal home (one neighbor at a time). Waiting before moving
 * avoids connect() failing while the backdoor UI is active (often leaving you stuck on e.g. n00dles).
 * @param pathFromHome Shortest path from home to the backdoor target (`getPathFromHomeTo`).
 */
export async function DoSingularityInstallBackdoorReturnHome(ns: NS, pathFromHome: string[]): Promise<unknown> {
  const command = 'installBackdoorReturnHome';
  const progname = '/temp/proc-' + uniqueID(command);
  writeIfNotSame(
    ns,
    progname + '.js',
    `export async function main(ns) {
  try {
    const p = ns.singularity.installBackdoor();
    await p;
    ${SINGULARITY_WALK_TO_HOME_FROM_PATH}
    ns.writePort(ns.pid, JSON.stringify(null), 'w');
  } catch (e) {
    ns.writePort(ns.pid, JSON.stringify({ ${DO_ERROR_MARKER}: true, message: (e && e.message) || String(e) }), 'w');
  }
}`,
  );
  let pid = ns.run(progname + '.js', 1, JSON.stringify(pathFromHome));
  let z = -1;
  while (0 == pid) {
    z += 1;
    await ns.asleep(z);
    pid = ns.run(progname + '.js', 1, JSON.stringify(pathFromHome));
  }
  await ns.getPortHandle(pid).nextWrite();
  const answer = JSON.parse(ns.readPort(pid));
  if (answer && typeof answer === 'object' && answer[DO_ERROR_MARKER] === true) {
    const msg = answer.message ?? 'Unknown error';
    ns.tprint(`DoSingularityInstallBackdoorReturnHome error: ${msg}`);
    throw new Error(msg);
  }
  return answer === 'UnDeFiNeDaF' ? null : answer;
}

// Writes a command to a file, runs against every argument, and then returns the result as an object. On failure, logs and rethrows.
export async function DoAll(ns: NS, command: string, args: unknown[]): Promise<unknown> {
  const progname = '/temp/procA-' + uniqueID(command);
  writeIfNotSame(
    ns,
    progname + '.js',
    `export async function main(ns) {
  try {
    let parsed = JSON.parse(ns.args[0]);
    let answer = {};
    for (let i = 0; i < parsed.length; i++) { answer[parsed[i]] = await ` +
      command +
      `(parsed[i]); }
    ns.writePort(ns.pid, JSON.stringify(answer), 'w');
  } catch (e) {
    ns.writePort(ns.pid, JSON.stringify({ ${DO_ERROR_MARKER}: true, message: (e && e.message) || String(e) }), 'w');
  }
}`,
  );
  let pid = ns.run(progname + '.js', 1, JSON.stringify(args));
  while (0 == pid) {
    await ns.asleep(0);
    pid = ns.run(progname + '.js', 1, JSON.stringify(args));
  }
  while (ns.peek(pid) == 'NULL PORT DATA') {
    await ns.asleep(0);
  }
  const answer = JSON.parse(ns.readPort(pid));
  if (answer && typeof answer === 'object' && answer[DO_ERROR_MARKER] === true) {
    const msg = answer.message ?? 'Unknown error';
    ns.tprint(`DoAll(${command}) error: ${msg}`);
    throw new Error(msg);
  }
  return answer;
}

// Writes a command to a file, runs against every argument, and then returns the result as an object. On failure, logs and rethrows.
export async function DoAllComplex(ns: NS, command: string, args: unknown[]): Promise<unknown> {
  const progname = '/temp/procC-' + uniqueID(command);
  writeIfNotSame(
    ns,
    progname + '.js',
    `export async function main(ns) {
  try {
    let parsed = JSON.parse(ns.args[0]);
    let answer = {};
    for (let i = 0; i < parsed.length; i++) { answer[parsed[i]] = await ` +
      command +
      `(...parsed[i]); }
    ns.writePort(ns.pid, JSON.stringify(answer), 'w');
  } catch (e) {
    ns.writePort(ns.pid, JSON.stringify({ ${DO_ERROR_MARKER}: true, message: (e && e.message) || String(e) }), 'w');
  }
}`,
  );
  let pid = ns.run(progname + '.js', 1, JSON.stringify(args));
  while (0 == pid) {
    await ns.asleep(0);
    pid = ns.run(progname + '.js', 1, JSON.stringify(args));
  }
  while (ns.peek(pid) == 'NULL PORT DATA') {
    await ns.asleep(0);
  }
  const answer = JSON.parse(ns.readPort(pid));
  if (answer && typeof answer === 'object' && answer[DO_ERROR_MARKER] === true) {
    const msg = answer.message ?? 'Unknown error';
    ns.tprint(`DoAllComplex(${command}) error: ${msg}`);
    throw new Error(msg);
  }
  return answer;
}

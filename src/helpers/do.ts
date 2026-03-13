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

// Writes a command to a file, runs it, and then returns the result
export async function Do(ns: NS, command: string, ...args: unknown[]): Promise<unknown> {
  //FFIGNORE
  const progname = '/temp/proc-' + uniqueID(command);
  writeIfNotSame(
    ns,
    progname + '.js',
    `export async function main(ns) { ns.writePort(ns.pid, JSON.stringify((await ` +
      command +
      `(...JSON.parse(ns.args[0]))) ?? "UnDeFiNeDaF"), 'w'); }`,
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
  return answer === 'UnDeFiNeDaF' ? null : answer;
}

// Writes a command to a file, runs against every argument, and then returns the result as an object
export async function DoAll(ns: NS, command: string, args: unknown[]): Promise<unknown> {
  const progname = '/temp/procA-' + uniqueID(command);
  writeIfNotSame(
    ns,
    progname + '.js',
    `export async function main(ns) { let parsed = JSON.parse(ns.args[0]); let answer = {}; for (let i = 0; i < parsed.length ; i++) {answer[parsed[i]] = await ` +
      command +
      `(parsed[i]);}; ns.writePort(ns.pid, JSON.stringify(answer), 'w'); }`,
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
  return answer;
}

// Writes a command to a file, runs against every argument, and then returns the result as an object
export async function DoAllComplex(ns: NS, command: string, args: unknown[]): Promise<unknown> {
  const progname = '/temp/procC-' + uniqueID(command);
  writeIfNotSame(
    ns,
    progname + '.js',
    `export async function main(ns) { let parsed = JSON.parse(ns.args[0]); let answer = {}; for (let i = 0; i < parsed.length ; i++) {answer[parsed[i]] = await ` +
      command +
      `(...parsed[i]);}; ns.writePort(ns.pid, JSON.stringify(answer), 'w'); }`,
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
  return answer;
}

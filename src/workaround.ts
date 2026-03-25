/**
 * Do NOT import any script except @ns
 */
import type { NS } from '@ns';

let originalRevokeObjectURLFunction: ((url: string) => void) | null = null;

export function disableURLRevokeObjectURL() {
  if (originalRevokeObjectURLFunction === null) {
    originalRevokeObjectURLFunction = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => {
      console.log(`Url ${url} has been requested to be revoked. This request has been cancelled.`);
    };
    console.log('URL.revokeObjectURL has been disabled');
  }
}

export function enableURLRevokeObjectURL() {
  if (originalRevokeObjectURLFunction === null) {
    throw new Error('URL.revokeObjectURL has not been disabled');
  }
  URL.revokeObjectURL = originalRevokeObjectURLFunction;
  originalRevokeObjectURLFunction = null;
  console.log('URL.revokeObjectURL has been enabled');
}

const FLAGS: [string, string | number | boolean | string[]][] = [
  ['all', false],
  ['hud', false],
  ['daemon', false],
];

export function autocomplete(
  data: { flags: (schema: [string, string | number | boolean | string[]][]) => void },
  _args: string[],
): string[] {
  data.flags(FLAGS);
  return ['--all', '--hud', '--daemon'];
}

export function main(ns: NS): void {
  disableURLRevokeObjectURL();

  const flags = ns.flags(FLAGS);
  const runHUD = flags.all || flags.hud;
  const runDaemon = flags.all || flags.daemon;
  if (runHUD) {
    ns.run('customHUD.js');
  }
  if (runDaemon) {
    ns.run('daemon.js', 1, '--maintainCorporation');
  }
}

import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';

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
  }
  return message;
}

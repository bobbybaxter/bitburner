import type { NS } from '@ns';
import { checkNsInstance } from './check-ns-instance';

/*
  Disables the specified logs for the given ns instance
  Example: disableLogs(ns, ['run', 'isRunning'])
  Will disable the run and isRunning logs for the given ns instance
  This is useful to reduce the amount of noise in the logs and to improve performance
  This is especially useful when running multiple instances of the same script
*/
export function disableLogs(ns: NS, listOfLogs: string[]): void {
  ['disableLog'].concat(...listOfLogs).forEach((log) => checkNsInstance(ns, '"disableLogs"').disableLog(log));
}

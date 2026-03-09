import type { NS } from '@ns';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ns.run compatibility
export type FnRun = (script: string, threadOrOptions?: number, ...args: any[]) => number;

export type FnIsAlive = (pid: number) => boolean | Promise<boolean>;

export type FnGetNsDataThroughFile = (
  ns: NS,
  command: string,
  fName?: string,
  args?: unknown[],
  verbose?: boolean,
  maxRetries?: number,
  retryDelayMs?: number,
) => Promise<unknown>;

export type ArgsSchemaEntry = [string, string | number | boolean | string[] | null];

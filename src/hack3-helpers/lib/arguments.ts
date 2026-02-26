import type { ScriptArg } from '@ns';

/**
 * Replace variables with calculated values.
 */
export function replaceArgs(args: ScriptArg[], replacer: Record<string, ScriptArg>): ScriptArg[] {
  return args.map((val: ScriptArg) => {
    const key = String(val);
    if (key in replacer) {
      return replacer[key];
    } else {
      return val;
    }
  });
}

export function withFlag(arg: string, flag: string): boolean {
  return arg.startsWith('-') && arg.indexOf(flag) > -1;
}

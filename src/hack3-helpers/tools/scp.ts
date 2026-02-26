import type { NS } from '@ns';
import { withFlag } from '/hack3-helpers/lib/arguments.js';
import { formatAbsolutePath, isFolder, lsPath } from '/hack3-helpers/lib/files.js';

export async function main(ns: NS): Promise<void> {
  let argument = ns.args as (string | number | boolean)[];
  const recursive = withFlag(String(argument[0] ?? ''), 'r');
  if (recursive) {
    argument = argument.slice(1);
  }

  const files = argument.slice(0, -1).map((arg: string | number | boolean) => formatAbsolutePath(String(arg), false));
  const dest = String(argument[argument.length - 1]);

  const toCopy: string[] = [];
  for (const file of files) {
    if (isFolder(ns, file)) {
      if (!recursive) {
        ns.tprint('-r flag not specified, not copying folder: ', file);
        continue;
      }
      toCopy.push(...lsPath(ns, file));
    } else {
      toCopy.push(file);
    }
  }
  if (toCopy.length > 0) {
    ns.scp(toCopy, dest);
  }
}

import type { NS } from '@ns';
import { withFlag } from '../lib/arguments.js';
import { endWithSlash, fileOrFolderExist, formatAbsolutePath, isFolder } from '../lib/files.js';

export async function main(ns: NS): Promise<void> {
  let argument = ns.args as (string | number | boolean)[];
  const recursive = withFlag(String(argument[0] ?? ''), 'r');
  if (recursive) {
    argument = argument.slice(1);
  }

  const target = formatAbsolutePath(String(argument[0]), false);

  if (!fileOrFolderExist(ns, target)) {
    ns.tprint('target not exist: ', target);
    ns.exit();
  }

  if (recursive && isFolder(ns, target)) {
    const host = ns.getHostname();
    const targetPrefix = endWithSlash(target);
    for (const file of ns.ls(host, target).filter((path) => path.startsWith(targetPrefix))) {
      ns.rm(formatAbsolutePath(file));
    }
  } else {
    if (isFolder(ns, target)) {
      ns.tprint('target is folder: ', target);
      ns.exit();
    }

    ns.rm(formatAbsolutePath(target));
  }
}

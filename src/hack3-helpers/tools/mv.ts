import type { NS } from '@ns';
import { endWithSlash, fileOrFolderExist, formatAbsolutePath, isFolder } from '/hack3-helpers/lib/files.js';

export async function main(ns: NS): Promise<void> {
  // All paths have to be converted to absolute paths;
  const src = formatAbsolutePath(String(ns.args[0]), false);
  const dest = formatAbsolutePath(String(ns.args[1]), false);

  if (!fileOrFolderExist(ns, src)) {
    ns.tprint('src not exist: ', src);
    ns.exit();
  }

  // Cannot overwrite a file with a folder
  if (ns.fileExists(dest) && isFolder(ns, src)) {
    ns.tprint('src: ', src, ' is folder, cannot overwrite file: ', dest);
    ns.exit();
  }

  const host = ns.getHostname();
  const destPrefix = endWithSlash(dest);
  const mvInside = isFolder(ns, dest);

  if (isFolder(ns, src)) {
    const srcPrefix = endWithSlash(src);
    const srcParentLen = endWithSlash(src, false).lastIndexOf('/') + 1;

    for (const srcFile of ns.ls(host, srcPrefix).filter((p) => p.startsWith(srcPrefix))) {
      const destFile = mvInside
        ? destPrefix + srcFile.substring(srcParentLen)
        : destPrefix + srcFile.substring(srcPrefix.length);
      ns.mv(host, srcFile, destFile);
    }
  } else {
    const destFile = mvInside ? destPrefix + src.substring(src.lastIndexOf('/') + 1) : dest;
    ns.mv(host, src, destFile);
  }
}

import type { NS } from '@ns';

export function isFolder(ns: NS, path: string): boolean {
  if (ns.fileExists(path)) {
    return false;
  } else {
    const lsList = ns.ls(ns.getHostname(), path);
    ns.print('checking is folder: ', path, ' listing: ', lsList);
    for (const idx in lsList) {
      if (lsList[idx].startsWith(endWithSlash(path))) {
        return true;
      }
    }
    return false;
  }
}

export function fileOrFolderExist(ns: NS, path: string): boolean {
  return ns.fileExists(path) || isFolder(ns, path);
}

export function formatAbsolutePath(path: string, withLeadingSlash = true): string {
  if (withLeadingSlash) {
    return path.startsWith('/') ? path : '/' + path;
  } else {
    return path.startsWith('/') ? path.substring(1) : path;
  }
}

export function endWithSlash(path: string, endsWith = true): string {
  if (endsWith) {
    return path.endsWith('/') ? path : path + '/';
  } else {
    return path.endsWith('/') ? path.substring(0, path.length - 1) : path;
  }
}

export function expandPath(curScriptPath: string, path: string): string {
  if (!path.startsWith('.')) {
    return path;
  }

  if (path.startsWith('.') && !path.startsWith('..')) {
    return curScriptPath.substring(0, curScriptPath.lastIndexOf('/')) + path.substring(1);
  }

  let tmpPath = path;
  let tmpCurPath = curScriptPath.substring(0, curScriptPath.lastIndexOf('/'));
  while (tmpPath.startsWith('../')) {
    tmpPath = tmpPath.substring(3);
    tmpCurPath = tmpCurPath.substring(0, tmpCurPath.lastIndexOf('/'));
  }
  return tmpCurPath + '/' + tmpPath;
}

export function lsPath(ns: NS, path: string): string[] {
  const prefix = formatAbsolutePath(endWithSlash(path), false);
  return ns.ls(ns.getHostname(), prefix).filter((path) => path.startsWith(prefix));
}

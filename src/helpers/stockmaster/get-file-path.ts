import { pathJoin } from './path-join';

/** Gets the path for the given local file, taking into account optional subfolder relocation via git-pull.js **/
export function getFilePath(file: string): string {
  const subfolder = ''; // git-pull.js optionally modifies this when downloading
  return pathJoin(subfolder, file);
}

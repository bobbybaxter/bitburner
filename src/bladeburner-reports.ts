import { NS } from '@ns';

export async function main(ns: NS) {
  const folder = 'bladeburner_reports';
  const files = ns.ls(ns.getHostname(), folder + '/');
  ns.print(`/${ns.getHostname()}/${folder}/ - ${files.length} file${files.length !== 1 ? 's' : ''} found.`);
  const choice = await ns.prompt('Select File', { type: 'select', choices: files });
  if (files.length > 0) ns.alert(ns.read(choice as string));
  else ns.alert(`There are no files inside ${folder}`);
}

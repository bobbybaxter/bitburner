import { NS } from '@ns';
import { getServerNames } from './helpers/get-server-names';

export async function main(ns: NS): Promise<void> {
  getServerNames(ns).forEach((server) => {
    ns.tprint(`${server.hostname} - ${server.name} - ${server.depth}`);
  });
}

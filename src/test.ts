import { NS } from '@ns';

export async function main(ns: NS): Promise<void> {
  const contracts = ns.bladeburner.getSkillNames();
  ns.tprint(JSON.stringify(contracts, null, 2));
  //
}

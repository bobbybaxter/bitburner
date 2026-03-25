import { NS } from '@ns';
import { Do } from '../do';

export async function createDivision(ns: NS, industryType: string, divisionName: string): Promise<void> {
  await Do(ns, 'ns.corporation.expandIndustry', industryType, divisionName);
  ns.tprint(`Created division ${divisionName} in the ${industryType} industry`);
}

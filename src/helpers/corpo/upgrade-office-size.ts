import { CityName, NS, Office } from '@ns';
import { Do } from '../do';

export async function upgradeOfficeSize({
  ns,
  divisionName,
  city,
  sizeNeed,
}: {
  ns: NS;
  divisionName: string;
  city: CityName;
  sizeNeed: number;
}): Promise<void> {
  const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city as CityName)) as Office;
  if (office.size >= sizeNeed) {
    ns.tprint(`Office ${city} already has ${office.size} slots, no need to upgrade.`);
    return;
  }

  for (let i = 0; i < sizeNeed - office.size; i++) {
    await Do(ns, 'ns.corporation.upgradeOfficeSize', divisionName, city as CityName, 1);
  }

  ns.tprint(`Upgraded office ${city} to ${sizeNeed} slots.`);
}

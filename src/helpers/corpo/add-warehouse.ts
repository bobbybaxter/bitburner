import { CityName, NS, Warehouse } from '@ns';
import { Do } from '../do';

export async function addWarehouse({
  ns,
  divisionName,
  city,
  amount,
}: {
  ns: NS;
  divisionName: string;
  city: CityName;
  amount: number;
}): Promise<void> {
  const hasWarehouse = (await Do(ns, 'ns.corporation.hasWarehouse', divisionName, city as CityName)) as Warehouse;
  if (!hasWarehouse) {
    await Do(ns, 'ns.corporation.purchaseWarehouse', divisionName, city as CityName);
    ns.tprint(`Purchased warehouse for ${divisionName} in ${city}`);
  }

  for (let i = 0; i < amount; i++) {
    await Do(ns, 'ns.corporation.upgradeWarehouse', divisionName, city as CityName);
  }

  const warehouse = (await Do(ns, 'ns.corporation.getWarehouse', divisionName, city as CityName)) as Warehouse;

  ns.tprint(`Upgraded warehouse x${amount} for ${divisionName} in ${city} to size ${warehouse.size}`);
}

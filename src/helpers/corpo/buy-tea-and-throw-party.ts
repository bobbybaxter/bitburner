import { CityName, NS, Office } from '@ns';
import { Do } from '../do';

export async function buyTeaAndThrowParty({
  ns,
  divisionName,
  cities,
}: {
  ns: NS;
  divisionName: string;
  cities: CityName[];
}): Promise<void> {
  const epsilon = 0.5;
  while (true) {
    for (const city of cities) {
      const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city as CityName)) as Office;
      if (office.avgEnergy < office.maxEnergy - epsilon) {
        await Do(ns, 'ns.corporation.buyTea', divisionName, city as CityName);
      }
      if (office.avgMorale < office.maxMorale - epsilon) {
        await Do(ns, 'ns.corporation.throwParty', divisionName, city as CityName, 500000);
      }
    }
    await Do(ns, 'ns.corporation.nextUpdate');
  }
}

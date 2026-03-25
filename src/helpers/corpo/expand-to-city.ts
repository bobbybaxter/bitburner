import { CityName, Division, NS } from '@ns';
import { Do } from '../do';

export async function expandToCity({
  ns,
  divisionName,
  city,
}: {
  ns: NS;
  divisionName: string;
  city: CityName;
}): Promise<void> {
  const division = (await Do(ns, 'ns.corporation.getDivision', divisionName)) as Division;
  if (!division) {
    ns.tprint(`Division ${divisionName} not found`);
    return;
  }

  if (division.cities.includes(city as CityName)) {
    ns.tprint(`City ${city} already expanded for ${division.name}`);
    return;
  }
  await Do(ns, 'ns.corporation.expandCity', division.name, city);
  ns.tprint(`Expanded city ${city} for ${division.name}`);
  await Do(ns, 'ns.corporation.hireEmployee', division.name, city, 'Operations');
  await Do(ns, 'ns.corporation.hireEmployee', division.name, city, 'Engineer');
  await Do(ns, 'ns.corporation.hireEmployee', division.name, city, 'Business');
  ns.tprint(`Hired 3 employees for ${division.name} in ${city}`);
}

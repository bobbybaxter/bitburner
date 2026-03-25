import { CityName, CorporationInfo, Division, InvestmentOffer, NS, Office, Warehouse } from '@ns';
import { ALL_CITIES } from './constants/all-cities';
import {
  addWarehouse,
  createCorporation,
  createDivision,
  expandToCity,
  type FinalRoles,
  upgradeOfficeSize,
} from './helpers/corpo';
import { Do } from './helpers/do';

type MaterialOrder = { material: string; totalAmount: number };

async function purchaseMaterials(
  ns: NS,
  divName: string,
  cities: readonly string[],
  orders: MaterialOrder[],
): Promise<void> {}

/** Wait until all offices have at least minMorale and minEnergy. */
async function waitForEmployeeStats(
  ns: NS,
  divisionName: string,
  cities: readonly string[],
  minMorale: number,
  minEnergy: number,
): Promise<void> {
  while (true) {
    let allReady = true;
    for (const city of cities) {
      const office = (await Do(ns, 'ns.corporation.getOffice', divisionName, city as CityName)) as Office;
      if (office.avgMorale < minMorale || office.avgEnergy < minEnergy) allReady = false;
    }
    if (allReady) break;
    await Do(ns, 'ns.corporation.nextUpdate');
  }
  ns.tprint(`Employee stats ready: morale >= ${minMorale}, energy >= ${minEnergy}`);
}

export async function main(ns: NS): Promise<void> {
  // create agriculture division if it doesn't exist
  await createCorporation(ns);

  // create first division in the Agriculture industry if it doesn't exist
  const corporation = (await Do(ns, 'ns.corporation.getCorporation')) as CorporationInfo;
  const divisions = corporation.divisions;
  if (divisions.length === 0) {
    await createDivision(ns, 'Agriculture', 'Agriculture One');
    ns.tprint('Created first division in the Agriculture industry: Agriculture One in Sector-12');
  }

  // expand to all cities and buy six warehouses each
  const division = (await Do(ns, 'ns.corporation.getDivision', 'Agriculture One')) as Division;

  for (let i = 0; i < ALL_CITIES.length; i++) {
    const city = ALL_CITIES[i] as CityName;

    if (division.cities.includes(city as CityName)) continue;
    await expandToCity({ ns, divisionName: division.name, city });
    await addWarehouse({ ns, divisionName: division.name, city, amount: 6 });
    await upgradeOfficeSize({ ns, divisionName: division.name, city, sizeNeed: 4 });
    ns.run(
      'build-rp-worker.js',
      1,
      division.name,
      city,
      55,
      JSON.stringify({
        Operations: 1,
        Engineer: 1,
        Business: 1,
        Management: 1,
      } satisfies FinalRoles),
    );
    ns.run('buy-tea-and-throw-party.js', 1, division.name, JSON.stringify(ALL_CITIES));
    await optimizeStorageAndFactory(ns, division.name);
  }

  if (!ns.corporation.hasUnlock('Smart Supply')) {
    await Do(ns, 'ns.corporation.purchaseUnlock', 'Smart Supply');
    ns.tprint('Purchased smart supply unlock');
    for (let i = 0; i < ALL_CITIES.length; i++) {
      const city = ALL_CITIES[i];
      await Do(ns, 'ns.corporation.setSmartSupply', division.name, city as CityName, true);
      ns.tprint(`Set smart supply for ${division.name} in ${city}`);
    }
  }

  if (ns.corporation.getHireAdVertCount(division.name) < 1) {
    await Do(ns, 'ns.corporation.hireAdVert', division.name);
    ns.tprint(`Hired advert for ${division.name}`);
  }

  for (let i = 0; i < ALL_CITIES.length; i++) {
    const city = ALL_CITIES[i];
    await Do(ns, 'ns.corporation.sellMaterial', division.name, city as CityName, 'Plants', 'MAX', 'MP');
    await Do(ns, 'ns.corporation.sellMaterial', division.name, city as CityName, 'Food', 'MAX', 'MP');
    ns.tprint(`Selling Plants and Food for ${division.name} in ${city}`);
  }

  const initialUpgrades = [
    'FocusWires',
    'Neural Accelerators',
    'Speech Processor Implants',
    'Nuoptimal Nootropic Injector Implants',
    'Smart Factories',
  ];
  const initialUpgradeTarget = 2;
  for (const upgrade of initialUpgrades) {
    let level = ns.corporation.getUpgradeLevel(upgrade);
    while (level < initialUpgradeTarget) {
      await Do(ns, 'ns.corporation.levelUpgrade', upgrade);
      level++;
      ns.tprint(`Leveled up ${upgrade} to ${level}.`);
    }
  }

  const divName = division.name;
  const cities = division.cities.length > 0 ? division.cities : (ALL_CITIES as CityName[]);

  // --- Phase: initial materials (one tick each) ---
  await purchaseMaterials(ns, divName, cities, [
    { material: 'Hardware', ratePerSec: 12.5 },
    { material: 'AI Cores', ratePerSec: 7.5 },
    { material: 'Real Estate', ratePerSec: 2700 },
  ]);
  ns.tprint('Initial materials: Hardware→125, AI Cores→75, Real Estate→27k (targets).');

  // --- Phase: ensure every city has at least 3 employees (Sector-12 gets none from expandIndustry) ---
  for (const city of cities) {
    const office = (await Do(ns, 'ns.corporation.getOffice', divName, city as CityName)) as Office;
    let count = office.numEmployees;
    while (count < 3) {
      if (ns.corporation.hireEmployee(divName, city as CityName)) count++;
      else await ns.asleep(100);
    }
  }
  ns.tprint('Ensured 3 employees per office.');

  // --- Phase: assign 1 Intern per office so morale/energy can rise (guide: 1/9 ratio; with 3 employees use 1 intern) ---
  // setAutoJobAssignment requires unassigned employees; clear all jobs, advance tick so unassignments apply, then set targets
  const allJobs = ['Intern', 'Operations', 'Engineer', 'Business', 'Management', 'Research & Development'];
  for (const city of cities) {
    for (const job of allJobs) {
      ns.corporation.setAutoJobAssignment(divName, city as CityName, job, 0);
    }
  }
  await ns.corporation.nextUpdate();
  for (const city of cities) {
    await Do(ns, 'ns.corporation.setAutoJobAssignment', divName, city as CityName, 'Intern', 1);
    await Do(ns, 'ns.corporation.setAutoJobAssignment', divName, city as CityName, 'Operations', 1);
    await Do(ns, 'ns.corporation.setAutoJobAssignment', divName, city as CityName, 'Engineer', 1);
  }
  ns.tprint('Set 1 Intern per office for morale/energy recovery.');

  // --- Phase: wait for employee morale/energy before investors ---
  await waitForEmployeeStats(ns, divName, cities, 100, 99.998);
  ns.tprint('Employee morale/energy ready.');

  // --- Phase: find investors (~$210b) ---
  const offer1 = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as InvestmentOffer;
  ns.tprint(`Investment offer: $${ns.formatNumber(offer1.funds)} for ${offer1.shares} shares`);
  await Do(ns, 'ns.corporation.acceptInvestmentOffer');
  ns.tprint('Accepted first investment offer.');

  // --- Phase: upgrade each office to 9 employees and assign jobs ---
  // Guide: 1/9 for interns; if morale/energy still drop use 1/6 — we use 2 Interns (2/9).
  const targetJobs: Record<string, number> = {
    Intern: 2,
    Operations: 2,
    Engineer: 2,
    Business: 1,
    Management: 1,
    'Research & Development': 1,
  };
  for (const city of cities) {
    const office = (await Do(ns, 'ns.corporation.getOffice', divName, city as CityName)) as Office;
    const sizeNeed = 9 - office.size;
    ns.tprint(`Office ${city} has ${office.size} slots, need ${sizeNeed}.`);

    if (sizeNeed > 0) {
      await Do(ns, 'ns.corporation.upgradeOfficeSize', divName, city as CityName, sizeNeed);
      ns.tprint(`Upgraded office ${city} to 9 slots.`);
    }
    // Hire up to 9 employees (no position = unassigned). setAutoJobAssignment requires unassigned employees.
    let hired = office.numEmployees;
    while (hired < 9) {
      if (await Do(ns, 'ns.corporation.hireEmployee', divName, city as CityName)) hired++;
      else await ns.asleep(100);
    }
    // Clear all jobs so everyone is unassigned
    for (const job of allJobs) {
      ns.corporation.setAutoJobAssignment(divName, city as CityName, job, 0);
    }
  }
  await ns.corporation.nextUpdate();
  for (const city of cities) {
    for (const [job, count] of Object.entries(targetJobs)) {
      await Do(ns, 'ns.corporation.setAutoJobAssignment', divName, city as CityName, job, count);
    }
  }
  ns.tprint('Office sizes and job assignments set (Intern 2, Ops 2, Eng 2, Bus 1, Mgmt 1, R&D 1).');

  // --- Phase: Smart Factories and Smart Storage to 10 ---
  for (const upgrade of ['Smart Factories', 'Smart Storage']) {
    while (ns.corporation.getUpgradeLevel(upgrade) < 10) {
      const cost = ns.corporation.getUpgradeLevelCost(upgrade);
      while (ns.corporation.getCorporation().funds < cost) {
        await ns.corporation.nextUpdate();
      }
      await Do(ns, 'ns.corporation.levelUpgrade', upgrade);
      ns.tprint(`Leveled ${upgrade} to ${ns.corporation.getUpgradeLevel(upgrade)}.`);
    }
  }

  // --- Phase: warehouse size 2k each ---
  const TARGET_WAREHOUSE_SIZE = 2000;
  for (const city of cities) {
    let warehouse = (await Do(ns, 'ns.corporation.getWarehouse', divName, city as CityName)) as Warehouse;
    while (warehouse.size < TARGET_WAREHOUSE_SIZE) {
      const cost = ns.corporation.getUpgradeWarehouseCost(divName, city as CityName, 1);
      while (ns.corporation.getCorporation().funds < cost) {
        await ns.corporation.nextUpdate();
      }
      await Do(ns, 'ns.corporation.upgradeWarehouse', divName, city as CityName, 1);
      warehouse = (await Do(ns, 'ns.corporation.getWarehouse', divName, city as CityName)) as Warehouse;
    }
    ns.tprint(`Warehouse ${city} at size ${warehouse.size}.`);
  }

  // --- Phase: second material buy (one tick) ---
  await purchaseMaterials(ns, divName, cities, [
    { material: 'Hardware', ratePerSec: 267.5 },
    { material: 'Robots', ratePerSec: 9.6 },
    { material: 'AI Cores', ratePerSec: 244.5 },
    { material: 'Real Estate', ratePerSec: 11940 },
  ]);
  ns.tprint('Second materials: HW→2800, Robots→96, AI Cores→2520, RE→146400 (targets).');

  // --- Phase: find investors again (~$5t) ---
  const offer2 = (await Do(ns, 'ns.corporation.getInvestmentOffer')) as InvestmentOffer;
  ns.tprint(`Second investment offer: $${ns.formatNumber(offer2.funds)}`);
  await Do(ns, 'ns.corporation.acceptInvestmentOffer');
  ns.tprint('Accepted second investment offer.');

  // --- Phase: warehouse size 3.8k each ---
  const TARGET_WAREHOUSE_SIZE_3_8K = 3800;
  for (const city of cities) {
    let warehouse = (await Do(ns, 'ns.corporation.getWarehouse', divName, city as CityName)) as Warehouse;
    while (warehouse.size < TARGET_WAREHOUSE_SIZE_3_8K) {
      const cost = ns.corporation.getUpgradeWarehouseCost(divName, city as CityName, 1);
      while (ns.corporation.getCorporation().funds < cost) {
        await ns.corporation.nextUpdate();
      }
      await Do(ns, 'ns.corporation.upgradeWarehouse', divName, city as CityName, 1);
      warehouse = (await Do(ns, 'ns.corporation.getWarehouse', divName, city as CityName)) as Warehouse;
    }
    ns.tprint(`Warehouse ${city} at size ${warehouse.size}.`);
  }

  // --- Phase: third material buy (one tick) --
  await purchaseMaterials(ns, divName, cities, [
    { material: 'Hardware', ratePerSec: 650 },
    { material: 'Robots', ratePerSec: 63 },
    { material: 'AI Cores', ratePerSec: 375 },
    { material: 'Real Estate', ratePerSec: 8400 },
  ]);
  ns.tprint('Third materials: HW→9300, Robots→726, AI Cores→6270, RE→230400 (targets).');

  const div = (await Do(ns, 'ns.corporation.getDivision', divName)) as Division;
  ns.tprint(`Done. Production mult: ${div.productionMult.toFixed(1)}.`);
}

import { AutocompleteData, NS } from '@ns';
import {
  NetscriptExtension,
  NetscriptFlags,
  NetscriptFlagsSchema,
  parseAutoCompleteDataFromDefaultConfig,
} from '/libs/NetscriptExtension';
import { corporationEventLogger } from './helpers/corpo/corporation-event-logger';
import { CorpState, EmployeePosition, UnlockName } from './helpers/corpo/corporation-formulas';
import {
  buyOptimalAmountOfInputMaterials,
  buyTeaAndThrowPartyForAllDivisions,
  clearPurchaseOrders,
  getProductMarkup,
  loopAllDivisionsAndCities,
  setOptimalSellingPriceForEverything,
  setSmartSupplyData,
  validateProductMarkupMap,
  waitForNumberOfCycles,
  waitUntilAfterStateHappens,
} from './helpers/corpo/corporation-utils';
import { Do } from './helpers/do';

export function autocomplete(data: AutocompleteData, _flags: string[]): string[] {
  return parseAutoCompleteDataFromDefaultConfig(data, defaultConfig);
}

let ns: NS;
let nsx: NetscriptExtension;
let config: NetscriptFlags;
const corporationSaveModeFile = '/tmp/corporation-save-mode.txt';

const defaultConfig: NetscriptFlagsSchema = [['maintainCorporation', false]];

function init(nsContext: NS) {
  ns = nsContext;
}

async function collectCorporationEventLog(): Promise<void> {
  await waitUntilAfterStateHappens(ns, CorpState.START);
  let reachProfitTarget = false;
  // noinspection InfiniteLoopJS
  while (true) {
    corporationEventLogger.cycle = corporationEventLogger.cycle + 1;
    await corporationEventLogger.generateDefaultEvent(ns);
    const corporation = ns.corporation.getCorporation();
    if (!reachProfitTarget && corporation.revenue - corporation.expenses >= 1e90) {
      corporationEventLogger.saveEventSnapshotData();
      reachProfitTarget = true;
    }
    await waitForNumberOfCycles(ns, 1);
  }
}

export async function main(nsContext: NS): Promise<void> {
  init(nsContext);
  nsx = new NetscriptExtension(ns);
  nsx.killProcessesSpawnFromSameScript();

  config = ns.flags(defaultConfig);

  ns.disableLog('ALL');
  // ns.ui.openTail();
  ns.clearLog();

  if (config.maintainCorporation === true && ns.corporation.hasCorporation()) {
    collectCorporationEventLog().then();
    clearPurchaseOrders(ns);

    // Clear purchase orders when script exits
    nsx.addAtExitCallback(() => {
      clearPurchaseOrders(ns);
    });
    let smartSupplyHasBeenEnabledEverywhere = false;
    const warehouseCongestionData = new Map<string, number>();
    let lastSaveForProductMode: boolean | undefined;
    let saveModeDiagnosticsCounter = 0;
    // noinspection InfiniteLoopJS
    while (true) {
      const saveForProductMode = ns.read(corporationSaveModeFile).trim() === '1';
      if (saveForProductMode !== lastSaveForProductMode) {
        ns.print(`Daemon save-for-product mode: ${saveForProductMode ? 'ON' : 'OFF'}`);
        lastSaveForProductMode = saveForProductMode;
      }
      if (saveForProductMode) {
        saveModeDiagnosticsCounter++;
        if (saveModeDiagnosticsCounter % 20 === 0) {
          const corp = ns.corporation.getCorporation();
          ns.print(
            `Daemon save mode active. Funds: ${ns.format.number(corp.funds)}, ` +
              `profit: ${ns.format.number(corp.revenue - corp.expenses)}/s`,
          );
        }
      }
      // Calculate product's markup ASAP
      if (ns.corporation.getCorporation().prevState === CorpState.PRODUCTION) {
        await loopAllDivisionsAndCities(ns, (divisionName, city) => {
          const division = ns.corporation.getDivision(divisionName);
          if (!division.makesProducts) {
            return;
          }
          const industryData = ns.corporation.getIndustryData(division.industry);
          const office = ns.corporation.getOffice(divisionName, city);
          for (const productName of division.products) {
            const product = ns.corporation.getProduct(divisionName, city, productName);
            if (product.developmentProgress < 100) {
              continue;
            }
            getProductMarkup(division, industryData, city, product, office);
          }
        });
      }

      await buyTeaAndThrowPartyForAllDivisions(ns);

      // Smart Supply
      if (!smartSupplyHasBeenEnabledEverywhere) {
        // Enable Smart Supply everywhere if we have unlocked this feature
        if (ns.corporation.hasUnlock(UnlockName.SMART_SUPPLY)) {
          await loopAllDivisionsAndCities(ns, (divisionName, city) => {
            ns.corporation.setSmartSupply(divisionName, city, true);
          });
          smartSupplyHasBeenEnabledEverywhere = true;
        }
        if (!smartSupplyHasBeenEnabledEverywhere && !saveForProductMode) {
          await setSmartSupplyData(ns);
          await buyOptimalAmountOfInputMaterials(ns, warehouseCongestionData);
        }
      }

      // Market TA2
      await setOptimalSellingPriceForEverything(ns);

      if (ns.corporation.getCorporation().prevState === CorpState.START) {
        await loopAllDivisionsAndCities(ns, async (divisionName, city) => {
          const office = ns.corporation.getOffice(divisionName, city);
          // Check for Unassigned employees
          const unassignedEmployees = office.employeeJobs.Unassigned;
          if (unassignedEmployees > 0) {
            const rndCount = office.employeeJobs['Research & Development'];
            const ok = await Do(
              ns,
              'ns.corporation.setJobAssignment',
              divisionName,
              city,
              EmployeePosition.RESEARCH_DEVELOPMENT,
              rndCount + unassignedEmployees,
            );
            if (!ok) {
              ns.print(
                `Daemon: could not move ${unassignedEmployees} unassigned employees to R&D ` +
                  `(${divisionName}, ${city})`,
              );
            }
          }
        });
        // Remove nonexistent product in productMarkupMap
        validateProductMarkupMap(ns);
      }
      await ns.corporation.nextUpdate();
    }
  }
}

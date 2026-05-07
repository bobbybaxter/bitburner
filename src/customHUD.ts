import { NS } from '@ns';
import { DAEMON_SCRIPT_NAME } from '/libs/constants';
import { NetscriptExtension } from '/libs/NetscriptExtension';
import { parseNumber } from '/libs/utils';
import { exposeInternalGameObjects } from './exploits';
import { UpgradeName } from './helpers/corpo/corporation-formulas';
import * as testingTools from './helpers/corpo/corporation-testing-tools';
import { clearPurchaseOrders, DivisionName, hasDivision } from './helpers/corpo/corporation-utils';

let ns: NS;
let nsx: NetscriptExtension;
let doc: Document;

const enableTestingTools = true;
let runCorpMaintain = false;
let runDelScripts = false;
let reload = false;
let runCorpRound = false;
let runCorpTest = false;

const STOCK_HUD_ROW_ATTR = 'data-custom-hud-stock-row';
const KARMA_HUD_ROW_ATTR = 'data-custom-hud-karma-row';

/** Clone a vanilla overview row (same pattern as stockmaster `helpers/stockmaster/hud.ts` `initializeHud`). */
function cloneOverviewStatRow(doc: Document): { row: HTMLElement; labelEl: HTMLElement; valueEl: HTMLElement } {
  const overviewHook = doc.getElementById('overview-extra-hook-0');
  if (!overviewHook?.parentElement?.parentElement) {
    throw new Error('HUD overview-extra-hook not found');
  }
  const templateRow = overviewHook.parentElement.parentElement as HTMLElement;
  const row = templateRow.cloneNode(true) as HTMLElement;
  row.querySelectorAll('p > p').forEach((el) => (el.parentElement as HTMLElement).removeChild(el));
  const ps = [...row.querySelectorAll('p')] as HTMLElement[];
  if (ps.length < 2) {
    throw new Error('Overview row clone did not yield two cells');
  }
  ps.forEach((el) => el.removeAttribute('id'));
  const [labelEl, valueEl] = ps;
  labelEl.innerHTML = '';
  valueEl.innerHTML = '';
  return { row, labelEl, valueEl };
}

function findMoneyOverviewRow(doc: Document): HTMLElement | null {
  const hook = doc.getElementById('overview-extra-hook-0');
  const hookRow = hook?.parentElement?.parentElement ?? null;
  const container = hookRow?.parentElement ?? null;
  if (!container) return null;
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child === hookRow) continue;
    const firstP = child.querySelector('p');
    const text = (firstP?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (/^money$/i.test(text)) return child;
  }
  return null;
}

function findIntOverviewRow(doc: Document): HTMLElement | null {
  const hook = doc.getElementById('overview-extra-hook-0');
  const hookRow = hook?.parentElement?.parentElement ?? null;
  const container = hookRow?.parentElement ?? null;
  if (!container) return null;
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child === hookRow) continue;
    const firstP = child.querySelector('p');
    const text = (firstP?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (/^int(elligence)?$/i.test(text)) return child;
  }
  return null;
}

function removeStockHudRows(doc: Document): void {
  doc.querySelectorAll(`[${STOCK_HUD_ROW_ATTR}]`).forEach((el) => el.remove());
}

function removeKarmaHudRow(doc: Document): void {
  doc.querySelectorAll(`[${KARMA_HUD_ROW_ATTR}]`).forEach((el) => el.remove());
}

/** Karma stat row directly under the vanilla Int overview row. */
function mountKarmaHudRowUnderInt(doc: Document): void {
  removeKarmaHudRow(doc);
  const intRow = findIntOverviewRow(doc);
  if (!intRow) return;
  const { row, labelEl, valueEl } = cloneOverviewStatRow(doc);
  row.setAttribute(KARMA_HUD_ROW_ATTR, '');
  labelEl.innerText = 'Karma';
  valueEl.id = 'hud-karma';
  valueEl.innerText = '0';
  intRow.insertAdjacentElement('afterend', row);
}

/**
 * StockWorth + Stockmaster as real overview rows directly under Money (stockmaster `hud.ts` placement style).
 */
function mountStockHudRowsUnderMoney(doc: Document): void {
  removeStockHudRows(doc);
  const hook = doc.getElementById('overview-extra-hook-0');
  const hookRow = hook?.parentElement?.parentElement ?? null;
  const container = hookRow?.parentElement ?? null;
  if (!hookRow || !container) return;

  const moneyRow = findMoneyOverviewRow(doc);
  const insertAfter = (anchor: HTMLElement, row: HTMLElement) => {
    anchor.insertAdjacentElement('afterend', row);
  };

  const makeRow = (labelText: string, valueId: string, initialValue: string) => {
    const { row, labelEl, valueEl } = cloneOverviewStatRow(doc);
    row.setAttribute(STOCK_HUD_ROW_ATTR, '');
    labelEl.innerText = labelText;
    valueEl.id = valueId;
    valueEl.innerText = initialValue;
    return row;
  };

  const rowWorth = makeRow('StockWorth', 'hud-stock-worth', '0');
  const rowMaster = makeRow('Stockmaster', 'hud-stockmaster-status', 'Offline');

  if (moneyRow) {
    insertAfter(moneyRow, rowWorth);
    insertAfter(rowWorth, rowMaster);
  } else {
    container.insertBefore(rowMaster, hookRow);
    container.insertBefore(rowWorth, rowMaster);
  }
}

function rerun(ns: NS) {
  ns.spawn(ns.getScriptName(), { spawnDelay: 100 });
}

type RemoteApiGlobals = {
  getRemoteFileApiConnectionStatus?: () => string;
  isRemoteFileApiConnectionLive?: () => boolean;
};

function updateRemoteApiHudCell(hudRemoteApi: HTMLElement): void {
  const g = globalThis as RemoteApiGlobals;
  let label = '—';
  if (typeof g.getRemoteFileApiConnectionStatus === 'function') {
    try {
      label = g.getRemoteFileApiConnectionStatus();
    } catch {
      label = 'err';
    }
  } else if (typeof g.isRemoteFileApiConnectionLive === 'function') {
    try {
      label = g.isRemoteFileApiConnectionLive() ? 'Online' : 'Offline';
    } catch {
      label = 'err';
    }
  }
  hudRemoteApi.innerText = label;
}

function setHudRowVisibility(labelElementId: string, valueElementId: string, visible: boolean): void {
  const labelElement = doc.getElementById(labelElementId);
  const valueElement = doc.getElementById(valueElementId);
  if (labelElement) {
    labelElement.style.display = visible ? '' : 'none';
  }
  if (valueElement) {
    valueElement.style.display = visible ? '' : 'none';
  }
}

function removeTestingTool() {
  const testingToolsDiv = doc.querySelector('#testing-tools');
  // Remove old tools
  if (testingToolsDiv) {
    testingToolsDiv.remove();
  }
}

function createTestingTool() {
  // Testing tools
  if (enableTestingTools) {
    removeTestingTool();

    // Create tools
    const root: Element = doc.querySelector('#root')!;
    const testingToolsTemplate = doc.createElement('template');
    testingToolsTemplate.innerHTML = `
<div id="testing-tools">
    <div>
        <button id="btn-corp-maintain">CorpMaintain</button>
        <button id="btn-unlimited-bonus-time">UnlimitedBonusTime</button>
        <button id="btn-remove-bonus-time">RemoveBonusTime</button>
        <button id="btn-corp-round">CorpRound</button>
        <button id="btn-corp-test">CorpTest</button>
        <button id="btn-import-save">ImportSave</button>
        <button id="btn-delete-all-scripts">DelScripts</button>
        <button id="btn-reload">Reload</button>
        <button id="btn-exit">Exit</button>
    </div>
    <div>
        <label for="testing-tools-input">Input:</label>
        <input id="testing-tools-input" type="text"/>
        <input id="testing-tools-file-input" type="file"/>
        <button id="btn-funds">Funds</button>
        <button id="btn-smart-factories">SmartFactories</button>
        <button id="btn-smart-storage">SmartStorage</button>
        <select id="select-save-data">
            <option value="current">Current</option>
        </select>
        <button id="btn-import-save-data">Import</button>
        <button id="btn-export-save-data">Export</button>
        <button id="btn-delete-save-data">Delete</button>
    </div>
    <div>
        <label for="testing-tools-divisions">Division:</label>
        <select name="divisions" id="testing-tools-divisions">
            <option value="Agriculture">Agriculture</option>
            <option value="Chemical">Chemical</option>
            <option value="T0">Tobacco</option>
        </select>
        <button id="btn-rp">RP</button>
        <button id="btn-office">Office</button>
        <button id="btn-warehouse">Warehouse</button>
        <button id="btn-boost-materials">BoostMats</button>
        <button id="btn-clear-boost-materials">ClearBoostMats</button>
        <button id="btn-clear-input-materials">ClearInputMats</button>
        <button id="btn-clear-output-materials">ClearOutputMats</button>
        <button id="btn-clear-storage">ClearStorage</button>
    </div>
    <div>
    </div>
    <style>
        #testing-tools {
            transform: translate(850px, 5px);z-index: 9999;display: flex;flex-flow: wrap;position: fixed;min-width: 150px;
            max-width: 840px;min-height: 33px;border: 1px solid rgb(68, 68, 68);color: white;
        }
        #testing-tools > div {
            width: 100%;display: flex;
        }
        #btn-corp-test {
            margin-right: auto;
        }
        #btn-import-save {
            margin-left: auto;
        }
        #btn-funds {
            margin-left: 10px;
        }
        #btn-rp {
            margin-left: 10px;
        }
        #testing-tools-file-input {
            display: none;
        }
        #select-save-data {
            min-width: 195px;
        }
    </style>
</div>
        `.trim();
    root.appendChild(testingToolsTemplate.content.firstChild!);
    const testingToolsDiv = doc.querySelector('#testing-tools')!;
    const savaDataSelectElement = doc.getElementById('select-save-data') as HTMLSelectElement;

    const reloadSaveDataSelectElement = async () => {
      const keys = await testingTools.getAllSaveDataKeys();
      keys.sort((a, b) => {
        if (a === 'save') {
          return 1;
        }
        return b.toString().localeCompare(a.toString());
      });
      savaDataSelectElement.innerHTML = '';
      for (const key of keys) {
        const option = document.createElement('option');
        option.text = key as string;
        option.value = key as string;
        savaDataSelectElement.add(option);
      }
    };

    reloadSaveDataSelectElement().then();
    doc.getElementById('btn-corp-maintain')!.addEventListener('click', function () {
      runCorpMaintain = true;
    });
    doc.getElementById('btn-unlimited-bonus-time')!.addEventListener('click', function () {
      testingTools.setUnlimitedBonusTime();
    });
    doc.getElementById('btn-remove-bonus-time')!.addEventListener('click', function () {
      testingTools.removeBonusTime();
    });
    doc.getElementById('btn-corp-round')!.addEventListener('click', function () {
      runCorpRound = true;
    });
    doc.getElementById('btn-corp-test')!.addEventListener('click', function () {
      runCorpTest = true;
    });
    doc.getElementById('btn-import-save')!.addEventListener('click', function () {
      const fileInput = doc.getElementById('testing-tools-file-input') as HTMLInputElement;
      fileInput.onchange = (e) => {
        const file = (<HTMLInputElement>e.target).files![0];
        const reader = new FileReader();
        reader.onload = function (this: FileReader, e: ProgressEvent<FileReader>) {
          const target = e.target;
          if (target === null) {
            throw new Error('Error importing file');
          }
          const result = target.result;
          const indexedDbRequest: IDBOpenDBRequest = window.indexedDB.open('bitburnerSave', 1);
          indexedDbRequest.onsuccess = function (this: IDBRequest<IDBDatabase>) {
            const db = this.result;
            if (!db) {
              throw new Error('Cannot access database');
            }
            const objectStore = db.transaction(['savestring'], 'readwrite').objectStore('savestring');
            const request = objectStore.put(result instanceof ArrayBuffer ? new Uint8Array(result) : result, 'save');
            request.onsuccess = () => {
              globalThis.setTimeout(() => globalThis.location.reload(), 1000);
            };
          };
        };
        if (file.name.endsWith('.gz')) {
          reader.readAsArrayBuffer(file);
        } else {
          reader.readAsText(file);
        }
      };
      fileInput.click();
    });
    doc.getElementById('btn-delete-all-scripts')!.addEventListener('click', function () {
      runDelScripts = true;
    });
    doc.getElementById('btn-reload')!.addEventListener('click', function () {
      reload = true;
      testingToolsDiv!.remove();
    });
    doc.getElementById('btn-exit')!.addEventListener('click', function () {
      testingToolsDiv!.remove();
    });

    const getInputValue = function () {
      return doc.querySelector<HTMLInputElement>('#testing-tools-input')!.value;
    };
    const useInputValueAsNumber = function (callback: (inputValue: number) => void) {
      const value = parseNumber(getInputValue());
      if (Number.isNaN(value)) {
        alert('Invalid input');
        return;
      }
      callback(value);
    };
    const useInputValueAsString = function (callback: (inputValue: string) => void) {
      const value = getInputValue();
      if (!value) {
        alert('Invalid input');
        return;
      }
      callback(value);
    };
    const getDivisionName = function (): string {
      return doc.querySelector<HTMLSelectElement>('#testing-tools-divisions')!.value;
    };
    doc.getElementById('btn-funds')!.addEventListener('click', function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setFunds(inputValue);
      });
    });
    doc.getElementById('btn-smart-factories')!.addEventListener('click', function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setUpgradeLevel(UpgradeName.SMART_FACTORIES, inputValue);
      });
    });
    doc.getElementById('btn-smart-storage')!.addEventListener('click', function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setUpgradeLevel(UpgradeName.SMART_STORAGE, inputValue);
      });
    });
    doc.getElementById('btn-import-save-data')!.addEventListener('click', function () {
      testingTools.getSaveData(savaDataSelectElement.value).then((saveData) => {
        if (!saveData) {
          return;
        }
        testingTools.updateSaveData('save', saveData).then(() => {
          ns.killall('home');
          const currentAllServers = globalThis.AllServers.saveAllServers();
          globalThis.SaveObject.loadGame(saveData);
          setTimeout(() => {
            globalThis.AllServers.loadAllServers(currentAllServers);
            ns.exec('daemon.js', 'home', 1, '--maintainCorporation');
          }, 1000);
        });
      });
    });
    doc.getElementById('btn-export-save-data')!.addEventListener('click', async function () {
      testingTools.insertSaveData(await globalThis.SaveObject.saveObject.getSaveData(true, true)).then(() => {
        reloadSaveDataSelectElement().then();
      });
    });
    doc.getElementById('btn-delete-save-data')!.addEventListener('click', function () {
      const key = savaDataSelectElement.value;
      if (!key) {
        return;
      }
      if (key === 'save') {
        alert(`You cannot delete the built-in "save"`);
        return;
      }
      testingTools.deleteSaveData(savaDataSelectElement.value).then(() => {
        reloadSaveDataSelectElement().then();
      });
    });
    doc.getElementById('btn-rp')!.addEventListener('click', function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setResearchPoints(getDivisionName(), inputValue);
      });
    });
    doc.getElementById('btn-office')!.addEventListener('click', function () {
      useInputValueAsString((inputValue: string) => {
        const employeeJobs: number[] = inputValue
          .trim()
          .split(',')
          .map((value) => parseNumber(value))
          .filter((value) => !Number.isNaN(value));
        if (employeeJobs.length !== 5) {
          alert('Invalid input');
          return;
        }
        testingTools.setOfficeSetup(getDivisionName(), employeeJobs);
      });
    });
    doc.getElementById('btn-warehouse')!.addEventListener('click', function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setWarehouseLevel(getDivisionName(), inputValue);
      });
    });
    doc.getElementById('btn-boost-materials')!.addEventListener('click', function () {
      useInputValueAsString((inputValue: string) => {
        const boostMaterials: number[] = inputValue
          .trim()
          .split(',')
          .map((value) => parseNumber(value))
          .filter((value) => !Number.isNaN(value));
        if (boostMaterials.length !== 4) {
          alert('Invalid input');
          return;
        }
        testingTools.setBoostMaterials(getDivisionName(), boostMaterials);
      });
    });
    doc.getElementById('btn-clear-boost-materials')!.addEventListener('click', function () {
      testingTools.setBoostMaterials(getDivisionName(), [0, 0, 0, 0]);
    });
    doc.getElementById('btn-clear-input-materials')!.addEventListener('click', function () {
      testingTools.clearMaterials(getDivisionName(), { input: true, output: false });
    });
    doc.getElementById('btn-clear-output-materials')!.addEventListener('click', function () {
      testingTools.clearMaterials(getDivisionName(), { input: false, output: true });
    });
    doc.getElementById('btn-clear-storage')!.addEventListener('click', function () {
      clearPurchaseOrders(ns);
      testingTools.setBoostMaterials(getDivisionName(), [0, 0, 0, 0]);
      testingTools.clearMaterials(getDivisionName(), { input: true, output: true });
    });
  }
}

export async function main(nsContext: NS): Promise<void> {
  exposeInternalGameObjects();
  testingTools.setDefaultSettings();
  ns = nsContext;
  nsx = new NetscriptExtension(ns);
  nsx.killProcessesSpawnFromSameScript();

  ns.disableLog('ALL');
  ns.clearLog();
  // ns.ui.openTail();

  doc = eval('document');
  const hook0 = doc.getElementById('overview-extra-hook-0')!;
  const hook1 = doc.getElementById('overview-extra-hook-1')!;
  nsx.addAtExitCallback(() => {
    hook0.innerText = '';
    hook1.innerText = '';
    removeStockHudRows(doc);
    removeKarmaHudRow(doc);
    removeTestingTool();
  });

  const headers = [];
  const values = [];

  headers.push('<div>RemoteAPI</div>');
  values.push("<div id='hud-remote-api'>—</div>");
  headers.push('<div>ServerLoad</div>');
  values.push("<div id='hud-server-load'>0%</div>");
  headers.push('<div>Scripts</div>');
  values.push("<div id='hud-scripts-count'>0</div>");
  mountKarmaHudRowUnderInt(doc);
  if (ns.stock.hasWseAccount()) {
    mountStockHudRowsUnderMoney(doc);
  }
  if (ns.corporation.hasCorporation()) {
    headers.push("<div id='hud-total-funds-label'>TotalFunds</div>");
    values.push("<div id='hud-total-funds-row'><div id='hud-total-funds'>0</div></div>");
    headers.push("<div id='hud-investment-offer-label'>InvestmentOffer</div>");
    values.push("<div id='hud-investment-offer-row'><div id='hud-investment-offer'>0</div></div>");
    headers.push("<div id='hud-corp-maintain-label'>CorpMaintain</div>");
    values.push("<div id='hud-corp-maintain-row'><div id='hud-corp-maintain'>false</div></div>");
  }

  hook0.innerHTML = headers.join('');
  hook1.innerHTML = values.join('');

  if (globalThis.Player) {
    createTestingTool();
  }

  while (true) {
    try {
      // Scan all runners and calculate server load
      let totalMaxRAMOfAllRunners = 0;
      let totalUsedRAMOfAllRunners = 0;
      let totalRunningScripts = 0;
      nsx
        .scanBFS('home')
        .filter((host) => {
          return ns.getServerMaxRam(host.hostname) > 0 && ns.hasRootAccess(host.hostname);
        })
        .forEach((runner) => {
          totalMaxRAMOfAllRunners += ns.getServerMaxRam(runner.hostname);
          totalUsedRAMOfAllRunners += ns.getServerUsedRam(runner.hostname);
          totalRunningScripts += ns.ps(runner.hostname).length;
        });
      doc.getElementById('hud-server-load')!.innerText =
        `${((totalUsedRAMOfAllRunners / totalMaxRAMOfAllRunners) * 100).toFixed(2)}%`;
      doc.getElementById('hud-scripts-count')!.innerText = `${totalRunningScripts}`;

      const hudRemoteApi = doc.getElementById('hud-remote-api');
      if (hudRemoteApi === null) {
        rerun(ns);
        return;
      }
      updateRemoteApiHudCell(hudRemoteApi);

      if (!doc.getElementById('hud-karma')) {
        mountKarmaHudRowUnderInt(doc);
      }
      const hudKarma = doc.getElementById('hud-karma');
      if (hudKarma !== null) {
        hudKarma.innerText = ns.format.number(ns.getPlayer().karma);
      }

      if (ns.stock.hasWseAccount()) {
        const hudStockWorthValue = doc.getElementById('hud-stock-worth');
        if (hudStockWorthValue === null) {
          rerun(ns);
          return;
        }
        const stockStats = nsx.calculateStockStats();
        hudStockWorthValue.innerText = `$${ns.format.number(stockStats.currentWorth)}`;

        const hudStockmasterStatus = doc.getElementById('hud-stockmaster-status');
        if (hudStockmasterStatus === null) {
          rerun(ns);
          return;
        }
        const stockmasterOnHome = ns.ps('home').some((p) => p.filename === 'stockmaster.js');
        hudStockmasterStatus.innerText = stockmasterOnHome ? 'Online' : 'Offline';
      }

      if (ns.corporation.hasCorporation()) {
        const hudTotalFundsValue = doc.getElementById('hud-total-funds');
        if (hudTotalFundsValue === null) {
          rerun(ns);
          return;
        }
        hudTotalFundsValue.innerText = ns.format.number(ns.corporation.getCorporation().funds);

        const hudInvestmentOfferValue = doc.getElementById('hud-investment-offer');
        if (hudInvestmentOfferValue === null) {
          rerun(ns);
          return;
        }
        const investmentOffer = ns.corporation.getInvestmentOffer();
        const hasRemainingInvestmentOffers =
          investmentOffer.round >= 1 && investmentOffer.round <= 4 && investmentOffer.funds > 0;
        setHudRowVisibility('hud-investment-offer-label', 'hud-investment-offer-row', hasRemainingInvestmentOffers);
        if (hasRemainingInvestmentOffers) {
          hudInvestmentOfferValue.innerText = ns.format.number(investmentOffer.funds);
        }

        let isDaemonRunning = false;
        ns.ps().forEach((process) => {
          if (process.filename !== DAEMON_SCRIPT_NAME) {
            return;
          }
          if (process.args.includes('--maintainCorporation')) {
            isDaemonRunning = true;
          }
        });
        doc.getElementById('hud-corp-maintain')!.innerText = `${isDaemonRunning}`;

        // Testing tools
        if (runCorpMaintain) {
          if (ns.exec('daemon.js', 'home', 1, '--maintainCorporation') === 0) {
            ns.toast('Failed to run daemon.js --maintainCorporation');
          }
          runCorpMaintain = false;
        }
        if (runDelScripts) {
          ns.killall('home', true);
          if (ns.exec('tools.js', 'home', 1, '--deleteAllScripts') === 0) {
            ns.toast('Failed to run tools.js --deleteAllScripts');
          }
          runDelScripts = false;
        }
        if (reload) {
          rerun(ns);
          reload = false;
        }
        if (runCorpRound) {
          // if (ns.exec("corporation.js", "home", 1, "--round1", "--benchmark") === 0) {
          //     ns.toast("Failed to run corporation.js --round1 --benchmark");
          // }
          // if (ns.exec("corporation.js", "home", 1, "--round2", "--benchmark") === 0) {
          //     ns.toast("Failed to run corporation.js --round2 --benchmark");
          // }
          // if (ns.exec("corporation.js", "home", 1, "--round3", "--benchmark") === 0) {
          //     ns.toast("Failed to run corporation.js --round3 --benchmark");
          // }
          if (!hasDivision(ns, DivisionName.CHEMICAL)) {
            if (ns.exec('corporation.js', 'home', 1, '--round2', '--benchmark') === 0) {
              ns.toast('Failed to run corporation.js --round2 --benchmark');
            }
          } else if (!hasDivision(ns, DivisionName.TOBACCO_0)) {
            if (ns.exec('corporation.js', 'home', 1, '--round3', '--benchmark') === 0) {
              ns.toast('Failed to run corporation.js --round3 --benchmark');
            }
          } else {
            if (ns.exec('corporation.js', 'home', 1, '--improveAllDivisions', '--benchmark') === 0) {
              ns.toast('Failed to run corporation.js --improveAllDivisions --benchmark');
            }
          }
          runCorpRound = false;
        }
        if (runCorpTest) {
          if (ns.exec('corporation.js', 'home', 1, '--test', '--benchmark') === 0) {
            ns.toast('Failed to run corporation.js --test --benchmark');
          }
          runCorpTest = false;
        }
      } else {
        if (runCorpRound) {
          if (ns.exec('corporation.js', 'home', 1, '--round1', '--benchmark') === 0) {
            ns.toast('Failed to run corporation.js --round1 --benchmark');
          }
          await ns.sleep(1000);
          ns.exec('daemon.js', 'home', 1, '--maintainCorporation');
          testingTools.setUnlimitedBonusTime();
          runCorpRound = false;
        }
      }
    } catch (ex: unknown) {
      ns.print(`HUD error: ${JSON.stringify(ex)}`);
    }
    await ns.asleep(1000);
  }
}

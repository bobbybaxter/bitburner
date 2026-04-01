import { CityName, NS } from '@ns';
import { ALL_CITIES } from 'constants/all-cities';
import { addLog, printLog } from './logger';

export async function cleanUp(ns: NS, GLOBAL_CHAR_LIMIT: number) {
  const border = '------------------------------';
  if (
    !ALL_CITIES.some((e) => ns.bladeburner.getCityChaos(e) > 1e50) ||
    ns.getPlayer().skills.charisma < GLOBAL_CHAR_LIMIT
  )
    return;
  ns.bladeburner.stopBladeburnerAction();
  const highestPop = {
    name: 'New Tokyo',
    pop: 0,
  };
  const startTime = new Date();
  let cleanUpMessage = `\n${startTime.toLocaleString()} - clean up phase began\n\n-----------Reports------------`;
  for (const c of ALL_CITIES) {
    ns.bladeburner.switchCity(c);
    cleanUpMessage += `\nCity:        ${c}`;
    cleanUpMessage += `\nOld Chaos:   ${ns.formatNumber(ns.bladeburner.getCityChaos(c), 3)}`;
    if (ns.bladeburner.getCityChaos(c) > 50) {
      addLog(ns, 'action', `Diplomacy: ${c}`);
      ns.bladeburner.startAction('General', 'Diplomacy');
      while (ns.bladeburner.getCityChaos(c) > 0) await ns.sleep(0);
      cleanUpMessage += `\nNew Chaos:   ${ns.formatNumber(ns.bladeburner.getCityChaos(c), 3)}`;
    } else {
      addLog(ns, 'action', `Diplomacy: ${c} - Skipped`);
      cleanUpMessage += '\n***Diplomacy Skipped***';
    }
    const popStart = ns.bladeburner.getCityEstimatedPopulation(c),
      check1 = ns.bladeburner.getCityChaos(c) === 0,
      check2 = ns.bladeburner.getActionTime('Operations', 'Investigation') === 1000,
      check3 = ns.bladeburner.getActionEstimatedSuccessChance('Operations', 'Investigation')[1] > 0.99;
    cleanUpMessage += `\nOld Est Pop: ${ns.formatNumber(popStart, 3)}`;
    if (check1 && check2 && check3) {
      addLog(ns, 'action', `Investigations: ${c}`);
      ns.bladeburner.startAction('Operations', 'Investigation');
      await ns.sleep(2000);
      ns.bladeburner.stopBladeburnerAction();
      addLog(ns, 'action', `Investigations: ${c} - complete`);
      const popEnd = ns.bladeburner.getCityEstimatedPopulation(c);
      cleanUpMessage += `\nNew Est Pop: ${ns.formatNumber(popEnd, 3)} (${popEnd - popStart > 0 ? '+' + ns.formatNumber(popEnd - popStart, 3) : ns.formatNumber(popEnd - popStart, 3)})`;
    } else {
      addLog(ns, 'action', `Investigations: ${c} - skipped`);
      cleanUpMessage += '\n***Investigations Skipped***';
    }
    if (ns.bladeburner.getCityEstimatedPopulation(c) > highestPop.pop) {
      highestPop.name = c;
      highestPop.pop = ns.bladeburner.getCityEstimatedPopulation(c);
    }
    cleanUpMessage += `\n${border}`;
    printLog(ns);
  }
  ns.bladeburner.switchCity(highestPop.name as CityName);
  const endTime = new Date(),
    folder = '/bladeburner_reports/',
    fileName = 'cleanup_' + (endTime.getMonth() + 1) + '-' + endTime.getDate() + '-' + endTime.getFullYear() + '.txt';
  cleanUpMessage += `\nMoving BBHQ to highest est pop: ${highestPop.name}\n${endTime.toLocaleString()} - clean up phase ended\n${endTime.getTime() - startTime.getTime() > 60 * 1000 ? ns.formatNumber((endTime.getTime() - startTime.getTime()) / 1000 / 60) + ' minutes' : endTime.getTime() - startTime.getTime() > 1000 ? ns.formatNumber((endTime.getTime() - startTime.getTime()) / 1000) + ' seconds' : ns.formatNumber(endTime.getTime() - startTime.getTime(), 0) + 'ms'} to finish clean up`;
  ns.tprint(cleanUpMessage);
  ns.write(folder + fileName, cleanUpMessage, 'w');
}

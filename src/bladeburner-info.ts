import { BladeburnerActionName, BladeburnerActionType, BladeburnerCurAction, BladeburnerSkillName, NS } from '@ns';
import { art } from 'helpers/art';
import { hms } from 'helpers/hms';
import { tem } from 'helpers/tem';
import { ALL_CITIES } from './constants/all-cities';

export async function main(ns: NS) {
  const [width, height] = [350, 800];
  ns.ui.openTail();
  ns.disableLog('ALL');
  ns.ui.resizeTail(width, height);
  ns.clearLog();
  ns.ui.setTailTitle(tem('🔍BB:Info', { fontFamily: 'Brush Script MT, cursive' }));

  while (1) {
    await ns.sleep(500);
    if (!ns.bladeburner.inBladeburner()) continue;
    printInfo();
  }

  function printInfo() {
    ns.ui.resizeTail(width, height);
    ns.clearLog();
    const divider = '══════════════════════════════';
    ns.print('BLADEBURNER INFORMATION');
    const currentTask = ns.bladeburner.getCurrentAction() as BladeburnerCurAction;
    const cTaskTime =
      currentTask === null || currentTask?.type === 'Idle'
        ? 0
        : ns.bladeburner.getActionTime(
            currentTask.type as BladeburnerActionType,
            currentTask.name as BladeburnerActionName,
          );
    ns.print(`Current Task: ${art(currentTask?.name.substring(0, 13), { color: 255 })}`);
    const timeLeft = Math.ceil(cTaskTime - ns.bladeburner.getActionCurrentTime());
    ns.print(` ${art('┣', { color: 255 })}Time Left:  ${art(hms(timeLeft), { color: 255 })}`);
    const stamina = ns.bladeburner.getStamina()[0] / ns.bladeburner.getStamina()[1];
    ns.print(` ${art('┗', { color: 255 })}Stamina:    ${art(ns.formatPercent(stamina), { color: 255 })}`);
    const assCount = ns.bladeburner.getActionCountRemaining('Operations', 'Assassination');
    const assLevel = ns.bladeburner.getActionCurrentLevel('Operations', 'Assassination'),
      maxAssLevel = ns.bladeburner.getActionMaxLevel('Operations', 'Assassination');
    ns.print(divider);
    ns.print('Assassination Info');
    ns.print(` ${art('┣', { color: 255 })}Current Count: ${art(ns.formatNumber(assCount, 3), { color: 255 })}`);
    ns.print(
      ` ${art('┣', { color: 255 })}Level(Max):    ${art(ns.formatNumber(assLevel, 2), { color: 255 })}(${art(ns.formatNumber(maxAssLevel, 2), { color: 255 })})`,
    );
    const successes = ns.bladeburner.getActionSuccesses('Operations', 'Assassination');
    ns.print(
      ` ${art('┣', { color: 255 })}Lv Post-Spree: ${art(ns.formatNumber(levelAfter(successes, assCount), 3), { color: 255 })}${levelAfter(successes, assCount) > maxAssLevel ? art('(+' + ns.formatNumber(levelAfter(successes, assCount) - maxAssLevel, 3) + ')', { color: 10 }) : ''}`,
    );
    ns.print(` ${art('┣', { color: 255 })}Successes:     ${art(ns.formatNumber(successes, 3), { color: 255 })}`);
    const successesToLevel = Math.floor(0.5 * maxAssLevel * (2 * 2.5 + (maxAssLevel - 1))) - successes, // number of additional successes needed for next level up
      successesLeftToGet = successesToLevel - assCount; // factor successes needed after subtracting current assassination count
    ns.print(
      ` ${art('┗', { color: 255 })}Success to lv: ${art(ns.formatNumber(successesToLevel, 2), { color: 255 })}${successesLeftToGet > 0 ? art('(' + ns.formatNumber(successesLeftToGet, 2) + ')', { color: 10 }) : ''}`,
    );
    ns.print(divider);
    const unspentPoints = ns.bladeburner.getSkillPoints();
    const rank = ns.bladeburner.getRank();
    const skillLevel = (x: string) => ns.bladeburner.getSkillLevel(x as BladeburnerSkillName);
    ns.print('Skill Info');
    ns.print(` ${art('┣', { color: 255 })}BB Rank:        ${art(ns.formatNumber(rank, 3), { color: 255 })}`);
    ns.print(` ${art('┣', { color: 255 })}Skill Points:   ${art(ns.formatNumber(unspentPoints, 3), { color: 255 })}`);
    ns.print(
      ` ${art('┣', { color: 255 })}Overclock:      ${art(ns.formatNumber(skillLevel('Overclock'), 3), { color: 255 })}`,
    );
    ns.print(
      ` ${art('┣', { color: 255 })}Reaper:         ${art(ns.formatNumber(skillLevel('Reaper'), 3), { color: 255 })}`,
    );
    ns.print(
      ` ${art('┣', { color: 255 })}Evasive System: ${art(ns.formatNumber(skillLevel('Evasive System'), 3), { color: 255 })}`,
    );
    ns.print(
      ` ${art('┣', { color: 255 })}Hands of Midas: ${art(ns.formatNumber(skillLevel('Hands of Midas'), 3), { color: 255 })}`,
    );
    ns.print(
      ` ${art('┗', { color: 255 })}Hyperdrive:     ${art(ns.formatNumber(skillLevel('Hyperdrive'), 3), { color: 255 })}`,
    );
    ns.print(divider);
    for (const city of ALL_CITIES) {
      const chaos = ns.bladeburner.getCityChaos(city);
      const estPop = ns.bladeburner.getCityEstimatedPopulation(city);
      ns.print(
        `${art(city, { color: 255 })} ${art(city === ns.bladeburner.getCity() ? '--You are here--' : '', { color: 81 })}`,
      );
      ns.print(` ${art('┣', { color: 255 })}Est Population: ${art(ns.formatNumber(estPop, 3), { color: 255 })}`);
      ns.print(` ${art('┗', { color: 255 })}Current Chaos:  ${art(ns.formatNumber(chaos, 3), { color: 255 })}`);
    }

    function levelAfter(successes: number, count: number, operation = true, level = 0) {
      const type = !operation ? 3 : 2.5;
      const succForLevel = (x: number) => Math.floor(0.5 * x * (2 * type + (x - 1)));
      while (successes + count >= succForLevel(level)) level++;
      return level;
    }
  }
}

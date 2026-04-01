import { NS } from '@ns';
import { bar } from '../bar';
import { ACTION_LOG_SIZE, ASS_TARGET, HEIGHT, SKILL_LOG_SIZE, WIDTH } from './constants';

const logs: { action: string[]; skill: string[] } = { action: [], skill: [] };

for (let i = 0; i < ACTION_LOG_SIZE; i++) logs.action.push(' ');
for (let i = 0; i < SKILL_LOG_SIZE; i++) logs.skill.push(' ');

export function printLog(ns: NS) {
  ns.ui.resizeTail(WIDTH, HEIGHT);
  ns.clearLog();
  if (logs.action.length > 0) {
    ns.print(`--action report--`);
    for (const report of logs.action) {
      ns.print(report);
    }
  }
  if (logs.skill.length > 0) {
    ns.print(`--skill report--`);
    for (const report of logs.skill) ns.print(report);
  }
  if (ns.bladeburner.inBladeburner())
    ns.print(
      bar(ns.bladeburner.getActionCountRemaining('Operations', 'Assassination') / ASS_TARGET, '⚡') +
        `${Math.floor(ns.bladeburner.getActionCountRemaining('Operations', 'Assassination'))}/${ASS_TARGET} Assassinations`,
    );
}

export function addLog(ns: NS, type: 'action' | 'skill', x: string) {
  const maxLength = type === 'action' ? ACTION_LOG_SIZE : SKILL_LOG_SIZE;
  if (logs[type].length >= maxLength) logs[type].shift();
  logs[type].push(x);
}

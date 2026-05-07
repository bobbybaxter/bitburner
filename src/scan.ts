import { NS, Server } from '@ns';
import { getServerNames } from '/helpers/get-server-names.js';

const facServers: Record<string, string> = {
  CSEC: 'yellow',
  'avmnite-02h': 'yellow',
  'I.I.I.I': 'yellow',
  run4theh111z: 'yellow',
  'The-Cave': 'orange',
  w0r1d_d43m0n: 'red',
};

/**
 * Scans the network and displays the results. (32.7GB RAM)
 */
export async function main(ns: NS): Promise<void> {
  let output = 'Network:';

  getServerNames(ns).forEach((server) => {
    const name = server.name;
    const serverData = ns.getServer(name) as Partial<Server>;
    const moneyAvailable = Math.round(serverData.moneyAvailable ?? 0);
    const moneyMax = Math.round(serverData.moneyMax ?? 0);
    const moneyPct = moneyMax > 0 ? Math.round((100 * moneyAvailable) / moneyMax) : 0;
    const hackColor = ns.hasRootAccess(name) ? 'lime' : 'red';
    const nameColor = facServers[name] ?? 'white';

    const hoverText = [
      'Req Level: ',
      serverData.requiredHackingSkill ?? 0,
      '&#10;Req Ports: ',
      serverData.numOpenPortsRequired ?? 0,
      '&#10;Memory: ',
      serverData.maxRam ?? 0,
      'GB',
      '&#10;Security: ',
      serverData.hackDifficulty ?? 0,
      '/',
      serverData.minDifficulty ?? 0,
      '&#10;Money: ',
      moneyAvailable.toLocaleString(),
      ' (',
      moneyPct,
      '%)',
    ].join('');

    let ctText = '';
    ns.ls(name, '.cct').forEach((ctName) => {
      ctText += [
        "<a title='",
        ctName,
        // Comment out the next line to reduce footprint by 5 GB
        '&#10;',
        ns.codingcontract.getContractType(ctName, name),
        "'>©</a>",
      ].join('');
    });

    output += [
      '<br>',
      '---'.repeat(server.depth - 1),
      `<font color=${hackColor}>■ </font>`,
      `<a class='scan-analyze-link' title='${hoverText}''
          onClick="(function()
          {
              const terminalInput = document.getElementById('terminal-input');
              terminalInput.value='home; run helpers/connect.js ${name}';
              const handler = Object.keys(terminalInput)[1];
              terminalInput[handler].onChange({target:terminalInput});
              terminalInput[handler].onKeyDown({keyCode:13,preventDefault:()=>null});
          })();"
          style='color:${nameColor}'>${name}</a> `,
      `<font color='fuchisa'>${ctText}</font>`,
    ].join('');
  });

  const list = document.getElementById('terminal');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', output);
}

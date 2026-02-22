import { NS } from '@ns';

/**
 * @param {{servers: any[]}} data
 * @param {any[]} args
 * @returns {*[]}
 */
export function autocomplete(data: { servers: string[] }): string[] {
  return [...data.servers];
}

/**
 * Connects to a target server
 */
export async function main(ns: NS): Promise<void> {
  const [target] = ns.args;
  const paths: Record<string, string[]> = { home: [] };
  const queue = Object.keys(paths);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    ns.scan(current)
      .filter((e) => !paths[e])
      .forEach((server) => {
        queue.push(server);
        paths[server] = paths[current]?.concat([server]) ?? [server];
      });
  }

  if (!paths[target as string]) {
    ns.tprint(`No path found to node ${target}`);
    return;
  }

  const terminalCommand = `home; ${paths[target as string].map((e) => `connect ${e}`).join(';')}`;

  const terminalInput = document.getElementById('terminal-input') as HTMLFormElement;
  if (!terminalInput) {
    ns.tprint('No terminal input found');
    return;
  }
  terminalInput.value = terminalCommand;
  const handler = Object.keys(terminalInput)[1];

  terminalInput[handler].onChange({ target: terminalInput });
  terminalInput[handler].onKeyDown({ keyCode: 13, preventDefault: () => null });
}

import { NS } from '@ns';

/**
 * Installs a backdoor on a server
 */
export function installBackdoor(ns: NS, serverName: string): number | null {
  try {
    const connections = [serverName];

    while (connections[connections.length - 1] !== 'home') {
      connections.push(ns.scan(connections[connections.length - 1])[0]);
    }

    connections.reverse();

    const fileName = `temp/backDoor/${serverName}.js`;

    ns.write(
      fileName,
      `export async function main(ns) {
				const connections = ${JSON.stringify(connections)};
				for (const connection of connections) {
					await Do(ns, 'ns.singularity.connect', connection);
				}
				await Do(ns, 'ns.singularity.installBackdoor');
				ns.toast(\`Backdoor installed on ${serverName}!\`);
				ns.singularity.connect('home');
			}`,
      'w',
    );

    return ns.run(fileName);
  } catch (e) {
    console.error(e);
    return null;
  }
}

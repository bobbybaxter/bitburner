import { NS } from '@ns';
import { getPathFromHomeTo } from '/helpers/get-path-from-home.js';

/**
 * Installs a backdoor on a server
 */
export function installBackdoor(ns: NS, serverName: string): number | null {
  try {
    const pathFromHome = getPathFromHomeTo(ns, serverName);
    if (pathFromHome == null) {
      return null;
    }

    const fileName = `temp/backDoor/${serverName}.js`;

    ns.write(
      fileName,
      `import { Do, DoSingularityInstallBackdoorReturnHome } from '/helpers/do.js';
			export async function main(ns) {
				const pathFromHome = ${JSON.stringify(pathFromHome)};
				for (const hop of pathFromHome) {
					await Do(ns, 'ns.singularity.connect', hop);
				}
				await DoSingularityInstallBackdoorReturnHome(ns, pathFromHome);
				ns.toast(\`Backdoor installed on ${serverName}!\`);
			}`,
      'w',
    );

    return ns.run(fileName);
  } catch (e) {
    console.error(e);
    return null;
  }
}

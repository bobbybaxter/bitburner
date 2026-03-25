import { NS } from '@ns';
import { Do } from '/helpers/do.js';

/**
 * Starts all scripts on the home server
 * Requires 25.25 GB RAM
 */
export async function main(ns: NS): Promise<void> {
  // disableNoisyLogs(ns);

  const running = new Set(ns.ps('home').map((p) => p.filename));
  const isRunning = (script: string) => running.has(script);

  await ns.run('infiltrate.js', 1); // 1.5GB RAM
  await ns.run('open-all-ports.js', 1); // 4.2GB RAM
  if (!isRunning('stockmaster.js')) await ns.run('stockmaster.js', 1); // 3.6GB RAM
  if (!isRunning('hacknet-opt.js')) await ns.run('hacknet-opt.js', 1, 1, 100); // 7.45GB RAM
  if (!isRunning('home-opt.js')) await ns.run('home-opt.js', 1);
  if (!isRunning('pserv-opt.js')) await ns.run('pserv-opt.js', 1); // 8.5GB RAM

  const resetInfo = ns.getResetInfo();
  const ownedSFString = [...resetInfo.ownedSF.entries()]
    .sort(([a], [b]) => a - b)
    .map(([k, v]) => `SF${k}: ${v}`)
    .join(', ');
  ns.tprint(`current node: ${resetInfo.currentNode} | ${ownedSFString}`);

  const hasSF3OrBN3 = resetInfo.currentNode === 3 || resetInfo.ownedSF.has(3);
  if (hasSF3OrBN3 && !isRunning('workaround.js')) {
    await ns.run('workaround.js', 1, '--hud');
  }

  const hasSF4 = resetInfo.ownedSF.has(4) || resetInfo.currentNode === 4;
  if (!hasSF4) return;

  const travelResult = await Do(ns, 'ns.singularity.travelToCity', 'Sector-12');
  ns.tprint(`travelToCity result: ${travelResult}`);
  const goToResult = await Do(ns, 'ns.singularity.goToLocation', 'MegaCorp');
  ns.tprint(`goToLocation result: ${goToResult}`);

  const doc = eval('document');
  let infiltrateBtn: HTMLElement | undefined;
  const allButtons: string[] = [];
  for (let i = 0; i < 25 && !infiltrateBtn; i++) {
    await ns.sleep(200);
    const buttons = [...doc.querySelectorAll('button')];
    if (i === 0 || i === 24) {
      buttons.forEach((b: Element) => allButtons.push(b.textContent ?? '(empty)'));
    }
    infiltrateBtn = buttons.find((b: Element) => b.textContent?.includes('Infiltrate')) as HTMLElement | undefined;
  }

  if (!infiltrateBtn) {
    ns.tprint(`ERROR: Infiltrate button not found. Buttons on page: ${JSON.stringify(allButtons)}`);
  } else {
    ns.tprint(`Found infiltrate button: "${infiltrateBtn.textContent}"`);
    const reactPropsKey = Object.keys(infiltrateBtn).find((k) => k.startsWith('__reactProps'));
    if (reactPropsKey) {
      const props = (infiltrateBtn as unknown as Record<string, Record<string, (e: unknown) => void>>)[reactPropsKey];
      ns.tprint(`reactProps has onClick: ${typeof props?.onClick}`);
      if (typeof props?.onClick === 'function') {
        props.onClick({
          isTrusted: true,
          preventDefault: () => {},
          stopPropagation: () => {},
          currentTarget: infiltrateBtn,
          target: infiltrateBtn,
          type: 'click',
          nativeEvent: { isTrusted: true, stopImmediatePropagation: () => {} },
        });
        ns.tprint('Called onClick via __reactProps with isTrusted: true');

        // Wait for infiltration to complete, then click "Sell"
        let sellBtn: HTMLElement | undefined;
        for (let i = 0; i < 600 && !sellBtn; i++) {
          await ns.sleep(500);
          sellBtn = [...doc.querySelectorAll('button')].find((b: Element) => b.textContent?.includes('Sell')) as
            | HTMLElement
            | undefined;
        }
        if (sellBtn) {
          const sellPropsKey = Object.keys(sellBtn).find((k: string) => k.startsWith('__reactProps'));
          if (sellPropsKey) {
            const sellProps = (sellBtn as unknown as Record<string, Record<string, (e: unknown) => void>>)[
              sellPropsKey
            ];
            sellProps?.onClick?.({
              isTrusted: true,
              preventDefault: () => {},
              stopPropagation: () => {},
            });
            ns.tprint('Auto-sold infiltration data');
          }
        } else {
          ns.tprint('WARN: Sell button not found after infiltration');
        }
      }
    } else {
      ns.tprint('ERROR: __reactProps key not found on button');
    }
  }

  while (!ns.hasTorRouter()) {
    await Do(ns, 'ns.singularity.purchaseTor');
    if (ns.hasTorRouter()) break;
    await ns.sleep(60_000);
  }

  const programs: string[] = (await Do(ns, 'ns.singularity.getDarkwebPrograms')) as string[];
  await Promise.all(
    programs.map(async (program: string) => {
      ns.tprint(`Purchasing program: ${program}`);
      await Do(ns, 'ns.singularity.purchaseProgram', program).then(
        () => ns.tprint(`SUCCESS: Purchased program: ${program}`),
        (e) => ns.tprint(`WARN: Failed to purchase program: ${program}: ${e}`),
      );
    }),
  );

  if (!isRunning('backdoor.js')) await ns.run('backdoor.js', 1);
  if (!isRunning('augs.js')) await ns.run('augs.js', 1);
  if (!isRunning('hack3.js')) await ns.run('hack3.js', 1); // 10.5GB RAM
}

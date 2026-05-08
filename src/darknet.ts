// TODO: if there's a txt or lit file, read it
// need to figure out why servers aren't opening up their RAM
// need to figure out what to actually do what all of that RAM

import type { NS } from '@ns';
import {
  attemptAuthOnConnectedServers,
  bootstrapDarknetContext,
  collectDarknetHints,
  deployCrawlerWorkers,
  discoverFromCurrentServer,
  runMemoryReallocationPass,
  saveIfDirtyOrDue,
} from '/helpers/darknet/lifecycle.js';

type Flags = {
  interval: number;
  authAttempts: number;
  heartbleedSamples: number;
  memoryReallocationTargets: number;
  deployWorkers: boolean;
  maxWorkerDeployments: number;
  openCaches: boolean;
  phishing: boolean;
  noTail: boolean;
};

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ['interval', 5_000],
    ['authAttempts', 2],
    ['heartbleedSamples', 2],
    ['memoryReallocationTargets', 2],
    ['deployWorkers', true],
    ['maxWorkerDeployments', 2],
    ['openCaches', false],
    ['phishing', false],
    ['noTail', false],
  ]) as unknown as Flags;

  if (!flags.noTail) ns.ui.openTail();
  ns.disableLog('sleep');

  if (!ns.fileExists('DarkscapeNavigator.exe', 'home')) {
    ns.tprint('ERROR: DarkscapeNavigator.exe is required before running darknet.ts');
    return;
  }

  const context = bootstrapDarknetContext(ns);
  ns.tprint(
    `darknet: booted with ${context.state.nodes.size} known nodes and ${context.passwords.size} known passwords`,
  );

  while (true) {
    discoverFromCurrentServer(context);
    const auth = await attemptAuthOnConnectedServers(context, Math.max(0, Math.floor(flags.authAttempts)));
    await runMemoryReallocationPass(context, Math.max(0, Math.floor(flags.memoryReallocationTargets)));
    if (flags.deployWorkers) {
      deployCrawlerWorkers(context, {
        maxDeployments: Math.max(0, Math.floor(flags.maxWorkerDeployments)),
        workerScript: 'darknet-worker.js',
        workerArgs: ['--interval', Math.max(500, Math.floor(flags.interval)), '--noTail'],
      });
    }
    await collectDarknetHints(context, {
      maxHeartbleedTargets: Math.max(0, Math.floor(flags.heartbleedSamples)),
      openCachesOnCurrentServer: flags.openCaches,
      runPhishingAttack: flags.phishing,
    });
    saveIfDirtyOrDue(context, auth.changedCredentials);
    await ns.sleep(Math.max(200, flags.interval));
  }
}

export function autocomplete(): string[] {
  return [
    '--interval',
    '--authAttempts',
    '--heartbleedSamples',
    '--memoryReallocationTargets',
    '--deployWorkers',
    '--maxWorkerDeployments',
    '--openCaches',
    '--phishing',
    '--noTail',
  ];
}

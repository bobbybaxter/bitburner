// TODO: need to figure out why servers aren't opening up their RAM
// TODO: need to figure out what to actually do what all of that RAM
// TODO: need to figure out a better system for cracking darknet servers
//   because there are multiple servers trying to crack the same server at the same time
//

import type { NS } from '@ns';
import {
  bootstrapDarknetContext,
  collectDarknetHints,
  deployCrawlerWorkers,
  discoverFromCurrentServer,
  guessAuthOnConnectedServers,
  runMemoryReallocationPass,
  saveIfDirtyOrDue,
} from '/helpers/darknet/lifecycle.js';
import { processWorkerSyncMessages } from '/helpers/darknet/worker-sync.js';

type Flags = {
  interval: number;
  authGuesses: number;
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
    // <= 0 means "no cap" (guess all eligible connected hosts each pass).
    ['authGuesses', 0],
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
  ns.disableLog('dnet.probe');
  ns.disableLog('getServerMaxRam');
  ns.disableLog('getServerUsedRam');
  ns.disableLog('scp');
  ns.disableLog('dnet.heartbleed');

  if (!ns.fileExists('DarkscapeNavigator.exe', 'home')) {
    ns.tprint('ERROR: DarkscapeNavigator.exe is required before running darknet.ts');
    return;
  }

  const context = bootstrapDarknetContext(ns);
  ns.tprint(
    `darknet: booted with ${context.state.nodes.size} known nodes and ${context.passwords.size} known passwords`,
  );

  while (true) {
    const workerSync = processWorkerSyncMessages(context);
    discoverFromCurrentServer(context);
    const auth = await guessAuthOnConnectedServers(context, Math.floor(flags.authGuesses));
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
    saveIfDirtyOrDue(context, auth.changedCredentials || workerSync.changedCredentials || workerSync.changedEdges);
    await ns.sleep(Math.max(200, flags.interval));
  }
}

export function autocomplete(): string[] {
  return [
    '--interval',
    '--authGuesses',
    '--heartbleedSamples',
    '--memoryReallocationTargets',
    '--deployWorkers',
    '--maxWorkerDeployments',
    '--openCaches',
    '--phishing',
    '--noTail',
  ];
}

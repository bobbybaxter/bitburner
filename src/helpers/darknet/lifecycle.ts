import type { NS } from '@ns';
import { logAuthEvent } from '/helpers/darknet/diagnostics.js';
import { runSolverForModel } from '/helpers/darknet/solvers/index.js';
import {
  DARKNET_AUTOSAVE_INTERVAL_MS,
  DARKNET_PASSWORD_PATH,
  DARKNET_STATE_PATH,
  loadDarknetPasswords,
  loadDarknetState,
  saveDarknetPasswords,
  saveDarknetState,
} from '/helpers/darknet/storage.js';
import type { DarknetContext, DarknetHostname, DarknetNodeState } from '/helpers/darknet/types.js';

const BASE_AUTH_BACKOFF_MS = 15_000;
const MAX_AUTH_BACKOFF_MS = 5 * 60_000;
const DEFAULT_AUTH_GUESS_LIMIT = 2;
const DEFAULT_HEARTBLEED_SAMPLE_LIMIT = 2;
const DEFAULT_MEMORY_REALLOCATION_LIMIT = 2;
const WORKER_DEPLOY_COOLDOWN_MS = 30_000;
const DARKNET_WORKER_SCRIPT = 'darknet-worker.js';
const DARKNET_WORKER_TASK_FILES = [
  '/helpers/darknet/task-open-cache.js',
  '/helpers/darknet/task-heartbleed.js',
  '/helpers/darknet/task-memory-reallocation.js',
  '/helpers/darknet/task-labradar.js',
] as const;

function syncWorkerScriptToConnectedHost(ns: NS, hostname: DarknetHostname): void {
  // Force overwrite so script changes propagate hop-by-hop across connected darknet hosts.
  ns.scp(DARKNET_WORKER_SCRIPT, hostname, ns.getHostname());
}

export type DarknetHintCollectionOptions = {
  maxHeartbleedTargets?: number;
  openCachesOnCurrentServer?: boolean;
  runPhishingAttack?: boolean;
};

export type DarknetCrawlerDeployOptions = {
  workerScript?: string;
  workerArgs?: (string | number | boolean)[];
  maxDeployments?: number;
};

export function ensureNode(state: DarknetContext['state'], hostname: DarknetHostname): DarknetNodeState {
  const existing = state.nodes.get(hostname);
  if (existing) return existing;

  const created: DarknetNodeState = {
    hostname,
    lastSeenAt: Date.now(),
  };
  state.nodes.set(hostname, created);
  return created;
}

export function setUndirectedEdge(state: DarknetContext['state'], a: DarknetHostname, b: DarknetHostname): void {
  if (!state.edges.has(a)) state.edges.set(a, new Set<DarknetHostname>());
  if (!state.edges.has(b)) state.edges.set(b, new Set<DarknetHostname>());
  state.edges.get(a)?.add(b);
  state.edges.get(b)?.add(a);
}

export function bootstrapDarknetContext(ns: NS): DarknetContext {
  const state = loadDarknetState(ns, DARKNET_STATE_PATH);
  const passwords = loadDarknetPasswords(ns, DARKNET_PASSWORD_PATH);
  for (const [hostname, record] of passwords.entries()) {
    const node = ensureNode(state, hostname);
    node.password = record.password;
    if (record.modelId) node.modelId = record.modelId;
  }
  return {
    ns,
    state,
    passwords,
    storage: {
      statePath: DARKNET_STATE_PATH,
      passwordPath: DARKNET_PASSWORD_PATH,
      autosaveIntervalMs: DARKNET_AUTOSAVE_INTERVAL_MS,
    },
    lastSaveAt: 0,
  };
}

export function discoverFromCurrentServer(context: DarknetContext): void {
  const { ns, state } = context;
  const now = Date.now();
  const current = ns.getHostname();
  const neighbors = ns.dnet.probe();
  const stasisLinked = new Set(ns.dnet.getStasisLinkedServers());

  ensureNode(state, current).lastSeenAt = now;

  for (const neighbor of neighbors) {
    setUndirectedEdge(state, current, neighbor);

    const details = ns.dnet.getServerDetails(neighbor);
    const node = ensureNode(state, neighbor);
    node.lastSeenAt = now;
    node.lastProbeAt = now;
    node.lastDetailRefreshAt = now;
    node.modelId = details.modelId;
    node.passwordHint = details.passwordHint;
    node.passwordLength = details.passwordLength;
    node.passwordFormat = details.passwordFormat;
    node.hasSession = details.hasSession;
    node.isConnectedToCurrentServer = details.isConnectedToCurrentServer;
    node.isOnline = details.isOnline;
    node.hasStasisLink = stasisLinked.has(neighbor);

    const passwordRecord = context.passwords.get(neighbor);
    if (passwordRecord && !details.hasSession && details.isOnline) {
      const result = ns.dnet.connectToSession(neighbor, passwordRecord.password);
      if (result.success) {
        passwordRecord.lastUsedAt = now;
        node.hasSession = true;
        syncWorkerScriptToConnectedHost(ns, neighbor);
        logAuthEvent(ns, {
          ts: now,
          hostname: neighbor,
          modelId: node.modelId,
          event: 'connect-session-success',
          message: result.message,
          passwordHint: node.passwordHint,
          passwordLength: node.passwordLength,
          passwordFormat: node.passwordFormat,
        });
      } else {
        // Server resets can invalidate known passwords; drop stale credential and queue re-crack.
        context.passwords.delete(neighbor);
        node.password = undefined;
        node.lastAuthFailureAt = now;
        context.state.revisitQueue.add(neighbor);
        logAuthEvent(ns, {
          ts: now,
          hostname: neighbor,
          modelId: node.modelId,
          event: 'connect-session-failure',
          message: result.message,
          passwordHint: node.passwordHint,
          passwordLength: node.passwordLength,
          passwordFormat: node.passwordFormat,
        });
      }
    }

    if (details.hasSession && details.isOnline && details.isConnectedToCurrentServer) {
      syncWorkerScriptToConnectedHost(ns, neighbor);
    }
  }

  for (const stasisHost of stasisLinked) {
    setUndirectedEdge(state, current, stasisHost);
    const stasisNode = ensureNode(state, stasisHost);
    stasisNode.lastSeenAt = now;
    stasisNode.hasStasisLink = true;
  }

  // Do not replace state.edges.get(current): setUndirectedEdge() mutates the stored Set in place.
  // Replacing it with only this probe's neighbors dropped edges learned from earlier hops / other hosts,
  // which broke BFS paths (e.g. darkweb → … → deep servers) in saved state.
}

export function queueForRevisit(context: DarknetContext, hostname: DarknetHostname): void {
  context.state.revisitQueue.add(hostname);
}

export function saveIfDirtyOrDue(context: DarknetContext, force = false): void {
  const now = Date.now();
  if (!force && now - context.lastSaveAt < context.storage.autosaveIntervalMs) return;
  saveDarknetState(context.ns, context.state, context.storage.statePath);
  saveDarknetPasswords(context.ns, context.passwords, context.storage.passwordPath);
  context.lastSaveAt = now;
}

export function rememberPassword(
  context: DarknetContext,
  hostname: DarknetHostname,
  password: string,
  modelId?: string,
): void {
  const now = Date.now();
  context.passwords.set(hostname, {
    password,
    modelId,
    discoveredAt: now,
    lastUsedAt: now,
  });

  const node = ensureNode(context.state, hostname);
  node.password = password;
  node.modelId = modelId ?? node.modelId;
  node.lastAuthSuccessAt = now;
}

function computeNextBackoffMs(guessCount: number): number {
  const exp = Math.max(0, guessCount - 1);
  return Math.min(MAX_AUTH_BACKOFF_MS, BASE_AUTH_BACKOFF_MS * 2 ** exp);
}

function canGuessAuth(node: DarknetNodeState, now: number): boolean {
  if (!node.isOnline || !node.isConnectedToCurrentServer || node.hasSession) return false;
  if (node.nextAuthGuessAt && now < node.nextAuthGuessAt) return false;
  return true;
}

async function tryAuthenticateConnectedHost(
  context: DarknetContext,
  hostname: DarknetHostname,
): Promise<{ changedState: boolean; changedCredentials: boolean }> {
  const { ns, state } = context;
  const now = Date.now();
  const node = ensureNode(state, hostname);
  const modelId = node.modelId ?? ns.dnet.getServerDetails(hostname).modelId;
  const solverResult = await runSolverForModel(ns, hostname, modelId);
  if (!solverResult) {
    state.revisitQueue.add(hostname);
    logAuthEvent(ns, {
      ts: now,
      hostname,
      modelId,
      event: 'solver-unsupported',
      message: 'No solver registered for model',
      passwordHint: node.passwordHint,
      passwordLength: node.passwordLength,
      passwordFormat: node.passwordFormat,
    });
    return { changedState: false, changedCredentials: false };
  }

  node.authGuessCount = (node.authGuessCount ?? 0) + 1;
  node.lastAuthMessage = solverResult.message;

  if (solverResult.success && solverResult.password != null) {
    rememberPassword(context, hostname, solverResult.password, modelId);
    node.hasSession = true;
    node.lastAuthSuccessAt = now;
    node.nextAuthGuessAt = undefined;
    state.revisitQueue.delete(hostname);
    logAuthEvent(ns, {
      ts: now,
      hostname,
      modelId,
      event: 'auth-success',
      message: solverResult.message,
      passwordHint: node.passwordHint,
      passwordLength: node.passwordLength,
      passwordFormat: node.passwordFormat,
    });
    return { changedState: true, changedCredentials: true };
  }

  node.lastAuthFailureAt = now;
  node.nextAuthGuessAt = now + computeNextBackoffMs(node.authGuessCount);
  state.revisitQueue.add(hostname);
  logAuthEvent(ns, {
    ts: now,
    hostname,
    modelId,
    event: 'auth-failure',
    message: solverResult.message,
    passwordHint: node.passwordHint,
    passwordLength: node.passwordLength,
    passwordFormat: node.passwordFormat,
  });

  if (solverResult.shouldCaptureHeartbleed !== false) {
    const bleed = await ns.dnet.heartbleed(hostname, { peek: true });
    logAuthEvent(ns, {
      ts: Date.now(),
      hostname,
      modelId,
      event: 'heartbleed-sample',
      message: bleed.message,
      heartbleedLogs: bleed.logs.slice(-5),
      passwordHint: node.passwordHint,
      passwordLength: node.passwordLength,
      passwordFormat: node.passwordFormat,
    });
  }
  return { changedState: true, changedCredentials: false };
}

export async function guessAuthOnConnectedServers(
  context: DarknetContext,
  maxGuesses = DEFAULT_AUTH_GUESS_LIMIT,
): Promise<{ changedState: boolean; changedCredentials: boolean; guessed: number }> {
  const { state } = context;
  const now = Date.now();
  const unlimitedGuesses = maxGuesses <= 0;
  let guessed = 0;
  let changedState = false;
  let changedCredentials = false;

  for (const [hostname, node] of state.nodes.entries()) {
    if (!unlimitedGuesses && guessed >= maxGuesses) break;
    if (!canGuessAuth(node, now)) continue;

    const result = await tryAuthenticateConnectedHost(context, hostname);
    guessed += 1;
    changedState = changedState || result.changedState;
    changedCredentials = changedCredentials || result.changedCredentials;
  }

  return { changedState, changedCredentials, guessed: guessed };
}

export async function runMemoryReallocationPass(
  context: DarknetContext,
  maxTargets = DEFAULT_MEMORY_REALLOCATION_LIMIT,
): Promise<{ guessed: number; succeeded: number }> {
  const { ns, state } = context;
  const now = Date.now();
  let guessed = 0;
  let succeeded = 0;
  const targetLimit = Math.max(0, Math.floor(maxTargets));

  for (const [hostname, node] of state.nodes.entries()) {
    if (guessed >= targetLimit) break;
    if (!node.isOnline || !node.isConnectedToCurrentServer || !node.hasSession) continue;

    const blockedRam = ns.dnet.getBlockedRam(hostname);
    if (blockedRam <= 0) continue;

    guessed += 1;
    try {
      const result = await ns.dnet.memoryReallocation(hostname);
      if (result.success) succeeded += 1;
      logAuthEvent(ns, {
        ts: now,
        hostname,
        modelId: node.modelId,
        event: result.success ? 'memory-reallocation-success' : 'memory-reallocation-failure',
        message: `${result.message} (blockedRam=${blockedRam.toFixed(2)}GB before call)`,
      });
    } catch (error) {
      logAuthEvent(ns, {
        ts: now,
        hostname,
        modelId: node.modelId,
        event: 'memory-reallocation-failure',
        message: String(error),
      });
    }
  }

  return { guessed: guessed, succeeded };
}

export async function collectDarknetHints(
  context: DarknetContext,
  options: DarknetHintCollectionOptions = {},
): Promise<void> {
  const { ns, state } = context;
  const maxHeartbleedTargets = Math.max(0, options.maxHeartbleedTargets ?? DEFAULT_HEARTBLEED_SAMPLE_LIMIT);
  const now = Date.now();

  let sampled = 0;
  for (const [hostname, node] of state.nodes.entries()) {
    if (sampled >= maxHeartbleedTargets) break;
    if (!node.isOnline || !node.isConnectedToCurrentServer) continue;

    try {
      const bleed = await ns.dnet.heartbleed(hostname, { peek: true, logsToCapture: 2 });
      if (bleed.logs.length > 0) {
        logAuthEvent(ns, {
          ts: now,
          hostname,
          modelId: node.modelId,
          event: 'heartbleed-ambient',
          message: bleed.message,
          heartbleedLogs: bleed.logs,
          passwordHint: node.passwordHint,
          passwordLength: node.passwordLength,
          passwordFormat: node.passwordFormat,
        });
      }
      sampled += 1;
    } catch {
      // Some targets may reject heartbleed (charisma/depth); skip quietly.
    }
  }

  const current = ns.getHostname();
  const currentNode = state.nodes.get(current);
  if (!ns.dnet.isDarknetServer(current)) return;

  if (options.openCachesOnCurrentServer) {
    const cacheFiles = ns.ls(current, '.cache');
    for (const cacheFile of cacheFiles) {
      try {
        const result = ns.dnet.openCache(cacheFile, true);
        logAuthEvent(ns, {
          ts: Date.now(),
          hostname: current,
          modelId: currentNode?.modelId,
          event: 'cache-opened',
          message: result.message,
          cacheFile,
          cacheOpenSuccess: result.success,
          karmaLoss: result.karmaLoss,
          notes: 'Opened cache from current darknet server',
        });
      } catch (error) {
        logAuthEvent(ns, {
          ts: Date.now(),
          hostname: current,
          modelId: currentNode?.modelId,
          event: 'cache-opened',
          cacheFile,
          cacheOpenSuccess: false,
          message: String(error),
          notes: 'Cache open call threw error',
        });
      }
    }
  }

  if (options.runPhishingAttack) {
    try {
      const result = await ns.dnet.phishingAttack();
      logAuthEvent(ns, {
        ts: Date.now(),
        hostname: current,
        modelId: currentNode?.modelId,
        event: 'phishing-guess',
        message: result.message,
        notes: 'Run from current darknet server; message may mention cache retrieval',
      });
    } catch (error) {
      logAuthEvent(ns, {
        ts: Date.now(),
        hostname: current,
        modelId: currentNode?.modelId,
        event: 'phishing-guess',
        message: String(error),
        notes: 'Phishing attack call threw error',
      });
    }
  }
}

const DEFAULT_CRAWLER_MAX_DEPLOYS = 2;

function getCrawlerTransferFiles(ns: NS, workerScript: string): string[] {
  if (workerScript === DARKNET_WORKER_SCRIPT) {
    return [workerScript, ...DARKNET_WORKER_TASK_FILES];
  }
  return [workerScript];
}

export function deployCrawlerWorkers(
  context: DarknetContext,
  options: DarknetCrawlerDeployOptions = {},
): { guessed: number; started: number } {
  const { ns, state } = context;
  const now = Date.now();
  const current = ns.getHostname();
  const workerScript = options.workerScript ?? ns.getScriptName();
  const workerArgs = options.workerArgs ?? ['--noTail'];
  const maxDeployments = Math.max(0, Math.floor(options.maxDeployments ?? DEFAULT_CRAWLER_MAX_DEPLOYS));
  const transferFiles = getCrawlerTransferFiles(ns, workerScript);
  const workerRam = ns.getScriptRam(workerScript, 'home');
  if (workerRam <= 0) return { guessed: 0, started: 0 };
  let guessed = 0;
  let started = 0;

  for (const [hostname, node] of state.nodes.entries()) {
    if (guessed >= maxDeployments) break;
    if (hostname === current) continue;
    if (!node.isOnline || !node.isConnectedToCurrentServer || !node.hasSession) continue;
    if (node.lastWorkerDeployAt && now - node.lastWorkerDeployAt < WORKER_DEPLOY_COOLDOWN_MS) continue;
    if (ns.isRunning(workerScript, hostname, ...workerArgs)) continue;

    const freeRam = ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname);
    if (freeRam < workerRam) {
      node.lastWorkerDeployFailureAt = now;
      logAuthEvent(ns, {
        ts: now,
        hostname,
        modelId: node.modelId,
        event: 'crawler-deploy-failure',
        message: `insufficient RAM: free=${freeRam.toFixed(2)} required=${workerRam.toFixed(2)}`,
      });
      continue;
    }

    guessed += 1;
    const copied = ns.scp(transferFiles, hostname, 'home');
    if (!copied) {
      logAuthEvent(ns, {
        ts: now,
        hostname,
        modelId: node.modelId,
        event: 'crawler-deploy-failure',
        message: `scp failed for ${workerScript}`,
      });
      continue;
    }

    const pid = ns.exec(
      workerScript,
      hostname,
      {
        threads: 1,
        preventDuplicates: true,
      },
      ...workerArgs,
    );
    if (pid > 0) {
      started += 1;
      node.lastWorkerDeployAt = now;
      logAuthEvent(ns, {
        ts: now,
        hostname,
        modelId: node.modelId,
        event: 'crawler-deploy-success',
        message: `Started worker ${workerScript} pid=${pid}`,
      });
    } else {
      node.lastWorkerDeployFailureAt = now;
      logAuthEvent(ns, {
        ts: now,
        hostname,
        modelId: node.modelId,
        event: 'crawler-deploy-failure',
        message: `exec failed for ${workerScript}`,
      });
    }
  }

  return { guessed: guessed, started };
}

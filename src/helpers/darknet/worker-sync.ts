import type { NS } from '@ns';
import { logAuthEvent } from '/helpers/darknet/diagnostics.js';
import { rememberPassword } from '/helpers/darknet/lifecycle.js';
import type { DarknetContext, DarknetHostname } from '/helpers/darknet/types.js';

export const DARKNET_WORKER_SYNC_PORT = 17;
const NULL_PORT_DATA = 'NULL PORT DATA';
const SHARED_PROGRESS_DIR = '/helpers/darknet/password-progress';

type WorkerProgressFingerprint = {
  modelId: string;
  passwordLength: number;
  passwordFormat: string;
};

type MastermindConstraint = {
  guess: string;
  exact: number;
  misplaced: number;
};

type ActiveWorkerLease = {
  sourceHost: string;
  since: number;
};

type NilConstraintState = {
  knownByPos: (string | null)[];
  forbiddenByPos: string[][];
};

type WorkerSyncMessage =
  | {
      kind: 'progress-update';
      hostname: DarknetHostname;
      modelId: string;
      fingerprint: WorkerProgressFingerprint;
      cursor: string;
      // Optional fields that solvers may provide. Existing values on disk are preserved when these are omitted.
      constraints?: MastermindConstraint[];
      nilConstraints?: NilConstraintState;
      activeWorker?: ActiveWorkerLease | null;
      sourceHost?: string;
      ts: number;
    }
  | {
      kind: 'progress-clear';
      hostname: DarknetHostname;
      modelId: string;
      sourceHost?: string;
      ts: number;
    }
  | {
      kind: 'password-found';
      hostname: DarknetHostname;
      modelId: string;
      password: string;
      sourceHost?: string;
      ts: number;
    }
  | {
      kind: 'password-stale';
      hostname: DarknetHostname;
      attemptedPassword?: string;
      sourceHost?: string;
      ts: number;
    };

type SharedProgressFile = {
  version: 1;
  hostname: DarknetHostname;
  modelId: string;
  fingerprint: WorkerProgressFingerprint;
  cursor: string;
  constraints?: MastermindConstraint[];
  nilConstraints?: NilConstraintState;
  activeWorker?: ActiveWorkerLease;
  updatedAt: number;
  sourceHost?: string;
};

function sanitizeHostForPath(hostname: string): string {
  return hostname.replace(/[^A-Za-z0-9._-]/g, '_');
}

function getSharedProgressPath(hostname: string): string {
  return `${SHARED_PROGRESS_DIR}/${sanitizeHostForPath(hostname)}.json`;
}

function isWorkerSyncMessage(value: unknown): value is WorkerSyncMessage {
  if (typeof value !== 'object' || value == null) return false;
  const message = value as Record<string, unknown>;
  return typeof message.kind === 'string' && typeof message.hostname === 'string';
}

function readSharedProgress(ns: NS, hostname: DarknetHostname): SharedProgressFile | null {
  const path = getSharedProgressPath(hostname);
  const raw = ns.read(path).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SharedProgressFile;
  } catch {
    return null;
  }
}

function fingerprintsMatch(a: WorkerProgressFingerprint, b: WorkerProgressFingerprint): boolean {
  return (
    a.modelId === b.modelId && a.passwordLength === b.passwordLength && a.passwordFormat === b.passwordFormat
  );
}

function applyProgressUpdate(ns: NS, message: Extract<WorkerSyncMessage, { kind: 'progress-update' }>): void {
  const path = getSharedProgressPath(message.hostname);
  // Merge with existing on-disk state so that messages that don't include constraints/activeWorker
  // (e.g. heartbeats from non-Mastermind solvers) preserve previously stored values, and updates from
  // a different fingerprint (model/length/format change) reset the stale bookkeeping.
  const existing = readSharedProgress(ns, message.hostname);
  const sameFingerprint = existing != null && fingerprintsMatch(existing.fingerprint, message.fingerprint);

  const constraints =
    message.constraints !== undefined
      ? message.constraints
      : sameFingerprint
        ? existing?.constraints
        : undefined;
  const nilConstraints =
    message.nilConstraints !== undefined
      ? message.nilConstraints
      : sameFingerprint
        ? existing?.nilConstraints
        : undefined;

  let activeWorker: ActiveWorkerLease | undefined;
  if (message.activeWorker === null) {
    activeWorker = undefined;
  } else if (message.activeWorker !== undefined) {
    activeWorker = message.activeWorker;
  } else if (sameFingerprint) {
    activeWorker = existing?.activeWorker;
  }

  const payload: SharedProgressFile = {
    version: 1,
    hostname: message.hostname,
    modelId: message.modelId,
    fingerprint: message.fingerprint,
    cursor: message.cursor,
    constraints,
    nilConstraints,
    activeWorker,
    updatedAt: message.ts,
    sourceHost: message.sourceHost,
  };
  ns.write(path, JSON.stringify(payload), 'w');
}

function applyProgressClear(ns: NS, message: Extract<WorkerSyncMessage, { kind: 'progress-clear' }>): void {
  const path = getSharedProgressPath(message.hostname);
  ns.rm(path, 'home');
}

function applyPasswordFound(context: DarknetContext, message: Extract<WorkerSyncMessage, { kind: 'password-found' }>): void {
  rememberPassword(context, message.hostname, message.password, message.modelId);
  applyProgressClear(context.ns, {
    kind: 'progress-clear',
    hostname: message.hostname,
    modelId: message.modelId,
    sourceHost: message.sourceHost,
    ts: message.ts,
  });
}

function applyPasswordStale(
  context: DarknetContext,
  message: Extract<WorkerSyncMessage, { kind: 'password-stale' }>,
): boolean {
  context.ns.rm(getSharedProgressPath(message.hostname), 'home');
  const existing = context.passwords.get(message.hostname);
  if (!existing) return false;
  if (message.attemptedPassword != null && existing.password !== message.attemptedPassword) return false;
  context.passwords.delete(message.hostname);
  const node = context.state.nodes.get(message.hostname);
  if (node) {
    node.password = undefined;
    node.lastAuthFailureAt = Date.now();
  }
  return true;
}

export function processWorkerSyncMessages(context: DarknetContext): {
  processed: number;
  changedCredentials: boolean;
} {
  const { ns } = context;
  let processed = 0;
  let changedCredentials = false;

  while (true) {
    const raw = ns.readPort(DARKNET_WORKER_SYNC_PORT);
    if (raw === NULL_PORT_DATA) break;
    processed += 1;
    if (!isWorkerSyncMessage(raw)) continue;

    switch (raw.kind) {
      case 'progress-update':
        applyProgressUpdate(ns, raw);
        break;
      case 'progress-clear':
        applyProgressClear(ns, raw);
        break;
      case 'password-found':
        applyPasswordFound(context, raw);
        changedCredentials = true;
        logAuthEvent(ns, {
          ts: raw.ts,
          hostname: raw.hostname,
          modelId: raw.modelId,
          event: 'auth-success',
          message: `Password reported by worker on ${raw.sourceHost ?? 'unknown-host'}`,
        });
        break;
      case 'password-stale':
        changedCredentials = applyPasswordStale(context, raw) || changedCredentials;
        break;
    }
  }

  return { processed, changedCredentials };
}

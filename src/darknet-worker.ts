import type { NS } from '@ns';

const PASSWORDS_PATH = '/helpers/darknet/darknet-passwords.json';
const SHARED_PROGRESS_DIR = '/helpers/darknet/password-progress';
const DARKNET_WORKER_SYNC_PORT = 17;
const DARKNET_CACHE_REQUEST_PORT = 18;
const CACHE_REQUEST_TTL_MS = 30_000;
const HEARTBLEED_SAMPLE_COOLDOWN_MS = 60_000;
const RATE_MY_PIX_ATTEMPTS_PER_PASS = 100;
const FACTORI_OS_ATTEMPTS_PER_PASS = 100;
const BIG_MO_OD_ATTEMPTS_PER_PASS = 100;
const KING_OF_THE_HILL_ATTEMPTS_PER_PASS = 100;
const NIL_ATTEMPTS_PER_PASS = 100;
const TWO_G_ATTEMPTS_PER_PASS = 100;
const ACCOUNTS_ATTEMPTS_PER_PASS = 100;
const BELLA_RANGE_ATTEMPTS_PER_PASS = 100;
const DEEP_GREEN_ATTEMPTS_PER_PASS = 100;
const PR0VER_ATTEMPTS_PER_PASS = 100;
const NUMERIC_CHARSET = '0123456789';
const ALPHANUMERIC_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type PasswordVaultFile = {
  version: number;
  updatedAt: number;
  passwords: Record<string, { password: string; modelId?: string; discoveredAt: number; lastUsedAt?: number }>;
};
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

type SharedProgressFile = {
  version: 1;
  hostname: string;
  modelId: string;
  fingerprint: WorkerProgressFingerprint;
  cursor: string;
  constraints?: MastermindConstraint[];
  nilConstraints?: NilConstraintState;
  activeWorker?: ActiveWorkerLease;
  updatedAt: number;
  sourceHost?: string;
};

type SharedProgress = {
  cursor: string | null;
  constraints: MastermindConstraint[];
  nilConstraints: NilConstraintState | null;
  activeWorker: ActiveWorkerLease | null;
};

const ACTIVE_WORKER_LEASE_TTL_MS = 30_000;
const MAX_TRACKED_CONSTRAINTS = 64;
const VAULT_REFRESH_INTERVAL_MS = 2_000;
const lastHeartbleedSampleByHost = new Map<string, number>();
let cachedFreshVaultPasswords: PasswordVaultFile['passwords'] = {};
let cachedFreshVaultAt = 0;
const externallyKnownStalePasswords = new Map<string, Set<string>>();

function loadVault(ns: NS): PasswordVaultFile {
  const raw = ns.read(PASSWORDS_PATH).trim();
  if (!raw) return { version: 1, updatedAt: Date.now(), passwords: {} };
  try {
    return JSON.parse(raw) as PasswordVaultFile;
  } catch {
    return { version: 1, updatedAt: Date.now(), passwords: {} };
  }
}

function syncVaultFromHome(ns: NS): void {
  const current = ns.getHostname();
  if (current === 'home') return;
  // Keep worker-local password vault in sync with the canonical home copy so
  // remote workers do not keep brute-forcing already-solved neighbors.
  ns.scp(PASSWORDS_PATH, current, 'home');
}

function refreshFreshVaultIfDue(ns: NS): void {
  const now = Date.now();
  if (cachedFreshVaultAt > 0 && now - cachedFreshVaultAt < VAULT_REFRESH_INTERVAL_MS) return;
  cachedFreshVaultAt = now;
  syncVaultFromHome(ns);
  const raw = ns.read(PASSWORDS_PATH).trim();
  if (!raw) {
    cachedFreshVaultPasswords = {};
    return;
  }
  try {
    const parsed = JSON.parse(raw) as PasswordVaultFile;
    cachedFreshVaultPasswords = parsed.passwords ?? {};
  } catch {
    cachedFreshVaultPasswords = {};
  }
}

function getFreshVaultPassword(ns: NS, host: string): string | null {
  refreshFreshVaultIfDue(ns);
  return cachedFreshVaultPasswords[host]?.password ?? null;
}

function isExternallyKnownStale(host: string, password: string): boolean {
  return externallyKnownStalePasswords.get(host)?.has(password) ?? false;
}

function markExternalPasswordStale(host: string, password: string): void {
  let set = externallyKnownStalePasswords.get(host);
  if (!set) {
    set = new Set();
    externallyKnownStalePasswords.set(host, set);
  }
  set.add(password);
}

function saveVault(ns: NS, vault: PasswordVaultFile): void {
  vault.updatedAt = Date.now();
  ns.write(PASSWORDS_PATH, JSON.stringify(vault), 'w');
}

function rememberDiscoveredPassword(
  ns: NS,
  vault: PasswordVaultFile,
  host: string,
  modelId: string,
  password: string,
): void {
  const now = Date.now();
  vault.passwords[host] = {
    password,
    modelId,
    discoveredAt: now,
    lastUsedAt: now,
  };
  emitPasswordFound(ns, host, modelId, password);
}

function sanitizeHostForPath(hostname: string): string {
  return hostname.replace(/[^A-Za-z0-9._-]/g, '_');
}

function getSharedProgressPath(hostname: string): string {
  return `${SHARED_PROGRESS_DIR}/${sanitizeHostForPath(hostname)}.json`;
}

function writeSharedProgressToHome(ns: NS, hostname: string, payload: SharedProgressFile): void {
  const path = getSharedProgressPath(hostname);
  ns.write(path, JSON.stringify(payload), 'w');
  const current = ns.getHostname();
  if (current !== 'home') {
    ns.scp(path, 'home', current);
  }
}

function clearSharedProgressOnHome(ns: NS, hostname: string): void {
  const path = getSharedProgressPath(hostname);
  const current = ns.getHostname();
  ns.rm(path, current);
  if (current !== 'home') {
    ns.rm(path, 'home');
  }
}

function getProgressFingerprint(
  modelId: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): WorkerProgressFingerprint {
  return {
    modelId,
    passwordLength: details.passwordLength,
    passwordFormat: details.passwordFormat,
  };
}

function loadSharedProgress(
  ns: NS,
  hostname: string,
  modelId: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): SharedProgress {
  const empty: SharedProgress = { cursor: null, constraints: [], nilConstraints: null, activeWorker: null };
  const path = getSharedProgressPath(hostname);
  ns.scp(path, ns.getHostname(), 'home');
  const raw = ns.read(path).trim();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as SharedProgressFile;
    const fingerprint = getProgressFingerprint(modelId, details);
    if (
      parsed.hostname !== hostname ||
      parsed.modelId !== modelId ||
      parsed.fingerprint.modelId !== fingerprint.modelId ||
      parsed.fingerprint.passwordLength !== fingerprint.passwordLength ||
      parsed.fingerprint.passwordFormat !== fingerprint.passwordFormat
    ) {
      return empty;
    }
    return {
      cursor: parsed.cursor ?? null,
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
      nilConstraints: parsed.nilConstraints ?? null,
      activeWorker: parsed.activeWorker ?? null,
    };
  } catch {
    return empty;
  }
}

function isLeaseHeldByOther(activeWorker: ActiveWorkerLease | null, myHost: string, now: number): boolean {
  if (!activeWorker) return false;
  if (activeWorker.sourceHost === myHost) return false;
  return now - activeWorker.since < ACTIVE_WORKER_LEASE_TTL_MS;
}

function deepGreenScore(candidate: string, guess: string): { exact: number; misplaced: number } | null {
  if (candidate.length !== guess.length) return null;
  const len = candidate.length;
  let exact = 0;
  for (let i = 0; i < len; i++) if (candidate[i] === guess[i]) exact++;

  const candidateCounts = new Map<string, number>();
  const guessCounts = new Map<string, number>();
  for (let i = 0; i < len; i++) {
    candidateCounts.set(candidate[i], (candidateCounts.get(candidate[i]) ?? 0) + 1);
    guessCounts.set(guess[i], (guessCounts.get(guess[i]) ?? 0) + 1);
  }
  let total = 0;
  for (const [ch, count] of candidateCounts) {
    total += Math.min(count, guessCounts.get(ch) ?? 0);
  }
  return { exact, misplaced: total - exact };
}

function isCandidateConsistent(candidate: string, constraints: MastermindConstraint[]): boolean {
  for (const c of constraints) {
    const score = deepGreenScore(candidate, c.guess);
    if (!score) return false;
    if (score.exact !== c.exact || score.misplaced !== c.misplaced) return false;
  }
  return true;
}

function parseDeepGreenHint(data: unknown): { exact: number; misplaced: number } | null {
  if (typeof data !== 'string') return null;
  const parts = data.split(',').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const exact = Number(parts[0]);
  const misplaced = Number(parts[1]);
  if (!Number.isFinite(exact) || !Number.isFinite(misplaced)) return null;
  if (exact < 0 || misplaced < 0) return null;
  return { exact, misplaced };
}

function createNilConstraintState(length: number): NilConstraintState {
  return {
    knownByPos: Array.from({ length }, () => null),
    forbiddenByPos: Array.from({ length }, () => []),
  };
}

function normalizeNilConstraintState(state: NilConstraintState | null, length: number): NilConstraintState {
  if (!state) return createNilConstraintState(length);
  const knownByPos = Array.from({ length }, (_, idx) => state.knownByPos[idx] ?? null);
  const forbiddenByPos = Array.from({ length }, (_, idx) => {
    const values = state.forbiddenByPos[idx] ?? [];
    return [...new Set(values)];
  });
  return { knownByPos, forbiddenByPos };
}

// Strip every apostrophe-like character (ASCII ', curly ', U+2019, modifier letter U+02BC, backtick).
// The game renders "yesn't" with whichever apostrophe glyph is in fashion, and an exact-match against
// the ASCII literal silently drops the whole feedback (no constraint learned) when the encodings
// disagree. Normalize first, classify second.
function stripApostrophes(token: string): string {
  return token.replace(/[\u2018\u2019\u02BC'`\u00B4]/g, '');
}

function parseNilFeedback(data: unknown): ('yes' | "yesn't")[] | null {
  let rawTokens: string[] | null = null;
  if (typeof data === 'string') {
    rawTokens = data.split(',');
  } else if (Array.isArray(data) && data.every((entry) => typeof entry === 'string')) {
    rawTokens = data as string[];
  }
  if (rawTokens == null) return null;

  const tokens = rawTokens.map((token) => token.trim().toLowerCase()).filter((token) => token.length > 0);
  if (tokens.length === 0) return null;

  const normalized: ('yes' | "yesn't")[] = [];
  for (const token of tokens) {
    if (token === 'yes') {
      normalized.push('yes');
      continue;
    }
    const stripped = stripApostrophes(token);
    if (stripped === 'yesnt' || stripped === 'no') {
      normalized.push("yesn't");
      continue;
    }
    return null;
  }
  return normalized;
}

function applyNilFeedback(state: NilConstraintState, guess: string, feedback: ('yes' | "yesn't")[]): boolean {
  let changed = false;
  const len = Math.min(guess.length, feedback.length, state.knownByPos.length);
  for (let i = 0; i < len; i++) {
    const ch = guess[i];
    if (feedback[i] === 'yes') {
      if (state.knownByPos[i] !== ch) changed = true;
      state.knownByPos[i] = ch;
      const filtered = state.forbiddenByPos[i].filter((value) => value !== ch);
      if (filtered.length !== state.forbiddenByPos[i].length) changed = true;
      state.forbiddenByPos[i] = filtered;
    } else if (!state.forbiddenByPos[i].includes(ch)) {
      state.forbiddenByPos[i].push(ch);
      changed = true;
    }
  }
  return changed;
}

function isNilCandidateConsistent(candidate: string, state: NilConstraintState): boolean {
  const len = Math.min(candidate.length, state.knownByPos.length);
  for (let i = 0; i < len; i++) {
    const known = state.knownByPos[i];
    const current = candidate[i];
    if (known != null && current !== known) return false;
    if (state.forbiddenByPos[i].includes(current)) return false;
  }
  return true;
}

function emitWorkerMessage(ns: NS, payload: unknown): void {
  ns.tryWritePort(DARKNET_WORKER_SYNC_PORT, payload);
}

function openLocalCaches(ns: NS): void {
  const host = ns.getHostname();
  const caches = ns.ls(host, '.cache');
  for (const file of caches) {
    try {
      ns.dnet.openCache(file, false);
    } catch {
      // Cache may have just been opened by another pass; ignore.
    }
  }
}

type CacheOpenRequest = {
  kind: 'open-cache';
  hostname: string;
  file: string;
  ts: number;
};

function isCacheOpenRequest(value: unknown): value is CacheOpenRequest {
  if (typeof value !== 'object' || value == null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.kind === 'open-cache' &&
    typeof message.hostname === 'string' &&
    typeof message.file === 'string' &&
    typeof message.ts === 'number'
  );
}

function processCacheOpenRequests(ns: NS): void {
  const myHost = ns.getHostname();
  const NULL_PORT = 'NULL PORT DATA';

  for (let i = 0; i < 16; i++) {
    const head = ns.peek(DARKNET_CACHE_REQUEST_PORT);
    if (head === NULL_PORT) return;

    if (!isCacheOpenRequest(head)) {
      ns.readPort(DARKNET_CACHE_REQUEST_PORT);
      continue;
    }

    if (head.hostname === myHost) {
      ns.readPort(DARKNET_CACHE_REQUEST_PORT);
      try {
        ns.dnet.openCache(head.file, false);
      } catch {
        // Cache may have moved/expired; ignore so other workers aren't blocked.
      }
      continue;
    }

    if (Date.now() - head.ts > CACHE_REQUEST_TTL_MS) {
      ns.readPort(DARKNET_CACHE_REQUEST_PORT);
      continue;
    }

    return;
  }
}

function emitProgressUpdate(
  ns: NS,
  hostname: string,
  modelId: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
  cursor: string,
  options?: {
    constraints?: MastermindConstraint[];
    nilConstraints?: NilConstraintState;
    activeWorker?: ActiveWorkerLease | null;
  },
): void {
  const message: Record<string, unknown> = {
    kind: 'progress-update',
    hostname,
    modelId,
    fingerprint: getProgressFingerprint(modelId, details),
    cursor,
    sourceHost: ns.getHostname(),
    ts: Date.now(),
  };
  if (options?.constraints !== undefined) message.constraints = options.constraints;
  if (options?.nilConstraints !== undefined) message.nilConstraints = options.nilConstraints;
  if (options?.activeWorker !== undefined) message.activeWorker = options.activeWorker;
  writeSharedProgressToHome(ns, hostname, {
    version: 1,
    hostname,
    modelId,
    fingerprint: getProgressFingerprint(modelId, details),
    cursor,
    constraints: options?.constraints,
    nilConstraints: options?.nilConstraints,
    activeWorker: options?.activeWorker ?? undefined,
    updatedAt: Date.now(),
    sourceHost: ns.getHostname(),
  });
  emitWorkerMessage(ns, message);
}

function emitProgressClear(ns: NS, hostname: string, modelId: string): void {
  clearSharedProgressOnHome(ns, hostname);
  emitWorkerMessage(ns, {
    kind: 'progress-clear',
    hostname,
    modelId,
    sourceHost: ns.getHostname(),
    ts: Date.now(),
  });
}

function emitPasswordFound(ns: NS, hostname: string, modelId: string, password: string): void {
  emitWorkerMessage(ns, {
    kind: 'password-found',
    hostname,
    modelId,
    password,
    sourceHost: ns.getHostname(),
    ts: Date.now(),
  });
}

function emitPasswordStale(ns: NS, hostname: string, attemptedPassword: string): void {
  emitWorkerMessage(ns, {
    kind: 'password-stale',
    hostname,
    attemptedPassword,
    sourceHost: ns.getHostname(),
    ts: Date.now(),
  });
}

const HEARTBLEED_LOGS_TO_CAPTURE = 10;

type HeartbleedFindings = {
  currentHostPassword: string | null;
  neighborPasswords: Map<string, string>;
};

// Per-guess short-circuit: check the (refreshed) home vault for a password we haven't yet recognized
// as stale, verify with authenticate, and signal cracked-or-stale appropriately. Used inside every
// brute-force inner loop so one worker discovering a credential frees all peers immediately.
async function tryShortCircuitFromVault(ns: NS, host: string, modelId: string): Promise<string | null> {
  const external = getFreshVaultPassword(ns, host);
  if (external == null) return null;
  if (isExternallyKnownStale(host, external)) return null;
  const auth = await ns.dnet.authenticate(host, external);
  if (auth.success) {
    emitProgressClear(ns, host, modelId);
    return external;
  }
  emitPasswordStale(ns, host, external);
  markExternalPasswordStale(host, external);
  return null;
}

async function maybeSampleHeartbleed(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string[] | null> {
  if (details.hasSession) return null;
  const now = Date.now();
  const lastSampleAt = lastHeartbleedSampleByHost.get(host) ?? 0;
  if (now - lastSampleAt < HEARTBLEED_SAMPLE_COOLDOWN_MS) return null;
  try {
    const result = await ns.dnet.heartbleed(host, {
      peek: true,
      logsToCapture: HEARTBLEED_LOGS_TO_CAPTURE,
    });
    lastHeartbleedSampleByHost.set(host, now);
    return Array.isArray(result?.logs) ? result.logs : [];
  } catch {
    // Some targets reject heartbleed (e.g. required charisma above ours); back off until cooldown.
    lastHeartbleedSampleByHost.set(host, now);
    return null;
  }
}

// Heartbleed log lines like:
//   Connecting to data;net:334 ...
//   Connecting to data@nwo:7043: ...
//   Logging in with passcode: 711469 ...
// The first form leaks neighbor passwords; the second leaks the heartbleed target's own password.
function parseHeartbleedLogs(logs: string[]): HeartbleedFindings {
  const neighborPasswords = new Map<string, string>();
  let currentHostPassword: string | null = null;

  const connectingRe = /Connecting to (.+?):(\S+?)(?=[:\s]|$)/;
  const passcodeRe = /Logging in with passcode:\s*(\S+?)(?=[\s.]|$)/;

  for (const rawLine of logs) {
    if (typeof rawLine !== 'string') continue;
    const line = rawLine.trim();

    const passcodeMatch = passcodeRe.exec(line);
    if (passcodeMatch) {
      const candidate = passcodeMatch[1];
      if (candidate.length > 0) currentHostPassword = candidate;
      continue;
    }

    const connectingMatch = connectingRe.exec(line);
    if (connectingMatch) {
      const hostname = connectingMatch[1];
      const password = connectingMatch[2];
      if (hostname.length > 0 && password.length > 0) {
        neighborPasswords.set(hostname, password);
      }
    }
  }

  return { currentHostPassword, neighborPasswords };
}

async function applyHeartbleedFindings(
  ns: NS,
  vault: PasswordVaultFile,
  currentHost: string,
  currentModelId: string | undefined,
  findings: HeartbleedFindings,
): Promise<{ learnedCurrentHost: boolean }> {
  const now = Date.now();
  let learnedCurrentHost = false;

  // For the current host the password can be verified directly via authenticate; only persist on success.
  if (findings.currentHostPassword != null) {
    const candidate = findings.currentHostPassword;
    const existing = vault.passwords[currentHost];
    if (existing?.password === candidate) {
      learnedCurrentHost = true;
    } else {
      const auth = await ns.dnet.authenticate(currentHost, candidate);
      if (auth.success) {
        vault.passwords[currentHost] = {
          password: candidate,
          modelId: currentModelId,
          discoveredAt: now,
          lastUsedAt: now,
        };
        emitPasswordFound(ns, currentHost, currentModelId ?? '', candidate);
        learnedCurrentHost = true;
      }
    }
  }

  // Neighbor passwords cannot be verified from here (we may not be directly connected). Save them so
  // the next connectToSession attempt can validate them; emitPasswordStale will clean up if wrong.
  for (const [neighbor, password] of findings.neighborPasswords) {
    if (neighbor === currentHost) continue;
    const existing = vault.passwords[neighbor];
    if (existing?.password === password) continue;
    vault.passwords[neighbor] = {
      password,
      modelId: existing?.modelId,
      discoveredAt: now,
      lastUsedAt: now,
    };
    emitPasswordFound(ns, neighbor, existing?.modelId ?? '', password);
  }

  return { learnedCurrentHost };
}

function powBigInt(base: bigint, exp: number): bigint {
  let out = 1n;
  for (let i = 0; i < exp; i++) out *= base;
  return out;
}

function toBaseNFixed(index: bigint, length: number, charset: string): string {
  const base = BigInt(charset.length);
  let value = index;
  const out = new Array<string>(length);
  for (let i = length - 1; i >= 0; i--) {
    const digit = Number(value % base);
    out[i] = charset[digit];
    value /= base;
  }
  return out.join('');
}

async function tryPr0verFl0(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'alphanumeric' || details.passwordLength <= 0) return null;
  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'Pr0verFl0', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };

  const base = BigInt(ALPHANUMERIC_CHARSET.length);
  const total = powBigInt(base, details.passwordLength);
  let start = 0n;
  if (progress.cursor != null) {
    try {
      start = BigInt(progress.cursor);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop = start + BigInt(PR0VER_ATTEMPTS_PER_PASS) > total ? total : start + BigInt(PR0VER_ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const short = await tryShortCircuitFromVault(ns, host, 'Pr0verFl0');
    if (short != null) return short;
    const candidate = toBaseNFixed(i, details.passwordLength, ALPHANUMERIC_CHARSET);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, 'Pr0verFl0');
      return candidate;
    }
  }

  emitProgressUpdate(ns, host, 'Pr0verFl0', details, stop >= total ? '0' : stop.toString(), {
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

async function tryDeepGreen(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordLength <= 0) return null;
  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) return null;

  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'DeepGreen', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) {
    return null;
  }

  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  if (progress.cursor != null) {
    try {
      start = BigInt(progress.cursor);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;

  // Track constraints in-memory across this pass, seeded from shared state. We emit them at the end of
  // the pass so other workers see the latest hints, while attempting many candidates per pass.
  const constraints: MastermindConstraint[] = [...progress.constraints];
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };
  // Take the lease before the first attempt so peers back off immediately on their next sync.
  emitProgressUpdate(ns, host, 'DeepGreen', details, start.toString(), {
    constraints,
    activeWorker: lease,
  });

  let cursor = start;
  let attempted = 0;
  let cracked: string | null = null;

  while (cursor < total && attempted < DEEP_GREEN_ATTEMPTS_PER_PASS) {
    const short = await tryShortCircuitFromVault(ns, host, 'DeepGreen');
    if (short != null) return short;

    const candidate = toBaseNFixed(cursor, details.passwordLength, charset);
    cursor += 1n;

    if (!isCandidateConsistent(candidate, constraints)) continue;

    attempted += 1;
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      cracked = candidate;
      break;
    }

    const hint = parseDeepGreenHint(auth.data);
    if (hint != null) {
      // If the new constraint duplicates an earlier guess, keep the most recent; otherwise append, with a soft cap.
      const existingIdx = constraints.findIndex((c) => c.guess === candidate);
      if (existingIdx >= 0) {
        constraints[existingIdx] = { guess: candidate, exact: hint.exact, misplaced: hint.misplaced };
      } else {
        constraints.push({ guess: candidate, exact: hint.exact, misplaced: hint.misplaced });
        if (constraints.length > MAX_TRACKED_CONSTRAINTS) {
          constraints.splice(0, constraints.length - MAX_TRACKED_CONSTRAINTS);
        }
      }
    }
  }

  if (cracked != null) {
    emitProgressClear(ns, host, 'DeepGreen');
    return cracked;
  }

  // Persist the resumed cursor and the latest constraints; refresh the lease so we keep priority next pass.
  emitProgressUpdate(ns, host, 'DeepGreen', details, cursor >= total ? '0' : cursor.toString(), {
    constraints,
    activeWorker: { sourceHost: myHost, since: Date.now() },
  });
  return null;
}

async function try2GCellular(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordLength <= 0) return null;
  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) return null;

  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, '2G_cellular', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };

  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  if (progress.cursor != null) {
    try {
      start = BigInt(progress.cursor);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop = start + BigInt(TWO_G_ATTEMPTS_PER_PASS) > total ? total : start + BigInt(TWO_G_ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const short = await tryShortCircuitFromVault(ns, host, '2G_cellular');
    if (short != null) return short;
    const candidate = toBaseNFixed(i, details.passwordLength, charset);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, '2G_cellular');
      return candidate;
    }
  }

  emitProgressUpdate(ns, host, '2G_cellular', details, stop >= total ? '0' : stop.toString(), {
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

async function tryBellaCuoreRange(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const tokens = (details.data ?? '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  if (tokens.length !== 2) return null;
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const parseRoman = (roman: string): number | null => {
    if (!/^[IVXLCDM]+$/.test(roman)) return null;
    let total = 0;
    for (let i = 0; i < roman.length; i++) {
      const cur = values[roman[i]];
      const next = i + 1 < roman.length ? values[roman[i + 1]] : 0;
      if (!cur) return null;
      total += cur < next ? -cur : cur;
    }
    return total;
  };

  const min = parseRoman(tokens[0]);
  const max = parseRoman(tokens[1]);
  if (min == null || max == null || min > max) return null;

  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'BellaCuore', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };

  const raw = progress.cursor;
  let start = raw == null ? min : Number.parseInt(raw, 10);
  if (!Number.isFinite(start)) start = min;
  if (start < min || start > max) start = min;
  const stop = Math.min(max + 1, start + BELLA_RANGE_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const short = await tryShortCircuitFromVault(ns, host, 'BellaCuore');
    if (short != null) return short;
    const candidate = String(n);
    if (candidate.length !== details.passwordLength) continue;
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, 'BellaCuore');
      return candidate;
    }
  }

  emitProgressUpdate(ns, host, 'BellaCuore', details, String(stop > max ? min : stop), {
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

async function tryAccountsManager42(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'AccountsManager_4.2', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };

  const maxValue = 10 ** details.passwordLength;
  const raw = progress.cursor;
  let start = raw == null ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(start)) start = 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + ACCOUNTS_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const short = await tryShortCircuitFromVault(ns, host, 'AccountsManager_4.2');
    if (short != null) return short;
    const candidate = String(n);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, 'AccountsManager_4.2');
      return candidate;
    }
  }

  emitProgressUpdate(ns, host, 'AccountsManager_4.2', details, String(stop >= maxValue ? 0 : stop), {
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

async function tryNIL(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordLength <= 0) return null;
  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) return null;

  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'NIL', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };
  const nilConstraints = normalizeNilConstraintState(progress.nilConstraints, details.passwordLength);

  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  if (progress.cursor != null) {
    try {
      start = BigInt(progress.cursor);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  // Publish lease + current NIL constraints early so peers can immediately back off and share clues.
  emitProgressUpdate(ns, host, 'NIL', details, start.toString(), {
    nilConstraints,
    activeWorker: lease,
  });

  // Count actual authenticate attempts (not raw cursor steps); skipped-by-constraint candidates are
  // free to scan since they don't burn an `authenticate` call. Without this, the per-pass attempt
  // budget gets eaten by `continue`s and the solver crawls once constraints prune most of the space.
  let cursor = start;
  let attempted = 0;
  while (cursor < total && attempted < NIL_ATTEMPTS_PER_PASS) {
    const short = await tryShortCircuitFromVault(ns, host, 'NIL');
    if (short != null) return short;

    const candidate = toBaseNFixed(cursor, details.passwordLength, charset);
    cursor += 1n;

    if (!isNilCandidateConsistent(candidate, nilConstraints)) continue;
    attempted += 1;

    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, 'NIL');
      return candidate;
    }
    const feedback = parseNilFeedback(auth.data);
    if (feedback && applyNilFeedback(nilConstraints, candidate, feedback)) {
      // Publish updated constraints as soon as they change to reduce stale NIL guesses across workers.
      emitProgressUpdate(ns, host, 'NIL', details, cursor.toString(), {
        nilConstraints,
        activeWorker: { ...lease, since: Date.now() },
      });
    }
  }

  emitProgressUpdate(ns, host, 'NIL', details, cursor >= total ? '0' : cursor.toString(), {
    nilConstraints,
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

async function tryRateMyPixAuth(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordLength <= 0) return null;
  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) return null;

  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'RateMyPix.Auth', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };

  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  if (progress.cursor != null) {
    try {
      start = BigInt(progress.cursor);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop =
    start + BigInt(RATE_MY_PIX_ATTEMPTS_PER_PASS) > total ? total : start + BigInt(RATE_MY_PIX_ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const short = await tryShortCircuitFromVault(ns, host, 'RateMyPix.Auth');
    if (short != null) return short;
    const candidate = toBaseNFixed(i, details.passwordLength, charset);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, 'RateMyPix.Auth');
      return candidate;
    }
  }

  emitProgressUpdate(ns, host, 'RateMyPix.Auth', details, stop >= total ? '0' : stop.toString(), {
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

async function tryFactoriOs(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'Factori-Os', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };

  const maxValue = 10 ** details.passwordLength;
  const raw = progress.cursor;
  let start = raw == null ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(start)) start = 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + FACTORI_OS_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const short = await tryShortCircuitFromVault(ns, host, 'Factori-Os');
    if (short != null) return short;
    const candidate = String(n);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, 'Factori-Os');
      return candidate;
    }
  }

  emitProgressUpdate(ns, host, 'Factori-Os', details, String(stop >= maxValue ? 0 : stop), {
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

async function tryBigMoOd(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'BigMo%od', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };

  const maxValue = 10 ** details.passwordLength;
  const raw = progress.cursor;
  let start = raw == null ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(start)) start = 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + BIG_MO_OD_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const short = await tryShortCircuitFromVault(ns, host, 'BigMo%od');
    if (short != null) return short;
    const candidate = String(n);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, 'BigMo%od');
      return candidate;
    }
  }

  emitProgressUpdate(ns, host, 'BigMo%od', details, String(stop >= maxValue ? 0 : stop), {
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

async function tryKingOfTheHill(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const myHost = ns.getHostname();
  const now = Date.now();
  const progress = loadSharedProgress(ns, host, 'KingOfTheHill', details);
  if (isLeaseHeldByOther(progress.activeWorker, myHost, now)) return null;
  const lease: ActiveWorkerLease = { sourceHost: myHost, since: now };

  const maxValue = 10 ** details.passwordLength;
  const raw = progress.cursor;
  let start = raw == null ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(start)) start = 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + KING_OF_THE_HILL_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const short = await tryShortCircuitFromVault(ns, host, 'KingOfTheHill');
    if (short != null) return short;
    const candidate = String(n);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      emitProgressClear(ns, host, 'KingOfTheHill');
      return candidate;
    }
  }

  emitProgressUpdate(ns, host, 'KingOfTheHill', details, String(stop >= maxValue ? 0 : stop), {
    activeWorker: { ...lease, since: Date.now() },
  });
  return null;
}

function inferDeskMemoPin(hint: string, expectedLength: number): string | null {
  const groups = hint.match(/\d+/g);
  if (!groups || groups.length === 0) return null;
  const exact = groups.find((g) => g.length === expectedLength);
  if (exact) return exact;
  const longest = [...groups].sort((a, b) => b.length - a.length)[0];
  return longest ? longest.slice(0, expectedLength) : null;
}

function inferFreshInstallCandidates(expectedLength: number, format: string): string[] {
  const pool = ['admin', 'password', '0000', '12345'];

  const matchesFormat = (value: string): boolean => {
    if (/\d/.test(value) && format === 'alphabetic') return false;
    if (/[A-Za-z]/.test(value) && format === 'numeric') return false;
    return true;
  };

  return pool.filter((p) => p.length === expectedLength && matchesFormat(p));
}

function inferTopPassCandidates(expectedLength: number, format: string): string[] {
  const pool = [
    '123456',
    'password',
    '12345678',
    'qwerty',
    '123456789',
    '12345',
    '1234',
    '111111',
    '1234567',
    'dragon',
    '123123',
    'baseball',
    'abc123',
    'football',
    'monkey',
    'letmein',
    '696969',
    'shadow',
    'master',
    '666666',
    'qwertyuiop',
    '123321',
    'mustang',
    '1234567890',
    'michael',
    '654321',
    'superman',
    '1qaz2wsx',
    '7777777',
    '121212',
    '0',
    'qazwsx',
    '123qwe',
    'trustno1',
    'jordan',
    'jennifer',
    'zxcvbnm',
    'asdfgh',
    'hunter',
    'buster',
    'soccer',
    'harley',
    'batman',
    'andrew',
    'tigger',
    'sunshine',
    'iloveyou',
    '2000',
    'charlie',
    'robert',
    'thomas',
    'hockey',
    'ranger',
    'daniel',
    'starwars',
    '112233',
    'george',
    'computer',
    'michelle',
    'jessica',
    'pepper',
    '1111',
    'zxcvbn',
    '555555',
    '11111111',
    '131313',
    'freedom',
    '777777',
    'pass',
    'maggie',
    '159753',
    'aaaaaa',
    'ginger',
    'princess',
    'joshua',
    'cheese',
    'amanda',
    'summer',
    'love',
    'ashley',
    '6969',
    'nicole',
    'chelsea',
    'biteme',
    'matthew',
    'access',
    'yankees',
    '987654321',
    'dallas',
    'austin',
    'thunder',
    'taylor',
    'matrix',
  ];

  const matchesFormat = (value: string): boolean => {
    if (format === 'numeric') return /^\d+$/.test(value);
    if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
    if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
    return true;
  };

  return pool.filter((p) => p.length === expectedLength && matchesFormat(p));
}

function inferEuroZoneFreeCandidates(expectedLength: number, format: string): string[] {
  const pool = [
    'Austria',
    'Belgium',
    'Bulgaria',
    'Croatia',
    'Republic of Cyprus',
    'Czech Republic',
    'Denmark',
    'Estonia',
    'Finland',
    'France',
    'Germany',
    'Greece',
    'Hungary',
    'Ireland',
    'Italy',
    'Latvia',
    'Lithuania',
    'Luxembourg',
    'Malta',
    'Netherlands',
    'Poland',
    'Portugal',
    'Romania',
    'Slovakia',
    'Slovenia',
    'Spain',
    'Sweden',
  ];

  const matchesFormat = (value: string): boolean => {
    if (format === 'numeric') return /^\d+$/.test(value);
    if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
    if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
    return true;
  };

  return pool.filter((country) => country.length === expectedLength && matchesFormat(country));
}

function inferLaika4Candidates(expectedLength: number, format: string): string[] {
  const pool = ['fido', 'spot', 'rover', 'max'];
  const matchesFormat = (value: string): boolean => {
    if (/\d/.test(value) && format === 'alphabetic') return false;
    if (/[A-Za-z]/.test(value) && format === 'numeric') return false;
    return true;
  };
  return pool.filter((p) => p.length === expectedLength && matchesFormat(p));
}

function inferOctantVoxelCandidate(data: string, expectedLength: number, format: string): string[] {
  if (format !== 'numeric') return [];
  const [baseText, valueText] = data.split(',').map((s) => s.trim());
  const base = Number(baseText);
  if (!Number.isFinite(base) || base <= 1 || base > 36) return [];
  const encoded = (valueText ?? '').trim().toUpperCase();
  if (!/^[0-9A-Z]+(\.[0-9A-Z]+)?$/.test(encoded)) return [];

  const maxDigitExclusive = Math.ceil(base);
  const [whole, frac = ''] = encoded.split('.');
  let approx = 0;
  for (let i = 0; i < whole.length; i++) {
    const digit = BASE_CHARS.indexOf(whole[i]);
    if (digit < 0 || digit >= maxDigitExclusive) return [];
    approx += digit * base ** (whole.length - i - 1);
  }
  for (let i = 0; i < frac.length; i++) {
    const digit = BASE_CHARS.indexOf(frac[i]);
    if (digit < 0 || digit >= maxDigitExclusive) return [];
    approx += digit * base ** -(i + 1);
  }

  const encodeNumberInBaseN = (decimalNumber: number): string => {
    let digits = Math.floor(Math.log(decimalNumber) / Math.log(base));
    let remaining = decimalNumber;
    let result = '';
    while (remaining >= 0.0001 || digits >= 0) {
      if (digits === -1) result += '.';
      const place = Math.floor(remaining / base ** digits);
      result += BASE_CHARS[place];
      remaining -= place * base ** digits;
      digits -= 1;
    }
    return result;
  };

  const center = Math.max(1, Math.round(approx));
  const start = Math.max(1, center - 5000);
  const end = center + 5000;
  for (let n = start; n <= end; n++) {
    const candidate = String(n);
    if (candidate.length !== expectedLength) continue;
    if (encodeNumberInBaseN(n) === encoded) return [candidate];
  }
  return [];
}

function inferOpenWebAccessPointCandidates(expectedLength: number, format: string): string[] {
  if (format !== 'numeric') return [];
  const pool = [
    '12345678',
    '00000000',
    '11111111',
    '87654321',
    '11223344',
    '12121212',
    '12341234',
    '98765432',
    '24682468',
    '25802580',
    '31415926',
    '01012000',
    '20000101',
  ];
  return pool.filter((p) => p.length === expectedLength);
}

function inferBellaCuoreCandidate(data: string, expectedLength: number, format: string): string[] {
  if (format !== 'numeric') return [];
  const roman = data.trim().toUpperCase();
  if (!roman || !/^[IVXLCDM]+$/.test(roman)) return [];
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const cur = values[roman[i]];
    const next = i + 1 < roman.length ? values[roman[i + 1]] : 0;
    if (!cur) return [];
    total += cur < next ? -cur : cur;
  }
  const candidate = String(total);
  return candidate.length === expectedLength ? [candidate] : [];
}

function inferPrimeTime2Candidate(data: string, expectedLength: number, format: string): string[] {
  if (format !== 'numeric' || expectedLength <= 0) return [];
  const targetText = data.trim();
  if (!/^\d+$/.test(targetText)) return [];
  let n = BigInt(targetText);
  if (n < 2n) return [];

  let largest = 1n;
  while (n % 2n === 0n) {
    largest = 2n;
    n /= 2n;
  }

  let d = 3n;
  while (d * d <= n) {
    while (n % d === 0n) {
      largest = d;
      n /= d;
    }
    d += 2n;
  }

  const candidate = (n > 1n ? n : largest).toString();
  return candidate.length === expectedLength ? [candidate] : [];
}

function infer110100100Candidate(data: string, expectedLength: number, format: string): string[] {
  const tokens = data
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return [];
  for (const token of tokens) {
    if (!/^[01]{8}$/.test(token)) return [];
  }

  const decoded = tokens.map((token) => String.fromCharCode(parseInt(token, 2))).join('');
  const matchesFormat = (value: string): boolean => {
    if (format === 'numeric') return /^\d+$/.test(value);
    if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
    if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
    return true;
  };

  if (decoded.length !== expectedLength || !matchesFormat(decoded)) return [];
  return [decoded];
}

function inferMathMLCandidate(data: string, expectedLength: number, format: string): string[] {
  if (format !== 'numeric' || expectedLength <= 0) return [];
  const cleanArithmeticExpression = (expression: string): string =>
    expression
      .replaceAll('ҳ', '*')
      .replaceAll('÷', '/')
      .replaceAll('➕', '+')
      .replaceAll('➖', '-')
      .replace(/[^0-9+\-*/(). ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const parseSimpleArithmeticExpression = (expression: string): number => {
    const tokens = cleanArithmeticExpression(expression).split('');
    let currentDepth = 0;
    const depth = tokens.map((token) => {
      if (token === '(') {
        currentDepth += 1;
      } else if (token === ')') {
        currentDepth -= 1;
        return currentDepth + 1;
      }
      return currentDepth;
    });

    const depth1Start = depth.indexOf(1);
    const firstZeroAfterDepth1Start = depth.indexOf(0, depth1Start);
    const depth1End = firstZeroAfterDepth1Start === -1 ? depth.length - 1 : firstZeroAfterDepth1Start - 1;
    if (depth1Start !== -1) {
      const subExpression = tokens.slice(depth1Start + 1, depth1End).join('');
      const result = parseSimpleArithmeticExpression(subExpression);
      tokens.splice(depth1Start, depth1End - depth1Start + 1, result.toString());
      return parseSimpleArithmeticExpression(tokens.join(''));
    }

    let remainingExpression = tokens.join('');
    const multiplicationDivisionRegex = /(-?\d*\.?\d+) *([*/]) *(-?\d*\.?\d+)/;
    let match = remainingExpression.match(multiplicationDivisionRegex);
    while (match) {
      const left = match[1];
      const operator = match[2];
      const right = match[3];
      const result = operator === '*' ? parseFloat(left) * parseFloat(right) : parseFloat(left) / parseFloat(right);
      const resultString = Math.abs(result) < 0.000001 ? result.toFixed(20) : result.toString();
      remainingExpression = remainingExpression.replace(match[0], resultString);
      match = remainingExpression.match(multiplicationDivisionRegex);
    }

    const additionSubtractionRegex = /(-?\d*\.?\d+) *([+-]) *(-?\d*\.?\d+)/;
    match = remainingExpression.match(additionSubtractionRegex);
    while (match) {
      const left = match[1];
      const operator = match[2];
      const right = match[3];
      const result = operator === '+' ? parseFloat(left) + parseFloat(right) : parseFloat(left) - parseFloat(right);
      remainingExpression = remainingExpression.replace(match[0], result.toString());
      match = remainingExpression.match(additionSubtractionRegex);
    }

    const leftover = remainingExpression.match(/(-?\d*\.?\d+)/)?.[1] ?? '';
    return parseFloat(leftover);
  };

  const cleaned = cleanArithmeticExpression(data ?? '');
  if (!cleaned) return [];
  const value = parseSimpleArithmeticExpression(cleaned);
  if (!Number.isFinite(value)) return [];
  const candidate = String(value);
  return candidate.length === expectedLength ? [candidate] : [];
}

function inferPr0verFl0Candidates(): string[] {
  return [];
}

function getCandidatePasswords(modelId: string, details: ReturnType<NS['dnet']['getServerAuthDetails']>): string[] {
  if (modelId === 'ZeroLogon') return [''];
  if (modelId === 'DeskMemo_3.1' && details.passwordFormat === 'numeric') {
    const pin = inferDeskMemoPin(details.passwordHint, details.passwordLength);
    return pin ? [pin] : [];
  }
  if (modelId === 'CloudBlare(tm)' && details.passwordFormat === 'numeric') {
    const digits = (details.data ?? '').replace(/\D/g, '');
    if (digits.length !== details.passwordLength) return [];
    return [digits];
  }
  if (modelId === 'FreshInstall_1.0') {
    return inferFreshInstallCandidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'TopPass') {
    return inferTopPassCandidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'EuroZone Free') {
    return inferEuroZoneFreeCandidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'Laika4') {
    return inferLaika4Candidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'OctantVoxel') {
    return inferOctantVoxelCandidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'OpenWebAccessPoint') {
    return inferOpenWebAccessPointCandidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'AccountsManager_4.2') {
    return [];
  }
  if (modelId === 'DeepGreen') {
    return [];
  }
  if (modelId === 'BellaCuore') {
    return inferBellaCuoreCandidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'PrimeTime 2') {
    return inferPrimeTime2Candidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === '110100100') {
    return infer110100100Candidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'MathML') {
    return inferMathMLCandidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'Pr0verFl0') {
    return inferPr0verFl0Candidates();
  }
  if (modelId === 'NIL') {
    return [];
  }
  if (modelId === 'RateMyPix.Auth') {
    return [];
  }
  if (modelId === 'Factori-Os') {
    return [];
  }
  if (modelId === 'BigMo%od') {
    return [];
  }
  if (modelId === 'KingOfTheHill') {
    return [];
  }
  return [];
}

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ['interval', 4000],
    ['noTail', true],
  ]) as { interval: number; noTail: boolean };

  if (!flags.noTail) ns.ui.openTail();
  ns.disableLog('sleep');
  ns.disableLog('dnet.probe');
  ns.disableLog('getServerMaxRam');
  ns.disableLog('getServerUsedRam');

  const script = ns.getScriptName();
  const workerRam = ns.getScriptRam(script, ns.getHostname());

  while (true) {
    openLocalCaches(ns);
    processCacheOpenRequests(ns);
    syncVaultFromHome(ns);

    const vault = loadVault(ns);
    const neighbors = ns.dnet.probe();

    for (const host of neighbors) {
      const details = ns.dnet.getServerAuthDetails(host);
      if (!details.isOnline || !details.isConnectedToCurrentServer) continue;

      if (!details.hasSession) {
        const saved = vault.passwords[host];
        if (saved?.password != null) {
          const reconnect = ns.dnet.connectToSession(host, saved.password);
          if (reconnect.success) {
            saved.lastUsedAt = Date.now();
          } else {
            emitPasswordStale(ns, host, saved.password);
            delete vault.passwords[host];
          }
        }
      }

      // Heartbleed log scraping happens before the brute-force chain so the worker can short-circuit if
      // the target's logs leak a passcode (or a neighbor's) we can use directly.
      const preExtractDetails = ns.dnet.getServerAuthDetails(host);
      if (!preExtractDetails.hasSession) {
        const heartbleedLogs = await maybeSampleHeartbleed(ns, host, preExtractDetails);
        if (heartbleedLogs && heartbleedLogs.length > 0) {
          const findings = parseHeartbleedLogs(heartbleedLogs);
          if (findings.currentHostPassword != null || findings.neighborPasswords.size > 0) {
            await applyHeartbleedFindings(ns, vault, host, preExtractDetails.modelId, findings);
          }
        }
      }

      const refreshed = ns.dnet.getServerAuthDetails(host);
      if (!refreshed.hasSession) {
        if (refreshed.modelId === 'KingOfTheHill') {
          const cracked = await tryKingOfTheHill(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        if (refreshed.modelId === 'BigMo%od') {
          const cracked = await tryBigMoOd(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        if (refreshed.modelId === 'Factori-Os') {
          const cracked = await tryFactoriOs(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        if (refreshed.modelId === 'RateMyPix.Auth') {
          const cracked = await tryRateMyPixAuth(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        if (refreshed.modelId === 'NIL') {
          const cracked = await tryNIL(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        if (refreshed.modelId === 'AccountsManager_4.2') {
          const cracked = await tryAccountsManager42(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        if (refreshed.modelId === 'BellaCuore') {
          const cracked = await tryBellaCuoreRange(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
            continue;
          }
        }

        if (refreshed.modelId === '2G_cellular') {
          const cracked = await try2GCellular(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        if (refreshed.modelId === 'DeepGreen') {
          const cracked = await tryDeepGreen(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        if (refreshed.modelId === 'Pr0verFl0') {
          const cracked = await tryPr0verFl0(ns, host, refreshed);
          if (cracked != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, cracked);
          }
          continue;
        }

        const candidates = getCandidatePasswords(refreshed.modelId, refreshed);
        for (const candidate of candidates) {
          const short = await tryShortCircuitFromVault(ns, host, refreshed.modelId);
          if (short != null) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, short);
            break;
          }
          const auth = await ns.dnet.authenticate(host, candidate);
          if (auth.success) {
            rememberDiscoveredPassword(ns, vault, host, refreshed.modelId, candidate);
            break;
          }
        }
      }

      const deployDetails = ns.dnet.getServerAuthDetails(host);
      if (!deployDetails.hasSession || !deployDetails.isConnectedToCurrentServer || !deployDetails.isOnline) continue;

      const blockedRam = ns.dnet.getBlockedRam(host);
      if (blockedRam > 0) {
        await ns.dnet.memoryReallocation(host);
        // Prioritize unblocking owner RAM before any other host actions.
        continue;
      }

      const freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
      if (freeRam < workerRam) continue;

      const workerArgs = ['--interval', Math.max(500, Math.floor(flags.interval)), '--noTail'] as const;
      if (ns.isRunning(script, host, ...workerArgs)) continue;

      ns.scp(script, host, ns.getHostname());
      ns.exec(
        script,
        host,
        {
          threads: 1,
          preventDuplicates: true,
        },
        ...workerArgs,
      );
    }

    saveVault(ns, vault);
    await ns.sleep(Math.max(300, flags.interval));
  }
}

export function autocomplete(): string[] {
  return ['--interval', '--noTail'];
}

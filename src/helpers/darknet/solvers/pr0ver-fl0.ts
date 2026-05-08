import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const PROGRESS_FILE = '/helpers/darknet/pr0ver-fl0-progress.json';
const ATTEMPTS_PER_PASS = 250;
const ALPHANUMERIC_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

type ProgressFile = {
  nextByHost: Record<string, string>;
};

function loadProgress(ns: NS): ProgressFile {
  const raw = ns.read(PROGRESS_FILE).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as ProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveProgress(ns: NS, progress: ProgressFile): void {
  ns.write(PROGRESS_FILE, JSON.stringify(progress), 'w');
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

function powBigInt(base: bigint, exp: number): bigint {
  let out = 1n;
  for (let i = 0; i < exp; i++) out *= base;
  return out;
}

export async function solvePr0verFl0(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerAuthDetails(hostname);
  if (details.passwordFormat !== 'alphanumeric' || details.passwordLength <= 0) {
    return {
      hostname,
      modelId: 'Pr0verFl0',
      attempted: false,
      success: false,
      message: `Unexpected format/length: ${details.passwordFormat}/${details.passwordLength}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const progress = loadProgress(ns);
  const hostCursor = progress.nextByHost[hostname];
  const base = BigInt(ALPHANUMERIC_CHARSET.length);
  const total = powBigInt(base, details.passwordLength);
  let start = 0n;
  if (hostCursor != null) {
    try {
      start = BigInt(hostCursor);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;

  const maxAttempts = BigInt(ATTEMPTS_PER_PASS);
  const stop = start + maxAttempts > total ? total : start + maxAttempts;
  for (let idx = start; idx < stop; idx++) {
    const candidate = toBaseNFixed(idx, details.passwordLength, ALPHANUMERIC_CHARSET);
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      delete progress.nextByHost[hostname];
      saveProgress(ns, progress);
      return {
        hostname,
        modelId: 'Pr0verFl0',
        attempted: true,
        success: true,
        password: candidate,
        message: result.message,
        shouldCaptureHeartbleed: false,
      };
    }
  }

  progress.nextByHost[hostname] = stop >= total ? '0' : stop.toString();
  saveProgress(ns, progress);
  return {
    hostname,
    modelId: 'Pr0verFl0',
    attempted: true,
    success: false,
    message: `Bruteforced alphanumeric range [${start.toString()}, ${stop.toString()}) of ${total.toString()}`,
    shouldCaptureHeartbleed: true,
  };
}

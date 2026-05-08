import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const PROGRESS_FILE = '/helpers/darknet/nil-progress.json';
const ATTEMPTS_PER_PASS = 250;
const NUMERIC_CHARSET = '0123456789';
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

export async function solveNIL(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerAuthDetails(hostname);
  if (details.passwordLength <= 0) {
    return {
      hostname,
      modelId: 'NIL',
      attempted: false,
      success: false,
      message: `Invalid password length ${details.passwordLength}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) {
    return {
      hostname,
      modelId: 'NIL',
      attempted: false,
      success: false,
      message: `Unexpected format ${details.passwordFormat}; expected numeric/alphanumeric`,
      shouldCaptureHeartbleed: true,
    };
  }

  const progress = loadProgress(ns);
  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  const raw = progress.nextByHost[hostname];
  if (raw != null) {
    try {
      start = BigInt(raw);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop = start + BigInt(ATTEMPTS_PER_PASS) > total ? total : start + BigInt(ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const candidate = toBaseNFixed(i, details.passwordLength, charset);
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      delete progress.nextByHost[hostname];
      saveProgress(ns, progress);
      return {
        hostname,
        modelId: 'NIL',
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
    modelId: 'NIL',
    attempted: true,
    success: false,
    message: `Bruteforced ${details.passwordFormat} range [${start.toString()}, ${stop.toString()}) of ${total.toString()}`,
    shouldCaptureHeartbleed: true,
  };
}

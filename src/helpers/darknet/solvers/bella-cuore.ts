import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const RANGE_PROGRESS_FILE = '/helpers/darknet/bella-cuore-progress.json';
const RANGE_ATTEMPTS_PER_PASS = 250;

const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

type RangeProgressFile = {
  nextByHost: Record<string, number>;
};

function loadRangeProgress(ns: NS): RangeProgressFile {
  const raw = ns.read(RANGE_PROGRESS_FILE).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as RangeProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveRangeProgress(ns: NS, progress: RangeProgressFile): void {
  ns.write(RANGE_PROGRESS_FILE, JSON.stringify(progress), 'w');
}

function romanToInteger(input: string): number | null {
  const roman = input.trim().toUpperCase();
  if (!roman || !/^[IVXLCDM]+$/.test(roman)) return null;

  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = ROMAN_VALUES[roman[i]];
    const next = i + 1 < roman.length ? ROMAN_VALUES[roman[i + 1]] : 0;
    if (!current) return null;
    total += current < next ? -current : current;
  }
  return total;
}

function getRomanToken(details: ReturnType<NS['dnet']['getServerAuthDetails']>): string | null {
  const fromData = (details.data ?? '').trim();
  if (fromData.length > 0) return fromData;

  const fromHint =
    details.passwordHint.match(/'([IVXLCDM]+)'/i)?.[1] ?? details.passwordHint.match(/\b([IVXLCDM]+)\b/i)?.[1];
  return fromHint ? fromHint.trim() : null;
}

function getRomanRange(details: ReturnType<NS['dnet']['getServerAuthDetails']>): [number, number] | null {
  const raw = (details.data ?? '').trim();
  const parts = raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (parts.length !== 2) return null;
  const min = romanToInteger(parts[0]);
  const max = romanToInteger(parts[1]);
  if (min == null || max == null) return null;
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null;
  if (min > max) return null;
  return [min, max];
}

export async function solveBellaCuore(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerAuthDetails(hostname);
  if (details.passwordFormat !== 'numeric') {
    return {
      hostname,
      modelId: 'BellaCuore',
      attempted: false,
      success: false,
      message: `Unexpected password format: ${details.passwordFormat}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const range = getRomanRange(details);
  if (range) {
    const [minValue, maxValue] = range;
    const progress = loadRangeProgress(ns);
    let start = progress.nextByHost[hostname] ?? minValue;
    if (start < minValue || start > maxValue) start = minValue;
    const stop = Math.min(maxValue + 1, start + RANGE_ATTEMPTS_PER_PASS);

    for (let n = start; n < stop; n++) {
      const password = String(n);
      if (password.length !== details.passwordLength) continue;
      const result = await ns.dnet.authenticate(hostname, password);
      if (result.success) {
        delete progress.nextByHost[hostname];
        saveRangeProgress(ns, progress);
        return {
          hostname,
          modelId: 'BellaCuore',
          attempted: true,
          success: true,
          password,
          message: result.message,
          shouldCaptureHeartbleed: false,
        };
      }
    }

    progress.nextByHost[hostname] = stop > maxValue ? minValue : stop;
    saveRangeProgress(ns, progress);
    return {
      hostname,
      modelId: 'BellaCuore',
      attempted: true,
      success: false,
      message: `Bruteforced roman range [${start}, ${stop}) from [${minValue}, ${maxValue}]`,
      shouldCaptureHeartbleed: true,
    };
  }

  const token = getRomanToken(details);
  if (!token) {
    return {
      hostname,
      modelId: 'BellaCuore',
      attempted: false,
      success: false,
      message: 'No roman numeral token found in data/hint',
      shouldCaptureHeartbleed: true,
    };
  }

  const value = romanToInteger(token);
  if (value == null) {
    return {
      hostname,
      modelId: 'BellaCuore',
      attempted: false,
      success: false,
      message: `Could not parse roman numeral: ${token}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const password = String(value);
  if (password.length !== details.passwordLength) {
    return {
      hostname,
      modelId: 'BellaCuore',
      attempted: false,
      success: false,
      message: `Parsed value ${password} does not match expected length ${details.passwordLength}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const result = await ns.dnet.authenticate(hostname, password);
  return {
    hostname,
    modelId: 'BellaCuore',
    attempted: true,
    success: result.success,
    password: result.success ? password : undefined,
    message: result.message,
    shouldCaptureHeartbleed: !result.success,
  };
}

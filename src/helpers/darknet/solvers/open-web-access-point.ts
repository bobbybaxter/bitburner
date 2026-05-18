import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const PROGRESS_FILE = '/helpers/darknet/open-web-access-point-progress.json';
const BRUTEFORCE_GUESSES_PER_PASS = 10;

const COMMON_8_DIGIT_PINS = [
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

type ProgressFile = {
  nextByHost: Record<string, number>;
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

function getDictionaryCandidates(length: number): string[] {
  return COMMON_8_DIGIT_PINS.filter((pin) => pin.length === length);
}

async function tryCandidates(
  ns: NS,
  hostname: string,
  modelId: string,
  candidates: string[],
): Promise<DarknetSolverResult | null> {
  for (const candidate of candidates) {
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      return {
        hostname,
        modelId,
        guessed: true,
        success: true,
        password: candidate,
        message: result.message,
        shouldCaptureHeartbleed: false,
      };
    }
  }
  return null;
}

export async function solveOpenWebAccessPoint(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  if (details.passwordFormat !== 'numeric') {
    return {
      hostname,
      modelId: 'OpenWebAccessPoint',
      guessed: false,
      success: false,
      message: `Unexpected format ${details.passwordFormat}; expected numeric`,
      shouldCaptureHeartbleed: true,
    };
  }

  const dictionaryCandidates = getDictionaryCandidates(details.passwordLength);
  const dictionaryResult = await tryCandidates(ns, hostname, 'OpenWebAccessPoint', dictionaryCandidates);
  if (dictionaryResult) {
    const progress = loadProgress(ns);
    delete progress.nextByHost[hostname];
    saveProgress(ns, progress);
    return dictionaryResult;
  }

  // Incremental brute-force with checkpointing so repeated solver passes make forward progress.
  const progress = loadProgress(ns);
  const maxValue = 10 ** details.passwordLength;
  let start = progress.nextByHost[hostname] ?? 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + BRUTEFORCE_GUESSES_PER_PASS);

  for (let n = start; n < stop; n++) {
    const candidate = String(n).padStart(details.passwordLength, '0');
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      delete progress.nextByHost[hostname];
      saveProgress(ns, progress);
      return {
        hostname,
        modelId: 'OpenWebAccessPoint',
        guessed: true,
        success: true,
        password: candidate,
        message: result.message,
        shouldCaptureHeartbleed: false,
      };
    }
  }

  progress.nextByHost[hostname] = stop >= maxValue ? 0 : stop;
  saveProgress(ns, progress);
  return {
    hostname,
    modelId: 'OpenWebAccessPoint',
    guessed: true,
    success: false,
    message: `Dictionary miss; brute-forced range [${start}, ${stop}) of ${maxValue}`,
    shouldCaptureHeartbleed: true,
  };
}

import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const PROGRESS_FILE = '/helpers/darknet/factori-os-progress.json';
const ATTEMPTS_PER_PASS = 250;

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

export async function solveFactoriOs(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerAuthDetails(hostname);
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) {
    return {
      hostname,
      modelId: 'Factori-Os',
      attempted: false,
      success: false,
      message: `Unexpected schema ${details.passwordLength}/${details.passwordFormat}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const progress = loadProgress(ns);
  const maxValue = 10 ** details.passwordLength;
  let start = progress.nextByHost[hostname] ?? 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const candidate = String(n);
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      delete progress.nextByHost[hostname];
      saveProgress(ns, progress);
      return {
        hostname,
        modelId: 'Factori-Os',
        attempted: true,
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
    modelId: 'Factori-Os',
    attempted: true,
    success: false,
    message: `Bruteforced numeric range [${start}, ${stop}) of ${maxValue}`,
    shouldCaptureHeartbleed: true,
  };
}

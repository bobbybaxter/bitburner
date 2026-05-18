import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const COMMON_DOG_NAMES = ['fido', 'max', 'rover', 'spot'];

function filterBySchema(candidates: readonly string[], length: number, format: string): string[] {
  const matchesFormat = (value: string): boolean => {
    if (format === 'numeric') return /^\d+$/.test(value);
    if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
    if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
    return true;
  };
  return candidates.filter((v) => v.length === length && matchesFormat(v));
}

export async function solveLaika4(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  const candidates = filterBySchema(COMMON_DOG_NAMES, details.passwordLength, details.passwordFormat);
  if (candidates.length === 0) {
    return {
      hostname,
      modelId: 'Laika4',
      guessed: false,
      success: false,
      message: `No dog-name candidates matched length/format ${details.passwordLength}/${details.passwordFormat}`,
      shouldCaptureHeartbleed: true,
    };
  }

  for (const candidate of candidates) {
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      return {
        hostname,
        modelId: 'Laika4',
        guessed: true,
        success: true,
        password: candidate,
        message: result.message,
        shouldCaptureHeartbleed: false,
      };
    }
  }

  return {
    hostname,
    modelId: 'Laika4',
    guessed: true,
    success: false,
    message: `Tried ${candidates.length} dog-name candidates with no match`,
    shouldCaptureHeartbleed: true,
  };
}

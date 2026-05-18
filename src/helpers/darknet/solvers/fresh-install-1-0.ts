import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const DEFAULT_SETTINGS_DICTIONARY = ['admin', 'password', '0000', '12345'];

function matchesFormat(value: string, format: string): boolean {
  switch (format) {
    case 'numeric':
      return /^\d+$/.test(value);
    case 'alphabetic':
      return /^[A-Za-z]+$/.test(value);
    case 'alphanumeric':
      return /^[A-Za-z0-9]+$/.test(value);
    default:
      return true;
  }
}

function getDefaultCandidates(length: number, format: string): string[] {
  return DEFAULT_SETTINGS_DICTIONARY.filter((c) => c.length === length && matchesFormat(c, format));
}

export async function solveFreshInstall10(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  const expectedLength = details.passwordLength;
  const candidates = getDefaultCandidates(expectedLength, details.passwordFormat);

  if (candidates.length === 0) {
    return {
      hostname,
      modelId: 'FreshInstall_1.0',
      guessed: false,
      success: false,
      message: `No default-password candidates matched length ${expectedLength}`,
      shouldCaptureHeartbleed: true,
    };
  }

  for (const candidate of candidates) {
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      return {
        hostname,
        modelId: 'FreshInstall_1.0',
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
    modelId: 'FreshInstall_1.0',
    guessed: true,
    success: false,
    message: `Tried ${candidates.length} default-password candidates with no match`,
    shouldCaptureHeartbleed: true,
  };
}

import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const EU_COUNTRIES = [
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
] as const;

function matchesFormat(value: string, format: string): boolean {
  if (format === 'numeric') return /^\d+$/.test(value);
  if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
  if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
  return true;
}

function getCandidates(length: number, format: string): string[] {
  return EU_COUNTRIES.filter((country) => country.length === length && matchesFormat(country, format));
}

export async function solveEuroZoneFree(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  const candidates = getCandidates(details.passwordLength, details.passwordFormat);
  if (candidates.length === 0) {
    return {
      hostname,
      modelId: 'EuroZone Free',
      guessed: false,
      success: false,
      message: `No EU-country candidates for schema ${details.passwordLength}/${details.passwordFormat}`,
      shouldCaptureHeartbleed: true,
    };
  }

  for (const candidate of candidates) {
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      return {
        hostname,
        modelId: 'EuroZone Free',
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
    modelId: 'EuroZone Free',
    guessed: true,
    success: false,
    message: `Tried ${candidates.length} EU-country candidates with no match`,
    shouldCaptureHeartbleed: true,
  };
}

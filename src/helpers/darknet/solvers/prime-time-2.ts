import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

function largestPrimeFactor(value: bigint): bigint {
  let n = value;
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

  return n > 1n ? n : largest;
}

function inferCandidate(details: ReturnType<NS['dnet']['getServerDetails']>): string | null {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const targetText = (details.data ?? '').trim();
  if (!/^\d+$/.test(targetText)) return null;
  const target = BigInt(targetText);
  if (target < 2n) return null;
  const candidate = largestPrimeFactor(target).toString();
  return candidate.length === details.passwordLength ? candidate : null;
}

export async function solvePrimeTime2(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  const password = inferCandidate(details);
  if (!password) {
    return {
      hostname,
      modelId: 'PrimeTime 2',
      guessed: false,
      success: false,
      message: 'Could not infer largest prime factor from auth data',
      shouldCaptureHeartbleed: true,
    };
  }

  const result = await ns.dnet.authenticate(hostname, password);
  return {
    hostname,
    modelId: 'PrimeTime 2',
    guessed: true,
    success: result.success,
    password: result.success ? password : undefined,
    message: result.message,
    shouldCaptureHeartbleed: !result.success,
  };
}

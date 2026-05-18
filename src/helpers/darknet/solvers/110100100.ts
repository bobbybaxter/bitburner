import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

function decodeBinaryPayload(data: string): string | null {
  const tokens = data
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  for (const token of tokens) {
    if (!/^[01]{8}$/.test(token)) return null;
  }
  return tokens.map((token) => String.fromCharCode(parseInt(token, 2))).join('');
}

function matchesFormat(value: string, format: string): boolean {
  if (format === 'numeric') return /^\d+$/.test(value);
  if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
  if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
  return true;
}

export async function solve110100100(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  const decoded = decodeBinaryPayload(details.data ?? '');
  if (!decoded) {
    return {
      hostname,
      modelId: '110100100',
      guessed: false,
      success: false,
      message: 'Could not decode binary payload from auth data',
      shouldCaptureHeartbleed: true,
    };
  }

  if (decoded.length !== details.passwordLength || !matchesFormat(decoded, details.passwordFormat)) {
    return {
      hostname,
      modelId: '110100100',
      guessed: false,
      success: false,
      message: `Decoded payload does not match schema ${details.passwordLength}/${details.passwordFormat}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const result = await ns.dnet.authenticate(hostname, decoded);
  return {
    hostname,
    modelId: '110100100',
    guessed: true,
    success: result.success,
    password: result.success ? decoded : undefined,
    message: result.message,
    shouldCaptureHeartbleed: !result.success,
  };
}

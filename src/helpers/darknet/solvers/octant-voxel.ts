import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const BASE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function parseApproxDecimal(encoded: string, base: number): number | null {
  const text = encoded.trim().toUpperCase();
  if (!/^[0-9A-Z]+(\.[0-9A-Z]+)?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  const maxDigitExclusive = Math.ceil(base);
  let total = 0;

  for (let i = 0; i < whole.length; i++) {
    const digit = BASE_CHARS.indexOf(whole[i]);
    if (digit < 0 || digit >= maxDigitExclusive) return null;
    const exp = whole.length - i - 1;
    total += digit * base ** exp;
  }

  for (let i = 0; i < frac.length; i++) {
    const digit = BASE_CHARS.indexOf(frac[i]);
    if (digit < 0 || digit >= maxDigitExclusive) return null;
    total += digit * base ** (-(i + 1));
  }

  return total;
}

function encodeNumberInBaseN(decimalNumber: number, base: number): string {
  let digits = Math.floor(Math.log(decimalNumber) / Math.log(base));
  let remaining = decimalNumber;
  let result = '';

  while (remaining >= 0.0001 || digits >= 0) {
    if (digits === -1) result += '.';
    const place = Math.floor(remaining / base ** digits);
    result += BASE_CHARS[place];
    remaining -= place * base ** digits;
    digits -= 1;
  }
  return result;
}

function inferOctantVoxelPassword(data: string, length: number): string | null {
  const [baseText, valueText] = data.split(',').map((s) => s.trim());
  const base = Number(baseText);
  if (!Number.isFinite(base) || base <= 1 || base > 36) return null;
  const encoded = (valueText ?? '').trim().toUpperCase();
  if (!encoded) return null;

  const approx = parseApproxDecimal(encoded, base);
  if (approx == null) return null;

  const center = Math.max(1, Math.round(approx));
  const start = Math.max(1, center - 5000);
  const end = center + 5000;
  for (let n = start; n <= end; n++) {
    if (String(n).length !== length) continue;
    if (encodeNumberInBaseN(n, base) === encoded) return String(n);
  }
  return null;
}

export async function solveOctantVoxel(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerAuthDetails(hostname);
  if (details.passwordFormat !== 'numeric') {
    return {
      hostname,
      modelId: 'OctantVoxel',
      attempted: false,
      success: false,
      message: `Unexpected password format: ${details.passwordFormat}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const password = inferOctantVoxelPassword(details.data ?? '', details.passwordLength);
  if (!password) {
    return {
      hostname,
      modelId: 'OctantVoxel',
      attempted: false,
      success: false,
      message: 'Could not decode base-N payload in data field',
      shouldCaptureHeartbleed: true,
    };
  }

  const result = await ns.dnet.authenticate(hostname, password);
  return {
    hostname,
    modelId: 'OctantVoxel',
    attempted: true,
    success: result.success,
    password: result.success ? password : undefined,
    message: result.message,
    shouldCaptureHeartbleed: !result.success,
  };
}


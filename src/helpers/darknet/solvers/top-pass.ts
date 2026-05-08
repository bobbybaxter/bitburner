import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const COMMON_PASSWORD_DICTIONARY = [
  '123456',
  'password',
  '12345678',
  'qwerty',
  '123456789',
  '12345',
  '1234',
  '111111',
  '1234567',
  'dragon',
  '123123',
  'baseball',
  'abc123',
  'football',
  'monkey',
  'letmein',
  '696969',
  'shadow',
  'master',
  '666666',
  'qwertyuiop',
  '123321',
  'mustang',
  '1234567890',
  'michael',
  '654321',
  'superman',
  '1qaz2wsx',
  '7777777',
  '121212',
  '0',
  'qazwsx',
  '123qwe',
  'trustno1',
  'jordan',
  'jennifer',
  'zxcvbnm',
  'asdfgh',
  'hunter',
  'buster',
  'soccer',
  'harley',
  'batman',
  'andrew',
  'tigger',
  'sunshine',
  'iloveyou',
  '2000',
  'charlie',
  'robert',
  'thomas',
  'hockey',
  'ranger',
  'daniel',
  'starwars',
  '112233',
  'george',
  'computer',
  'michelle',
  'jessica',
  'pepper',
  '1111',
  'zxcvbn',
  '555555',
  '11111111',
  '131313',
  'freedom',
  '777777',
  'pass',
  'maggie',
  '159753',
  'aaaaaa',
  'ginger',
  'princess',
  'joshua',
  'cheese',
  'amanda',
  'summer',
  'love',
  'ashley',
  '6969',
  'nicole',
  'chelsea',
  'biteme',
  'matthew',
  'access',
  'yankees',
  '987654321',
  'dallas',
  'austin',
  'thunder',
  'taylor',
  'matrix',
] as const;

function matchesFormat(value: string, format: string): boolean {
  if (format === 'numeric') return /^\d+$/.test(value);
  if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
  if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
  return true;
}

function getCandidates(length: number, format: string): string[] {
  return COMMON_PASSWORD_DICTIONARY.filter((p) => p.length === length && matchesFormat(p, format));
}

export async function solveTopPass(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerAuthDetails(hostname);
  const candidates = getCandidates(details.passwordLength, details.passwordFormat);
  if (candidates.length === 0) {
    return {
      hostname,
      modelId: 'TopPass',
      attempted: false,
      success: false,
      message: `No TopPass candidates for schema ${details.passwordLength}/${details.passwordFormat}`,
      shouldCaptureHeartbleed: true,
    };
  }

  for (const candidate of candidates) {
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      return {
        hostname,
        modelId: 'TopPass',
        attempted: true,
        success: true,
        password: candidate,
        message: result.message,
        shouldCaptureHeartbleed: false,
      };
    }
  }

  return {
    hostname,
    modelId: 'TopPass',
    attempted: true,
    success: false,
    message: `Tried ${candidates.length} common-password candidates with no match`,
    shouldCaptureHeartbleed: true,
  };
}


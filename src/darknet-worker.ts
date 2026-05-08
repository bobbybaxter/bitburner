import type { NS } from '@ns';

const PASSWORDS_PATH = '/helpers/darknet/darknet-passwords.json';
const RATE_MY_PIX_PROGRESS_PATH = '/helpers/darknet/rate-my-pix-auth-progress.json';
const FACTORI_OS_PROGRESS_PATH = '/helpers/darknet/factori-os-progress.json';
const BIG_MO_OD_PROGRESS_PATH = '/helpers/darknet/big-mo-od-progress.json';
const KING_OF_THE_HILL_PROGRESS_PATH = '/helpers/darknet/king-of-the-hill-progress.json';
const NIL_PROGRESS_PATH = '/helpers/darknet/nil-progress.json';
const ACCOUNTS_PROGRESS_PATH = '/helpers/darknet/accounts-manager-4-2-progress.json';
const TWO_G_PROGRESS_PATH = '/helpers/darknet/2g-cellular-progress.json';
const BELLA_RANGE_PROGRESS_PATH = '/helpers/darknet/bella-cuore-progress.json';
const DEEP_GREEN_PROGRESS_PATH = '/helpers/darknet/deep-green-progress.json';
const PR0VER_PROGRESS_PATH = '/helpers/darknet/pr0ver-fl0-progress.json';
const RATE_MY_PIX_ATTEMPTS_PER_PASS = 100;
const FACTORI_OS_ATTEMPTS_PER_PASS = 100;
const BIG_MO_OD_ATTEMPTS_PER_PASS = 100;
const KING_OF_THE_HILL_ATTEMPTS_PER_PASS = 100;
const NIL_ATTEMPTS_PER_PASS = 100;
const TWO_G_ATTEMPTS_PER_PASS = 100;
const ACCOUNTS_ATTEMPTS_PER_PASS = 100;
const BELLA_RANGE_ATTEMPTS_PER_PASS = 100;
const DEEP_GREEN_ATTEMPTS_PER_PASS = 100;
const PR0VER_ATTEMPTS_PER_PASS = 100;
const NUMERIC_CHARSET = '0123456789';
const ALPHANUMERIC_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type PasswordVaultFile = {
  version: number;
  updatedAt: number;
  passwords: Record<string, { password: string; modelId?: string; discoveredAt: number; lastUsedAt?: number }>;
};

type Pr0verProgressFile = {
  nextByHost: Record<string, string>;
};

type DeepGreenProgressFile = {
  nextByHost: Record<string, string>;
};

type TwoGProgressFile = {
  nextByHost: Record<string, string>;
};

type AccountsProgressFile = {
  nextByHost: Record<string, number>;
};

type NilProgressFile = {
  nextByHost: Record<string, string>;
};

type RateMyPixProgressFile = {
  nextByHost: Record<string, string>;
};

type FactoriOsProgressFile = {
  nextByHost: Record<string, number>;
};

type BigMoOdProgressFile = {
  nextByHost: Record<string, number>;
};

type KingOfTheHillProgressFile = {
  nextByHost: Record<string, number>;
};

type BellaRangeProgressFile = {
  nextByHost: Record<string, number>;
};

function loadVault(ns: NS): PasswordVaultFile {
  const raw = ns.read(PASSWORDS_PATH).trim();
  if (!raw) return { version: 1, updatedAt: Date.now(), passwords: {} };
  try {
    return JSON.parse(raw) as PasswordVaultFile;
  } catch {
    return { version: 1, updatedAt: Date.now(), passwords: {} };
  }
}

function saveVault(ns: NS, vault: PasswordVaultFile): void {
  vault.updatedAt = Date.now();
  ns.write(PASSWORDS_PATH, JSON.stringify(vault), 'w');
}

function loadRateMyPixProgress(ns: NS): RateMyPixProgressFile {
  const raw = ns.read(RATE_MY_PIX_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as RateMyPixProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveRateMyPixProgress(ns: NS, progress: RateMyPixProgressFile): void {
  ns.write(RATE_MY_PIX_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadFactoriOsProgress(ns: NS): FactoriOsProgressFile {
  const raw = ns.read(FACTORI_OS_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as FactoriOsProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveFactoriOsProgress(ns: NS, progress: FactoriOsProgressFile): void {
  ns.write(FACTORI_OS_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadBigMoOdProgress(ns: NS): BigMoOdProgressFile {
  const raw = ns.read(BIG_MO_OD_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as BigMoOdProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveBigMoOdProgress(ns: NS, progress: BigMoOdProgressFile): void {
  ns.write(BIG_MO_OD_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadKingOfTheHillProgress(ns: NS): KingOfTheHillProgressFile {
  const raw = ns.read(KING_OF_THE_HILL_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as KingOfTheHillProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveKingOfTheHillProgress(ns: NS, progress: KingOfTheHillProgressFile): void {
  ns.write(KING_OF_THE_HILL_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadNilProgress(ns: NS): NilProgressFile {
  const raw = ns.read(NIL_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as NilProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveNilProgress(ns: NS, progress: NilProgressFile): void {
  ns.write(NIL_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadAccountsProgress(ns: NS): AccountsProgressFile {
  const raw = ns.read(ACCOUNTS_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as AccountsProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveAccountsProgress(ns: NS, progress: AccountsProgressFile): void {
  ns.write(ACCOUNTS_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadTwoGProgress(ns: NS): TwoGProgressFile {
  const raw = ns.read(TWO_G_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as TwoGProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveTwoGProgress(ns: NS, progress: TwoGProgressFile): void {
  ns.write(TWO_G_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadBellaRangeProgress(ns: NS): BellaRangeProgressFile {
  const raw = ns.read(BELLA_RANGE_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as BellaRangeProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveBellaRangeProgress(ns: NS, progress: BellaRangeProgressFile): void {
  ns.write(BELLA_RANGE_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadDeepGreenProgress(ns: NS): DeepGreenProgressFile {
  const raw = ns.read(DEEP_GREEN_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as DeepGreenProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function saveDeepGreenProgress(ns: NS, progress: DeepGreenProgressFile): void {
  ns.write(DEEP_GREEN_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function loadPr0verProgress(ns: NS): Pr0verProgressFile {
  const raw = ns.read(PR0VER_PROGRESS_PATH).trim();
  if (!raw) return { nextByHost: {} };
  try {
    return JSON.parse(raw) as Pr0verProgressFile;
  } catch {
    return { nextByHost: {} };
  }
}

function savePr0verProgress(ns: NS, progress: Pr0verProgressFile): void {
  ns.write(PR0VER_PROGRESS_PATH, JSON.stringify(progress), 'w');
}

function powBigInt(base: bigint, exp: number): bigint {
  let out = 1n;
  for (let i = 0; i < exp; i++) out *= base;
  return out;
}

function toBaseNFixed(index: bigint, length: number, charset: string): string {
  const base = BigInt(charset.length);
  let value = index;
  const out = new Array<string>(length);
  for (let i = length - 1; i >= 0; i--) {
    const digit = Number(value % base);
    out[i] = charset[digit];
    value /= base;
  }
  return out.join('');
}

async function tryPr0verFl0(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'alphanumeric' || details.passwordLength <= 0) return null;
  const progress = loadPr0verProgress(ns);
  const base = BigInt(ALPHANUMERIC_CHARSET.length);
  const total = powBigInt(base, details.passwordLength);
  let start = 0n;
  const raw = progress.nextByHost[host];
  if (raw != null) {
    try {
      start = BigInt(raw);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop = start + BigInt(PR0VER_ATTEMPTS_PER_PASS) > total ? total : start + BigInt(PR0VER_ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const candidate = toBaseNFixed(i, details.passwordLength, ALPHANUMERIC_CHARSET);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      savePr0verProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= total ? '0' : stop.toString();
  savePr0verProgress(ns, progress);
  return null;
}

async function tryDeepGreen(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordLength <= 0) return null;
  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) return null;

  const progress = loadDeepGreenProgress(ns);
  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  const raw = progress.nextByHost[host];
  if (raw != null) {
    try {
      start = BigInt(raw);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop =
    start + BigInt(DEEP_GREEN_ATTEMPTS_PER_PASS) > total ? total : start + BigInt(DEEP_GREEN_ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const candidate = toBaseNFixed(i, details.passwordLength, charset);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveDeepGreenProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= total ? '0' : stop.toString();
  saveDeepGreenProgress(ns, progress);
  return null;
}

async function try2GCellular(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordLength <= 0) return null;
  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) return null;

  const progress = loadTwoGProgress(ns);
  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  const raw = progress.nextByHost[host];
  if (raw != null) {
    try {
      start = BigInt(raw);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop = start + BigInt(TWO_G_ATTEMPTS_PER_PASS) > total ? total : start + BigInt(TWO_G_ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const candidate = toBaseNFixed(i, details.passwordLength, charset);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveTwoGProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= total ? '0' : stop.toString();
  saveTwoGProgress(ns, progress);
  return null;
}

async function tryBellaCuoreRange(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const tokens = (details.data ?? '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  if (tokens.length !== 2) return null;
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const parseRoman = (roman: string): number | null => {
    if (!/^[IVXLCDM]+$/.test(roman)) return null;
    let total = 0;
    for (let i = 0; i < roman.length; i++) {
      const cur = values[roman[i]];
      const next = i + 1 < roman.length ? values[roman[i + 1]] : 0;
      if (!cur) return null;
      total += cur < next ? -cur : cur;
    }
    return total;
  };

  const min = parseRoman(tokens[0]);
  const max = parseRoman(tokens[1]);
  if (min == null || max == null || min > max) return null;

  const progress = loadBellaRangeProgress(ns);
  let start = progress.nextByHost[host] ?? min;
  if (start < min || start > max) start = min;
  const stop = Math.min(max + 1, start + BELLA_RANGE_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const candidate = String(n);
    if (candidate.length !== details.passwordLength) continue;
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveBellaRangeProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop > max ? min : stop;
  saveBellaRangeProgress(ns, progress);
  return null;
}

async function tryAccountsManager42(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const progress = loadAccountsProgress(ns);
  const maxValue = 10 ** details.passwordLength;
  let start = progress.nextByHost[host] ?? 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + ACCOUNTS_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const candidate = String(n);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveAccountsProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= maxValue ? 0 : stop;
  saveAccountsProgress(ns, progress);
  return null;
}

async function tryNIL(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordLength <= 0) return null;
  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) return null;

  const progress = loadNilProgress(ns);
  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  const raw = progress.nextByHost[host];
  if (raw != null) {
    try {
      start = BigInt(raw);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop = start + BigInt(NIL_ATTEMPTS_PER_PASS) > total ? total : start + BigInt(NIL_ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const candidate = toBaseNFixed(i, details.passwordLength, charset);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveNilProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= total ? '0' : stop.toString();
  saveNilProgress(ns, progress);
  return null;
}

async function tryRateMyPixAuth(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordLength <= 0) return null;
  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) return null;

  const progress = loadRateMyPixProgress(ns);
  const total = powBigInt(BigInt(charset.length), details.passwordLength);
  let start = 0n;
  const raw = progress.nextByHost[host];
  if (raw != null) {
    try {
      start = BigInt(raw);
    } catch {
      start = 0n;
    }
  }
  if (start < 0n || start >= total) start = 0n;
  const stop =
    start + BigInt(RATE_MY_PIX_ATTEMPTS_PER_PASS) > total ? total : start + BigInt(RATE_MY_PIX_ATTEMPTS_PER_PASS);

  for (let i = start; i < stop; i++) {
    const candidate = toBaseNFixed(i, details.passwordLength, charset);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveRateMyPixProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= total ? '0' : stop.toString();
  saveRateMyPixProgress(ns, progress);
  return null;
}

async function tryFactoriOs(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const progress = loadFactoriOsProgress(ns);
  const maxValue = 10 ** details.passwordLength;
  let start = progress.nextByHost[host] ?? 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + FACTORI_OS_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const candidate = String(n);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveFactoriOsProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= maxValue ? 0 : stop;
  saveFactoriOsProgress(ns, progress);
  return null;
}

async function tryBigMoOd(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const progress = loadBigMoOdProgress(ns);
  const maxValue = 10 ** details.passwordLength;
  let start = progress.nextByHost[host] ?? 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + BIG_MO_OD_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const candidate = String(n);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveBigMoOdProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= maxValue ? 0 : stop;
  saveBigMoOdProgress(ns, progress);
  return null;
}

async function tryKingOfTheHill(
  ns: NS,
  host: string,
  details: ReturnType<NS['dnet']['getServerAuthDetails']>,
): Promise<string | null> {
  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) return null;
  const progress = loadKingOfTheHillProgress(ns);
  const maxValue = 10 ** details.passwordLength;
  let start = progress.nextByHost[host] ?? 0;
  if (start < 0 || start >= maxValue) start = 0;
  const stop = Math.min(maxValue, start + KING_OF_THE_HILL_ATTEMPTS_PER_PASS);

  for (let n = start; n < stop; n++) {
    const candidate = String(n);
    const auth = await ns.dnet.authenticate(host, candidate);
    if (auth.success) {
      delete progress.nextByHost[host];
      saveKingOfTheHillProgress(ns, progress);
      return candidate;
    }
  }

  progress.nextByHost[host] = stop >= maxValue ? 0 : stop;
  saveKingOfTheHillProgress(ns, progress);
  return null;
}

function inferDeskMemoPin(hint: string, expectedLength: number): string | null {
  const groups = hint.match(/\d+/g);
  if (!groups || groups.length === 0) return null;
  const exact = groups.find((g) => g.length === expectedLength);
  if (exact) return exact;
  const longest = [...groups].sort((a, b) => b.length - a.length)[0];
  return longest ? longest.slice(0, expectedLength) : null;
}

function inferFreshInstallCandidates(expectedLength: number, format: string): string[] {
  const pool = ['admin', 'password', '0000', '12345'];

  const matchesFormat = (value: string): boolean => {
    if (/\d/.test(value) && format === 'alphabetic') return false;
    if (/[A-Za-z]/.test(value) && format === 'numeric') return false;
    return true;
  };

  return pool.filter((p) => p.length === expectedLength && matchesFormat(p));
}

function inferTopPassCandidates(expectedLength: number, format: string): string[] {
  const pool = [
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
  ];

  const matchesFormat = (value: string): boolean => {
    if (format === 'numeric') return /^\d+$/.test(value);
    if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
    if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
    return true;
  };

  return pool.filter((p) => p.length === expectedLength && matchesFormat(p));
}

function inferEuroZoneFreeCandidates(expectedLength: number, format: string): string[] {
  const pool = [
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
  ];

  const matchesFormat = (value: string): boolean => {
    if (format === 'numeric') return /^\d+$/.test(value);
    if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
    if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
    return true;
  };

  return pool.filter((country) => country.length === expectedLength && matchesFormat(country));
}

function inferLaika4Candidates(expectedLength: number, format: string): string[] {
  const pool = ['fido', 'spot', 'rover', 'max'];
  const matchesFormat = (value: string): boolean => {
    if (/\d/.test(value) && format === 'alphabetic') return false;
    if (/[A-Za-z]/.test(value) && format === 'numeric') return false;
    return true;
  };
  return pool.filter((p) => p.length === expectedLength && matchesFormat(p));
}

function inferOctantVoxelCandidate(data: string, expectedLength: number, format: string): string[] {
  if (format !== 'numeric') return [];
  const [baseText, valueText] = data.split(',').map((s) => s.trim());
  const base = Number(baseText);
  if (!Number.isFinite(base) || base <= 1 || base > 36) return [];
  const encoded = (valueText ?? '').trim().toUpperCase();
  if (!/^[0-9A-Z]+(\.[0-9A-Z]+)?$/.test(encoded)) return [];

  const maxDigitExclusive = Math.ceil(base);
  const [whole, frac = ''] = encoded.split('.');
  let approx = 0;
  for (let i = 0; i < whole.length; i++) {
    const digit = BASE_CHARS.indexOf(whole[i]);
    if (digit < 0 || digit >= maxDigitExclusive) return [];
    approx += digit * base ** (whole.length - i - 1);
  }
  for (let i = 0; i < frac.length; i++) {
    const digit = BASE_CHARS.indexOf(frac[i]);
    if (digit < 0 || digit >= maxDigitExclusive) return [];
    approx += digit * base ** -(i + 1);
  }

  const encodeNumberInBaseN = (decimalNumber: number): string => {
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
  };

  const center = Math.max(1, Math.round(approx));
  const start = Math.max(1, center - 5000);
  const end = center + 5000;
  for (let n = start; n <= end; n++) {
    const candidate = String(n);
    if (candidate.length !== expectedLength) continue;
    if (encodeNumberInBaseN(n) === encoded) return [candidate];
  }
  return [];
}

function inferOpenWebAccessPointCandidates(expectedLength: number, format: string): string[] {
  if (format !== 'numeric') return [];
  const pool = [
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
  return pool.filter((p) => p.length === expectedLength);
}

function inferBellaCuoreCandidate(data: string, expectedLength: number, format: string): string[] {
  if (format !== 'numeric') return [];
  const roman = data.trim().toUpperCase();
  if (!roman || !/^[IVXLCDM]+$/.test(roman)) return [];
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const cur = values[roman[i]];
    const next = i + 1 < roman.length ? values[roman[i + 1]] : 0;
    if (!cur) return [];
    total += cur < next ? -cur : cur;
  }
  const candidate = String(total);
  return candidate.length === expectedLength ? [candidate] : [];
}

function inferPrimeTime2Candidate(data: string, expectedLength: number, format: string): string[] {
  if (format !== 'numeric' || expectedLength <= 0) return [];
  const targetText = data.trim();
  if (!/^\d+$/.test(targetText)) return [];
  let n = BigInt(targetText);
  if (n < 2n) return [];

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

  const candidate = (n > 1n ? n : largest).toString();
  return candidate.length === expectedLength ? [candidate] : [];
}

function infer110100100Candidate(data: string, expectedLength: number, format: string): string[] {
  const tokens = data
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return [];
  for (const token of tokens) {
    if (!/^[01]{8}$/.test(token)) return [];
  }

  const decoded = tokens.map((token) => String.fromCharCode(parseInt(token, 2))).join('');
  const matchesFormat = (value: string): boolean => {
    if (format === 'numeric') return /^\d+$/.test(value);
    if (format === 'alphabetic') return /^[A-Za-z]+$/.test(value);
    if (format === 'alphanumeric') return /^[A-Za-z0-9]+$/.test(value);
    return true;
  };

  if (decoded.length !== expectedLength || !matchesFormat(decoded)) return [];
  return [decoded];
}

function inferMathMLCandidate(data: string, expectedLength: number, format: string): string[] {
  if (format !== 'numeric' || expectedLength <= 0) return [];
  const cleanArithmeticExpression = (expression: string): string =>
    expression
      .replaceAll('ҳ', '*')
      .replaceAll('÷', '/')
      .replaceAll('➕', '+')
      .replaceAll('➖', '-')
      .replace(/[^0-9+\-*/(). ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const parseSimpleArithmeticExpression = (expression: string): number => {
    const tokens = cleanArithmeticExpression(expression).split('');
    let currentDepth = 0;
    const depth = tokens.map((token) => {
      if (token === '(') {
        currentDepth += 1;
      } else if (token === ')') {
        currentDepth -= 1;
        return currentDepth + 1;
      }
      return currentDepth;
    });

    const depth1Start = depth.indexOf(1);
    const firstZeroAfterDepth1Start = depth.indexOf(0, depth1Start);
    const depth1End = firstZeroAfterDepth1Start === -1 ? depth.length - 1 : firstZeroAfterDepth1Start - 1;
    if (depth1Start !== -1) {
      const subExpression = tokens.slice(depth1Start + 1, depth1End).join('');
      const result = parseSimpleArithmeticExpression(subExpression);
      tokens.splice(depth1Start, depth1End - depth1Start + 1, result.toString());
      return parseSimpleArithmeticExpression(tokens.join(''));
    }

    let remainingExpression = tokens.join('');
    const multiplicationDivisionRegex = /(-?\d*\.?\d+) *([*/]) *(-?\d*\.?\d+)/;
    let match = remainingExpression.match(multiplicationDivisionRegex);
    while (match) {
      const left = match[1];
      const operator = match[2];
      const right = match[3];
      const result = operator === '*' ? parseFloat(left) * parseFloat(right) : parseFloat(left) / parseFloat(right);
      const resultString = Math.abs(result) < 0.000001 ? result.toFixed(20) : result.toString();
      remainingExpression = remainingExpression.replace(match[0], resultString);
      match = remainingExpression.match(multiplicationDivisionRegex);
    }

    const additionSubtractionRegex = /(-?\d*\.?\d+) *([+-]) *(-?\d*\.?\d+)/;
    match = remainingExpression.match(additionSubtractionRegex);
    while (match) {
      const left = match[1];
      const operator = match[2];
      const right = match[3];
      const result = operator === '+' ? parseFloat(left) + parseFloat(right) : parseFloat(left) - parseFloat(right);
      remainingExpression = remainingExpression.replace(match[0], result.toString());
      match = remainingExpression.match(additionSubtractionRegex);
    }

    const leftover = remainingExpression.match(/(-?\d*\.?\d+)/)?.[1] ?? '';
    return parseFloat(leftover);
  };

  const cleaned = cleanArithmeticExpression(data ?? '');
  if (!cleaned) return [];
  const value = parseSimpleArithmeticExpression(cleaned);
  if (!Number.isFinite(value)) return [];
  const candidate = String(value);
  return candidate.length === expectedLength ? [candidate] : [];
}

function inferPr0verFl0Candidates(): string[] {
  return [];
}

function getCandidatePasswords(modelId: string, details: ReturnType<NS['dnet']['getServerAuthDetails']>): string[] {
  if (modelId === 'ZeroLogon') return [''];
  if (modelId === 'DeskMemo_3.1' && details.passwordFormat === 'numeric') {
    const pin = inferDeskMemoPin(details.passwordHint, details.passwordLength);
    return pin ? [pin] : [];
  }
  if (modelId === 'CloudBlare(tm)' && details.passwordFormat === 'numeric') {
    const digits = (details.data ?? '').replace(/\D/g, '');
    if (digits.length !== details.passwordLength) return [];
    return [digits];
  }
  if (modelId === 'FreshInstall_1.0') {
    return inferFreshInstallCandidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'TopPass') {
    return inferTopPassCandidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'EuroZone Free') {
    return inferEuroZoneFreeCandidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'Laika4') {
    return inferLaika4Candidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'OctantVoxel') {
    return inferOctantVoxelCandidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'OpenWebAccessPoint') {
    return inferOpenWebAccessPointCandidates(details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'AccountsManager_4.2') {
    return [];
  }
  if (modelId === 'DeepGreen') {
    return [];
  }
  if (modelId === 'BellaCuore') {
    return inferBellaCuoreCandidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'PrimeTime 2') {
    return inferPrimeTime2Candidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === '110100100') {
    return infer110100100Candidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'MathML') {
    return inferMathMLCandidate(details.data ?? '', details.passwordLength, details.passwordFormat);
  }
  if (modelId === 'Pr0verFl0') {
    return inferPr0verFl0Candidates();
  }
  if (modelId === 'NIL') {
    return [];
  }
  if (modelId === 'RateMyPix.Auth') {
    return [];
  }
  if (modelId === 'Factori-Os') {
    return [];
  }
  if (modelId === 'BigMo%od') {
    return [];
  }
  if (modelId === 'KingOfTheHill') {
    return [];
  }
  return [];
}

export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ['interval', 4000],
    ['noTail', true],
  ]) as { interval: number; noTail: boolean };

  if (!flags.noTail) ns.ui.openTail();
  ns.disableLog('sleep');

  const script = ns.getScriptName();
  const workerRam = ns.getScriptRam(script, ns.getHostname());

  while (true) {
    const vault = loadVault(ns);
    const neighbors = ns.dnet.probe();

    for (const host of neighbors) {
      const details = ns.dnet.getServerAuthDetails(host);
      if (!details.isOnline || !details.isConnectedToCurrentServer) continue;

      if (!details.hasSession) {
        const saved = vault.passwords[host];
        if (saved?.password != null) {
          const reconnect = ns.dnet.connectToSession(host, saved.password);
          if (reconnect.success) {
            saved.lastUsedAt = Date.now();
          } else {
            delete vault.passwords[host];
          }
        }
      }

      const refreshed = ns.dnet.getServerAuthDetails(host);
      if (!refreshed.hasSession) {
        if (refreshed.modelId === 'KingOfTheHill') {
          const cracked = await tryKingOfTheHill(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        if (refreshed.modelId === 'BigMo%od') {
          const cracked = await tryBigMoOd(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        if (refreshed.modelId === 'Factori-Os') {
          const cracked = await tryFactoriOs(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        if (refreshed.modelId === 'RateMyPix.Auth') {
          const cracked = await tryRateMyPixAuth(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        if (refreshed.modelId === 'NIL') {
          const cracked = await tryNIL(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        if (refreshed.modelId === 'AccountsManager_4.2') {
          const cracked = await tryAccountsManager42(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        if (refreshed.modelId === 'BellaCuore') {
          const cracked = await tryBellaCuoreRange(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
            continue;
          }
        }

        if (refreshed.modelId === '2G_cellular') {
          const cracked = await try2GCellular(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        if (refreshed.modelId === 'DeepGreen') {
          const cracked = await tryDeepGreen(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        if (refreshed.modelId === 'Pr0verFl0') {
          const cracked = await tryPr0verFl0(ns, host, refreshed);
          if (cracked != null) {
            vault.passwords[host] = {
              password: cracked,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
          continue;
        }

        const candidates = getCandidatePasswords(refreshed.modelId, refreshed);
        for (const candidate of candidates) {
          const auth = await ns.dnet.authenticate(host, candidate);
          if (auth.success) {
            vault.passwords[host] = {
              password: candidate,
              modelId: refreshed.modelId,
              discoveredAt: Date.now(),
              lastUsedAt: Date.now(),
            };
            break;
          } else {
            await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 1 });
          }
        }
      }

      const deployDetails = ns.dnet.getServerAuthDetails(host);
      if (!deployDetails.hasSession || !deployDetails.isConnectedToCurrentServer || !deployDetails.isOnline) continue;

      const blockedRam = ns.dnet.getBlockedRam(host);
      if (blockedRam > 0) {
        await ns.dnet.memoryReallocation(host);
        // Prioritize unblocking owner RAM before any other host actions.
        continue;
      }

      const freeRam = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
      if (freeRam < workerRam) continue;

      ns.scp(script, host, ns.getHostname());
      ns.exec(
        script,
        host,
        {
          threads: 1,
          preventDuplicates: true,
        },
        '--interval',
        Math.max(500, Math.floor(flags.interval)),
        '--noTail',
      );
    }

    saveVault(ns, vault);
    await ns.sleep(Math.max(300, flags.interval));
  }
}

export function autocomplete(): string[] {
  return ['--interval', '--noTail'];
}

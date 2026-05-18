import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

const PROGRESS_FILE = '/helpers/darknet/nil-progress.json';
const GUESSES_PER_PASS = 250;
const HEARTBLEED_LOGS_TO_CAPTURE = 40;
const NUMERIC_CHARSET = '0123456789';
const ALPHANUMERIC_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

type ProgressFile = {
  nextByHost: Record<string, string>;
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isNilGuessString(raw: string | undefined, length: number, charset: string): raw is string {
  return raw != null && raw.length === length && [...raw].every((c) => charset.includes(c));
}

// Strip apostrophe-like characters (ASCII ', curly ', U+2019, modifier letter U+02BC, backtick, fullwidth ').
// The game renders "yesn't" with different apostrophe glyphs; normalize before classifying tokens.
function stripApostrophes(token: string): string {
  return token.replace(/[\u2018\u2019\u02BC'`\u00B4\uFF07]/g, '');
}

const MAX_NIL_FEEDBACK_SOURCE_DEPTH = 10;

/** Walk auth / API values: nested objects, JSON strings, and `data:` lines inside multi-line messages. */
function collectNilFeedbackSources(data: unknown, depth = 0, acc: unknown[] = []): unknown[] {
  if (depth > MAX_NIL_FEEDBACK_SOURCE_DEPTH || data == null) return acc;
  acc.push(data);

  if (typeof data === 'string') {
    const t = data.trim();
    if (t.startsWith('{') && t.endsWith('}')) {
      try {
        collectNilFeedbackSources(JSON.parse(t) as unknown, depth + 1, acc);
      } catch {
        /* keep raw string */
      }
    }
    const dataLine = /\bdata:\s*([^\r\n]+)/im.exec(t);
    if (dataLine) acc.push(dataLine[1].trim());
    return acc;
  }

  if (Array.isArray(data)) {
    if (data.every((e) => typeof e === 'string')) acc.push((data as string[]).join(','));
    return acc;
  }

  if (typeof data === 'object' && !Array.isArray(data)) {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (v !== undefined) collectNilFeedbackSources(v, depth + 1, acc);
    }
  }
  return acc;
}

function parseNilFeedback(data: unknown): ('yes' | "yesn't")[] | null {
  for (const src of collectNilFeedbackSources(data)) {
    let rawTokens: string[] | null = null;
    if (typeof src === 'string') {
      rawTokens = src.split(',');
    } else if (Array.isArray(src) && src.every((entry) => typeof entry === 'string')) {
      rawTokens = src as string[];
    }
    if (rawTokens == null) continue;

    const tokens = rawTokens.map((token) => token.trim().toLowerCase()).filter((token) => token.length > 0);
    if (tokens.length === 0) continue;

    const normalized: ('yes' | "yesn't")[] = [];
    let ok = true;
    for (const token of tokens) {
      if (token === 'yes') {
        normalized.push('yes');
        continue;
      }
      const stripped = stripApostrophes(token);
      if (stripped === 'yesnt' || stripped === 'no') {
        normalized.push("yesn't");
        continue;
      }
      ok = false;
      break;
    }
    if (ok && normalized.length > 0) return normalized;
  }
  return null;
}

/** Heartbleed may log JSON (`"passwordAttempted":"00000"`) or plaintext key: value lines. */
function extractNilDataLineForGuessFromLogChunk(chunk: string, guess: string): string | null {
  const trimmed = chunk.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const att = obj.passwordAttempted;
      if (String(att) !== guess) return null;
      const d = obj.data;
      if (typeof d === 'string') return d;
      if (Array.isArray(d) && d.every((x) => typeof x === 'string')) return d.join(',');
    } catch {
      /* fall through to plaintext / quoted-json patterns */
    }
  }

  const esc = escapeRegExp(guess);
  const mentionsAttempt = new RegExp(
    `(?:passwordAttempted|"passwordAttempted")\\s*:\\s*"?${esc}"?(?:\\s|$|\\r|\\n|,|\\})`,
    'i',
  ).test(trimmed);
  if (!mentionsAttempt) return null;

  const plain = /\bdata:\s*([^\r\n]+)/i.exec(trimmed);
  if (plain) return plain[1].trim();

  const quoted = /"data"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(trimmed);
  if (quoted) {
    try {
      return JSON.parse(`"${quoted[1]}"`) as string;
    } catch {
      return quoted[1].replace(/\\"/g, '"');
    }
  }
  return null;
}

function findNilDataForGuessInHeartbleedLogs(logs: unknown, guess: string): string | null {
  if (!Array.isArray(logs)) return null;
  const esc = escapeRegExp(guess);

  for (let i = logs.length - 1; i >= 0; i--) {
    const got = extractNilDataLineForGuessFromLogChunk(String(logs[i]), guess);
    if (got != null) return got;
  }

  const lines: string[] = [];
  for (const entry of logs) {
    for (const line of String(entry).split(/\r?\n/)) {
      const t = line.trim();
      if (t.length > 0) lines.push(t);
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const got = extractNilDataLineForGuessFromLogChunk(lines[i], guess);
    if (got != null) return got;
  }

  const text = logs.map((x) => String(x)).join('\n');
  const re1 = new RegExp(
    `(?:^|[\\r\\n])data:\\s*([^\\r\\n]+)[\\s\\S]*?(?:passwordAttempted|"passwordAttempted")\\s*:\\s*"?${esc}"?(?:\\s|$|[\\r\\n])`,
    'im',
  );
  let m = re1.exec(text);
  if (m) return m[1].trim();
  const re2 = new RegExp(
    `(?:^|[\\r\\n])(?:passwordAttempted|"passwordAttempted")\\s*:\\s*"?${esc}"?(?:\\s|$|[\\r\\n])[\\s\\S]*?data:\\s*([^\\r\\n]+)`,
    'im',
  );
  m = re2.exec(text);
  if (m) return m[1].trim();
  return null;
}

async function fetchNilFeedback(
  ns: NS,
  hostname: DarknetHostname,
  guess: string,
  authResult: unknown,
): Promise<('yes' | "yesn't")[] | null> {
  const fromAuth = parseNilFeedback(authResult);
  if (fromAuth != null && fromAuth.length === guess.length) return fromAuth;

  try {
    const bleed = await ns.dnet.heartbleed(hostname, { peek: true, logsToCapture: HEARTBLEED_LOGS_TO_CAPTURE });
    const dataLine = findNilDataForGuessInHeartbleedLogs(bleed.logs, guess);
    if (dataLine == null) return fromAuth;
    const fromBleed = parseNilFeedback(dataLine);
    if (fromBleed != null && fromBleed.length === guess.length) return fromBleed;
    return fromAuth;
  } catch {
    return fromAuth;
  }
}

/** Per-slot: keep digit when feedback is `yes`, otherwise advance one step in `charset` (wrap; numeric 9→0). */
function advanceNilWrongSlots(candidate: string, feedback: ('yes' | "yesn't")[], charset: string): string {
  const base = charset.length;
  const out = [...candidate];
  const n = Math.min(out.length, feedback.length);
  for (let i = 0; i < n; i++) {
    if (feedback[i] === 'yes') continue;
    const idx = charset.indexOf(out[i]);
    const cur = idx >= 0 ? idx : 0;
    out[i] = charset[(cur + 1) % base];
  }
  return out.join('');
}

export async function solveNIL(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  if (details.passwordLength <= 0) {
    return {
      hostname,
      modelId: 'NIL',
      guessed: false,
      success: false,
      message: `Invalid password length ${details.passwordLength}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const charset =
    details.passwordFormat === 'numeric'
      ? NUMERIC_CHARSET
      : details.passwordFormat === 'alphanumeric'
        ? ALPHANUMERIC_CHARSET
        : null;
  if (!charset) {
    return {
      hostname,
      modelId: 'NIL',
      guessed: false,
      success: false,
      message: `Unexpected format ${details.passwordFormat}; expected numeric/alphanumeric`,
      shouldCaptureHeartbleed: true,
    };
  }

  const progress = loadProgress(ns);
  const len = details.passwordLength;
  const stored = progress.nextByHost[hostname];
  let candidate = isNilGuessString(stored, len, charset) ? stored : charset[0].repeat(len);

  for (let n = 0; n < GUESSES_PER_PASS; n++) {
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      delete progress.nextByHost[hostname];
      saveProgress(ns, progress);
      return {
        hostname,
        modelId: 'NIL',
        guessed: true,
        success: true,
        password: candidate,
        message: result.message,
        shouldCaptureHeartbleed: false,
      };
    }

    const feedback = await fetchNilFeedback(ns, hostname, candidate, result);
    if (feedback == null || feedback.length !== candidate.length) {
      progress.nextByHost[hostname] = candidate;
      saveProgress(ns, progress);
      return {
        hostname,
        modelId: 'NIL',
        guessed: true,
        success: false,
        message: 'NIL feedback missing or unparsable (auth.data and heartbleed); saved guess for retry',
        shouldCaptureHeartbleed: true,
      };
    }

    candidate = advanceNilWrongSlots(candidate, feedback, charset);
    progress.nextByHost[hostname] = candidate;
    saveProgress(ns, progress);
  }

  return {
    hostname,
    modelId: 'NIL',
    guessed: true,
    success: false,
    message: `NIL incremental pass exhausted (${GUESSES_PER_PASS} guesses); progress saved`,
    shouldCaptureHeartbleed: true,
  };
}

import type { NS } from '@ns';

type CopyResult = {
  source: string;
  target: string;
};

const DARKNET_PASSWORD_PATHS = [
  'helpers/darknet/darknet-passwords.json',
  '/helpers/darknet/darknet-passwords.json',
] as const;
const DARKNET_CACHE_REQUEST_PORT = 18;

type SerializedDarknetPasswords = {
  passwords?: Record<string, { password?: string }>;
};

function buildCandidatePaths(file: string): string[] {
  const candidates = new Set<string>();
  candidates.add(file);
  candidates.add(`/${file.replace(/^\/+/, '')}`);
  return [...candidates];
}

function firstExistingPath(ns: NS, host: string, file: string): string | null {
  const normalize = (value: string) => value.replace(/^\/+/, '');
  const files = ns.ls(host);
  const byNormalized = new Map<string, string>();
  for (const hostFile of files) {
    byNormalized.set(normalize(hostFile), hostFile);
  }

  for (const candidate of buildCandidatePaths(file)) {
    const matched = byNormalized.get(normalize(candidate));
    if (matched) return matched;
  }
  return null;
}

function copyToHome(ns: NS, host: string, file: string): CopyResult | null {
  const source = firstExistingPath(ns, host, file);
  if (!source) return null;

  const copied = ns.scp(source, 'home', host);
  if (!copied) return null;

  const target = source.startsWith('/') ? source : `/${source}`;
  return { source, target };
}

function getSavedPassword(ns: NS, host: string): string | null {
  for (const passwordPath of DARKNET_PASSWORD_PATHS) {
    if (!ns.fileExists(passwordPath, 'home')) continue;
    const raw = ns.read(passwordPath).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as SerializedDarknetPasswords;
      const password = parsed.passwords?.[host]?.password;
      if (typeof password === 'string' && password.length > 0) return password;
    } catch {
      // Ignore parse errors and continue trying alternate paths.
    }
  }
  return null;
}

function ensureAuthenticatedSession(ns: NS, host: string): boolean {
  const savedPassword = getSavedPassword(ns, host);
  if (!savedPassword) return false;
  try {
    const auth = ns.dnet.connectToSession(host, savedPassword);
    return auth.success;
  } catch {
    return false;
  }
}

function requestCacheOpenViaWorker(ns: NS, host: string, file: string): boolean {
  return ns.tryWritePort(DARKNET_CACHE_REQUEST_PORT, {
    kind: 'open-cache',
    hostname: host,
    file,
    ts: Date.now(),
  });
}

export async function main(ns: NS): Promise<void> {
  const [rawHost, rawFile] = ns.args;
  const host = String(rawHost ?? '');
  const file = String(rawFile ?? '');

  if (!host || !file) {
    ns.tprint("Usage: run helpers/darknet/read-file.js '<hostname>' '<file>'");
    return;
  }

  if (file.toLowerCase().endsWith('.cache')) {
    const queued = requestCacheOpenViaWorker(ns, host, file);
    if (!queued) {
      ns.alert(`Cache request port (${DARKNET_CACHE_REQUEST_PORT}) is full. Try again in a moment.`);
      return;
    }
    ns.alert(
      `Cache open request sent to worker on ${host} for ${file}.\n\n` +
        'The worker on that host will run openCache and the reward toast will appear.\n' +
        'If no toast appears within ~30s, that host may not currently be running darknet-worker.js.',
    );
    return;
  }

  if (!ensureAuthenticatedSession(ns, host)) {
    ns.alert(
      `Unable to authenticate session to ${host}.\n` +
        'Try rerunning darknet auth/crawler so cached credentials are refreshed.',
    );
    return;
  }

  const copied = copyToHome(ns, host, file);
  if (!copied) {
    const knownPath = firstExistingPath(ns, host, file);
    if (!knownPath) {
      const visibleFiles = ns
        .ls(host)
        .filter((name) => !name.toLowerCase().startsWith('helpers/'))
        .slice(0, 10);
      const hint =
        visibleFiles.length > 0
          ? `\n\nCurrent files include:\n- ${visibleFiles.join('\n- ')}`
          : '\n\nNo files currently visible.';
      ns.alert(`Unable to find ${file} on ${host}.${hint}`);
      return;
    }
    ns.alert(`Unable to copy ${file} from ${host}.`);
    return;
  }

  const contents = ns.read(copied.target);
  if (contents.length === 0) {
    ns.alert(`[${host}] ${copied.source} is empty.`);
    return;
  }

  ns.alert(`[${host}] ${copied.source}\n\n${contents}`);
}

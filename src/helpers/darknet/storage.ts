import type { NS } from '@ns';
import type {
  DarknetHostname,
  DarknetNodeState,
  DarknetPasswordVault,
  DarknetState,
  SerializedDarknetState,
} from '/helpers/darknet/types.js';

export const DARKNET_STATE_VERSION = 1;
export const DARKNET_STATE_PATH = '/helpers/darknet/darknet-state.json';
export const DARKNET_PASSWORD_PATH = '/helpers/darknet/darknet-passwords.json';
export const DARKNET_AUTOSAVE_INTERVAL_MS = 15_000;

export function createEmptyDarknetState(now = Date.now()): DarknetState {
  return {
    version: DARKNET_STATE_VERSION,
    updatedAt: now,
    edges: new Map<DarknetHostname, Set<DarknetHostname>>(),
    nodes: new Map<DarknetHostname, DarknetNodeState>(),
    revisitQueue: new Set<DarknetHostname>(),
  };
}

function serializeState(state: DarknetState): SerializedDarknetState {
  const edges: Record<DarknetHostname, DarknetHostname[]> = {};
  for (const [hostname, neighbors] of state.edges.entries()) {
    edges[hostname] = [...neighbors];
  }

  const nodes: Record<DarknetHostname, DarknetNodeState> = {};
  for (const [hostname, node] of state.nodes.entries()) {
    nodes[hostname] = node;
  }

  return {
    version: state.version,
    updatedAt: state.updatedAt,
    edges,
    nodes,
    revisitQueue: [...state.revisitQueue],
  };
}

function deserializeState(serialized: SerializedDarknetState): DarknetState {
  const state = createEmptyDarknetState(serialized.updatedAt);
  state.version = serialized.version;

  for (const [hostname, neighbors] of Object.entries(serialized.edges ?? {})) {
    state.edges.set(hostname, new Set(neighbors));
  }

  for (const [hostname, node] of Object.entries(serialized.nodes ?? {})) {
    state.nodes.set(hostname, { ...node, hostname });
  }

  for (const hostname of serialized.revisitQueue ?? []) {
    state.revisitQueue.add(hostname);
  }

  return state;
}

export function loadDarknetState(ns: NS, statePath = DARKNET_STATE_PATH): DarknetState {
  if (!ns.fileExists(statePath, 'home')) {
    return createEmptyDarknetState();
  }

  const raw = ns.read(statePath).trim();
  if (raw.length === 0) {
    return createEmptyDarknetState();
  }

  try {
    const parsed = JSON.parse(raw) as SerializedDarknetState;
    return deserializeState(parsed);
  } catch {
    ns.tprint(`WARN: Failed to parse ${statePath}; starting with empty darknet state.`);
    return createEmptyDarknetState();
  }
}

export function saveDarknetState(ns: NS, state: DarknetState, statePath = DARKNET_STATE_PATH): void {
  state.updatedAt = Date.now();
  const payload = JSON.stringify(serializeState(state));
  ns.write(statePath, payload, 'w');
}

type SerializedDarknetPasswords = {
  version: number;
  updatedAt: number;
  passwords: Record<DarknetHostname, { password: string; modelId?: string; discoveredAt: number; lastUsedAt?: number }>;
};

export function loadDarknetPasswords(ns: NS, passwordPath = DARKNET_PASSWORD_PATH): DarknetPasswordVault {
  const vault: DarknetPasswordVault = new Map();
  if (!ns.fileExists(passwordPath, 'home')) return vault;

  const raw = ns.read(passwordPath).trim();
  if (raw.length === 0) return vault;

  try {
    const parsed = JSON.parse(raw) as SerializedDarknetPasswords;
    for (const [hostname, record] of Object.entries(parsed.passwords ?? {})) {
      if (!record || typeof record.password !== 'string') continue;
      vault.set(hostname, {
        password: record.password,
        modelId: record.modelId,
        discoveredAt: record.discoveredAt ?? Date.now(),
        lastUsedAt: record.lastUsedAt,
      });
    }
  } catch {
    ns.tprint(`WARN: Failed to parse ${passwordPath}; starting with empty password vault.`);
  }
  return vault;
}

export function saveDarknetPasswords(ns: NS, vault: DarknetPasswordVault, passwordPath = DARKNET_PASSWORD_PATH): void {
  const passwords: SerializedDarknetPasswords['passwords'] = {};
  for (const [hostname, record] of vault.entries()) {
    passwords[hostname] = {
      password: record.password,
      modelId: record.modelId,
      discoveredAt: record.discoveredAt,
      lastUsedAt: record.lastUsedAt,
    };
  }
  const payload: SerializedDarknetPasswords = {
    version: DARKNET_STATE_VERSION,
    updatedAt: Date.now(),
    passwords,
  };
  ns.write(passwordPath, JSON.stringify(payload), 'w');
}

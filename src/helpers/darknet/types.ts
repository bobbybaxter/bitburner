import type { NS } from '@ns';

export type DarknetHostname = string;

export type DarknetNodeState = {
  hostname: DarknetHostname;
  modelId?: string;
  password?: string;
  passwordHint?: string;
  passwordLength?: number;
  passwordFormat?: 'numeric' | 'alphabetic' | 'alphanumeric' | 'ASCII' | 'unicode';
  isOnline?: boolean;
  hasSession?: boolean;
  hasStasisLink?: boolean;
  isConnectedToCurrentServer?: boolean;
  lastSeenAt: number;
  lastAuthSuccessAt?: number;
  lastAuthFailureAt?: number;
  authAttemptCount?: number;
  nextAuthAttemptAt?: number;
  lastAuthMessage?: string;
  lastWorkerDeployAt?: number;
  lastWorkerDeployFailureAt?: number;
  lastProbeAt?: number;
  lastDetailRefreshAt?: number;
};

export type DarknetState = {
  version: number;
  updatedAt: number;
  edges: Map<DarknetHostname, Set<DarknetHostname>>;
  nodes: Map<DarknetHostname, DarknetNodeState>;
  revisitQueue: Set<DarknetHostname>;
};

export type SerializedDarknetState = {
  version: number;
  updatedAt: number;
  edges: Record<DarknetHostname, DarknetHostname[]>;
  nodes: Record<DarknetHostname, DarknetNodeState>;
  revisitQueue: DarknetHostname[];
};

export type DarknetStorageConfig = {
  statePath: string;
  passwordPath: string;
  autosaveIntervalMs: number;
};

export type DarknetPasswordRecord = {
  password: string;
  modelId?: string;
  discoveredAt: number;
  lastUsedAt?: number;
};

export type DarknetPasswordVault = Map<DarknetHostname, DarknetPasswordRecord>;

export type DarknetContext = {
  ns: NS;
  state: DarknetState;
  passwords: DarknetPasswordVault;
  storage: DarknetStorageConfig;
  lastSaveAt: number;
};

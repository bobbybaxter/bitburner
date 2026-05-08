import type { NS } from '@ns';
import type { DarknetHostname } from '/helpers/darknet/types.js';

export const DARKNET_AUTH_LOG_PATH = '/helpers/darknet/darknet-auth-log.txt';

type AuthDiagnosticEvent = {
  ts: number;
  hostname: DarknetHostname;
  modelId?: string;
  event:
    | 'connect-session-success'
    | 'connect-session-failure'
    | 'solver-unsupported'
    | 'auth-success'
    | 'auth-failure'
    | 'heartbleed-sample'
    | 'heartbleed-ambient'
    | 'cache-opened'
    | 'phishing-attempt'
    | 'crawler-deploy-success'
    | 'crawler-deploy-failure'
    | 'memory-reallocation-success'
    | 'memory-reallocation-failure';
  message?: string;
  passwordHint?: string;
  passwordLength?: number;
  passwordFormat?: string;
  heartbleedLogs?: string[];
  cacheFile?: string;
  cacheOpenSuccess?: boolean;
  karmaLoss?: number;
  notes?: string;
};

export function logAuthEvent(ns: NS, event: AuthDiagnosticEvent): void {
  ns.write(DARKNET_AUTH_LOG_PATH, `${JSON.stringify(event)}\n`, 'a');
}

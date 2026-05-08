import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

export async function solveZeroLogon(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const password = '';
  const result = await ns.dnet.authenticate(hostname, password);
  return {
    hostname,
    modelId: 'ZeroLogon',
    attempted: true,
    success: result.success,
    password: result.success ? password : undefined,
    message: result.message,
    shouldCaptureHeartbleed: !result.success,
  };
}

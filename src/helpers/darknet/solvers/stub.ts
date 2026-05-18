import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

export function buildStubSolverResult(
  ns: NS,
  hostname: DarknetHostname,
  modelId: string,
  notes: string,
): DarknetSolverResult {
  const details = ns.dnet.getServerDetails(hostname);
  return {
    hostname,
    modelId,
    guessed: false,
    success: false,
    message: `${notes} hint="${details.passwordHint}" data="${details.data}" len=${details.passwordLength} fmt=${details.passwordFormat}`,
    shouldCaptureHeartbleed: true,
  };
}

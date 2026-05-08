import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

function inferCloudBlareCode(data: string, expectedLength: number): string | null {
  const digits = data.replace(/\D/g, '');
  if (digits.length !== expectedLength) return null;
  return digits;
}

export async function solveCloudBlare(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerAuthDetails(hostname);
  const expectedLength = details.passwordLength;

  if (details.passwordFormat !== 'numeric' || expectedLength <= 0) {
    return {
      hostname,
      modelId: 'CloudBlare(tm)',
      attempted: false,
      success: false,
      message: `Unexpected format/length: ${details.passwordFormat}/${expectedLength}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const password = inferCloudBlareCode(details.data ?? '', expectedLength);
  if (!password || password.length !== expectedLength) {
    return {
      hostname,
      modelId: 'CloudBlare(tm)',
      attempted: false,
      success: false,
      message: 'Could not infer numeric code from data payload',
      shouldCaptureHeartbleed: true,
    };
  }

  const result = await ns.dnet.authenticate(hostname, password);
  return {
    hostname,
    modelId: 'CloudBlare(tm)',
    attempted: true,
    success: result.success,
    password: result.success ? password : undefined,
    message: result.message,
    shouldCaptureHeartbleed: !result.success,
  };
}

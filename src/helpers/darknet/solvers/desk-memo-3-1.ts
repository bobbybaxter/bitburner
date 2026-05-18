import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

function inferPinFromHint(passwordHint: string, expectedLength: number): string | null {
  const trailing = passwordHint.match(/(\d+)\s*$/)?.[1];
  if (trailing && trailing.length === expectedLength) return trailing;
  return null;
}

export async function solveDeskMemo31(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerDetails(hostname);
  const expectedLength = details.passwordLength;

  if (details.passwordFormat !== 'numeric' || expectedLength <= 0) {
    return {
      hostname,
      modelId: 'DeskMemo_3.1',
      guessed: false,
      success: false,
      message: `Unexpected format/length: ${details.passwordFormat}/${expectedLength}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const password = inferPinFromHint(details.passwordHint, expectedLength);
  if (!password || password.length !== expectedLength) {
    return {
      hostname,
      modelId: 'DeskMemo_3.1',
      guessed: false,
      success: false,
      message: 'Could not infer numeric PIN from hint',
      shouldCaptureHeartbleed: true,
    };
  }

  const result = await ns.dnet.authenticate(hostname, password);
  return {
    hostname,
    modelId: 'DeskMemo_3.1',
    guessed: true,
    success: result.success,
    password: result.success ? password : undefined,
    message: result.message,
    shouldCaptureHeartbleed: !result.success,
  };
}

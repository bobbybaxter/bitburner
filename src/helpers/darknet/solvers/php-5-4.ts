import type { NS } from '@ns';
import type { DarknetSolverResult } from '/helpers/darknet/solvers/types.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

function buildUniquePermutations(sortedToken: string): string[] {
  const counts = new Map<string, number>();
  for (const ch of sortedToken) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }

  const chars = [...counts.keys()].sort();
  const out: string[] = [];
  const path: string[] = [];

  const dfs = (): void => {
    if (path.length === sortedToken.length) {
      out.push(path.join(''));
      return;
    }

    for (const ch of chars) {
      const remaining = counts.get(ch) ?? 0;
      if (remaining <= 0) continue;
      counts.set(ch, remaining - 1);
      path.push(ch);
      dfs();
      path.pop();
      counts.set(ch, remaining);
    }
  };

  dfs();
  return out;
}

export async function solvePhp54(ns: NS, hostname: DarknetHostname): Promise<DarknetSolverResult> {
  const details = ns.dnet.getServerAuthDetails(hostname);

  if (details.passwordFormat !== 'numeric' || details.passwordLength <= 0) {
    return {
      hostname,
      modelId: 'PHP 5.4',
      attempted: false,
      success: false,
      message: `Unexpected format/length: ${details.passwordFormat}/${details.passwordLength}`,
      shouldCaptureHeartbleed: true,
    };
  }

  const sortedToken = details.data;
  if (!sortedToken || sortedToken.length !== details.passwordLength || !/^\d+$/.test(sortedToken)) {
    return {
      hostname,
      modelId: 'PHP 5.4',
      attempted: false,
      success: false,
      message: 'Invalid sorted password token in auth data',
      shouldCaptureHeartbleed: true,
    };
  }

  const candidates = buildUniquePermutations(sortedToken);
  for (const candidate of candidates) {
    const result = await ns.dnet.authenticate(hostname, candidate);
    if (result.success) {
      return {
        hostname,
        modelId: 'PHP 5.4',
        attempted: true,
        success: true,
        password: candidate,
        message: result.message,
        shouldCaptureHeartbleed: false,
      };
    }
  }

  return {
    hostname,
    modelId: 'PHP 5.4',
    attempted: true,
    success: false,
    message: `Tried ${candidates.length} permutations derived from sorted token`,
    shouldCaptureHeartbleed: true,
  };
}

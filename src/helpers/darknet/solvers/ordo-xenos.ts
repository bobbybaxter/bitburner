import type { NS } from '@ns';
import { buildStubSolverResult } from '/helpers/darknet/solvers/stub.js';
import type { DarknetHostname } from '/helpers/darknet/types.js';

export async function solveOrdoXenos(ns: NS, hostname: DarknetHostname) {
  return buildStubSolverResult(ns, hostname, 'OrdoXenos', 'TODO: encryptedPassword solver not implemented.');
}

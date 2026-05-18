import type { NS } from '@ns';
import {
  bootstrapDarknetContext,
  discoverFromCurrentServer,
  saveIfDirtyOrDue,
  setUndirectedEdge,
} from '/helpers/darknet/lifecycle.js';
import { symmetrizeDarknetEdges } from '/helpers/darknet/storage.js';
import type { DarknetPasswordVault, DarknetState } from '/helpers/darknet/types.js';
import { quoteTerminalToken } from '/helpers/terminal-quote.js';

const DARKWEB = 'darkweb';
const TASK_LABRADAR_PATH = '/helpers/darknet/task-labradar.js';

type DnetWithSession = {
  connectToSession: (host: string, password: string) => { success: boolean; message?: string };
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeJsSingleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function ensureHomeDarkwebBridge(state: DarknetState): void {
  if (!state.edges.has('home')) state.edges.set('home', new Set());
  if (!state.edges.has(DARKWEB)) state.edges.set(DARKWEB, new Set());
  state.edges.get('home')!.add(DARKWEB);
  state.edges.get(DARKWEB)!.add('home');
}

/** Depth 0 = directly under darkweb; edges from probe() alone miss this when the crawler wasn't on darkweb. */
function mergeDirectDarkwebNeighborsFromDepth(ns: NS, state: DarknetState): void {
  const dnet = ns.dnet as { getDepth(host?: string): number };
  for (const hostname of state.nodes.keys()) {
    if (hostname === DARKWEB || hostname === 'home') continue;
    let depth: number;
    try {
      depth = dnet.getDepth(hostname);
    } catch {
      continue;
    }
    if (depth === 0) {
      setUndirectedEdge(state, DARKWEB, hostname);
    }
  }
}

/**
 * Edges are populated continuously by `darknet-worker.js` running on each authenticated host, which
 * emits `dnet.probe()` results over the worker-sync port. This script just reads the saved state, so
 * the freshness of links depends on `darknet.js` being running long enough for workers to report.
 */

function buildConnectChain(state: DarknetState, target: string): string[] | null {
  if (target === DARKWEB) return [DARKWEB];

  const parents = new Map<string, string>();
  const visited = new Set<string>([DARKWEB]);
  const queue: string[] = [DARKWEB];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === target) break;
    const neighbors = state.edges.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parents.set(neighbor, current);
      queue.push(neighbor);
    }
  }

  if (!parents.has(target)) return null;

  const reverseChain: string[] = [];
  let node: string | undefined = target;
  while (node && node !== DARKWEB) {
    reverseChain.push(node);
    node = parents.get(node);
  }
  reverseChain.push(DARKWEB);
  return reverseChain.reverse();
}

/**
 * Like darknet-files’ `read-file.js`, but `dnet.labradar()` only exists on the target host.
 * `exec()` from home requires that host to be adjacent to home (or backdoor/stasis), so we must
 * hop in the terminal: connect …; run task-labradar.js. Tail UI belongs on `task-labradar.js`.
 */
function createLabradarTerminalCommand(state: DarknetState, hostname: string): string | null {
  const chain = buildConnectChain(state, hostname);
  if (!chain) return null;
  const connects = chain.map((hop) => `connect ${quoteTerminalToken(hop)}`).join('; ');
  return `home; ${connects}; run ${TASK_LABRADAR_PATH.replace(/^\//, '')}`;
}

function createServerLink(state: DarknetState, hostname: string): string {
  const command = createLabradarTerminalCommand(state, hostname);
  if (command === null) {
    return `<span style="color:#75715e" title="${escapeHtml(`No BFS path from ${DARKWEB} to ${hostname} in saved edges yet. Keep darknet.js running so workers report mesh edges via worker-sync.`)}">${escapeHtml(hostname)}</span>`;
  }
  const commandAttr = escapeHtml(escapeJsSingleQuoted(command));
  return [
    "<a class='scan-analyze-link'",
    ` title='${escapeHtml(`Run dnet labradar on ${hostname}`)}'`,
    ' onClick="(function(){',
    "const terminalInput=document.getElementById('terminal-input');",
    'if(!terminalInput) return;',
    `terminalInput.value='${commandAttr}';`,
    'const handler=Object.keys(terminalInput)[1];',
    'terminalInput[handler].onChange({target:terminalInput});',
    'terminalInput[handler].onKeyDown({keyCode:13,preventDefault:()=>null});',
    '})();"',
    " style='color:#66d9ff'>",
    escapeHtml(hostname),
    '</a>',
  ].join('');
}

function ensureLabradarTaskOnHosts(ns: NS, hosts: string[], passwords: DarknetPasswordVault): void {
  if (!ns.fileExists(TASK_LABRADAR_PATH, 'home')) {
    ns.tprint(`WARN: ${TASK_LABRADAR_PATH} not found on home; cannot distribute task script.`);
    return;
  }
  const dnet = ns.dnet as unknown as DnetWithSession;
  for (const host of hosts) {
    if (host === 'home') continue;
    const record = passwords.get(host);
    if (!record) continue;
    try {
      const auth = dnet.connectToSession(host, record.password);
      if (!auth.success) continue;
    } catch {
      continue;
    }
    ns.scp(TASK_LABRADAR_PATH, host, 'home');
  }
}

export async function main(ns: NS): Promise<void> {
  const context = bootstrapDarknetContext(ns);
  discoverFromCurrentServer(context);
  ensureHomeDarkwebBridge(context.state);
  mergeDirectDarkwebNeighborsFromDepth(ns, context.state);
  symmetrizeDarknetEdges(context.state);
  saveIfDirtyOrDue(context, true);
  const { state } = context;

  const hostnames = [...state.nodes.keys()].sort((a, b) => a.localeCompare(b));
  if (hostnames.length === 0) {
    ns.tprint('No darknet servers found in saved state yet. Run darknet.js first.');
    return;
  }

  const accessibleHosts: string[] = [];
  for (const hostname of hostnames) {
    if (!ns.serverExists(hostname)) continue;
    try {
      const files = ns.ls(hostname);
      if (files.length === 0) continue;
      accessibleHosts.push(hostname);
    } catch {
      continue;
    }
  }

  if (accessibleHosts.length === 0) {
    ns.tprint('No currently accessible darknet servers found.');
    return;
  }

  ensureLabradarTaskOnHosts(ns, accessibleHosts, context.passwords);

  let output = '<span style="color:#a6e22e;font-weight:600;">Darknet Labradar Targets:</span>';
  for (const hostname of accessibleHosts) {
    output += `<br>&nbsp;&nbsp;&bull; ${createServerLink(state, hostname)}`;
  }

  const terminal = document.getElementById('terminal');
  if (!terminal) return;
  terminal.insertAdjacentHTML('beforeend', output);
}

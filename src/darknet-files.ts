import type { NS } from '@ns';
import { loadDarknetState } from '/helpers/darknet/storage.js';

type Flags = {
  showJs: boolean;
  showExe: boolean;
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

function createTerminalCommand(hostname: string, file: string): string {
  if (file.toLowerCase().endsWith('.exe')) {
    return `home; connect ${hostname}; ${file}`;
  }
  const safeHost = escapeJsSingleQuoted(hostname);
  const safeFile = escapeJsSingleQuoted(file);
  return `home; run helpers/darknet/read-file.js '${safeHost}' '${safeFile}'`;
}

function createFileLink(hostname: string, file: string): string {
  const command = escapeJsSingleQuoted(createTerminalCommand(hostname, file));
  const title = file.toLowerCase().endsWith('.exe') ? `Run ${file} on ${hostname}` : `Open ${file} on ${hostname}`;
  return [
    "<a class='scan-analyze-link'",
    ` title='${escapeHtml(title)}'`,
    ' onClick="(function(){',
    "const terminalInput=document.getElementById('terminal-input');",
    'if(!terminalInput) return;',
    `terminalInput.value='${command}';`,
    'const handler=Object.keys(terminalInput)[1];',
    'terminalInput[handler].onChange({target:terminalInput});',
    'terminalInput[handler].onKeyDown({keyCode:13,preventDefault:()=>null});',
    '})();"',
    " style='color:#66d9ff'>",
    escapeHtml(file),
    '</a>',
  ].join('');
}

function shouldShowFile(file: string, flags: Flags): boolean {
  const lower = file.toLowerCase();
  if (!flags.showJs && lower.endsWith('.js')) return false;
  if (!flags.showExe && lower.endsWith('.exe')) return false;
  if (lower.startsWith('temp/')) return false;
  if (lower.startsWith('tmp/')) return false;
  if (lower.startsWith('helpers/')) return false;
  return true;
}

/**
 * Shows discovered darknet servers and clickable file entries.
 */
export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ['showJs', false],
    ['showExe', false],
  ]) as unknown as Flags;

  const state = loadDarknetState(ns);
  const hostnames = [...state.nodes.keys()].sort((a, b) => a.localeCompare(b));

  if (hostnames.length === 0) {
    ns.tprint('No darknet servers found in saved state yet. Run darknet.js first.');
    return;
  }

  let output = 'Darknet Files:';

  const hostsWithFiles: { hostname: string; files: string[] }[] = [];
  for (const hostname of hostnames) {
    const files = ns
      .ls(hostname)
      .filter((file) => shouldShowFile(file, flags))
      .sort((a, b) => a.localeCompare(b));
    if (files.length === 0) continue;
    hostsWithFiles.push({ hostname, files });
  }

  if (hostsWithFiles.length === 0) {
    ns.tprint('No darknet servers have visible files with current filters.');
    return;
  }

  for (const host of hostsWithFiles) {
    const { hostname, files } = host;
    output += `<br><font color='orange'>${escapeHtml(hostname)}</font>`;

    for (const file of files) {
      output += `<br>&nbsp;&nbsp;&bull; ${createFileLink(hostname, file)}`;
    }
  }

  const terminal = document.getElementById('terminal');
  if (!terminal) return;
  terminal.insertAdjacentHTML('beforeend', output);
}

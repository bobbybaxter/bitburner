import { NS } from '@ns';

export function openPorts(
  ns: NS,
  {
    hostname,
    ftpPortOpen,
    httpPortOpen,
    smtpPortOpen,
    sqlPortOpen,
    sshPortOpen,
  }: {
    hostname: string;
    ftpPortOpen: boolean;
    httpPortOpen: boolean;
    smtpPortOpen: boolean;
    sqlPortOpen: boolean;
    sshPortOpen: boolean;
  },
): number {
  let openPorts = 0;

  // must be done separately like this because you can't abstract the function call without getting an error in the game
  if (ns.fileExists('BruteSSH.exe') && !sshPortOpen) {
    console.log(`Opening ssh on ${hostname}`);
    ns.brutessh(hostname);
    openPorts += 1;
  }
  if (ns.fileExists('FTPCrack.exe') && !ftpPortOpen) {
    console.log(`Opening ftp on ${hostname}`);
    ns.ftpcrack(hostname);
    openPorts += 1;
  }
  if (ns.fileExists('relaySMTP.exe') && !smtpPortOpen) {
    console.log(`Opening smtp on ${hostname}`);
    ns.relaysmtp(hostname);
    openPorts += 1;
  }
  if (ns.fileExists('HTTPWorm.exe') && !httpPortOpen) {
    console.log(`Opening http on ${hostname}`);
    ns.httpworm(hostname);
    openPorts += 1;
  }
  if (ns.fileExists('SQLInject.exe') && !sqlPortOpen) {
    console.log(`Opening sql on ${hostname}`);
    ns.sqlinject(hostname);
    openPorts += 1;
  }
  return openPorts;
}

export function disableNoisyLogs({ disableLog }: { disableLog: (log: string) => unknown }): void {
  disableLog('ALL');
  // disableLog('getServerNumPortsRequired');
  // disableLog('getServerRequiredHackingLevel');
  // disableLog('getHackingLevel');
  // disableLog("scp");
  // disableLog("getHackTime");
  // disableLog("hackAnalyze");
  // disableLog("hackAnalyzeChance");
  // disableLog("hasRootAccess");
  // disableLog("getServerMaxRam");
  // disableLog("sleep");
  // disableLog("getServerMoneyAvailable");
  // disableLog("scan");
  // disableLog("getPurchasedServers");
  // disableLog("getServerMaxMoney");
  // disableLog("exec");
  // disableLog("rm");
  // disableLog("getServerUsedRam");
}

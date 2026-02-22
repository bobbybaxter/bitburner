import { NS } from '@ns';

export type CalculateCycleThreadsOutput = {
  hack: number;
  grow: number;
  growWeak: number;
  hackWeak: number;
  total: number;
  taking: number;
  ratio: number;
};

export type CalculateCycleTimesOutput = {
  growWeakEnd: number;
  hackWeakEnd: number;
  growWeakStart: number;
  growStart: number;
  growEnd: number;
  hackStart: number;
  hackEnd: number;
  hackWeakStart: number;
};

export type CalculateGrowthOutput = {
  total: number;
  grow: number;
  growWeak: number;
  ratio: number;
};

export type StartCycleInput = {
  threads?: {
    hack: number;
    grow: number;
    growWeak: number;
    hackWeak: number;
    total: number;
    taking: number;
    ratio: number;
  };
  times?: {
    growWeakEnd: number;
    hackWeakEnd: number;
    growWeakStart: number;
    growStart: number;
    growEnd: number;
    hackStart: number;
    hackEnd: number;
    hackWeakStart: number;
  };
  await?: boolean;
};

const weakenProgress = 0.05; // NOTE: Do i need to break this out into constants?

export default function target(ns: NS, name: string, host: string) {
  return {
    calculateCycleThreads(taking: number, maxThreads?: number | undefined): CalculateCycleThreadsOutput {
      const maxCash = ns.getServerMaxMoney(name);
      const hackThreads = Math.floor(ns.hackAnalyzeThreads(name, taking * maxCash));

      const security = ns.hackAnalyzeSecurity(hackThreads);
      const hackWeakThreads = this.calculateWeaken(security);

      const ratio = 1 / (1 - taking) + 0.01;
      const { grow, growWeak, total } = this.calculateGrowth(ratio);

      const threads = {
        hack: hackThreads > 0 ? hackThreads : 0,
        hackWeak: hackWeakThreads > 0 ? hackWeakThreads : 0,
        grow,
        growWeak,
        total: hackThreads + hackWeakThreads + total,
        taking,
        ratio,
      };

      if (maxThreads) {
        while (threads.total > maxThreads && threads.taking > 0.01) {
          threads.taking -= 0.01;
          threads.hack = Math.floor(ns.hackAnalyzeThreads(name, threads.taking * maxCash));

          const security = ns.hackAnalyzeSecurity(hackThreads);
          threads.hackWeak = this.calculateWeaken(security);

          threads.ratio = 1 / (1 - taking) + 0.01;
          const { grow, growWeak, total } = this.calculateGrowth(threads.ratio);
          threads.grow = grow;
          threads.growWeak = growWeak;
          threads.total = threads.hack + threads.hackWeak + total;
        }
      }

      return threads;
    },

    calculateCycleTimes(
      options: { now: number; gap: number } = {
        now: Date.now(),
        gap: 500,
      },
    ): CalculateCycleTimesOutput {
      const now = options.now || Date.now();
      const gap = options.gap || 500;
      const timestamp = now + 5000;
      const growTime = ns.getGrowTime(name);
      const hackTime = ns.getHackTime(name);
      const weakTime = ns.getWeakenTime(name);

      return {
        hackStart: timestamp + weakTime - hackTime,
        hackWeakStart: timestamp + weakTime + 1 * gap - weakTime,
        growStart: timestamp + weakTime + 2 * gap - growTime,
        growWeakStart: timestamp + weakTime + 3 * gap - weakTime,
        hackEnd: timestamp + weakTime,
        hackWeakEnd: timestamp + weakTime + 1 * gap,
        growEnd: timestamp + weakTime + 2 * gap,
        growWeakEnd: timestamp + weakTime + 3 * gap,
      };
    },

    calculateGrowth(
      ratio: number | undefined = undefined,
      maxThreads: number | undefined = undefined,
    ): CalculateGrowthOutput {
      ratio ||= this.getRatio();

      const growThreads = Math.ceil(ns.growthAnalyze(name, ratio));
      const security = ns.growthAnalyzeSecurity(growThreads);
      const growWeakThreads = this.calculateWeaken(security);

      const threads = {
        grow: growThreads,
        growWeak: growWeakThreads,
        total: growThreads + growWeakThreads,
        ratio: ratio,
      };

      while (maxThreads && threads.total > maxThreads && threads.ratio > 1.01) {
        threads.ratio -= 0.01;
        threads.grow = Math.ceil(ns.growthAnalyze(name, threads.ratio));
        const security = ns.growthAnalyzeSecurity(growThreads);
        threads.growWeak = this.calculateWeaken(security);
        threads.total = threads.grow + threads.growWeak;
      }

      return threads;
    },

    calculateWeaken(security: number | undefined = undefined, maxThreads: number | undefined = undefined): number {
      security ||= this.getSecurity();
      const threads = Math.ceil(security / weakenProgress);
      return Math.min(maxThreads || threads, threads);
    },

    async execute(cmd: string, threads: number, options: { start?: number; await?: number } = {}): Promise<void> {
      const start = options.start || Date.now();
      const script =
        cmd === 'hack'
          ? 'worker-hack.js'
          : cmd === 'grow'
            ? 'worker-grow.js'
            : cmd === 'weaken'
              ? 'worker-weaken.js'
              : null;
      if (!script) return;
      ns.scp(script, host);
      ns.exec(script, host, threads, name, start);
      if (!options.await) {
        return Promise.resolve();
      }

      // ns.print("Starting worker");
      const end = new Date(start + options.await);
      while (ns.isRunning(script, host, name, start)) {
        const now = new Date(end.getTime() - Date.now());
        // ns.print(
        //     `Worker done in ${now.toUTCString().substr(17, 8)}`
        // );

        if (now.getUTCHours()) {
          await ns.sleep(1000 * 60 * 60);
        } else if (now.getUTCMinutes() > 10) {
          await ns.sleep(1000 * 60 * 10);
        } else if (now.getUTCMinutes()) {
          await ns.sleep(1000 * 60);
        } else if (now.getUTCSeconds() > 10) {
          await ns.sleep(1000 * 10);
        } else {
          await ns.sleep(1000);
        }
      }
      ns.print(`Worker is done`);
    },

    getRatio(): number {
      return ns.getServerMaxMoney(name) / Math.floor(ns.getServerMoneyAvailable(name)) + 1;
    },

    getSecurity(): number {
      const serverSecurityLevel = ns.getServerSecurityLevel(name);
      const serverMinSecurityLevel = ns.getServerMinSecurityLevel(name);
      return serverSecurityLevel - serverMinSecurityLevel;
    },

    async grow(threads: number, options: { start?: number; await?: boolean } = {}): Promise<void> {
      return this.execute('grow', threads, {
        ...options,
        await: options.await ? ns.getGrowTime(name) : undefined,
      });
    },

    async hack(threads: number, options: { start?: number; await?: boolean } = {}): Promise<void> {
      return this.execute('hack', threads, {
        ...options,
        await: options.await ? ns.getHackTime(name) : undefined,
      });
    },

    isMoneyLow(): boolean {
      const serverMaxMoney = ns.getServerMaxMoney(name);
      const serverMoney = Math.floor(ns.getServerMoneyAvailable(name));
      return serverMaxMoney > serverMoney;
    },

    isSecurityHigh(): boolean {
      return this.getSecurity() > 0;
    },

    async prepare(): Promise<void> {
      const maxRam = ns.getServerMaxRam(host);
      const threadCost = Math.max(
        ns.getScriptRam('worker-hack.js'),
        ns.getScriptRam('worker-grow.js'),
        ns.getScriptRam('worker-weaken.js'),
      );
      const maxThreads = Math.floor(maxRam / threadCost);
      const availableRam = maxRam - ns.getServerUsedRam(host);
      const availableThreads = Math.floor(availableRam / threadCost);

      // const isPrepared = this.isSecurityHigh() || this.isMoneyLow();
      // ns.print(`Is ${host} prepared? ${isPrepared}`);
      if (!this.isSecurityHigh() && !this.isMoneyLow()) {
        if (availableThreads > threadCost) {
          await this.hack(availableThreads);
        }
      }

      while (this.isSecurityHigh()) {
        const threads = this.calculateWeaken(this.getSecurity(), maxThreads);
        return await this.weaken(threads, { await: true });
      }

      while (this.isMoneyLow()) {
        const threads = this.calculateGrowth(this.getRatio(), maxThreads);
        await this.grow(threads.grow);
        return await this.weaken(threads.growWeak, { await: true });
      }

      while (this.isSecurityHigh()) {
        const threads = this.calculateWeaken(this.getSecurity(), maxThreads);
        return await this.weaken(threads, { await: true });
      }
    },

    async startCycle(options: StartCycleInput = {}): Promise<void> {
      const times = options.times || this.calculateCycleTimes();
      const threads = options.threads || this.calculateCycleThreads(0.98);

      console.log('times', times);
      console.log('threads', threads);
      if (threads.hack > 0) {
        await this.hack(threads.hack, { start: times.hackStart });
      }
      if (threads.hackWeak > 0) {
        await this.weaken(threads.hackWeak, {
          start: times.hackWeakStart,
        });
      }
      if (threads.grow > 0) {
        await this.grow(threads.grow, { start: times.growStart });
      }
      if (threads.growWeak > 0) {
        await this.weaken(threads.growWeak, {
          start: times.growWeakStart,
          await: options.await,
        });
      }
    },

    async weaken(threads: number, options: { start?: number; await?: boolean } = {}): Promise<void> {
      return this.execute('weaken', threads, {
        ...options,
        await: options.await ? ns.getWeakenTime(name) : undefined,
      });
    },
  };
}

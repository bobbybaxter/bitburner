# Script Docs

## hack0.ts

**What it does:** Lightweight hack launcher (6.4GB RAM). Discovers servers via scan, then runs `hack1-script` on each server with available RAM. Use `hack1.ts` when you have more RAM and want the fuller setup.

**How to run:**

```bash
run hack0.js                    # scan all servers, use optimal target from /constants/optimal-target.txt (or n00dles)
run hack0.js home               # home only as host
run hack0.js home n00dles       # home + target n00dles
```

- **Arg 1 (optional):** Dedicated hostname. If omitted, uses all discovered servers.
- **Arg 2 (optional):** Target server. Defaults to `/constants/optimal-target.txt` or `n00dles`.

---

## hack1.ts

**What it does:** Hacks all servers whose required hacking level is below your level. Uses `getAllServers` plus purchased servers, sets up each host with `setUpHost`, and runs the hack script against the chosen target. Higher RAM usage (42.3GB) than hack0.

**How to run:**

```bash
run hack1.js                    # all hosts, optimal target
run hack1.js home               # home only, optimal target
run hack1.js home n00dles       # home only, target n00dles
```

- **Arg 1 (optional):** Dedicated hostname. If omitted, uses all available hosts.
- **Arg 2 (optional):** Dedicated target. If omitted, uses optimal target.

---

## hack2.ts

**What it does:** Continuously hacks the best target until money reaches 90% of max or security rises above min+5. Uses worker scripts (hack, grow, weaken) coordinated by `findBestConfig`—grows when money is low, weakens when security is high, otherwise hacks with timed weaken/grow follow-ups. Targets are chosen via `findBestServer` (cached every 60s).

**How to run:**

```bash
run hack2.js
```

- No parameters. Runs indefinitely. Requires worker scripts (`worker-hack.js`, `worker-grow.js`, `worker-weaken.js`).

---

## hack3.ts

**What it does:** Batched hacking across multiple hosts and targets. Uses all rooted servers as hosts (including home at 90% RAM) and targets non-home, non-purchased servers with money. Runs `open-all-ports.js` on startup, deploys action scripts (`do-hack.js`, `do-grow.js`, `do-weaken1.js`, `do-weaken2.js`) to each host. Schedules timed batches: weaken when security is high, grow when money is low, then hack+grow+weaken1+weaken2 cycles on the top ~20% of `findBestServer` targets. Uses Formulas API when available for thread calculations.

**How to run:**

```bash
run hack3.js
```

- No parameters. Runs indefinitely. Requires action scripts in `/scripts/` and `open-all-ports.js`. Benefits from Formulas.exe for optimal thread counts.

---

## cloud-opt.ts

**What it does:** Optimizes purchased servers. Buys new servers at increasing RAM tiers (128GB → 2TB → 32TB → 512TB → … up to 1PB) when you have the slots and funds. When at server limit, upgrades the smallest server by deleting and repurchasing. Only buys when cash ≥ cost / 0.25 (configurable `moneyThreshold`).

**How to run:**

```bash
run cloud-opt.js
```

- No parameters. Runs indefinitely. Config in code: `initialMulti` (7 = 128GB), `moneyThreshold` (0.25).

---

## contract-auto-solver.ts

**What it does:** Walks the network with a depth-first search and automatically solves any coding contracts (`.cct` files) found on each server. Uses the `solveContract` helper for each contract type. High RAM (27GB) due to contract solvers.

**How to run:**

```bash
run contract-auto-solver.js
```

- No parameters. Scans from home, visits every reachable server, and solves all contracts.

---

## hacknet-opt.ts

**What it does:** Optimizes HackNet node upgrades and purchases. Spends only within income earned from HackNet, scaled by `budgetPct`; when Formulas API is available, picks upgrades by best ROI (return on investment), otherwise picks cheapest. Buys new nodes when ROI compares favorably.

**How to run:**

```bash
run hacknet-opt.js              # default: 1 level per upgrade, 50% budget
run hacknet-opt.js 5            # upgrade 5 levels at a time for level upgrades
run hacknet-opt.js 1 80         # 1 level per upgrade, use 80% of HackNet budget
```

- **Arg 1 (optional):** `numLevels` — how many levels to buy per level upgrade (default: 1).
- **Arg 2 (optional):** `budgetPct` — percentage of available HackNet budget to spend per purchase (default: 50).

---

## infiltrate.ts

**What it does:** Automatically completes company infiltration minigames by simulating keyboard input while the infiltration screen is open. Supports type-it, enter-the-code, close-the-brackets, guarding, minesweeper, match-the-symbols, wire-cutting, and other minigames. Works best with the game running (e.g. in Edge). Modified to support Shadows of anarchy augments.

**How to run:**

```bash
run infiltrate.js               # start automation (--start optional)
run infiltrate.js --stop         # stop automation
run infiltrate.js --status       # show if active
run infiltrate.js --quiet        # reduce terminal output
```

- **`--start`:** Start automation (optional; default when not using --stop or --status)
- **`--stop`:** Stop and exit
- **`--status`:** Report whether automation is active
- **`--quiet`:** Suppress output

Tip: Visit a company, click Infiltrate, and the script will run when the infiltration screen appears. Use an alias such as `alias autoinfil="run infiltrate.js --stop --quiet; run infiltrate.js --quiet"` to restart cleanly.

---

## scan.ts

**What it does:** Scans the network and prints a tree of servers with color-coded root access (lime = rooted, red = not), faction server colors (e.g. CSEC yellow, w0r1d_d43m0n red), and contract indicators (©). Hover shows req level, ports, RAM, security, money. Clicking a server inserts a connect command into the terminal.

**How to run:**

```bash
run scan.js
```

- No parameters. Output is appended to the terminal.

---

## share-server.ts

**What it does:** Deploys `helpers/share-loop.js` to one or more servers and runs it with max available threads on each. The share loop contributes that server's CPU to your current faction (or gang) to earn reputation when idle. The dedicated `cloud-share` server is _always_ included, plus any extra hostnames you pass as arguments. Requires `helpers/share-loop.js` to exist.

**How to run:**

```bash
run share-server.js                          # share on cloud-share
run share-server.js home                     # share on home + cloud-share
run share-server.js home cloud-1 cloud-2     # share on all listed + cloud-share
```

- **Args (optional):** Any number of hostnames to share from. `cloud-share` is always added automatically.

---

## startup.ts

**What it does:** Bootstraps the full automation stack on home, gated by what your current BitNode / SourceFiles allow. Always starts `open-all-ports`, `infiltrate`, `stockmaster`, `hacknet-opt` (1 level, 100% budget), and `home-opt`. If purchased servers are enabled, also launches `cloud-opt`.

Conditional on BitNode/SourceFiles:

- **SF2** — runs `gangs.js`.
- **SF3** — runs `corporation.js` with a stage-appropriate flag (`--round1 --auto`, `--round2 --benchmark`, `--round3 --benchmark`, or `--improveAllDivisions --benchmark`) plus `daemon.js --maintainCorporation`. Also runs `workaround.js --hud`.
- **SF4** — once available, grinds MegaCorp infiltration via `grind-infil.js` until you have ≥ $1B, then starts `backdoor.js`, `augs.js`, and `hack3.js`. Buys the TOR router and every dark-web program as funds allow.
- **SF6 / SF7** — runs `bladeburner.js`.
- **SF9** — runs `setup-hashnet.js` and `hash-servers.js` (and kills `hacknet-opt.js`).

Requires ~25 GB RAM on home. Starts everything and exits (does not keep running).

**How to run:**

```bash
run startup.js
```

- No parameters. Starts all scripts and exits. Requires the launched scripts to exist on home.

---

## stockmaster.ts

**What it does:** Automated stock market trading bot. Requires TIX API; buys 4S Market Data API when affordable. Uses forecast and volatility to buy long/short positions, manages diversification, and sells when expected return drops. Supports pre-4S trading via price-history-based forecasts and market-cycle detection.

**How to run:**

```bash
run stockmaster.js
run stockmaster.js --liquidate   # sell all and exit (or -l)
run stockmaster.js --mock        # simulate trades only
run stockmaster.js --noisy       # tprint each buy/sell
```

**Flags:**

- **`-l` / `--liquidate`:** Kill other instances, sell all positions, and exit
- **`--mock`:** Simulate trades without executing
- **`--noisy`:** Print each buy/sell
- **`--disable-shorts`:** Disable short positions (auto-off without SF8.2)
- **`--reserve`:** Fixed amount to keep as cash
- **`--fracB`:** Fraction of assets to keep liquid before buying (default 0.4)
- **`--fracH`:** Fraction to retain as cash when buying (default 0.2)
- **`--buy-threshold`:** Min expected return to buy (default 0.0001)
- **`--sell-threshold`:** Sell when return below this (default 0)
- **`--diversification`:** Max fraction of portfolio per stock (default 0.34)
- **`--disableHud`:** Disable stock value in HUD
- **`--disable-purchase-tix-api`:** Don't buy TIX API access
- **`--show-pre-4s-forecast` / `--show-market-summary`:** Show forecast table
- **`--buy-4s-budget`:** Max corpus fraction to spend on 4S API (default 0.8)

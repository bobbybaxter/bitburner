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

## hacknet-opt.ts

**What it does:** Optimizes HackNet node upgrades and purchases. Spends only within income earned from HackNet; when Formulas API is available, picks upgrades by best ROI (return on investment), otherwise picks cheapest. Buys new nodes when ROI compares favorably.

**How to run:**

```bash
run hacknet-opt.js              # default: 1 level per upgrade
run hacknet-opt.js 5            # upgrade 5 levels at a time for level upgrades
```

- **Arg 1 (optional):** `numLevels` — how many levels to buy per level upgrade (default: 1).

---

## pserv-opt.ts

**What it does:** Optimizes purchased servers. Buys new servers at increasing RAM tiers (128GB → 256GB → … up to 1PB) when you have the slots and funds. When at server limit, upgrades the smallest server by deleting and repurchasing. Only buys when cash ≥ cost / 0.25 (configurable `moneyThreshold`).

**How to run:**

```bash
run pserv-opt.js
```

- No parameters. Runs indefinitely. Config in code: `initialMulti` (7 = 128GB), `moneyThreshold` (0.25).

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

## contract-auto-solver.ts

**What it does:** Walks the network with a depth-first search and automatically solves any coding contracts (`.cct` files) found on each server. Uses the `solveContract` helper for each contract type. High RAM (27GB) due to contract solvers.

**How to run:**

```bash
run contract-auto-solver.js
```

- No parameters. Scans from home, visits every reachable server, and solves all contracts.

---

## scan.ts

**What it does:** Scans the network and prints a tree of servers with color-coded root access (lime = rooted, red = not), faction server colors (e.g. CSEC yellow, w0r1d_d43m0n red), and contract indicators (©). Hover shows req level, ports, RAM, security, money. Clicking a server inserts a connect command into the terminal.

**How to run:**

```bash
run scan.js
```

- No parameters. Output is appended to the terminal.

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

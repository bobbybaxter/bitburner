# Bitburner Scripts

[Bitburner](https://github.com/bitburner-official/bitburner-source) is a terminal-based, cyberpunk-themed incremental game where you hack servers, trade stocks, and infiltrate corporations—all via JavaScript/TypeScript. This repo is a suite of automation scripts for it.

## What's Here

Scripts for hacking (multi-host batching, worker coordination, optimal target selection), stock market trading, HackNet and purchased-server optimization, automated infiltration minigames, contract solving, network scanning, and faction sharing. Written in TypeScript with proper typing, modular structure, and shared helpers.

For employers: this project demonstrates scripting automation, algorithmic decision-making (e.g. batched hack scheduling, stock forecasts), and TypeScript in a constrained, game-like environment.

## Setup

```bash
npm install
npm run watch
```

Output goes to `dist/`. The watch command runs TypeScript compilation plus `bitburner-filesync` (see `filesync.json`).

### Connecting to the game

1. Install the **Bitburner Connector** extension (VS Code/Cursor).
2. In Bitburner: **Options → Remote API** — set hostname to `localhost` and port to `12525`.
3. Start `npm run watch`, then click **Connect** in the game.

Scripts in `dist/` sync to the game automatically.

## Running Scripts

This is not a single-script project. Different scripts serve different roles:

- **startup.js** — Launches the background stack (open-all-ports, infiltrate, stockmaster, hacknet-opt, pserv-opt). Requires ~25 GB RAM on home. One-shot; exits after spawning. Run this first to get the baseline automation going.
- **Hacking** — Run `hack0.js`, `hack1.js`, `hack2.js`, or `hack3.js` depending on your stage and RAM. Each has different targets and strategies.
- **Other scripts** — `scan.js`, `contract-auto-solver.js`, `share-server.js`, etc.

[script-guide.md](script-guide.md) has full docs: what each script does, arguments, RAM costs, and dependencies.

## For Bitburner Players

Fork freely. Scripts assume default game structure (`/helpers/`, `/scripts/`, `/constants/`). Some scripts need Formulas.exe or TIX API for full functionality. If something’s missing, check the guide or the script’s top-level comments.

# Bitburner Scripts

[Bitburner](https://github.com/bitburner-official/bitburner-source) is a terminal-based, cyberpunk-themed incremental game where you hack servers, trade stocks, and infiltrate corporations—all via JavaScript/TypeScript. This repo is a suite of automation scripts for it.

## What's Here

Scripts for hacking (multi-host batching, worker coordination, optimal target selection), stock market trading, HackNet and purchased-server optimization, automated infiltration minigames, contract solving, network scanning, and faction sharing. Written in TypeScript with proper typing, modular structure, and shared helpers.

For employers: this project demonstrates scripting automation, algorithmic decision-making (e.g. batched hack scheduling, stock forecasts), and TypeScript in a constrained, game-like environment.

## Setup

```bash
npm install
npm run dev
```

`npm run dev` runs [`viteburner`](https://github.com/Tanimodori/viteburner), which transpiles TypeScript with Vite and pushes scripts straight to the running Bitburner game over the Remote API WebSocket — no separate `dist/` step required. See `vite.config.ts` for the watch globs and the import resolver that lets TypeScript-style `.js` specifiers (e.g. `import { foo } from 'helpers/foo.js'`) resolve to their `.ts` sources.

### Legacy watch (filesync) workflow

The older `bitburner-filesync` flow is still wired up if you prefer it (or want to inspect the compiled output in `dist/`):

```bash
npm run watch
```

This runs `tsc -w`, a local file mirror, and `bitburner-filesync` concurrently. Config lives in `filesync.json`.

### Connecting to the game

1. In Bitburner: **Options → Remote API** — set hostname to `localhost` and port to `12525` (matches `filesync.json` and the viteburner default).
2. Start `npm run dev` (or `npm run watch`), then click **Connect** in the game.

Scripts sync to the game automatically.

## Running Scripts

This is not a single-script project. Different scripts serve different roles:

- **startup.js** — Launches the background stack (open-all-ports, infiltrate, stockmaster, hacknet-opt, cloud-opt). Requires ~25 GB RAM on home. One-shot; exits after spawning. Run this first to get the baseline automation going.
- **Hacking** — Run `hack0.js`, `hack1.js`, `hack2.js`, or `hack3.js` depending on your stage and RAM. Each has different targets and strategies.
- **Other scripts** — `scan.js`, `contract-auto-solver.js`, `share-server.js`, etc.

[script-guide.md](script-guide.md) has full docs: what each script does, arguments, RAM costs, and dependencies.

## For Bitburner Players

Fork freely. Scripts assume default game structure (`/helpers/`, `/scripts/`, `/constants/`). Some scripts need Formulas.exe or TIX API for full functionality. If something’s missing, check the guide or the script’s top-level comments.

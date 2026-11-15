# Ultimate Auction Arena V2

A local and real-time multiplayer auction game for 2–8 friends. Football Arena defaults to eleven players; Heroes Arena defaults to five heroes. This upgrades the existing React, TypeScript, Vite and Node/WebSocket application.

## Run on Windows

From this project directory in PowerShell:

```powershell
npm.cmd install
npm.cmd run build
$env:SERVER_PORT = '8788'
$env:DATA_FILE = 'server/data/rooms-v2.json'
npm.cmd start
```

Open **http://localhost:8788**. One server serves the website and `/ws`. Use `npm.cmd` if PowerShell blocks `npm.ps1`. Verified with Node v22.21.0.

For development, `npm.cmd run dev` starts Vite on 5173 and the backend on 8787. Override `PORT` and `SERVER_PORT` for other ports. Run either the production server or the development backend on the same port, not both. Friends on the same network can use the network URL printed by the server. Nothing has been publicly deployed.

| Command | Purpose |
| --- | --- |
| `npm.cmd test` | Engine, scoring, import, demo, image manifest, server, hardening and 8-player soak tests |
| `npm.cmd run typecheck` | Strict TypeScript checks, including tests and scripts |
| `npm.cmd run build` | Type-check, build the web client into `dist/` and bundle the server into `dist-server/` |
| `npm.cmd run build:web` | Web client only (what Netlify and Vercel run) |
| `npm.cmd start` | Run the bundled production server (`node dist-server/index.mjs`); needs no dev dependencies |
| `npm.cmd run start:ts` | Run the server straight from TypeScript, without bundling |
| `npm.cmd run test:all` | Typecheck, unit tests, build and every browser test |
| `npm.cmd run test:browser` | Desktop/mobile Chrome UI tests. Starts the production bundle on 8788 by itself (run the build first) |
| `npm.cmd run audit:assets` | Regenerate the per-card image audit and manifest |

Browser tests use installed Chrome on Windows. Set `PLAYWRIGHT_CHROME` to another Chromium executable, or install Playwright Chromium using `npx.cmd playwright install chromium`. Set `ARENA_URL` to test another running URL instead of the auto-started local bundle (the restart and split-hosting specs always start their own servers). No standalone lint task is configured.

## Deploying

**Netlify and Vercel can host the web client but not the game server** — online rooms need a
long-running WebSocket process, which neither platform runs. The supported shapes are:

- the web client on Netlify or Vercel plus the game server on Render (or Railway, Fly.io, a VPS), linked by `VITE_WS_URL` and `ALLOWED_ORIGINS`; or
- everything on one Render service (simplest: one URL, no variables).

`netlify.toml`, `vercel.json`, `render.yaml` and a `Dockerfile` are included. Follow the
[deployment guide](docs/DEPLOYMENT.md) step by step. Variables are listed in `.env.example`.

What was tested before deployment, and the defects that testing found and fixed, are in the
[test report](docs/TEST_REPORT.md).

## Features

- Two illustrated arena entrances, collectible cards, optional synthesized sounds, legendary reveals, sale celebrations and reduced-motion support.
- Local pass-and-play, private online rooms, server-validated bids, synchronized timers, anti-sniping, unsold re-auctions and token-based reconnection.
- FC 26, FC 27 and Prime Legends selectors with CSV/JSON import, provenance and strict exclusion of unverified data from official auctions.
- Six football formations, exact/secondary position fit, drag/tap/keyboard arrangement and goalkeeper-specific evaluation. Heroes retain role synergies and counter coverage.
- Head-to-head comparisons, championship awards, final lineups, a separate tactics preview, downloadable squad/result images and rematches.
- **Legends Auction — Friends Championship** preserves all 55 supplied purchases. Opening the demo does not overwrite a saved local match.

## Data and images

**No official FC dataset is bundled.** The 134 built-in footballers and nine demo-only additions use custom Prime Legends values. The 104 heroes use custom game-power values. FC 26/27 modes require complete, sourced imports and cannot start with an insufficient verified pool.

“Host verified” records the importer's source check. The app validates completeness and metadata; it does not independently check an EA page. See [manual import instructions](docs/RATING_IMPORT.md).

All 247 distinct characters currently use identity-based SVG fallbacks. There are **zero verified photographic/licensed character portraits**. Imported artwork supports attribution, lazy loading, public-next-card preloading and error fallback. Two original generated arena backgrounds are included. See [image audit](docs/card-image-audit.csv) and [asset manifest](docs/asset-manifest.json).

## Scoring

Football: **40% quality, 20% positional suitability, 15% tactical balance, 15% role coverage, 10% chemistry**.

Heroes: **40% capability, 25% synergy, 20% role balance, 15% strategic/counter coverage**.

Quality ratings normalize 70 → 0 and 96 → 100, clamped. Football goalkeepers blend 60% OVR and 40% keeper attributes; DIV/HAN/KIC/REF/SPD/POS weights are 20/15/10/25/10/20%. Named formations use exact positions and listed secondaries. Custom formations preserve broad-line fit. The same documented normalization applies consistently to the chosen rating mode; it is not EA's team-rating formula.

Football head-to-head attack, midfield and defense metrics use shooting, passing and defending respectively, adjusted by position fit. Goalkeeping uses the weighted keeper attributes.

Empty slots cost the configured penalty, capped at half of the points the team earned (so squads from an auction that ended early still rank by what they bought); mystery guesses add at most three points; totals stay within 0–100. Ranking uses complete squads first when enabled, then score, completeness, positional/role coverage and remaining budget; fully equal teams share a rank. Spending never determines quality. Championship results lock at completion; the tactics lab affects a preview only.

## Structure and saves

```text
src/       React screens, cards, tactical boards, transport and sound
shared/    Types, catalog/import pipeline, auction/scoring engine and demo
server/    HTTP/WebSocket server and JSON room persistence
public/    Generated arena background assets
tests/     Unit/server/soak tests and desktop/mobile browser tests (local, online, split hosting)
scripts/   Asset audit generator
docs/      Deployment guide, delivery report, import guide and asset audits
```

Local storage keys and anonymous online room tokens are preserved. There are no password/account features. The default room file is `server/data/rooms.json`; the V2 preview uses `server/data/rooms-v2.json` to preserve that original file. The source backup is `.backup/ultimate-auction-arena-pre-v2-20261115.zip`.

See [the delivery report](docs/V2_DELIVERY.md) for changed files, actual MCP usage, checks and remaining dependencies.

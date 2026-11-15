# Test report — in-depth pass before deployment

Run with `npm run test:all` (typecheck → unit/server tests → production build → browser tests).
Browser tests drive real Chrome against the **production bundle** on a 1440×1000 desktop and a
390×844 touch phone viewport.

## Result of the final run

| Stage | Result |
| --- | --- |
| Typecheck (strict, including tests) | Pass |
| Unit, server, hardening and soak tests | **105 passed**, 0 failed (9 files) |
| Production build (web client + server bundle) | Pass |
| Browser tests | **46 passed**, 0 failed, 2 skipped by design (the two layout tests set their own viewports, so they run once rather than once per device profile) |
| Clean checkout: `npm ci` → build → run bundle with no `node_modules` | Pass, 0 known vulnerabilities reported by npm |

## Test cases

### Engine, scoring and data (`tests/engine`, `scoring`, `upgrade`, `demo`, `imageManifest`, `regression`)

| Area | Cases |
| --- | --- |
| Budgets | Equal starting budgets; prices, increments and quick-bid steps scale with the budget |
| Bid validation | Too low, below increment, non-integer, negative, NaN, unknown player, over balance, over strict reserve |
| Fair bidding | Leader cannot raise own bid; simultaneous equal bids → one winner; duplicate submission counted once; late bid rejected |
| Timer | Anti-sniping extension; countdown expiry → SOLD or UNSOLD; early close when every rival passes; pause freezes everything |
| Rosters | Full squad blocked; strict formation slots and hero class limits enforced with a reason; lineup edits validated |
| End conditions | All squads complete; nobody can afford another card; pool exhausted; one reduced-price re-auction; host ends early |
| Integrity | Whole random auctions (both modes, 2–8 players): money conserved, no card owned twice, slot rules never broken |
| Mystery | Card identity and auction order hidden until reveal; correct guess scores capped points, never ownership |
| Scoring | Published weights; determinism; out-of-position and incomplete-squad penalties; complete squads rank first; full tie-break chain; shared victory |
| Persistence | Refresh recovery (serialise → suspend → resume) keeps deadline, leader and squads |
| Custom data | Rating edits, JSON/CSV import, unsafe image URLs dropped, built-in data never mutated |

### Server (`tests/server`, `hardening`, `soak`)

| Area | Cases |
| --- | --- |
| Rooms | Create with invite code; join; duplicate names; 8-player cap; ready-up; host-only start, kick, settings, rematch |
| Authority | Socket identity overrides a spoofed player id; unaffordable, late and duplicate bids rejected by the server |
| Presence | Disconnect keeps squad and budget; token rejoin; guessed tokens refused; host hand-over after 30 s |
| Secrecy | Hidden Mystery card never present in any frame sent to any client |
| Persistence | Restart restores rooms with the auction paused; stale tokens refused when nothing was saved |
| Hardening | Malformed URLs, path traversal, missing assets, oversized payloads, garbage frames, message floods, room cap, origin allow-list (incl. wildcards), health CORS, gzip, one broken room cannot stop the others |
| Soak | Eight scenarios of complete matches for 2, 3, 4, 5, 6 and 8 simulated clients — strict/casual, classic/mystery, both modes — with random bids, passes, guesses, hostile input, disconnects, reconnects and pauses. After **every** server tick: invariants hold and all connected clients see an identical match |

### Browser — local play (`arena`, `images`, `local-deep`) · desktop + phone

| Case |
| --- |
| Home, demo championship, comparisons, tactics lab, squad image download |
| Official rating mode stays empty without verified data; import rules |
| Mystery clues, private guess, reveal — Football and Heroes |
| Registration, bidding, budgets, refresh and result — Football and Heroes |
| Broken portrait falls back to generated art; next card preloaded |
| **Full strict Football match (2 players, 22 purchases) to its natural end** — both XIs complete and legal |
| **Full casual Heroes match (3 players) to its natural end** |
| Auction ends by itself when nobody can afford another card |
| Setup validation: duplicate/blank names, custom budget rescales prices, summary correct |
| Eight players: equal budgets, bid controls for all, leader cannot self-raise |
| Bid controls: every refusal explained (minimum, funds, strict reserve), quick steps, pause blocks bids |
| Rematch, switch game mode (players carried over), play again |
| Layout: bid amount, countdown and Place Bid never overlap or overflow at ten widths (360–1920 px); home, setup, join and results never scroll sideways |

### Browser — online multiplayer (`online`, `online-deep`, `online-lobby`, `online-split-hosting`)

| Case |
| --- |
| Two clients: create, join by link, ready, start, bid, refresh, identical result |
| **Three clients play a whole Heroes match to its natural end**: synchronised countdown, instant outbid on every screen, identical champion and awards everywhere; then rematch, kick, restart |
| Lobby rules: unknown code, duplicate name, **second tab in the same browser is a separate player**, refresh keeps the seat, late joiner refused |
| Dropped connection: shown offline to others, automatic reconnect, same seat, bid intact |
| Pause/resume: host only, mirrored on every client, clock really frozen |
| Mystery online: every WebSocket frame inspected — hidden card absent until reveal; guesses private |
| Phone-sized guest: join, bid, no sideways scrolling |
| Tab closed: rejoin from the home screen; "Forget" removes the shortcut |
| Host disappears: another player becomes host |
| **Server killed and restarted mid-auction** (production bundle): clients reconnect by themselves, auction returns paused with the bid intact |
| Host edits settings in the lobby (budget, timer, mode); guests see them and cannot edit |
| Host switches game mode between matches; ready-up resets |
| A player changes their own formation online; a rival's board is read-only |
| **Split hosting rehearsal** (static site on one address, WebSocket-only game server on another): invite link, join, bid, refresh |
| A site not on the allow-list is refused, with a clear message |
| A static site with no game server says so within seconds and still offers local play |

## Defects found and fixed in this pass

| # | Defect | Fix |
| --- | --- | --- |
| 1 | A malformed URL (`/%E0%A4%A`) threw inside the HTTP handler and **crashed the whole server**, ending every running match | Request handler guarded; returns 400 |
| 2 | An exception while ticking one room would stop the clock for every room | Per-room isolation |
| 3 | After a server restart without saved rooms, a reconnecting client stayed on a frozen screen forever | Lost session is now a clear, final error |
| 4 | "Forget" on the home screen did nothing until some other re-render | Fixed |
| 5 | Missing static asset returned the HTML app shell with status 200 | Real 404 |
| 6 | Every team scored 0.0 when an auction ended early, so the "champion" was decided only by tie-breaks | Empty-slot penalty capped at half of the points earned |
| 7 | `npm start` needed dev tooling (`tsx`) at runtime — it would fail on hosts that install production dependencies only | Server is bundled to `dist-server/index.mjs`; zero runtime dependencies |
| 8 | Client gave up on the server after ~6 s — shorter than a free-tier cold start | Wake-up probe, 75 s patience with a visible "waking" message, cancel button |
| 9 | A dead connection (sleeping phone, network switch) was not noticed until the next action | App-level heartbeat; instant reconnect on unlock / network return |
| 10 | Countdown ignored network latency | Clock offset corrected with round-trip time |
| 11 | Any website could open sockets to the game server | Optional `ALLOWED_ORIGINS` allow-list |
| 12 | Phone header: countdown label overlapped its ring | Label hidden at small size |
| 13 | Setup, lobby, auction header and results said "Avengers" while the home screen and README say "Heroes" | Wording aligned to "Heroes" |
| 14 | At tablet / small-laptop widths (1024–1279 px) the bid amount ran underneath the countdown ring | Two-column layout at that width; covered by a new test across ten widths from 360 to 1920 px |
| 16 | On 360 px phones — and on any phone once bids passed ₹1 lakh — the auction screen scrolled sideways | Bid amount scales with screen width, smaller countdown on narrow phones, single-column grid may shrink |
| 15 | The lobby showed a red error box ("needs between 2 and 8 participants") while the host was simply waiting for friends | Shown as the normal hint only |

No defect was found in the auction rules themselves: across every simulated and browser-driven
match, money was conserved, no card was owned twice and all clients agreed on the result.

## Not covered

- The real Netlify, Vercel and Render services (needs accounts) — only rehearsed locally.
- Physical phones, Safari and Firefox; real internet latency and packet loss.
- The `Dockerfile` (Docker was installed but its engine was not running on this machine).
- Load beyond a handful of simultaneous rooms.

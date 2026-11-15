# Deploying Ultimate Auction Arena

## The one thing to know first

The game has two parts:

| Part | What it is | Where it can run |
| --- | --- | --- |
| **Web client** | Static files in `dist/` (HTML, JS, CSS, two images) | Anywhere, including **Netlify** and **Vercel** |
| **Game server** | One long-running Node process holding WebSocket connections | A host that keeps a process alive: Render, Railway, Fly.io, Koyeb, a VPS |

**Netlify and Vercel cannot run the game server.** They run static files and short-lived serverless
functions; neither keeps a WebSocket server open. So online multiplayer always needs a second host
for the server. Local pass-and-play needs no server at all and works on Netlify/Vercel alone.

That leaves three sensible shapes:

| Option | Web client | Game server | Result |
| --- | --- | --- | --- |
| **A. Netlify + Render** | Netlify | Render | What was asked for. Two dashboards, two env vars. |
| **B. Vercel + Render** | Vercel | Render | Same as A with Vercel. |
| **C. Render only** | Render | Render (same service) | Simplest: one URL, no env vars, nothing to keep in sync. |

Option C is the least work and has the fewest ways to go wrong. A and B are fully supported and
tested (see "What was tested" below).

Everything needs the code in a Git repository (GitHub, GitLab or Bitbucket) that the hosts can read.

---

## Step 1 — Deploy the game server (all options)

On [Render](https://render.com): **New → Blueprint**, pick the repository. `render.yaml` in this
project configures the service. Or create a **Web Service** by hand with:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |

When it is live, note its address, for example `https://ultimate-auction-arena.onrender.com`.
Open `https://…onrender.com/health` — it should answer `{"ok":true,…}`.

**If you chose option C you are finished**: that address is the game. Share it.

Other hosts work the same way: build with `npm run build`, start with `npm start`, and let the
platform set `PORT`. For container hosts (Railway, Fly.io, Koyeb) use the included `Dockerfile`.

## Step 2 — Deploy the web client (options A and B)

**Netlify:** *Add new site → Import an existing project*, pick the repository. `netlify.toml`
already sets the build command (`npm run build:web`), the publish folder (`dist`) and the
single-page-app redirect.

**Vercel:** *Add New → Project*, pick the repository. `vercel.json` sets the same things.

On either host add one environment variable **before the first build** (or redeploy after adding it —
it is read at build time):

| Variable | Value |
| --- | --- |
| `VITE_WS_URL` | The game server address from step 1, e.g. `https://ultimate-auction-arena.onrender.com` |

## Step 3 — Tell the server which site may connect (options A and B)

On the game server (Render → Environment) set:

| Variable | Value |
| --- | --- |
| `ALLOWED_ORIGINS` | Your site address, e.g. `https://my-arena.netlify.app` |
| `SERVE_CLIENT` | `off` (optional: stops the server also serving its own copy of the site) |

Several sites are comma-separated. `https://*.vercel.app` or `https://*.netlify.app` allows every
preview deployment. A custom domain must be listed too. No trailing slash needed.

## Step 4 — Check it

1. Open the site, start a **local** match — proves the client deployed.
2. Create an **online** room, open the invite link on a phone (mobile data, not the same Wi-Fi), join, bid.
3. Refresh the phone mid-auction — it should come back to the same seat.

If online play shows "Could not reach the game server": check `VITE_WS_URL` (and redeploy the site
after changing it), check `ALLOWED_ORIGINS` matches the site address exactly, and open `/health` on
the server.

---

## Environment variables

**Web client — build time**

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_WS_URL` | same origin | Game server address. Accepts `https://host`, `wss://host/ws` or `host`. |

**Game server — start time**

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 8787 | Listening port; set by the hosting platform. `SERVER_PORT` overrides it. |
| `ALLOWED_ORIGINS` | any | Comma-separated sites allowed to open game sockets. |
| `SERVE_CLIENT` | on | `off` = WebSocket-only server. |
| `PERSIST` | on | `off` = keep rooms in memory only. |
| `DATA_FILE` | `server/data/rooms.json` | Where rooms are saved when persistence is on. |
| `MAX_ROOMS` | 500 | New rooms are refused beyond this. |
| `MAX_CONNECTIONS` | 2000 | New sockets are refused beyond this. |

---

## Things that will surprise you if nobody says them

- **Free hosts sleep.** Render's free plan stops the server after about 15 idle minutes. The next
  visitor waits up to a minute. The client handles this: it pings `/health` to wake the server,
  shows "Waking the game server…" and keeps trying for 75 seconds before giving up.
- **A sleeping or restarted free server forgets its rooms.** Free plans have no persistent disk, so
  a match in progress is lost if the server restarts. While people are playing the server stays
  awake, so this bites only between sessions. For restart-proof rooms use a plan with a disk, mount
  it, and point `DATA_FILE` at it with `PERSIST` on — running auctions then come back paused.
- **Run exactly one server instance.** Rooms live in that process's memory. Two instances would
  split players between them. Do not enable auto-scaling.
- **HTTPS site needs a secure socket.** The client turns an `https://` server address into `wss://`
  automatically. A plain `ws://` server will not work from an HTTPS site.
- **Changing `VITE_WS_URL` needs a rebuild** of the site; changing server variables needs only a restart.

---

## What was tested

Automated, on this machine, against the production build (`npm run build`):

- 105 engine/scoring/server tests, including whole matches for 2–8 simulated online players with
  random bids, bad input, disconnects and pauses.
- 46 browser tests in real Chrome on desktop and phone-sized viewports, including:
  - a three-player online match played to its natural finish, then rematch and kick;
  - a dropped connection, automatic reconnection, and a server restart mid-auction;
  - **a rehearsal of options A/B**: the client built with `VITE_WS_URL` and served from a plain
    static host on one address, the game server WebSocket-only on another with `ALLOWED_ORIGINS`
    set, including a site that is *not* on the allow-list being refused.

Also checked: a clean checkout installs with `npm ci`, builds, and the bundled server then runs
with no `node_modules` folder at all.

Not tested: the real Netlify, Vercel and Render services themselves (that needs your accounts),
the `Dockerfile` (Docker's engine was not running here), physical phones, Safari, and behaviour
under real internet latency. Full detail is in the [test report](TEST_REPORT.md).

Run the suites yourself:

```bash
npm run test:all
```

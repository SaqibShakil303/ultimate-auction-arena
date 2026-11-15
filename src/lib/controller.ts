// One interface, two transports. Screens never know whether the engine runs in this tab
// (local pass-and-play) or on the server (online rooms).

import type { Action, Card, ClientMsg, MatchState, PublicMatch, PublicRoom, RoomSettings, ServerMsg } from '../../shared/types';
import { act, suspend, tick, toPublic } from '../../shared/engine';

export interface Notice { id: number; text: string; tone: 'info' | 'error' | 'good' }

export interface Snap {
  demo?: boolean;
  kind: 'local' | 'online';
  status: 'local' | 'connecting' | 'open';
  slow?: boolean; // still connecting after a few seconds — the game server is probably waking up
  room: PublicRoom | null;
  match: PublicMatch | null;
  cards: Record<string, Card>;
  me: string | null; // null in local play: every participant is controlled from this device
  isHost: boolean;
  offset: number; // server clock − local clock
  pending: string | null; // bid awaiting server confirmation (optimistic UI)
  notice: Notice | null;
  fatal: string | null;
}

export interface Controller {
  subscribe(cb: () => void): () => void;
  get(): Snap;
  act(a: Action): void;
  send(m: ClientMsg): void;
  dispose(leave?: boolean): void;
}

let noticeSeq = 0;
const mkNotice = (text: string, tone: Notice['tone'] = 'error'): Notice => ({ id: ++noticeSeq, text, tone });

// ───────────────────────── local pass-and-play ─────────────────────────

const LOCAL_KEY = 'uaa.local.v1';
const LOCAL_BEAT = 'uaa.local.beat';
const ACTIVE_KEY = 'uaa.active';

export function loadLocal(): MatchState | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { savedAt: number; state: MatchState };
    if (!data.state?.config || !Array.isArray(data.state.participants)) return null;
    const beat = Number(localStorage.getItem(LOCAL_BEAT) || 0);
    suspend(data.state, Math.max(data.savedAt, beat)); // timers never expire while the tab was closed
    return data.state;
  } catch {
    return null;
  }
}
export function clearLocal() {
  localStorage.removeItem(LOCAL_KEY);
  localStorage.removeItem(LOCAL_BEAT);
}
// The 'active' marker is per-tab (sessionStorage): a refresh restores this tab's match, while a second tab starts clean.
export const getActive = () => sessionStorage.getItem(ACTIVE_KEY);
export const setActive = (v: 'local' | 'online' | null) => (v ? sessionStorage.setItem(ACTIVE_KEY, v) : sessionStorage.removeItem(ACTIVE_KEY));

export function createLocal(state: MatchState, persist = true): Controller {
  const subs = new Set<() => void>();
  let notice: Notice | null = null;
  let snap: Snap;
  const build = () => {
    snap = {
      kind: 'local', demo: !persist, status: 'local', room: null, match: toPublic(state, null), cards: state.cards,
      me: null, isHost: true, offset: 0, pending: null, notice, fatal: null,
    };
  };
  const save = () => {
    if (!persist) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ savedAt: Date.now(), state }));
    } catch {
      /* storage full or unavailable — the match still works, it just cannot be restored */
    }
  };
  const emit = () => {
    build();
    save();
    subs.forEach((f) => f());
  };
  build();
  save();
  const timer = setInterval(() => {
    if (tick(state, Date.now())) emit();
  }, 100);
  const beat = setInterval(() => {
    if (!persist) return;
    try { localStorage.setItem(LOCAL_BEAT, String(Date.now())); } catch { /* ignore */ }
  }, 1000);
  return {
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    get: () => snap,
    act(a) {
      const now = Date.now();
      const r = act(state, a, now);
      tick(state, now);
      notice = r.ok ? null : mkNotice(r.message);
      emit();
    },
    send() { /* no server in local play */ },
    dispose() { clearInterval(timer); clearInterval(beat); },
  };
}

// ───────────────────────── online rooms ─────────────────────────

const ONLINE_KEY = 'uaa.online.v1';
export type OnlineIntent =
  | { type: 'create'; name: string; team: string; settings: RoomSettings }
  | { type: 'join'; code: string; name: string; team: string }
  | { type: 'rejoin'; code: string; token: string };

export interface OnlineSession { code: string; token: string; name?: string }
function readSession(store: Storage): OnlineSession | null {
  try {
    const s = JSON.parse(store.getItem(ONLINE_KEY) || 'null');
    return s && typeof s.code === 'string' && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}
/** This tab's live room session — survives a refresh. */
export const loadOnlineSession = () => readSession(sessionStorage);
/** The last room joined from this browser — lets a player come back after closing the tab. */
export const loadSavedOnline = () => readSession(localStorage);
export const clearOnlineSession = () => { sessionStorage.removeItem(ONLINE_KEY); localStorage.removeItem(ONLINE_KEY); };
function storeSession(s: OnlineSession) {
  const raw = JSON.stringify(s);
  sessionStorage.setItem(ONLINE_KEY, raw);
  localStorage.setItem(ONLINE_KEY, raw);
}

export function wsUrl(): string {
  const env = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (env) {
    // Accept "https://host", "host" or a full "wss://host/ws" so a pasted server address just works.
    let u = env.replace(/^http/i, 'ws');
    if (!/^wss?:\/\//i.test(u)) u = `wss://${u}`;
    return /\/ws\/?$/.test(u) ? u.replace(/\/$/, '') : `${u.replace(/\/+$/, '')}/ws`;
  }
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
/** HTTP address of the game server — used to wake a sleeping free-tier host before the socket connects. */
export function healthUrl(): string {
  return wsUrl().replace(/^ws/i, 'http').replace(/\/ws$/, '/health');
}
const isLocalHost = (host: string) => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(host);

const PING_EVERY_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;
const FATAL_CODES = ['no-session', 'replaced', 'no-room', 'busy'];

export function createOnline(intent: OnlineIntent): Controller {
  const subs = new Set<() => void>();
  let snap: Snap = {
    kind: 'online', status: 'connecting', room: null, match: null, cards: {}, me: null, isHost: false,
    offset: 0, pending: null, notice: null, fatal: null,
  };
  let ws: WebSocket | null = null;
  let session: OnlineSession | null = intent.type === 'rejoin' ? { code: intent.code, token: intent.token } : null;
  let disposed = false;
  let everOpen = false;
  let attempts = 0;
  const firstAttemptAt = Date.now();
  // A free-tier server can take up to a minute to wake; a local one answers (or refuses) instantly.
  let serverHost = '';
  try { serverHost = new URL(wsUrl()).hostname; } catch { /* handled by connect() */ }
  const patience = isLocalHost(serverHost) ? 6_000 : 75_000;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;
  let slowTimer: ReturnType<typeof setTimeout> | null = null;
  let pingSeq = 0;
  let pingSentAt = 0;
  let bestRtt = Infinity;
  let healthOk = false; // the server answered over HTTP, so a refused socket is a configuration problem, not downtime

  const set = (patch: Partial<Snap>) => {
    snap = { ...snap, ...patch };
    subs.forEach((f) => f());
  };
  const raw = (m: ClientMsg) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const stopTimers = () => {
    if (pingTimer) clearInterval(pingTimer);
    if (pongTimer) clearTimeout(pongTimer);
    pingTimer = null;
    pongTimer = null;
  };
  const cleanup = () => {
    stopTimers();
    if (retryTimer) clearTimeout(retryTimer);
    if (pendingTimer) clearTimeout(pendingTimer);
    if (slowTimer) clearTimeout(slowTimer);
    window.removeEventListener('online', nudge);
    document.removeEventListener('visibilitychange', nudge);
  };
  const fatal = (text: string) => {
    disposed = true;
    cleanup();
    ws?.close();
    set({ fatal: text, status: 'connecting', pending: null });
  };
  const ping = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    pingSentAt = Date.now();
    const sock = ws;
    raw({ t: 'ping', id: ++pingSeq });
    if (pongTimer) clearTimeout(pongTimer);
    // No answer → the connection is dead even though the browser has not noticed (sleeping phone, network switch).
    pongTimer = setTimeout(() => { if (ws === sock) sock.close(); }, PONG_TIMEOUT_MS);
  };

  const onMsg = (m: ServerMsg) => {
    switch (m.t) {
      case 'pong': {
        if (pongTimer) clearTimeout(pongTimer);
        if (m.id !== pingSeq) break;
        const rtt = Date.now() - pingSentAt;
        if (rtt <= bestRtt) {
          bestRtt = rtt;
          set({ offset: Math.round(m.now + rtt / 2 - Date.now()) }); // latency-corrected server clock
        }
        break;
      }
      case 'joined':
        session = { code: m.code, token: m.token };
        storeSession(session);
        setActive('online');
        set({ me: m.pid });
        break;
      case 'catalog': {
        const cards: Record<string, Card> = {};
        for (const c of m.cards) cards[c.id] = c;
        set({ cards });
        break;
      }
      case 'state': {
        const confirmed = snap.pending && m.match?.bids.some((b) => b.id === snap.pending);
        const mine = m.room.members.find((x) => x.id === snap.me);
        if (session && mine && session.name !== mine.name) { session = { ...session, name: mine.name }; storeSession(session); }
        set({
          room: m.room, match: m.match, isHost: m.room.hostId === snap.me,
          offset: bestRtt === Infinity ? m.now - Date.now() : snap.offset,
          pending: confirmed || !m.match?.lot ? null : snap.pending,
        });
        break;
      }
      case 'reject':
        set({ notice: mkNotice(m.message), pending: m.bidId && m.bidId === snap.pending ? null : snap.pending });
        break;
      case 'kicked':
        clearOnlineSession();
        fatal('The host removed you from the room.');
        break;
      case 'error':
        if (m.code === 'no-session') clearOnlineSession();
        if (!snap.me || FATAL_CODES.includes(m.code)) fatal(m.message);
        else set({ notice: mkNotice(m.message) });
        break;
    }
  };

  const connect = () => {
    if (disposed || (ws && ws.readyState <= WebSocket.OPEN)) return;
    if (retryTimer) clearTimeout(retryTimer);
    set({ status: 'connecting' });
    let sock: WebSocket;
    try {
      sock = new WebSocket(wsUrl());
    } catch {
      return fatal('Could not open a connection to the game server. Check the server address.');
    }
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      everOpen = true;
      attempts = 0;
      bestRtt = Infinity;
      set({ status: 'open', slow: false });
      if (session) raw({ t: 'rejoin', code: session.code, token: session.token });
      else if (intent.type === 'create') raw({ t: 'create', name: intent.name, team: intent.team, settings: intent.settings });
      else if (intent.type === 'join') raw({ t: 'join', code: intent.code, name: intent.name, team: intent.team });
      stopTimers();
      ping();
      pingTimer = setInterval(ping, PING_EVERY_MS);
    };
    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      try { onMsg(JSON.parse(String(ev.data)) as ServerMsg); } catch { /* ignore malformed frames */ }
    };
    sock.onclose = () => {
      if (disposed || ws !== sock) return;
      ws = null;
      stopTimers();
      attempts++;
      if (!everOpen && healthOk && attempts >= 3) {
        return fatal('The game server is running but refused the connection from this site. If you run this site, add its address to the ALLOWED_ORIGINS setting of the server.');
      }
      if (!everOpen && Date.now() - firstAttemptAt > patience) {
        return fatal(
          'Could not reach the game server. It may be offline or still starting up — wait a minute and try again. Local Pass-and-Play works without it.'
          + (import.meta.env.DEV ? ' (Developer note: start it with "npm run dev".)' : ''),
        );
      }
      set({ status: 'connecting', pending: null });
      retryTimer = setTimeout(connect, Math.min(5000, 300 * 2 ** Math.min(attempts, 5))); // reconnect with backoff
    };
  };
  /** Phone unlocked, tab re-focused or network back: reconnect now instead of waiting for the backoff timer. */
  function nudge() {
    if (disposed || document.visibilityState === 'hidden') return;
    if (!ws || ws.readyState > WebSocket.OPEN) connect();
    else if (ws.readyState === WebSocket.OPEN) ping();
  }
  window.addEventListener('online', nudge);
  document.addEventListener('visibilitychange', nudge);
  slowTimer = setTimeout(() => { if (!everOpen && !disposed) set({ slow: true }); }, 3500);
  // Probe the server over plain HTTP. This wakes a sleeping free-tier host, and it also tells a
  // real game server apart from a static site that merely answers every path with its app shell
  // (a Netlify/Vercel deployment where VITE_WS_URL was never set).
  void fetch(healthUrl(), { cache: 'no-store' })
    .then((r) => r.json().then((j: { ok?: boolean }) => !!j?.ok, () => false))
    .then((isGameServer) => {
      healthOk = isGameServer;
      if (!isGameServer && !everOpen && !disposed) {
        fatal('Online rooms are not available on this site yet: no game server is connected to it. Local Pass-and-Play works right now.'
          + (import.meta.env.DEV ? ' (Developer note: start the server with "npm run dev".)' : ''));
      }
    })
    .catch(() => undefined); // unreachable or still waking: the socket keeps retrying within its patience window
  connect();

  return {
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    get: () => snap,
    act(a) {
      if (snap.status !== 'open') return set({ notice: mkNotice('Reconnecting… your action was not sent.'), pending: null });
      if (a.type === 'bid') {
        set({ pending: a.bidId, notice: null }); // optimistic feedback until the server confirms or rejects
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => { if (snap.pending === a.bidId) set({ pending: null }); }, 4000);
      }
      raw({ t: 'action', action: a });
    },
    send: raw,
    dispose(leave) {
      disposed = true;
      cleanup();
      if (leave) { raw({ t: 'leave' }); clearOnlineSession(); }
      const sock = ws;
      setTimeout(() => sock?.close(), 50);
    },
  };
}

// Room manager: the server-authoritative home of every online match.
// Node processes messages one at a time, so each bid is validated and applied atomically —
// two simultaneous bids can never both win, and money can never be deducted twice.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Card, ClientMsg, MatchState, PublicRoom, RoomSettings, ServerMsg } from '../shared/types';
import { HOST_ACTIONS } from '../shared/types';
import { act, buildPool, createMatch, suspend, tick, toPublic, validateSetup } from '../shared/engine';
import { applyCustom, getCatalog } from '../shared/catalog';
import { sanitizeAction, sanitizeSettings } from '../shared/config';

export interface Conn {
  id: string;
  send(msg: ServerMsg): void;
}

interface Member {
  id: string;
  token: string;
  name: string;
  team: string;
  ready: boolean;
  connected: boolean;
  connId: string | null;
  lastSeen: number;
}

interface Room {
  code: string;
  hostId: string;
  members: Member[];
  settings: RoomSettings;
  match: MatchState | null;
  createdAt: number;
  updatedAt: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOST_GRACE_MS = 30_000;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const LOBBY_TTL_MS = 2 * 60 * 60 * 1000; // abandoned lobbies are cleaned up sooner than matches
const cleanName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);

export class RoomManager {
  rooms = new Map<string, Room>();
  private conns = new Map<string, { conn: Conn; code: string | null; pid: string | null }>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private nowFn: () => number;
  private persistPath: string | null;
  private maxRooms: number;

  constructor(opts: { now?: () => number; persistPath?: string | null; maxRooms?: number } = {}) {
    this.nowFn = opts.now ?? Date.now;
    this.maxRooms = opts.maxRooms ?? 500;
    this.persistPath = opts.persistPath ?? null;
    this.load();
  }

  now() {
    return this.nowFn();
  }

  connect(conn: Conn) {
    this.conns.set(conn.id, { conn, code: null, pid: null });
  }

  disconnect(connId: string) {
    const c = this.conns.get(connId);
    this.conns.delete(connId);
    if (!c?.code) return;
    const room = this.rooms.get(c.code);
    const m = room?.members.find((x) => x.id === c.pid);
    if (!room || !m || m.connId !== connId) return;
    m.connected = false;
    m.connId = null;
    m.lastSeen = this.now();
    this.syncPresence(room);
    this.broadcast(room);
  }

  private pool(room: Room): Card[] {
    const cfg = room.settings.config;
    return buildPool(applyCustom(getCatalog(cfg.mode), room.settings.custom, cfg.mode), cfg);
  }

  private publicRoom(room: Room): PublicRoom {
    let errors: string[] = [];
    let warnings: string[] = [];
    let poolSize = 0;
    if (room.match) poolSize = Object.keys(room.match.cards).length;
    else {
      const pool = this.pool(room);
      const v = validateSetup(room.settings.config, room.members.map((m) => m.name), pool);
      poolSize = pool.length;
      errors = v.errors;
      warnings = v.warnings;
    }
    return {
      code: room.code,
      hostId: room.hostId,
      members: room.members.map((m) => ({ id: m.id, name: m.name, team: m.team, ready: m.ready, connected: m.connected })),
      settings: room.match ? { config: room.match.config, custom: { edits: {}, imported: [] } } : room.settings,
      inMatch: !!room.match,
      poolSize, errors, warnings,
    };
  }

  private syncPresence(room: Room) {
    if (!room.match) return;
    for (const p of room.match.participants) {
      const m = room.members.find((x) => x.id === p.id);
      p.connected = !!m?.connected;
    }
  }

  private broadcast(room: Room) {
    const now = this.now();
    const pub = this.publicRoom(room);
    for (const m of room.members) {
      const c = m.connId ? this.conns.get(m.connId) : null;
      if (c) c.conn.send({ t: 'state', room: pub, match: room.match ? toPublic(room.match, m.id) : null, now });
    }
    room.updatedAt = now;
    this.scheduleSave();
  }

  private attach(connId: string, room: Room, m: Member) {
    const c = this.conns.get(connId);
    if (!c) return;
    if (m.connId && m.connId !== connId) {
      const old = this.conns.get(m.connId);
      if (old) { old.code = null; old.pid = null; old.conn.send({ t: 'error', code: 'replaced', message: 'You joined from another tab or device.' }); }
    }
    c.code = room.code;
    c.pid = m.id;
    m.connId = connId;
    m.connected = true;
    m.lastSeen = this.now();
    c.conn.send({ t: 'joined', code: room.code, pid: m.id, token: m.token });
    if (room.match) c.conn.send({ t: 'catalog', cards: Object.values(room.match.cards) });
    this.syncPresence(room);
    this.broadcast(room);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private newMember(name: string, team: string): Member {
    return {
      id: 'p-' + crypto.randomBytes(5).toString('hex'), token: crypto.randomBytes(18).toString('hex'),
      name, team: team || `Team ${name}`, ready: false, connected: true, connId: null, lastSeen: this.now(),
    };
  }

  handle(connId: string, raw: unknown) {
    const c = this.conns.get(connId);
    if (!c || !raw || typeof raw !== 'object') return;
    const msg = raw as ClientMsg;
    // Keep-alive + clock sync. Answered before anything else so it works in every state.
    if (msg.t === 'ping') return c.conn.send({ t: 'pong', id: Number(msg.id) || 0, now: this.now() });
    const err = (code: string, message: string) => c.conn.send({ t: 'error', code, message });
    const reject = (code: string, message: string, bidId?: string) => c.conn.send({ t: 'reject', code, message, bidId });

    if (msg.t === 'create') {
      const name = cleanName(msg.name);
      if (!name) return err('name', 'Enter a display name.');
      if (this.rooms.size >= this.maxRooms) return err('busy', 'The server is hosting the maximum number of rooms right now. Please try again in a few minutes.');
      const room: Room = {
        code: this.newCode(), hostId: '', members: [], settings: sanitizeSettings(msg.settings, 'online'),
        match: null, createdAt: this.now(), updatedAt: this.now(),
      };
      const m = this.newMember(name, cleanName(msg.team));
      m.ready = true;
      room.hostId = m.id;
      room.members.push(m);
      this.rooms.set(room.code, room);
      return this.attach(connId, room, m);
    }
    if (msg.t === 'join') {
      const room = this.rooms.get(String(msg.code || '').toUpperCase().trim());
      const name = cleanName(msg.name);
      if (!room) return err('no-room', 'Room not found. Check the invite code.');
      if (!name) return err('name', 'Enter a display name.');
      if (room.match) return err('in-match', 'This match has already started. Players already in it can rejoin from their original device.');
      if (room.members.length >= 8) return err('full', 'This room is full (8 players).');
      if (room.members.some((x) => x.name.toLowerCase() === name.toLowerCase())) return err('name', 'That name is already taken in this room.');
      const m = this.newMember(name, cleanName(msg.team));
      room.members.push(m);
      return this.attach(connId, room, m);
    }
    if (msg.t === 'rejoin') {
      const room = this.rooms.get(String(msg.code || '').toUpperCase().trim());
      const m = room?.members.find((x) => x.token === msg.token);
      if (!room || !m) return err('no-session', 'Your previous session could not be restored.');
      return this.attach(connId, room, m);
    }

    const room = c.code ? this.rooms.get(c.code) : undefined;
    const me = room?.members.find((x) => x.id === c.pid);
    if (!room || !me) return err('no-room', 'You are not in a room.');
    const isHost = me.id === room.hostId;

    switch (msg.t) {
      case 'ready':
        if (room.match) return;
        me.ready = !!msg.ready;
        return this.broadcast(room);
      case 'settings':
        if (!isHost) return reject('forbidden', 'Only the host can change match settings.');
        if (room.match) return reject('locked', 'Settings are locked once the match starts.');
        room.settings = sanitizeSettings(msg.settings, 'online');
        return this.broadcast(room);
      case 'kick': {
        if (!isHost) return reject('forbidden', 'Only the host can remove players.');
        if (room.match) return reject('locked', 'Players cannot be removed during a match.');
        const target = room.members.find((x) => x.id === msg.pid);
        if (!target || target.id === room.hostId) return;
        room.members = room.members.filter((x) => x !== target);
        const tc = target.connId ? this.conns.get(target.connId) : null;
        if (tc) { tc.code = null; tc.pid = null; tc.conn.send({ t: 'kicked' }); }
        return this.broadcast(room);
      }
      case 'start': {
        if (!isHost) return reject('forbidden', 'Only the host can start the match.');
        if (room.match && room.match.phase !== 'finished') return reject('locked', 'A match is already running.');
        const notReady = room.members.filter((x) => x.id !== room.hostId && (!x.ready || !x.connected));
        if (notReady.length) return reject('not-ready', `Waiting for: ${notReady.map((x) => x.name).join(', ')}`);
        const pool = this.pool(room);
        const check = validateSetup(room.settings.config, room.members.map((x) => x.name), pool);
        if (check.errors.length) return reject('setup', check.errors[0]);
        const cfg = { ...room.settings.config, play: 'online' as const, seed: crypto.randomInt(1, 2 ** 31 - 1) };
        room.match = createMatch(cfg, room.members.map((x) => ({ id: x.id, name: x.name, team: x.team })), pool, this.now());
        this.syncPresence(room);
        const cards = Object.values(room.match.cards);
        for (const m of room.members) {
          const mc = m.connId ? this.conns.get(m.connId) : null;
          if (mc) mc.conn.send({ t: 'catalog', cards });
        }
        return this.broadcast(room);
      }
      case 'action': {
        if (!room.match) return reject('closed', 'No match is running.');
        const a = sanitizeAction(msg.action, me.id);
        if (!a) return reject('invalid', 'Unknown action.');
        const bidId = a.type === 'bid' ? a.bidId : undefined;
        if (HOST_ACTIONS.includes(a.type) && !isHost) return reject('forbidden', 'Only the host can do that.', bidId);
        const now = this.now();
        const r = act(room.match, a, now); // validated before the clock advances, so late bids are reported as late
        tick(room.match, now);
        if (!r.ok) {
          reject(r.code, r.message, bidId);
          return this.broadcast(room);
        }
        return this.broadcast(room);
      }
      case 'rematch':
        if (!isHost) return reject('forbidden', 'Only the host can start a rematch.');
        if (room.match && room.match.phase !== 'finished') return reject('locked', 'The current match is still running.');
        room.match = null;
        room.members = room.members.filter((x) => x.connected);
        for (const m of room.members) m.ready = m.id === room.hostId;
        return this.broadcast(room);
      case 'leave': {
        c.code = null;
        c.pid = null;
        if (room.match && room.match.phase !== 'finished') {
          me.connected = false;
          me.connId = null;
          me.lastSeen = this.now();
          this.syncPresence(room);
        } else {
          room.members = room.members.filter((x) => x !== me);
          if (!room.members.length) { this.rooms.delete(room.code); this.scheduleSave(); return; }
          if (isHost) room.hostId = (room.members.find((x) => x.connected) ?? room.members[0]).id;
        }
        return this.broadcast(room);
      }
    }
  }

  /** Advances every running auction from the server clock. Called ~10×/second. */
  tickAll() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      try {
        this.tickRoom(room, now);
      } catch (e) {
        // One broken room must never stop the clock for every other room.
        console.error('[room ' + room.code + '] tick failed:', (e as Error).message);
      }
    }
  }

  private tickRoom(room: Room, now: number) {
    {
      let dirty = false;
      if (room.match && tick(room.match, now)) dirty = true;
      const host = room.members.find((m) => m.id === room.hostId);
      if (host && !host.connected && now - host.lastSeen > HOST_GRACE_MS) {
        const next = room.members.find((m) => m.connected);
        if (next) { room.hostId = next.id; next.ready = true; dirty = true; }
      }
      if (dirty) this.broadcast(room);
      const ttl = room.match && room.match.phase !== 'finished' ? ROOM_TTL_MS : LOBBY_TTL_MS;
      if (now - room.updatedAt > ttl && !room.members.some((m) => m.connected)) {
        this.rooms.delete(room.code);
        this.scheduleSave();
      }
    }
  }

  // ───── persistence: rooms survive a server restart (running auctions come back paused) ─────

  private scheduleSave() {
    if (!this.persistPath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 400);
  }

  saveNow() {
    if (!this.persistPath) return;
    try {
      fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
      const data = { savedAt: this.now(), rooms: [...this.rooms.values()] };
      const tmp = this.persistPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.persistPath);
    } catch (e) {
      console.error('[persist] save failed:', (e as Error).message);
    }
  }

  private load() {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf8')) as { savedAt: number; rooms: Room[] };
      for (const room of data.rooms || []) {
        if (this.now() - room.updatedAt > ROOM_TTL_MS) continue;
        for (const m of room.members) { m.connected = false; m.connId = null; }
        if (room.match) {
          suspend(room.match, data.savedAt);
          for (const p of room.match.participants) p.connected = false;
        }
        this.rooms.set(room.code, room);
      }
      if (this.rooms.size) console.log(`[persist] restored ${this.rooms.size} room(s)`);
    } catch (e) {
      console.error('[persist] load failed:', (e as Error).message);
    }
  }

  dispose() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }
}

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import type { ClientMsg, PublicMatch, PublicRoom, ServerMsg } from '../shared/types';
import { defaultConfig, INTRO_MS, RESULT_MS } from '../shared/engine';
import { RoomManager } from '../server/rooms';
import { startServer, type ServerHandle } from '../server/app';

/** A mock multiplayer participant talking to the RoomManager without a network. */
class Client {
  msgs: ServerMsg[] = [];
  pid = '';
  token = '';
  code = '';
  constructor(private mgr: RoomManager, public id: string) {
    mgr.connect({ id, send: (m) => this.receive(m) });
  }
  private receive(m: ServerMsg) {
    this.msgs.push(m);
    if (m.t === 'joined') { this.pid = m.pid; this.token = m.token; this.code = m.code; }
  }
  send(m: ClientMsg) { this.mgr.handle(this.id, m); }
  get room(): PublicRoom { return [...this.msgs].reverse().find((m) => m.t === 'state')!.room as PublicRoom; }
  get match(): PublicMatch { return ([...this.msgs].reverse().find((m) => m.t === 'state') as { match: PublicMatch }).match; }
  last(t: ServerMsg['t']) { return [...this.msgs].reverse().find((m) => m.t === t) as any; }
  bid(amount: number, bidId = `${this.id}-${amount}`) { this.send({ t: 'action', action: { type: 'bid', pid: 'spoofed', amount, bidId } }); }
}

function world(over = {}) {
  const clock = { t: 5_000_000 };
  const mgr = new RoomManager({ now: () => clock.t });
  const settings = { config: { ...defaultConfig('football'), shuffle: false, ...over }, custom: { edits: {}, imported: [] } };
  const host = new Client(mgr, 'c1');
  host.send({ t: 'create', name: 'Saqib', team: 'Royal Strikers', settings });
  const join = (id: string, name: string) => {
    const c = new Client(mgr, id);
    c.send({ t: 'join', code: host.code, name, team: '' });
    return c;
  };
  const run = (ms: number) => { clock.t += ms; mgr.tickAll(); };
  return { mgr, clock, host, join, run };
}

describe('online rooms', () => {
  it('creates a room with a short invite code and a ready-up lobby', () => {
    const w = world();
    expect(w.host.code).toMatch(/^[A-Z2-9]{5}$/);
    const rahul = w.join('c2', 'Rahul');
    expect(w.host.room.members.map((m) => m.name)).toEqual(['Saqib', 'Rahul']);
    expect(w.host.room.hostId).toBe(w.host.pid);
    const dup = w.join('c3', 'rahul');
    expect(dup.last('error').code).toBe('name');

    rahul.send({ t: 'start' });
    expect(rahul.last('reject').code).toBe('forbidden'); // only the host can start
    w.host.send({ t: 'start' });
    expect(w.host.last('reject').code).toBe('not-ready');
    rahul.send({ t: 'ready', ready: true });
    w.host.send({ t: 'start' });
    expect(w.host.room.inMatch).toBe(true);
    expect(w.host.last('catalog').cards.length).toBeGreaterThanOrEqual(80);
    expect(w.host.match.participants.map((p) => p.budget)).toEqual([1_000_000, 1_000_000]);

    const late = w.join('c4', 'Aman');
    expect(late.last('error').code).toBe('in-match');
  });

  it('lets the host remove players only before play begins', () => {
    const w = world();
    const rahul = w.join('c2', 'Rahul');
    const aman = w.join('c3', 'Aman');
    aman.send({ t: 'kick', pid: rahul.pid });
    expect(aman.last('reject').code).toBe('forbidden');
    w.host.send({ t: 'kick', pid: aman.pid });
    expect(aman.last('kicked')).toBeTruthy();
    expect(w.host.room.members).toHaveLength(2);
    rahul.send({ t: 'ready', ready: true });
    w.host.send({ t: 'start' });
    w.host.send({ t: 'kick', pid: rahul.pid });
    expect(w.host.last('reject').code).toBe('locked');
    w.host.send({ t: 'settings', settings: { config: defaultConfig('avengers'), custom: { edits: {}, imported: [] } } });
    expect(w.host.last('reject').code).toBe('locked');
  });

  function started(over = {}) {
    const w = world(over);
    const rahul = w.join('c2', 'Rahul');
    const aman = w.join('c3', 'Aman');
    rahul.send({ t: 'ready', ready: true });
    aman.send({ t: 'ready', ready: true });
    w.host.send({ t: 'start' });
    w.run(INTRO_MS);
    return { ...w, rahul, aman };
  }

  it('resolves concurrent bids on the server: one winner, one rejection, same view for everyone', () => {
    const w = started();
    expect(w.host.match.phase).toBe('bidding');
    w.rahul.bid(50_000);
    w.aman.bid(50_000); // same instant, same amount
    expect(w.aman.last('reject')).toMatchObject({ code: 'low', bidId: 'c3-50000' });
    for (const c of [w.host, w.rahul, w.aman]) {
      expect(c.match.lot).toMatchObject({ bid: 50_000, leader: w.rahul.pid, bidCount: 1 });
      expect(c.match.lot!.deadline).toBe(w.host.match.lot!.deadline);
    }
  });

  it('ignores spoofed identities and rejects unaffordable or duplicate bids', () => {
    const w = started();
    w.rahul.bid(60_000, 'dup-1'); // action.pid was "spoofed" — the server uses the socket identity
    expect(w.host.match.lot!.leader).toBe(w.rahul.pid);
    w.rahul.bid(60_000, 'dup-1');
    expect(w.host.match.totalBids).toBe(1);
    w.aman.bid(5_000_000);
    expect(w.aman.last('reject').code).toBe('funds');
    w.aman.send({ t: 'action', action: { type: 'pause' } });
    expect(w.aman.last('reject').code).toBe('forbidden');
    w.aman.send({ t: 'action', action: { type: 'hammer' } });
    expect(w.aman.last('reject').code).toBe('forbidden');
  });

  it('rejects late bids and sells the card exactly once', () => {
    const w = started({ timerSec: 10 });
    w.rahul.bid(50_000);
    w.clock.t = w.host.match.lot!.deadline + 5; // the deadline passed between server ticks
    w.aman.bid(90_000);
    expect(w.aman.last('reject').code).toBe('late');
    expect(w.host.match.last).toMatchObject({ type: 'sold', pid: w.rahul.pid, price: 50_000 });
    const rahul = w.host.match.participants.find((p) => p.id === w.rahul.pid)!;
    expect(rahul.budget).toBe(950_000);
    expect(rahul.squad).toHaveLength(1);
    expect(w.host.match.sales).toHaveLength(1);
  });

  it('keeps a disconnected player’s squad and budget for their return', () => {
    const w = started({ timerSec: 10 });
    w.rahul.bid(70_000);
    w.run(10_000);
    w.mgr.disconnect('c2');
    expect(w.host.match.participants.find((p) => p.id === w.rahul.pid)!.connected).toBe(false);
    w.run(RESULT_MS + 4000); // the auction carries on without them

    const back = new Client(w.mgr, 'c2-new-socket');
    back.send({ t: 'rejoin', code: w.host.code, token: w.rahul.token });
    expect(back.pid).toBe(w.rahul.pid);
    expect(back.last('catalog').cards.length).toBeGreaterThan(0);
    const me = back.match.participants.find((p) => p.id === back.pid)!;
    expect(me).toMatchObject({ budget: 930_000, connected: true });
    expect(me.squad).toHaveLength(1);

    const thief = new Client(w.mgr, 'c9');
    thief.send({ t: 'rejoin', code: w.host.code, token: 'guessed-token' });
    expect(thief.last('error').code).toBe('no-session');
  });

  it('lets the host pause and resume, and hands hosting over if the host vanishes', () => {
    const w = started({ timerSec: 10 });
    w.host.send({ t: 'action', action: { type: 'pause' } });
    expect(w.rahul.match.paused).toBe(true);
    w.rahul.bid(50_000);
    expect(w.rahul.last('reject').code).toBe('paused');
    w.run(60_000);
    expect(w.rahul.match.phase).toBe('bidding');
    w.host.send({ t: 'action', action: { type: 'resume' } });
    expect(w.rahul.match.paused).toBe(false);
    w.mgr.disconnect('c1');
    w.run(31_000);
    expect(w.rahul.room.hostId).toBe(w.rahul.pid);
  });

  it('never sends the hidden Mystery card to any client', () => {
    const w = started({ auctionType: 'mystery' });
    expect(w.rahul.match.phase).toBe('clue');
    const wire = JSON.stringify(w.rahul.msgs.filter((m) => m.t === 'state').slice(-1));
    expect(w.rahul.match.lot!.cardId).toBeNull();
    expect(wire).not.toContain('f-lionel-messi');
    expect(wire).not.toContain('"queue"');
    w.rahul.send({ t: 'action', action: { type: 'guess', pid: 'x', cardId: 'f-lionel-messi' } });
    expect(w.rahul.match.lot!.myGuess).toBe('f-lionel-messi');
    expect(w.aman.match.lot!.myGuess).toBeNull();
    expect(w.aman.match.lot!.guessed).toEqual([w.rahul.pid]);
  });

  it('returns everyone to the lobby for a rematch with the same players', () => {
    const w = started();
    w.host.send({ t: 'action', action: { type: 'end' } });
    expect(w.host.match.phase).toBe('finished');
    w.rahul.send({ t: 'rematch' });
    expect(w.rahul.last('reject').code).toBe('forbidden');
    w.host.send({ t: 'rematch' });
    expect(w.host.room.inMatch).toBe(false);
    expect(w.host.room.members).toHaveLength(3);
  });
});

describe('persistence', () => {
  it('restores rooms after a server restart with the auction safely paused', () => {
    const file = path.join(os.tmpdir(), `uaa-test-${process.pid}-${Date.now()}.json`);
    const clock = { t: 9_000_000 };
    const a = new RoomManager({ now: () => clock.t, persistPath: file });
    const host = new Client(a, 'c1');
    host.send({ t: 'create', name: 'Saqib', team: '', settings: { config: { ...defaultConfig('football'), shuffle: false }, custom: { edits: {}, imported: [] } } });
    const rahul = new Client(a, 'c2');
    rahul.send({ t: 'join', code: host.code, name: 'Rahul', team: '' });
    rahul.send({ t: 'ready', ready: true });
    host.send({ t: 'start' });
    clock.t += INTRO_MS; a.tickAll();
    rahul.bid(80_000);
    a.saveNow();
    a.dispose();

    clock.t += 600_000;
    const b = new RoomManager({ now: () => clock.t, persistPath: file });
    const back = new Client(b, 'c7');
    back.send({ t: 'rejoin', code: host.code, token: rahul.token });
    expect(back.match.paused).toBe(true);
    expect(back.match.lot).toMatchObject({ bid: 80_000, leader: rahul.pid });
    b.dispose();
    fs.rmSync(file, { force: true });
  });
});

describe('websocket transport', () => {
  let server: ServerHandle | null = null;
  afterEach(async () => { await server?.close(); server = null; });

  const open = (port: number) =>
    new Promise<{ ws: WebSocket; msgs: ServerMsg[]; wait: (pred: (m: ServerMsg) => boolean) => Promise<ServerMsg> }>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const msgs: ServerMsg[] = [];
      const waiters: { pred: (m: ServerMsg) => boolean; done: (m: ServerMsg) => void }[] = [];
      ws.on('message', (d) => {
        const m = JSON.parse(d.toString()) as ServerMsg;
        msgs.push(m);
        for (const w of waiters.slice()) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.done(m); }
      });
      const wait = (pred: (m: ServerMsg) => boolean) =>
        new Promise<ServerMsg>((done) => {
          const hit = msgs.find(pred);
          if (hit) done(hit); else waiters.push({ pred, done });
        });
      ws.on('open', () => resolve({ ws, msgs, wait }));
    });

  it('synchronises two real sockets through create → join → start → bid', async () => {
    server = await startServer({ port: 0 });
    const a = await open(server.port);
    const b = await open(server.port);
    const send = (c: { ws: WebSocket }, m: ClientMsg) => c.ws.send(JSON.stringify(m));

    send(a, { t: 'create', name: 'Saqib', team: '', settings: { config: { ...defaultConfig('avengers'), shuffle: false }, custom: { edits: {}, imported: [] } } });
    const joined = (await a.wait((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
    send(b, { t: 'join', code: joined.code, name: 'Priya', team: '' });
    const bJoined = (await b.wait((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
    send(b, { t: 'ready', ready: true });
    await a.wait((m) => m.t === 'state' && m.room.members.length === 2 && m.room.members[1].ready);
    send(a, { t: 'start' });
    const live = (await b.wait((m) => m.t === 'state' && m.match?.phase === 'bidding')) as Extract<ServerMsg, { t: 'state' }>;
    expect(Math.abs(live.now - Date.now())).toBeLessThan(2000);

    const opening = live.match!.lot!.opening;
    send(b, { t: 'action', action: { type: 'bid', pid: bJoined.pid, amount: opening, bidId: 'ws-1' } });
    send(a, { t: 'action', action: { type: 'bid', pid: joined.pid, amount: opening, bidId: 'ws-2' } });
    const seen = (await a.wait((m) => m.t === 'state' && m.match?.lot?.bidCount === 1)) as Extract<ServerMsg, { t: 'state' }>;
    expect(seen.match!.lot!.leader).toBe(bJoined.pid);
    const rej = (await a.wait((m) => m.t === 'reject')) as Extract<ServerMsg, { t: 'reject' }>;
    expect(rej.bidId).toBe('ws-2');
    a.ws.close();
    b.ws.close();
  });
});

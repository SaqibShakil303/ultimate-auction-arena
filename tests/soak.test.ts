// Multiplayer soak: whole online matches played by 2–8 simulated clients that bid, pass, guess,
// send bad input, disconnect, reconnect and pause at random. After every server tick the
// authoritative state must stay consistent and every connected client must see the same match.

import { describe, expect, it } from 'vitest';
import type { Card, ClientMsg, FootballCard, HeroCard, MatchConfig, MatchState, PublicMatch, ServerMsg } from '../shared/types';
import { checkBid, defaultConfig } from '../shared/engine';
import { rankTeams } from '../shared/scoring';
import { mulberry32 } from '../shared/util';
import { RoomManager } from '../server/rooms';

const NAMES = ['Saqib', 'Rahul', 'Aman', 'Priya', 'Zoya', 'Kabir', 'Meera', 'Dev'];

class Bot {
  msgs = 0;
  state: Extract<ServerMsg, { t: 'state' }> | null = null;
  cards: Record<string, Card> = {};
  rejects: string[] = [];
  errors: string[] = [];
  pid = '';
  token = '';
  code = '';
  connected = false;
  private conn = 0;
  /** Every state frame received while the card was hidden, for leak checks. */
  hiddenFrames: string[] = [];

  constructor(private mgr: RoomManager, public name: string, private hiddenId: () => string | null) {}

  get connId() { return `${this.name}#${this.conn}`; }
  connect() {
    this.conn++;
    const id = this.connId;
    this.mgr.connect({ id, send: (m) => { if (id === this.connId) this.receive(m); } });
    this.connected = true;
  }
  drop() {
    this.mgr.disconnect(this.connId);
    this.connected = false;
  }
  private receive(m: ServerMsg) {
    this.msgs++;
    if (m.t === 'joined') { this.pid = m.pid; this.token = m.token; this.code = m.code; }
    else if (m.t === 'catalog') { this.cards = {}; for (const c of m.cards) this.cards[c.id] = c; }
    else if (m.t === 'reject') this.rejects.push(m.code);
    else if (m.t === 'error') this.errors.push(m.code);
    else if (m.t === 'state') {
      this.state = m;
      const hidden = this.hiddenId();
      if (m.match?.phase === 'clue' && hidden) this.hiddenFrames.push(leaks(m, hidden) ? 'LEAK' : 'ok');
    }
  }
  send(m: ClientMsg | Record<string, unknown>) { this.mgr.handle(this.connId, m); }
  get match(): PublicMatch | null { return this.state?.match ?? null; }
}

/**
 * True when the hidden Mystery card can be identified from a state frame. Two places may legitimately
 * hold its id: the viewer's own secret guess, and the auction history (in a re-auction round the card
 * is one of many earlier UNSOLD records, which does not single it out).
 */
function leaks(frame: Extract<ServerMsg, { t: 'state' }>, hidden: string): boolean {
  const m = frame.match!;
  const scrubbed = { ...frame, match: { ...m, sales: [], lot: m.lot && { ...m.lot, myGuess: null } } };
  return JSON.stringify(scrubbed).includes(`"${hidden}"`);
}

function invariants(s: MatchState) {
  const owners = new Set<string>();
  for (const p of s.participants) {
    expect(p.budget).toBeGreaterThanOrEqual(0);
    expect(p.squad.length).toBeLessThanOrEqual(s.config.squadSize);
    expect(p.budget + p.squad.reduce((a, o) => a + o.price, 0)).toBe(s.config.budget);
    for (const o of p.squad) {
      expect(owners.has(o.cardId)).toBe(false);
      owners.add(o.cardId);
    }
    if (s.config.rules === 'strict') {
      if (s.config.mode === 'football') {
        for (const line of ['GK', 'DEF', 'MID', 'ATT'] as const) {
          expect(p.squad.filter((o) => (s.cards[o.cardId] as FootballCard).line === line).length).toBeLessThanOrEqual(s.config.slots[line]);
        }
      } else {
        const per: Record<string, number> = {};
        for (const o of p.squad) per[(s.cards[o.cardId] as HeroCard).cls] = (per[(s.cards[o.cardId] as HeroCard).cls] || 0) + 1;
        for (const n of Object.values(per)) expect(n).toBeLessThanOrEqual(s.config.maxPerClass);
      }
    }
  }
  expect(s.sales.filter((x) => x.type === 'sold').length).toBe(owners.size);
  if (s.lot?.leader) {
    const leader = s.participants.find((p) => p.id === s.lot!.leader)!;
    expect(leader.budget).toBeGreaterThanOrEqual(s.lot.bid); // the leading bid is always affordable
  }
}

const normalise = (m: PublicMatch) => JSON.stringify({ ...m, lot: m.lot && { ...m.lot, myGuess: null } });

function playMatch(seed: number, players: number, over: Partial<MatchConfig>) {
  const rnd = mulberry32(seed * 7919 + players);
  const clock = { t: 10_000_000 };
  const mgr = new RoomManager({ now: () => clock.t });
  let code = '';
  const hidden = () => {
    const m = code ? mgr.rooms.get(code)?.match : null;
    return m && m.phase === 'clue' && m.lot ? m.lot.cardId : null;
  };
  const bots = NAMES.slice(0, players).map((n) => new Bot(mgr, n, hidden));
  const host = bots[0];
  const cfg = { ...defaultConfig(over.mode ?? 'football'), timerSec: 10, ...over };
  host.connect();
  host.send({ t: 'create', name: host.name, team: '', settings: { config: cfg, custom: { edits: {}, imported: [] } } });
  code = host.code;
  for (const b of bots.slice(1)) { b.connect(); b.send({ t: 'join', code, name: b.name, team: '' }); b.send({ t: 'ready', ready: true }); }
  host.send({ t: 'start' });
  expect(host.rejects).toEqual([]);
  const authoritative = () => mgr.rooms.get(code)!.match!;
  let pausedFor = 0;
  let bidSeq = 0;
  let steps = 0;
  const stats = { bids: 0, reconnects: 0, pauses: 0, junk: 0 };

  while (authoritative().phase !== 'finished' && steps++ < 60_000) {
    clock.t += 250;
    mgr.tickAll();
    const live = authoritative();

    // Random connection churn — never the host, so pause/resume stays possible.
    for (const b of bots.slice(1)) {
      if (b.connected && rnd() < 0.004) b.drop();
      else if (!b.connected && rnd() < 0.05) { b.connect(); b.send({ t: 'rejoin', code, token: b.token }); stats.reconnects++; }
    }
    // The host occasionally pauses, then resumes a few ticks later.
    if (live.paused) { if (--pausedFor <= 0) host.send({ t: 'action', action: { type: 'resume' } }); }
    else if (rnd() < 0.003) { host.send({ t: 'action', action: { type: 'pause' } }); pausedFor = 1 + Math.floor(rnd() * 6); stats.pauses++; }

    for (const b of bots) {
      if (!b.connected || !b.match) continue;
      const m = b.match;
      const roll = rnd();
      if (m.phase === 'clue' && roll < 0.2) {
        const ids = Object.keys(b.cards);
        b.send({ t: 'action', action: { type: 'guess', pid: b.pid, cardId: rnd() < 0.1 ? 'not-a-card' : ids[Math.floor(rnd() * ids.length)] } });
      } else if (m.phase === 'bidding') {
        const chk = checkBid(m, b.cards, b.pid);
        if (chk.ok && roll < 0.22) {
          const amount = Math.min(chk.max, chk.min + Math.floor(rnd() * 3) * m.config.increment);
          const bidId = `${b.name}-${++bidSeq}`;
          b.send({ t: 'action', action: { type: 'bid', pid: b.pid, amount, bidId } });
          if (rnd() < 0.15) b.send({ t: 'action', action: { type: 'bid', pid: b.pid, amount, bidId } }); // double-click
          stats.bids++;
        } else if (chk.ok && roll < 0.27) {
          b.send({ t: 'action', action: { type: 'pass', pid: b.pid } });
        } else if (roll > 0.97) {
          // Hostile or broken input: must be rejected without disturbing the room.
          const junk: Record<string, unknown>[] = [
            { type: 'bid', pid: host.pid, amount: 1, bidId: `junk-${++bidSeq}` },
            { type: 'bid', pid: b.pid, amount: 9e15, bidId: `junk-${++bidSeq}` },
            { type: 'bid', pid: b.pid, amount: -500, bidId: `junk-${++bidSeq}` },
            { type: 'bid', pid: b.pid, amount: 'lots', bidId: `junk-${++bidSeq}` },
            { type: 'bid', pid: b.pid, amount: chk.min + 0.5, bidId: `junk-${++bidSeq}` },
            { type: 'lineup', pid: b.pid, lineup: ['f-not-mine'] },
            { type: 'end' }, { type: 'pause' }, { type: 'hammer' }, { type: 'teleport' },
          ];
          const pick = junk[Math.floor(rnd() * junk.length)];
          if (b !== host || !['end', 'pause'].includes(String(pick.type))) { b.send({ t: 'action', action: pick }); stats.junk++; }
        }
      }
    }

    invariants(live);
    const views = bots.filter((b) => b.connected && b.match).map((b) => normalise(b.match!));
    for (const v of views) expect(v).toBe(views[0]); // everyone connected sees the same auction
  }

  const final = authoritative();
  expect(final.phase).toBe('finished');
  invariants(final);
  for (const b of bots) if (!b.connected) { b.connect(); b.send({ t: 'rejoin', code, token: b.token }); }
  const rankings = bots.map((b) => rankTeams(b.match!.participants, b.match!.config, b.cards).map((r) => `${r.rank}:${r.p.id}:${r.score.total}`).join('|'));
  for (const r of rankings) expect(r).toBe(rankings[0]); // every client computes the same champion
  for (const b of bots) expect(b.hiddenFrames).not.toContain('LEAK');
  return { final, stats, bots };
}

// Whole matches with up to eight bots take several seconds each; give them room on slow or busy machines.
describe('online multiplayer soak', { timeout: 60_000 }, () => {
  const scenarios: [string, number, Partial<MatchConfig>][] = [
    ['2 players · football · strict', 2, { mode: 'football', rules: 'strict' }],
    ['4 players · football · casual', 4, { mode: 'football', rules: 'casual' }],
    ['8 players · football · strict (full house)', 8, { mode: 'football', rules: 'strict' }],
    ['5 players · football · mystery', 5, { mode: 'football', auctionType: 'mystery' }],
    ['2 players · heroes · strict', 2, { mode: 'avengers', rules: 'strict' }],
    ['6 players · heroes · casual', 6, { mode: 'avengers', rules: 'casual' }],
    ['8 players · heroes · mystery (tight pool)', 8, { mode: 'avengers', auctionType: 'mystery' }],
    ['3 players · heroes · no reserve, no re-auction', 3, { mode: 'avengers', reserve: false, reauction: false }],
  ];
  scenarios.forEach(([label, players, over], i) => {
    it(`stays consistent through a whole match: ${label}`, () => {
      const { final, stats, bots } = playMatch(i + 1, players, over);
      expect(final.finishReason).not.toBe('');
      expect(stats.bids).toBeGreaterThan(players);
      expect(final.sales.some((s) => s.type === 'sold')).toBe(true);
      // Rejected junk never leaked into the record: every recorded bid belongs to a real participant.
      const pids = new Set(final.participants.map((p) => p.id));
      for (const bid of final.bids) {
        expect(pids.has(bid.pid)).toBe(true);
        expect(Number.isInteger(bid.amount) && bid.amount > 0 && bid.amount <= final.config.budget).toBe(true);
      }
      expect(new Set(final.bids.map((b) => b.id)).size).toBe(final.bids.length); // double-clicks were deduplicated
      expect(bots.every((b) => b.msgs > 0)).toBe(true);
    });
  });

  it('gives a reconnecting player exactly the squad and budget they left with', () => {
    const { final, bots } = playMatch(42, 4, { mode: 'avengers' });
    for (const b of bots) {
      const mine = b.match!.participants.find((p) => p.id === b.pid)!;
      const truth = final.participants.find((p) => p.id === b.pid)!;
      expect(mine.budget).toBe(truth.budget);
      expect(mine.squad).toEqual(truth.squad);
      expect(mine.connected).toBe(true);
    }
  });
});

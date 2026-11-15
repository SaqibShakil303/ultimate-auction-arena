// Regressions found while testing the game end to end.

import { describe, expect, it } from 'vitest';
import type { Card, ClientMsg, ServerMsg } from '../shared/types';
import { defaultConfig } from '../shared/engine';
import { rankTeams, scoreTeam } from '../shared/scoring';
import { HEROES } from '../shared/data/heroes';
import { FOOTBALLERS } from '../shared/data/football';
import { RoomManager } from '../server/rooms';
import { fakeParticipant } from './helpers';

const hCards: Record<string, Card> = Object.fromEntries(HEROES.map((c) => [c.id, c]));
const fCards: Record<string, Card> = Object.fromEntries(FOOTBALLERS.map((c) => [c.id, c]));
const id = (name: string, list: Card[]) => list.find((c) => c.name === name)!.id;

describe('scoring of badly incomplete squads (auction ended early)', () => {
  const cfg = defaultConfig('football');

  it('no longer collapses every team to 0.0 — the better purchase still ranks higher', () => {
    const star = fakeParticipant('star', [id('Lionel Messi', FOOTBALLERS)], 900_000, cfg);
    const modest = fakeParticipant('modest', [id('Sunil Chhetri', FOOTBALLERS)], 900_000, cfg);
    const nothing = fakeParticipant('nothing', [], 1_000_000, cfg);
    const [a, b, c] = [star, modest, nothing].map((p) => scoreTeam(p, cfg, fCards));
    expect(a.total).toBeGreaterThan(0);
    expect(a.total).toBeGreaterThan(b.total);
    expect(c.total).toBe(0);
    expect(rankTeams([nothing, modest, star], cfg, fCards).map((r) => r.p.id)).toEqual(['star', 'modest', 'nothing']);
  });

  it('caps the empty-slot penalty at half of the points earned and says so', () => {
    const p = fakeParticipant('p', [id('Lionel Messi', FOOTBALLERS)], 0, cfg);
    const s = scoreTeam(p, cfg, fCards);
    const earned = s.parts.reduce((x, part) => x + part.score * part.weight, 0);
    expect(s.penalties[0].label).toMatch(/capped at half/);
    expect(-s.penalties[0].points).toBeLessThanOrEqual(earned / 2 + 0.06);
    expect(s.total).toBeCloseTo(earned + s.penalties[0].points, 0);
  });

  it('still applies the full published penalty to a nearly complete squad', () => {
    const hcfg = defaultConfig('avengers');
    const four = ['Thor', 'Iron Man', 'Captain America', 'Doctor Strange'].map((n) => id(n, HEROES));
    const s = scoreTeam(fakeParticipant('p', four, 0, hcfg), hcfg, hCards);
    expect(s.penalties).toEqual([{ label: `1 empty squad slot × −${hcfg.emptyPenalty}`, points: -hcfg.emptyPenalty }]);
    expect(s.complete).toBe(false);
  });

  it('an incomplete squad never outranks a complete one by default, whatever the cap', () => {
    const hcfg = defaultConfig('avengers');
    const complete = fakeParticipant('complete', ['Hawkeye', 'Falcon', 'Mantis', 'Okoye', 'Nick Fury'].map((n) => id(n, HEROES)), 0, hcfg);
    const stars = fakeParticipant('stars', ['Thor', 'Hulk', 'Captain Marvel', 'Scarlet Witch'].map((n) => id(n, HEROES)), 0, hcfg);
    expect(rankTeams([stars, complete], hcfg, hCards)[0].p.id).toBe('complete');
  });
});

describe('room limits', () => {
  const settings = { config: defaultConfig('football'), custom: { edits: {}, imported: [] } };
  const client = (mgr: RoomManager, cid: string) => {
    const msgs: ServerMsg[] = [];
    mgr.connect({ id: cid, send: (m) => msgs.push(m) });
    return { msgs, send: (m: ClientMsg) => mgr.handle(cid, m) };
  };

  it('seats at most eight players and turns the ninth away', () => {
    const mgr = new RoomManager();
    const host = client(mgr, 'c0');
    host.send({ t: 'create', name: 'P0', team: '', settings });
    const code = (host.msgs.find((m) => m.t === 'joined') as Extract<ServerMsg, { t: 'joined' }>).code;
    for (let i = 1; i < 8; i++) client(mgr, `c${i}`).send({ t: 'join', code, name: `P${i}`, team: '' });
    const ninth = client(mgr, 'c8');
    ninth.send({ t: 'join', code, name: 'P8', team: '' });
    expect(ninth.msgs).toEqual([{ t: 'error', code: 'full', message: expect.stringMatching(/full/) }]);
    expect(mgr.rooms.get(code)!.members).toHaveLength(8);
  });

  it('trims and bounds names, rejecting blank ones', () => {
    const mgr = new RoomManager();
    const a = client(mgr, 'a');
    a.send({ t: 'create', name: '   ', team: '', settings });
    expect(a.msgs[0]).toMatchObject({ t: 'error', code: 'name' });
    a.send({ t: 'create', name: '  A   very    long name that keeps going and going  ', team: '', settings });
    const room = [...mgr.rooms.values()][0];
    expect(room.members[0].name).toBe('A very long name tha');
    expect(room.members[0].name.length).toBeLessThanOrEqual(20);
  });

  it('answers keep-alive pings with the server clock in any state', () => {
    const clock = { t: 123_456 };
    const mgr = new RoomManager({ now: () => clock.t });
    const a = client(mgr, 'a');
    a.send({ t: 'ping', id: 9 });
    expect(a.msgs).toEqual([{ t: 'pong', id: 9, now: 123_456 }]);
  });

  it('removes an empty lobby when the last player leaves', () => {
    const mgr = new RoomManager();
    const a = client(mgr, 'a');
    a.send({ t: 'create', name: 'Solo', team: '', settings });
    expect(mgr.rooms.size).toBe(1);
    a.send({ t: 'leave' });
    expect(mgr.rooms.size).toBe(0);
  });
});

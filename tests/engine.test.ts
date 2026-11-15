import { describe, expect, it } from 'vitest';
import type { FootballCard, HeroCard, MatchState } from '../shared/types';
import {
  act, basePrice, buildPool, checkBid, createMatch, defaultConfig, incrementOptions, minPrice, quickSteps,
  slotsForFormation, suspend, tick, toPublic, validateSetup, FORMATIONS, FORMATION_SLOTS, RESULT_MS, UNCONTESTED_MS,
} from '../shared/engine';
import { applyCustom, artSource, getCatalog, normalizeCard } from '../shared/catalog';
import { sanitizeConfig } from '../shared/config';
import { FOOTBALLERS } from '../shared/data/football';
import { HEROES } from '../shared/data/heroes';
import { formatINR, compactINR } from '../shared/util';
import { playOut, Sim } from './helpers';

describe('datasets', () => {
  it('ships at least 80 footballers and 40 heroes with valid, unique cards', () => {
    expect(FOOTBALLERS.length).toBeGreaterThanOrEqual(80);
    expect(HEROES.filter((h) => h.pack === 'core').length).toBeGreaterThanOrEqual(40);
    expect(HEROES.filter((h) => h.pack === 'original').length).toBeGreaterThanOrEqual(40);
    for (const list of [FOOTBALLERS, HEROES]) {
      expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
      for (const c of list) {
        expect(c.stats).toHaveLength(6);
        expect(c.overall).toBeGreaterThanOrEqual(1);
        expect(c.overall).toBeLessThanOrEqual(99);
        expect(c.clues).toHaveLength(3);
        c.stats.forEach((v) => expect(v >= 1 && v <= 99).toBe(true));
      }
    }
  });

  it('has enough cards of every position for 8 strict football squads', () => {
    const cfg = defaultConfig('football');
    const v = validateSetup(cfg, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], buildPool(getCatalog('football'), cfg));
    expect(v.errors).toEqual([]);
  });

  it('defaults football to an 11-player 4-3-3 and exposes every supported formation', () => {
    const cfg = defaultConfig('football');
    expect(cfg).toMatchObject({ squadSize: 11, formation: '4-3-3', ratingMode: 'prime' });
    expect(cfg.slots).toEqual({ GK: 1, DEF: 4, MID: 3, ATT: 3 });
    expect(FORMATIONS).toEqual(['4-3-3', '4-4-2', '4-2-3-1', '4-1-2-1-2', '3-5-2', '5-3-2']);
    for (const formation of FORMATIONS) {
      expect(Object.values(FORMATION_SLOTS[formation]).reduce((a, b) => a + b, 0)).toBe(11);
      expect(slotsForFormation(formation)).not.toBe(FORMATION_SLOTS[formation]);
    }
    const sanitized = sanitizeConfig({ mode: 'football', formation: '3-5-2', ratingMode: 'fc27' }, 'local');
    expect(sanitized).toMatchObject({ formation: '3-5-2', ratingMode: 'fc27', squadSize: 11 });
    expect(sanitized.slots).toEqual({ GK: 1, DEF: 3, MID: 5, ATT: 2 });
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatINR(140000)).toBe('₹1,40,000');
    expect(formatINR(1000000)).toBe('₹10,00,000');
    expect(compactINR(860000)).toBe('₹8.6L');
  });
});

describe('setup and pricing', () => {
  it('gives every participant the same starting budget', () => {
    const sim = new Sim('football', 6, { budget: 2_000_000 });
    expect(sim.s.participants.map((p) => p.budget)).toEqual(Array(6).fill(2_000_000));
  });

  it('scales opening prices, increments and quick-bid steps with the budget', () => {
    const a = defaultConfig('football', 1_000_000);
    const b = defaultConfig('football', 5_000_000);
    expect(basePrice(94, a)).toBe(45_000);
    expect(basePrice(94, b)).toBe(227_000);
    expect(minPrice(a) * a.squadSize).toBeLessThanOrEqual(a.budget * 0.1);
    expect(incrementOptions(1_000_000)).toEqual([2_500, 5_000, 10_000, 20_000]);
    expect(quickSteps(1_000_000)).toEqual([5_000, 10_000, 25_000]);
    expect(basePrice(95, defaultConfig('avengers'))).toBe(100_000);
  });

  it('rejects empty or undersized card pools before a match starts', () => {
    const cfg = { ...defaultConfig('avengers'), packs: ['original'], squadSize: 6 };
    const pool = buildPool(getCatalog('avengers'), cfg);
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(validateSetup(cfg, names, pool).errors.join(' ')).toMatch(/too small/);
    expect(validateSetup({ ...cfg, packs: [] }, names, []).errors.join(' ')).toMatch(/empty/);
    expect(validateSetup(defaultConfig('football'), ['Sam', 'sam '], buildPool(getCatalog('football'), defaultConfig('football'))).errors.join(' ')).toMatch(/unique/);
  });

  it('finishes immediately instead of hanging when created with an empty pool', () => {
    const s = createMatch(defaultConfig('football'), [{ id: 'a', name: 'A', team: '' }, { id: 'b', name: 'B', team: '' }], [], 0);
    expect(s.phase).toBe('finished');
  });
});

describe('bidding rules', () => {
  it('plays the documented Messi scenario exactly', () => {
    const sim = new Sim('football', 4);
    sim.open();
    expect(sim.card().name).toBe('Lionel Messi');
    expect(sim.s.lot!.opening).toBe(45_000);
    expect(sim.bid('p1', 70_000).ok).toBe(true);
    expect(sim.bid('p2', 90_000).ok).toBe(true);
    expect(sim.bid('p3', 110_000).ok).toBe(true);
    expect(sim.bid('p4', 125_000).ok).toBe(true);
    expect(sim.bid('p1', 140_000).ok).toBe(true);
    sim.close();
    expect(sim.s.last).toMatchObject({ type: 'sold', pid: 'p1', price: 140_000 });
    expect(sim.p(1).budget).toBe(860_000);
    expect(sim.p(1).squad).toHaveLength(1);
    expect(sim.s.phase).toBe('result');
    sim.advance(RESULT_MS);
    expect(sim.s.phase).toBe('bidding');
    expect(sim.s.round).toBe(2);
  });

  it('accepts only one of two simultaneous equal bids', () => {
    const sim = new Sim('football', 3);
    sim.open();
    const a = sim.bid('p1', 60_000);
    const b = sim.bid('p2', 60_000);
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, code: 'low' });
    expect(sim.s.lot!.leader).toBe('p1');
    expect(sim.s.bids).toHaveLength(1);
  });

  it('rejects invalid amounts without disturbing the auction', () => {
    const sim = new Sim('football', 2);
    sim.open();
    expect(sim.bid('p1', 44_999)).toMatchObject({ ok: false, code: 'low' });
    expect(sim.bid('p1', 70_000.5)).toMatchObject({ ok: false, code: 'invalid' });
    expect(sim.bid('p1', -5)).toMatchObject({ ok: false, code: 'invalid' });
    expect(sim.bid('p1', NaN)).toMatchObject({ ok: false, code: 'invalid' });
    expect(sim.bid('ghost', 70_000)).toMatchObject({ ok: false, code: 'unknown' });
    expect(sim.bid('p1', 70_000).ok).toBe(true);
    expect(sim.bid('p2', 72_000)).toMatchObject({ ok: false, code: 'low' }); // below the 5,000 increment
    expect(sim.bid('p2', 75_000).ok).toBe(true);
    expect(sim.s.phase).toBe('bidding');
  });

  it('never lets anyone bid beyond their balance or strict reserve', () => {
    const sim = new Sim('football', 2);
    sim.open();
    expect(sim.bid('p1', 1_000_001)).toMatchObject({ ok: false, code: 'funds' });
    expect(sim.bid('p1', 950_000)).toMatchObject({ ok: false, code: 'reserve' }); // must keep 9 × ₹10,000
    expect(sim.bid('p1', 910_000).ok).toBe(true);
    const casual = new Sim('football', 2, { rules: 'casual' });
    casual.open();
    expect(casual.bid('p1', 1_000_000).ok).toBe(true);
  });

  it('stops a leader from raising their own bid', () => {
    const sim = new Sim('football', 2);
    sim.open();
    sim.bid('p1', 50_000);
    expect(sim.bid('p1', 80_000)).toMatchObject({ ok: false, code: 'leading' });
    expect(sim.s.lot!.bid).toBe(50_000);
  });

  it('rejects late bids that arrive after the deadline', () => {
    const sim = new Sim('football', 2);
    sim.open();
    sim.bid('p1', 50_000);
    sim.now = sim.s.lot!.deadline + 1; // clock passed the deadline, tick has not run yet
    expect(sim.bid('p2', 60_000)).toMatchObject({ ok: false, code: 'late' });
    tick(sim.s, sim.now);
    expect(sim.s.last).toMatchObject({ pid: 'p1', price: 50_000 });
    expect(sim.bid('p2', 60_000).ok).toBe(false);
  });

  it('treats a duplicate submission as one bid', () => {
    const sim = new Sim('football', 3);
    sim.open();
    expect(sim.bid('p1', 50_000, 'same-id')).toEqual({ ok: true });
    expect(sim.bid('p1', 50_000, 'same-id')).toEqual({ ok: true, dup: true });
    expect(sim.s.bids).toHaveLength(1);
    expect(sim.s.lot!.bidCount).toBe(1);
    sim.close();
    expect(sim.p(1).budget).toBe(950_000); // charged exactly once
  });

  it('extends the countdown when a bid lands inside the anti-sniping window', () => {
    const sim = new Sim('football', 3, { timerSec: 10, antiSnipeSec: 5 });
    sim.open();
    sim.advance(8_500);
    sim.bid('p1', 50_000);
    expect(sim.s.lot!.deadline - sim.now).toBe(5_000);
  });

  it('marks a card UNSOLD when the countdown expires without bids', () => {
    const sim = new Sim('football', 2, { timerSec: 10 });
    sim.open();
    const id = sim.s.lot!.cardId;
    sim.advance(10_000);
    expect(sim.s.last).toMatchObject({ type: 'unsold', cardId: id, pid: null });
    expect(sim.s.unsold).toContain(id);
    expect(sim.s.participants.every((p) => p.budget === 1_000_000)).toBe(true);
  });

  it('closes early once every rival has passed', () => {
    const sim = new Sim('football', 3, { timerSec: 30 });
    sim.open();
    sim.bid('p1', 50_000);
    act(sim.s, { type: 'pass', pid: 'p2' }, sim.now);
    expect(sim.s.lot!.uncontested).toBe(false);
    act(sim.s, { type: 'pass', pid: 'p3' }, sim.now);
    expect(sim.s.lot!.uncontested).toBe(true);
    expect(sim.s.lot!.deadline - sim.now).toBeLessThanOrEqual(UNCONTESTED_MS);
    expect(sim.bid('p2', 60_000)).toMatchObject({ ok: false, code: 'passed' });
  });

  it('blocks bids and freezes timers while paused', () => {
    const sim = new Sim('football', 2, { timerSec: 10 });
    sim.open();
    act(sim.s, { type: 'pause' }, sim.now);
    expect(sim.bid('p1', 50_000)).toMatchObject({ ok: false, code: 'paused' });
    sim.advance(60_000);
    expect(sim.s.phase).toBe('bidding');
    act(sim.s, { type: 'resume' }, sim.now);
    expect(sim.s.lot!.deadline - sim.now).toBe(10_000);
    expect(sim.bid('p1', 50_000).ok).toBe(true);
  });
});

describe('roster restrictions', () => {
  it('stops a participant with a full squad from bidding again', () => {
    const sim = new Sim('avengers', 2, { squadSize: 2, rules: 'casual' });
    for (let i = 0; i < 2; i++) { sim.open(); sim.bid('p1', sim.s.lot!.opening); sim.close(); }
    sim.open();
    expect(sim.p(1).squad).toHaveLength(2);
    expect(sim.bid('p1', sim.s.lot!.opening)).toMatchObject({ ok: false, code: 'full' });
    expect(checkBid(sim.s, sim.s.cards, 'p1').reason).toMatch(/Squad complete/);
  });

  it('enforces strict formation slots and explains why', () => {
    const cfg = defaultConfig('football');
    const gks = FOOTBALLERS.filter((c) => c.line === 'GK');
    const rest = FOOTBALLERS.filter((c) => c.line !== 'GK');
    const sim = new Sim('football', 2, {}, [...gks, ...rest]);
    sim.open(); sim.bid('p1', sim.s.lot!.opening); sim.close();
    sim.open();
    expect((sim.card() as FootballCard).line).toBe('GK');
    const r = sim.bid('p1', sim.s.lot!.opening);
    expect(r).toMatchObject({ ok: false, code: 'slot' });
    expect((r as { message: string }).message).toMatch(/No open GK slot/);
    expect(sim.bid('p2', sim.s.lot!.opening).ok).toBe(true);
    expect(cfg.slots.GK).toBe(1);
  });

  it('enforces the strict class limit in Avengers mode', () => {
    const tanks = HEROES.filter((h) => h.pack === 'core' && h.cls === 'Tank');
    const others = HEROES.filter((h) => h.pack === 'core' && h.cls !== 'Tank');
    const sim = new Sim('avengers', 2, {}, [...tanks, ...others]);
    for (let i = 0; i < 2; i++) { sim.open(); sim.bid('p1', sim.s.lot!.opening); sim.close(); }
    sim.open();
    expect((sim.card() as HeroCard).cls).toBe('Tank');
    expect(sim.bid('p1', sim.s.lot!.opening)).toMatchObject({ ok: false, code: 'slot' });
  });

  it('validates manual lineups against the owned squad', () => {
    const sim = new Sim('football', 2);
    sim.open(); sim.bid('p1', 50_000); sim.close();
    const owned = sim.p(1).squad[0].cardId;
    const bad = Array(11).fill(null); bad[0] = 'f-not-mine';
    expect(act(sim.s, { type: 'lineup', pid: 'p1', lineup: bad }, sim.now).ok).toBe(false);
    const good = Array(11).fill(null); good[10] = owned;
    expect(act(sim.s, { type: 'lineup', pid: 'p1', lineup: good }, sim.now).ok).toBe(true);
    expect(sim.p(1).lineup[10]).toBe(owned);
  });
});

describe('end conditions and integrity', () => {
  const invariants = (s: MatchState) => {
    const owners = new Map<string, string>();
    for (const p of s.participants) {
      expect(p.budget).toBeGreaterThanOrEqual(0);
      expect(p.squad.length).toBeLessThanOrEqual(s.config.squadSize);
      expect(p.budget + p.squad.reduce((a, o) => a + o.price, 0)).toBe(s.config.budget); // money is conserved
      for (const o of p.squad) {
        expect(owners.has(o.cardId)).toBe(false); // no card belongs to two teams
        owners.set(o.cardId, p.id);
      }
      if (s.config.rules === 'strict' && s.config.mode === 'football') {
        for (const line of ['GK', 'DEF', 'MID', 'ATT'] as const) {
          expect(p.squad.filter((o) => (s.cards[o.cardId] as FootballCard).line === line).length).toBeLessThanOrEqual(s.config.slots[line]);
        }
      }
    }
    const sold = s.sales.filter((x) => x.type === 'sold');
    expect(sold.length).toBe(owners.size);
    expect(new Set(sold.map((x) => x.cardId)).size).toBe(sold.length);
  };

  it('keeps money and ownership consistent across full random auctions', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const mode of ['football', 'avengers'] as const) {
        const sim = new Sim(mode, 2 + (seed % 7), { shuffle: true, seed, rules: seed % 2 ? 'strict' : 'casual', timerSec: 10 });
        const s = playOut(sim, seed * 31);
        expect(s.phase).toBe('finished');
        expect(s.finishReason).not.toBe('');
        invariants(s);
      }
    }
  });

  it('ends when every squad is complete, without draining budgets', () => {
    const sim = new Sim('avengers', 2, { squadSize: 2, rules: 'casual' });
    for (const pid of ['p1', 'p2', 'p1', 'p2']) { sim.open(); sim.bid(pid, sim.s.lot!.opening); sim.close(); }
    sim.advance(RESULT_MS);
    expect(sim.s.phase).toBe('finished');
    expect(sim.s.finishReason).toMatch(/complete/);
    expect(sim.p(1).budget).toBeGreaterThan(0);
  });

  it('ends instead of waiting forever when nobody can afford another bid', () => {
    const sim = new Sim('football', 2, { budget: 1000, rules: 'casual', increment: 5 });
    sim.open(); expect(sim.bid('p1', 1000).ok).toBe(true); sim.close();
    sim.open(); expect(sim.bid('p2', 1000).ok).toBe(true); sim.close();
    sim.advance(RESULT_MS);
    expect(sim.s.phase).toBe('finished');
    expect(sim.s.finishReason).toMatch(/afford/);
    expect(sim.p(1).squad).toHaveLength(1);
  });

  it('re-auctions unsold cards once at a reduced price, then ends', () => {
    const pool = HEROES.filter((h) => h.pack === 'core').slice(0, 3);
    const sim = new Sim('avengers', 2, { squadSize: 1, rules: 'casual', timerSec: 5 }, pool);
    sim.open();
    const first = sim.s.lot!.opening;
    for (let i = 0; i < 3; i++) { sim.open(); sim.close(); } // nobody bids on anything
    sim.open();
    expect(sim.s.pass).toBe(1);
    expect(sim.s.lot!.opening).toBeLessThan(first);
    let guard = 0;
    while (sim.s.phase !== 'finished' && guard++ < 400) sim.advance(500);
    expect(sim.s.phase).toBe('finished');
    expect(sim.s.sales.filter((x) => x.type === 'unsold')).toHaveLength(6);
  });

  it('lets the host end the auction, settling the live lot first', () => {
    const sim = new Sim('football', 2);
    sim.open();
    sim.bid('p1', 50_000);
    act(sim.s, { type: 'end' }, sim.now);
    expect(sim.s.phase).toBe('finished');
    expect(sim.p(1).squad).toHaveLength(1);
    expect(sim.bid('p2', 90_000)).toMatchObject({ ok: false, code: 'finished' });
  });
});

describe('mystery auction', () => {
  it('hides the card identity and auction order from clients until the reveal', () => {
    const sim = new Sim('football', 2, { auctionType: 'mystery' });
    sim.advance(3000);
    expect(sim.s.phase).toBe('clue');
    const pub = toPublic(sim.s, 'p1');
    expect(pub.lot!.cardId).toBeNull();
    expect(pub.lot!.clues).toHaveLength(1);
    expect(pub.nextCardId).toBeNull();
    expect(JSON.stringify(pub)).not.toContain(sim.s.lot!.cardId);
    expect((pub as unknown as Record<string, unknown>).queue).toBeUndefined();
    sim.advance(5000);
    expect(toPublic(sim.s, 'p1').lot!.clues).toHaveLength(2);
    expect(sim.bid('p1', 50_000)).toMatchObject({ ok: false, code: 'closed' });
  });

  it('rewards a correct guess with capped points but never with ownership', () => {
    const sim = new Sim('football', 2, { auctionType: 'mystery' });
    sim.advance(3000);
    const answer = sim.s.lot!.cardId;
    expect(act(sim.s, { type: 'guess', pid: 'p1', cardId: answer }, sim.now).ok).toBe(true);
    expect(act(sim.s, { type: 'guess', pid: 'p1', cardId: answer }, sim.now)).toMatchObject({ ok: false, code: 'guessed' });
    expect(toPublic(sim.s, 'p2').lot!.myGuess).toBeNull();
    act(sim.s, { type: 'guess', pid: 'p2', cardId: 'f-pele' }, sim.now);
    sim.advance(1000); // everyone guessed → early reveal
    expect(sim.s.phase).toBe('bidding');
    expect(toPublic(sim.s, 'p2').lot!.cardId).toBe(answer);
    expect(sim.p(1).guessHits).toBe(1);
    expect(sim.p(2).guessHits).toBe(0);
    expect(sim.p(1).squad).toHaveLength(0);
  });
});

describe('persistence and customisation', () => {
  it('recovers a match after a refresh: serialised, suspended and resumed intact', () => {
    const sim = new Sim('football', 3, { timerSec: 20 });
    sim.open();
    sim.bid('p1', 50_000);
    sim.advance(4000);
    const remaining = sim.s.lot!.deadline - sim.now;
    const restored = JSON.parse(JSON.stringify(sim.s)) as MatchState;
    suspend(restored, sim.now);
    const later = sim.now + 3_600_000; // the tab was closed for an hour
    expect(tick(restored, later)).toBe(false);
    act(restored, { type: 'resume' }, later);
    expect(restored.lot!.deadline - later).toBe(remaining);
    expect(restored.lot!.leader).toBe('p1');
    expect(restored.participants).toEqual(sim.s.participants);
    expect(act(restored, { type: 'bid', pid: 'p2', amount: 60_000, bidId: 'after-restore' }, later).ok).toBe(true);
  });

  it('falls back to generated art for missing or broken images', () => {
    const card = FOOTBALLERS[0];
    expect(artSource(card, false)).toBe('generated');
    expect(artSource({ ...card, image: 'https://example.com/a.png' }, false)).toBe('image');
    expect(artSource({ ...card, image: 'https://example.com/a.png' }, true)).toBe('generated');
    expect(normalizeCard({ name: 'X', image: 'javascript:alert(1)' }, 'football')!.image).toBeUndefined();
  });

  it('applies rating edits and imports custom cards safely', () => {
    const custom = {
      edits: { 'f-lionel-messi': { overall: 80, stats: [80, 80, 80, 80, 80, 80] } },
      imported: [{ name: 'Local Hero', overall: 150, pos: 'st', nation: 'India' }, { nope: true }, 'garbage'],
    };
    const cat = applyCustom(getCatalog('football'), custom, 'football');
    const messi = cat.find((c) => c.id === 'f-lionel-messi')!;
    expect(messi.overall).toBe(80);
    expect(messi.rarity).toBe('common');
    const added = cat.find((c) => c.name === 'Local Hero') as FootballCard;
    expect(added.overall).toBe(99);
    expect(added.line).toBe('ATT');
    expect(added.pack).toBe('custom');
    expect(cat.length).toBe(getCatalog('football').length + 1);
    expect(FOOTBALLERS[0].overall).toBe(94); // built-in data is never mutated
  });

  it('materialises honest provenance and downgrades unsupported official claims', () => {
    const builtIn = getCatalog('football')[0] as FootballCard;
    expect(builtIn).toMatchObject({
      ratingMode: 'prime', edition: 'Prime Legends', cardType: 'custom',
      source: null, verifiedAt: null, verificationStatus: 'custom', playStyles: [],
    });

    const unsupported = normalizeCard({
      name: 'Claimed Star', pos: 'ST', overall: 91, ratingMode: 'fc27',
      verificationStatus: 'verified', playStyles: ['Finesse Shot'],
    }, 'football') as FootballCard;
    expect(unsupported).toMatchObject({
      ratingMode: 'fc27', edition: 'FC 27', cardType: 'standard',
      source: null, verifiedAt: null, verificationStatus: 'unverified',
      playStyles: ['Finesse Shot'],
    });

    const verified = normalizeCard({
      name: 'Verified Star', pos: 'CM', overall: 88, stats: [80, 82, 91, 89, 75, 78],
      nation: 'India', club: 'Example FC',
      ratingMode: 'fc26', cardType: 'special', verificationStatus: 'verified',
      source: 'https://www.ea.com/games/ea-sports-fc/ratings', verifiedAt: '2026-09-01',
      playStyles: ['Incisive Pass', 'Technical'],
    }, 'football') as FootballCard;
    expect(verified).toMatchObject({
      ratingMode: 'fc26', edition: 'FC 26', cardType: 'special',
      verificationStatus: 'verified', verifiedAt: '2026-09-01',
      playStyles: ['Incisive Pass', 'Technical'],
    });
    expect(verified.source).toMatch(/^https:\/\/www\.ea\.com\//);

    const edited = applyCustom([verified], {
      edits: { [verified.id]: { overall: 89, stats: [81, 83, 92, 90, 76, 79] } }, imported: [],
    }, 'football')[0] as FootballCard;
    expect(edited).toMatchObject({ verificationStatus: 'unverified', verifiedAt: null });
    expect(edited.source).toBe(verified.source);
  });
});

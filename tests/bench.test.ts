// Football squads of 11 starters + 5 substitutes, the Gold + Icons pool and the Epic / Legendary /
// Mythic tiers. Older 11-player formats (no bench) must keep behaving exactly as before.

import { describe, expect, it } from 'vitest';
import type { Card, FootballCard, Line, MatchConfig } from '../shared/types';
import {
  act, autoLineup, benchProblem, buildPool, defaultConfig, effectiveLineup, fitOf, lineCounts, lineupValid,
  MAX_BENCH_GK, MAX_SUBS, slotBlock, slotPositions, startersOf, subsOf, validateSetup,
} from '../shared/engine';
import { applyCustom, getCatalog } from '../shared/catalog';
import { sanitizeAction, sanitizeConfig } from '../shared/config';
import { BENCH_WEIGHT, FOOTBALL_WEIGHTS, footballWeights, rankTeams, scoreTeam } from '../shared/scoring';
import { footballRarity } from '../shared/util';
import { squadSummary, startConfig } from '../src/lib/draft';
import { fakeParticipant, NAMES, playOut, Sim } from './helpers';

const cfg = startConfig('football');
const pool = buildPool(getCatalog('football'), cfg) as FootballCard[];
const cards: Record<string, Card> = Object.fromEntries(pool.map((c) => [c.id, c]));
const by = (line: Line) => pool.filter((c) => c.line === line).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
const ids = (...groups: FootballCard[][]) => groups.flat().map((c) => c.id);
/** The strongest strict squad for 4-3-3: two keepers, five defenders, five midfielders, four attackers. */
const full = ids(by('GK').slice(0, 2), by('DEF').slice(0, 5), by('MID').slice(0, 5), by('ATT').slice(0, 4));

describe('football format: 11 starters + 5 substitutes', () => {
  it('starts new football matches on FC 27 Gold players and Icons with a 16-player squad', () => {
    expect(cfg).toMatchObject({ mode: 'football', ratingMode: 'fc27', squadSize: 16, formation: '4-3-3' });
    expect([...cfg.packs].sort()).toEqual(['icons', 'modern']);
    expect(startersOf(cfg)).toBe(11);
    expect(subsOf(cfg)).toBe(5);
    expect(squadSummary(cfg)).toBe('16 · 11 starters + 5 subs · 1 GK / 4 DEF / 3 MID / 3 ATT');
    expect(validateSetup(cfg, NAMES, pool).errors).toEqual([]);
    // Heroes have no bench, and the classic 11-player football format still has none either.
    expect(subsOf(startConfig('avengers'))).toBe(0);
    expect(subsOf(defaultConfig('football'))).toBe(0);
    expect(startersOf(startConfig('avengers'))).toBe(5);
  });

  it('validates bench sizes and keeps them through untrusted settings', () => {
    expect(validateSetup({ ...cfg, squadSize: 11 + MAX_SUBS }, NAMES.slice(0, 4), pool).errors).toEqual([]);
    expect(validateSetup({ ...cfg, squadSize: 12 + MAX_SUBS }, NAMES.slice(0, 4), pool).errors.join(' ')).toMatch(/At most 7 substitutes/);
    expect(validateSetup({ ...cfg, squadSize: 10 }, NAMES.slice(0, 4), pool).errors.join(' ')).toMatch(/squad size is only 10/);
    expect(sanitizeConfig(cfg, 'online')).toMatchObject({ squadSize: 16, ratingMode: 'fc27', packs: ['modern', 'icons'] });
    expect(sanitizeConfig({ ...cfg, squadSize: 99 }, 'online').squadSize).toBe(20);
    const lineup = autoLineup(full, cfg, cards);
    const action = sanitizeAction({ type: 'lineup', lineup }, 'p1');
    expect(action).toMatchObject({ type: 'lineup', lineup });
  });

  it('picks the best XI and benches the rest, strongest substitute first', () => {
    const lineup = autoLineup(full, cfg, cards);
    expect(lineup).toHaveLength(16);
    expect(new Set(lineup).size).toBe(16);
    const xi = lineup.slice(0, 11).map((id) => cards[id!] as FootballCard);
    const bench = lineup.slice(11).map((id) => cards[id!] as FootballCard);
    expect(xi[0].id).toBe(by('GK')[0].id); // the better keeper starts
    expect(bench.filter((c) => c.line === 'GK').map((c) => c.id)).toEqual([by('GK')[1].id]);
    expect(xi.filter((c) => c.line === 'DEF')).toHaveLength(4);
    expect(bench.map((c) => c.overall)).toEqual(bench.map((c) => c.overall).sort((a, b) => b - a));
    // The XI is optimal for OVR × position fit: no single starter ↔ substitute swap improves it.
    const positions = slotPositions(cfg);
    const value = (c: FootballCard, pos: string) => c.overall * fitOf(c, pos) + (fitOf(c, pos) === 1 ? 0.5 : 0);
    for (const [i, starter] of xi.entries()) {
      for (const sub of bench) expect(value(sub, positions[i]), `${sub.name} for ${starter.name}`).toBeLessThanOrEqual(value(starter, positions[i]) + 1e-9);
    }
    // An incomplete squad fills starting places before the bench.
    const partial = autoLineup(ids(by('GK').slice(0, 1), by('DEF').slice(0, 2)), cfg, cards);
    expect(partial.slice(0, 11).filter(Boolean)).toHaveLength(3);
    expect(partial.slice(11).filter(Boolean)).toHaveLength(0);
  });

  it('enforces Strict roster rules with a bench: 5 substitutes, at most one substitute keeper', () => {
    const p = fakeParticipant('p1', [], 0, cfg);
    const withSquad = (list: string[]) => ({ ...p, squad: list.map((cardId, i) => ({ cardId, price: 1, round: i })) });
    // Four defenders fill the back line; five more fill the bench; a tenth is refused.
    expect(slotBlock(withSquad(ids(by('DEF').slice(0, 8))), by('DEF')[8], cfg, cards)).toBeNull();
    expect(slotBlock(withSquad(ids(by('DEF').slice(0, 9))), by('DEF')[9], cfg, cards)).toBe('DEF places full (4/4) · Bench full (5/5 substitutes)');
    // A second keeper may sit on the bench; a third may not.
    expect(slotBlock(withSquad(ids(by('GK').slice(0, 1))), by('GK')[1], cfg, cards)).toBeNull();
    expect(slotBlock(withSquad(ids(by('GK').slice(0, 2))), by('GK')[2], cfg, cards)).toBe(`GK places full (1/1) · Only ${MAX_BENCH_GK} substitute goalkeeper allowed`);
    // Without a bench the original message is unchanged.
    const classic = { ...cfg, squadSize: 11 };
    expect(slotBlock(withSquad(ids(by('GK').slice(0, 1))), by('GK')[1], classic, cards)).toBe('No open GK slot (1/1 filled)');
    // Casual rules never block.
    expect(slotBlock(withSquad(ids(by('GK').slice(0, 3))), by('GK')[3], { ...cfg, rules: 'casual' }, cards)).toBeNull();
    expect(benchProblem(lineCounts(full, cards), cfg)).toBeNull();
  });

  it('scores the XI at 90% and the bench at 10%, and counts the whole squad for completeness', () => {
    const W = footballWeights(cfg);
    expect(W.bench).toBe(BENCH_WEIGHT);
    expect(Object.values(W).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(footballWeights({ ...cfg, squadSize: 11 })).toEqual({ ...FOOTBALL_WEIGHTS, bench: 0 });

    const p = fakeParticipant('p1', full, 0, cfg);
    const s = scoreTeam(p, cfg, cards);
    expect(s).toMatchObject({ filled: 16, size: 16, complete: true });
    expect(s.parts.map((x) => x.key)).toEqual(['quality', 'balance', 'tactics', 'coverage', 'chemistry', 'bench']);
    expect(s.total).toBeCloseTo(s.parts.reduce((a, x) => a + x.score * x.weight, 0), 0);

    // Missing substitutes cost the bench score and the empty-slot penalty.
    const short = scoreTeam(fakeParticipant('p2', full.slice(0, 13), 0, cfg), cfg, cards);
    expect(short).toMatchObject({ filled: 13, complete: false });
    expect(short.penalties[0].label).toMatch(/^3 empty squad slots/);
    expect(short.total).toBeLessThan(s.total);

    // A better bench raises only the bench part.
    const weakerBench = [...full.slice(0, 11), ...ids(by('DEF').slice(-1), by('MID').slice(-2), by('ATT').slice(-2))];
    const weak = scoreTeam(fakeParticipant('p3', weakerBench, 0, cfg), cfg, cards);
    const xiKeys = ['quality', 'balance', 'tactics', 'coverage', 'chemistry'];
    const strongXi = scoreTeam(fakeParticipant('p4', [...full.slice(0, 11), ...full.slice(11)], 0, cfg), cfg, cards);
    expect(weak.parts.find((x) => x.key === 'bench')!.score).toBeLessThan(strongXi.parts.find((x) => x.key === 'bench')!.score);
    for (const key of xiKeys) {
      const a = weak.parts.find((x) => x.key === key)!.score;
      const b = strongXi.parts.find((x) => x.key === key)!.score;
      expect(Math.abs(a - b), key).toBeLessThan(25);
    }
    // The classic format scores exactly as before: no bench part, published weights.
    const classic = { ...cfg, squadSize: 11 };
    const old = scoreTeam(fakeParticipant('p5', full.slice(0, 11), 0, classic), classic, cards);
    expect(old.parts.map((x) => x.key)).not.toContain('bench');
    expect(old.parts.find((x) => x.key === 'quality')!.weight).toBe(FOOTBALL_WEIGHTS.quality);
  });

  it('lets managers swap substitutes in and changes formation around the bench', () => {
    const sim = new Sim('football', 2, cfg, pool);
    const p = sim.p(1);
    p.squad = full.map((cardId, i) => ({ cardId, price: 1000, round: i + 1 }));
    expect(act(sim.s, { type: 'autoLineup', pid: p.id }, sim.now).ok).toBe(true);
    const lineup = p.lineup.slice();
    // Swap the starting goalkeeper with the substitute goalkeeper.
    const subGk = lineup.findIndex((id, i) => i >= 11 && (cards[id!] as FootballCard).line === 'GK');
    [lineup[0], lineup[subGk]] = [lineup[subGk], lineup[0]];
    expect(act(sim.s, { type: 'lineup', pid: p.id, lineup }, sim.now).ok).toBe(true);
    expect(lineupValid(p, p.lineup, cfg)).toBe(true);
    expect(effectiveLineup(p, cfg, cards)[0]).toBe(by('GK')[1].id);
    // A lineup that drops a player is refused.
    expect(act(sim.s, { type: 'lineup', pid: p.id, lineup: lineup.slice(0, 15) }, sim.now).ok).toBe(false);
    // 2 GK / 5 DEF / 5 MID / 4 ATT fits every formation with five substitutes, e.g. 4-4-2.
    expect(act(sim.s, { type: 'formation', pid: p.id, formation: '4-4-2' }, sim.now).ok).toBe(true);
    expect(p.formation).toBe('4-4-2');
    expect(effectiveLineup(p, cfg, cards).slice(11).filter(Boolean)).toHaveLength(5);
    // Seven attackers fit 4-3-3 (three start, four on the bench) but would need six subs in 4-4-2.
    const q = sim.p(2);
    q.squad = ids(by('GK').slice(2, 4), by('DEF').slice(5, 9), by('MID').slice(5, 8), by('ATT').slice(4, 11)).map((cardId, i) => ({ cardId, price: 1000, round: i + 1 }));
    expect(benchProblem(lineCounts(q.squad.map((o) => o.cardId), cards), cfg)).toBeNull();
    const r = act(sim.s, { type: 'formation', pid: q.id, formation: '4-4-2' }, sim.now);
    expect(r.ok).toBe(false);
    expect(q.formation ?? '4-3-3').toBe('4-3-3');
  });
});

describe('Gold players, Icons and football tiers', () => {
  it('uses three football tiers: Mythic for Icons and Legends, Legendary 85+, Epic 75–84', () => {
    expect(footballRarity(95, true)).toBe('mythic');
    expect(footballRarity(85, false)).toBe('legendary');
    expect(footballRarity(84, false)).toBe('epic');
    expect(footballRarity(75, false)).toBe('epic');
    const tiers = new Set(getCatalog('football').map((c) => c.rarity));
    expect([...tiers].sort()).toEqual(['epic', 'legendary', 'mythic']);
    for (const c of getCatalog('football') as FootballCard[]) {
      if (c.cardType === 'icon' || c.era === 'Legend') expect(c.rarity, c.name).toBe('mythic');
      else expect(c.rarity, c.name).toBe(c.overall >= 85 ? 'legendary' : 'epic');
    }
    // Heroes keep their five rarity themes.
    expect(new Set(getCatalog('avengers').map((c) => c.rarity)).size).toBeGreaterThan(3);
    // A host edit keeps an Icon Mythic and re-tiers a current player.
    const icon = pool.find((c) => c.cardType === 'icon')!;
    const gold = pool.find((c) => c.cardType === 'standard' && c.overall >= 85)!;
    const edited = applyCustom(getCatalog('football'), { edits: { [icon.id]: { overall: 80, stats: icon.stats }, [gold.id]: { overall: 80, stats: gold.stats } }, imported: [] }, 'football');
    expect(edited.find((c) => c.id === icon.id)!.rarity).toBe('mythic');
    expect(edited.find((c) => c.id === gold.id)!.rarity).toBe('epic');
  });

  it('has enough Gold players and Icons for eight strict 16-player squads in every formation', () => {
    for (const formation of ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '5-3-2'] as const) {
      const c: MatchConfig = sanitizeConfig({ ...cfg, formation, slots: undefined }, 'local');
      expect(c.squadSize, formation).toBe(16);
      const check = validateSetup(c, NAMES, buildPool(getCatalog('football'), c));
      expect(check.errors, formation).toEqual([]);
      expect(check.needed).toBe(128);
    }
  });

  it('plays whole 16-player auctions with money, ownership and benches intact', () => {
    for (const seed of [21, 22, 23, 24]) {
      const players = 2 + (seed % 7);
      const sim = new Sim('football', players, { ...cfg, shuffle: true, seed, timerSec: 10 });
      const s = playOut(sim, seed * 31, 0.9);
      expect(s.phase).toBe('finished');
      const owned = new Set<string>();
      for (const p of s.participants) {
        expect(p.budget + p.squad.reduce((a, o) => a + o.price, 0)).toBe(s.config.budget);
        expect(p.squad.length).toBeLessThanOrEqual(16);
        for (const o of p.squad) { expect(owned.has(o.cardId)).toBe(false); owned.add(o.cardId); }
        // Strict rules held: every squad fits its formation plus the bench.
        expect(benchProblem(lineCounts(p.squad.map((o) => o.cardId), s.cards), s.config), p.name).toBeNull();
        const lineup = effectiveLineup(p, s.config, s.cards);
        expect(lineup).toHaveLength(16);
        expect(lineup.filter(Boolean).sort()).toEqual(p.squad.map((o) => o.cardId).sort());
      }
      const ranking = rankTeams(s.participants, s.config, s.cards);
      expect(ranking[0].rank).toBe(1);
      expect(ranking.every((r) => r.score.total >= 0 && r.score.total <= 100)).toBe(true);
    }
  });
});

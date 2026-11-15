import { describe, expect, it } from 'vitest';
import type { Card } from '../shared/types';
import { defaultConfig } from '../shared/engine';
import { AVENGERS_WEIGHTS, computeAwards, evalSynergies, FOOTBALL_WEIGHTS, goalkeeperAttributeRating, rankTeams, scoreTeam, simulateBattle, SYNERGY_CAP } from '../shared/scoring';
import { FOOTBALLERS } from '../shared/data/football';
import { HEROES } from '../shared/data/heroes';
import { GUESS_CAP } from '../shared/engine';
import { fakeParticipant, playOut, Sim } from './helpers';

const fCards: Record<string, Card> = Object.fromEntries(FOOTBALLERS.map((c) => [c.id, c]));
const hCards: Record<string, Card> = Object.fromEntries(HEROES.map((c) => [c.id, c]));
const fcfg = defaultConfig('football');
const hcfg = defaultConfig('avengers');
const ids = (names: string[], list: Card[]) => names.map((n) => list.find((c) => c.name === n)!.id);

const XI = ids(['Gianluigi Buffon', 'Paolo Maldini', 'Franco Baresi', 'Cafu', 'Roberto Carlos', 'Xavi', 'Andrea Pirlo', 'Rodri', 'Lionel Messi', 'Pelé', 'Thierry Henry'], FOOTBALLERS);

describe('football scoring', () => {
  it('uses the published weights and is fully deterministic', () => {
    expect(FOOTBALL_WEIGHTS).toEqual({ quality: 0.4, balance: 0.2, tactics: 0.15, coverage: 0.15, chemistry: 0.1 });
    expect(AVENGERS_WEIGHTS).toEqual({ capability: 0.4, synergy: 0.25, diversity: 0.2, strategy: 0.15 });
    expect(Object.values(FOOTBALL_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Object.values(AVENGERS_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const p = fakeParticipant('a', XI, 100_000, fcfg);
    const one = scoreTeam(p, fcfg, fCards);
    const two = scoreTeam(JSON.parse(JSON.stringify(p)), fcfg, fCards);
    expect(one).toEqual(two);
    const weighted = one.parts.reduce((a, x) => a + x.score * x.weight, 0);
    expect(one.total).toBeCloseTo(weighted, 0);
    expect(one.complete).toBe(true);
    expect(one.total).toBeGreaterThan(60);
    expect(one.total).toBeLessThanOrEqual(100);
  });

  it('rewards positional balance and penalises players out of position', () => {
    const balanced = scoreTeam(fakeParticipant('a', XI, 0, fcfg), fcfg, fCards);
    const elevenStrikers = ids(['Lionel Messi', 'Pelé', 'Thierry Henry', 'Cristiano Ronaldo', 'Kylian Mbappé', 'Erling Haaland', 'Romário', 'Gerd Müller', 'Luis Suárez', 'Harry Kane', 'Karim Benzema'], FOOTBALLERS);
    const casual = { ...fcfg, rules: 'casual' as const };
    const lopsided = scoreTeam(fakeParticipant('b', elevenStrikers, 0, casual), casual, fCards);
    // This XI includes secondary positions: precise fit is high but no longer an automatic 100.
    expect(balanced.parts.find((x) => x.key === 'balance')!.score).toBeGreaterThan(90);
    expect(balanced.parts.find((x) => x.key === 'balance')!.score).toBeLessThan(100);
    expect(lopsided.parts.find((x) => x.key === 'balance')!.score).toBeLessThan(50);
    expect(lopsided.flags.map((f) => f.text)).toContain('Missing goalkeeper');
    expect(balanced.total).toBeGreaterThan(lopsided.total);
  });

  it('applies an explicit penalty per empty slot and ranks complete squads first', () => {
    const full = ids(['Hugo Lloris', 'Kyle Walker', 'John Stones', 'Andrew Robertson', 'Sergio Ramos', 'Gavi', 'Kobbie Mainoo', 'Moisés Caicedo', 'Sunil Chhetri', 'Darwin Núñez', 'Ollie Watkins'], FOOTBALLERS);
    const a = fakeParticipant('modest-but-complete', full, 0, fcfg);
    const b = fakeParticipant('stars-but-incomplete', XI.slice(0, 10), 0, fcfg);
    const sb = scoreTeam(b, fcfg, fCards);
    expect(sb.penalties[0].points).toBe(-fcfg.emptyPenalty);
    expect(sb.complete).toBe(false);
    const ranked = rankTeams([b, a], fcfg, fCards);
    expect(ranked[0].p.id).toBe('modest-but-complete');
    const alt = rankTeams([b, a], { ...fcfg, completeFirst: false }, fCards); // host-selected alternate rule
    expect(alt[0].score.total).toBeGreaterThanOrEqual(alt[1].score.total);
  });

  it('uses goalkeeper attributes explicitly in quality and head-to-head output', () => {
    const keeper = FOOTBALLERS.find((c) => c.name === 'Gianluigi Buffon')!;
    const weakKeeper = { ...keeper, id: 'f-test-weak-keeper', name: 'Test Weak Keeper', stats: [70, 70, 70, 70, 70, 70] };
    const cards = { ...fCards, [weakKeeper.id]: weakKeeper };
    const strong = scoreTeam(fakeParticipant('strong', XI, 0, fcfg), fcfg, cards);
    const weak = scoreTeam(fakeParticipant('weak', [weakKeeper.id, ...XI.slice(1)], 0, fcfg), fcfg, cards);
    expect(goalkeeperAttributeRating(keeper)).toBeGreaterThan(goalkeeperAttributeRating(weakKeeper));
    expect(strong.parts.find((x) => x.key === 'quality')!.score).toBeGreaterThan(weak.parts.find((x) => x.key === 'quality')!.score);
    expect(strong.compare.find((x) => x.label === 'Goalkeeping')!.value).toBeGreaterThan(weak.compare.find((x) => x.label === 'Goalkeeping')!.value);
    expect(strong.parts.find((x) => x.key === 'quality')!.lines.join(' ')).toMatch(/DIV 20%.*REF 25%/);
  });

  it('breaks ties by completeness, coverage, then remaining budget, then shares the place', () => {
    const rich = fakeParticipant('rich', XI, 300_000, fcfg);
    const poor = fakeParticipant('poor', XI, 100_000, fcfg);
    const r = rankTeams([poor, rich], fcfg, fCards);
    expect(r.map((x) => x.p.id)).toEqual(['rich', 'poor']);
    expect(r.map((x) => x.rank)).toEqual([1, 2]);
    const twin = fakeParticipant('twin', XI, 300_000, fcfg);
    const shared = rankTeams([rich, twin, poor], fcfg, fCards);
    expect(shared.map((x) => x.rank)).toEqual([1, 1, 3]);
    expect(shared[0].shared && shared[1].shared).toBe(true);
    expect(shared[2].shared).toBe(false);
  });

  it('caps the Mystery guess bonus', () => {
    const p = fakeParticipant('a', XI.slice(0, 5), 0, fcfg);
    const base = scoreTeam(p, fcfg, fCards).total;
    p.guessHits = 50;
    expect(scoreTeam(p, fcfg, fCards).total - base).toBeCloseTo(GUESS_CAP);
  });
});

describe('avengers scoring', () => {
  const team = (names: string[]) => fakeParticipant(names[0], ids(names, HEROES), 0, hcfg);

  it('lets a synergistic, diverse team beat a higher-rated one-dimensional team', () => {
    const smart = team(['Captain America', 'Iron Man', 'Doctor Strange', 'Invisible Woman', 'Storm']);
    const brute = team(['Thanos', 'Dormammu', 'Hela', 'Ultron', 'Doctor Doom']);
    const a = scoreTeam(smart, hcfg, hCards);
    const b = scoreTeam(brute, hcfg, hCards);
    expect(b.avgOverall).toBeGreaterThan(a.avgOverall);
    expect(a.parts.find((x) => x.key === 'synergy')!.score).toBeGreaterThan(b.parts.find((x) => x.key === 'synergy')!.score);
    expect(a.total).toBeGreaterThan(b.total);
  });

  it('caps synergy so combinations cannot run away', () => {
    const all = HEROES.filter((h) => h.pack === 'core');
    expect(evalSynergies(all).points).toBeLessThanOrEqual(SYNERGY_CAP);
    const five = ids(['Thor', 'Iron Man', 'Captain America', 'Doctor Strange', 'Black Widow'], HEROES).map((id) => hCards[id]);
    const res = evalSynergies(five as never);
    expect(res.hits.filter((h) => h.active).map((h) => h.id)).toEqual(expect.arrayContaining(['tac', 'ward', 'rally', 'cover', 'aff-avengers']));
    expect(res.points).toBe(SYNERGY_CAP);
  });

  it('applies lone-wolf penalties that are visible in the breakdown', () => {
    const s = scoreTeam(team(['Loki', 'Thanos', 'Ultron']), hcfg, hCards);
    expect(s.synergies.filter((x) => x.name === 'Lone Wolf')).toHaveLength(3);
    expect(s.flags.some((f) => /lone wol/.test(f.text))).toBe(true);
    expect(s.penalties[0].points).toBe(-2 * hcfg.emptyPenalty);
  });

  it('runs a reproducible seeded exhibition battle', () => {
    const a = team(['Thor', 'Iron Man', 'Captain America', 'Doctor Strange', 'Black Widow']);
    const b = team(['Hulk', 'Spider-Man', 'Vision', 'Wong', 'Mantis']);
    const one = simulateBattle(a, b, hCards, 42);
    expect(simulateBattle(a, b, hCards, 42)).toEqual(one);
    expect(one.rounds).toHaveLength(5);
    expect(one.winsA + one.winsB).toBeLessThanOrEqual(5);
  });
});

describe('results from real auction records', () => {
  it('ranks every team and derives awards from actual sales', () => {
    for (const mode of ['football', 'avengers'] as const) {
      const sim = new Sim(mode, 4, { shuffle: true, seed: 7, timerSec: 10 });
      const s = playOut(sim, 99);
      const ranking = rankTeams(s.participants, s.config, s.cards);
      expect(ranking).toHaveLength(4);
      expect(ranking[0].rank).toBe(1);
      for (let i = 1; i < ranking.length; i++) expect(ranking[i].rank).toBeGreaterThanOrEqual(ranking[i - 1].rank);
      const awards = computeAwards(s.participants, s.sales, s.config, s.cards, ranking);
      expect(awards.map((a) => a.id)).toEqual(['bargain', 'pricey', 'strong', 'smart', 'chem', ...(mode === 'football' ? ['defense', 'midfield', 'attack', 'tactics'] : [])]);
      const pricey = s.sales.filter((x) => x.type === 'sold').sort((a, b) => b.price - a.price)[0];
      expect(awards.find((a) => a.id === 'pricey')!.detail).toContain(s.cards[pricey.cardId].name);
      for (const a of awards) expect(s.participants.map((p) => p.name)).toContain(a.winner);
    }
  });
});

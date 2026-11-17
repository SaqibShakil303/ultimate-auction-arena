// The bundled official EA SPORTS FC 27 dataset: provenance, completeness and honest labelling.

import { describe, expect, it } from 'vitest';
import type { FootballCard } from '../shared/types';
import { buildPool, defaultConfig, validateSetup } from '../shared/engine';
import { applyCustom, getCatalog } from '../shared/catalog';
import { FC27_RETRIEVED, FC27_ROWS, FC27_SOURCE } from '../shared/data/fc27';
import { rankTeams } from '../shared/scoring';
import { playOut, Sim } from './helpers';

const catalog = getCatalog('football') as FootballCard[];
const fc27 = catalog.filter((c) => c.ratingMode === 'fc27');
const cfg27 = { ...defaultConfig('football'), ratingMode: 'fc27' as const };

describe('official FC 27 dataset', () => {
  it('ships a complete, verified record for every bundled player', () => {
    expect(fc27.length).toBe(FC27_ROWS.length);
    expect(fc27.length).toBeGreaterThanOrEqual(250);
    expect(FC27_SOURCE).toBe('https://www.ea.com/games/ea-sports-fc/ratings');
    expect(FC27_RETRIEVED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(fc27.map((c) => c.id)).size).toBe(fc27.length);
    for (const c of fc27) {
      expect(c).toMatchObject({ edition: 'FC 27', cardType: 'standard', verificationStatus: 'verified', verifiedAt: FC27_RETRIEVED });
      expect(c.source).toMatch(/^https:\/\/www\.ea\.com\/games\/ea-sports-fc\/ratings\/player-ratings\/[a-z0-9-]+\/\d+$/);
      expect(c.overall >= 40 && c.overall <= 99).toBe(true);
      expect(c.stats).toHaveLength(6);
      c.stats.forEach((v) => expect(Number.isInteger(v) && v >= 1 && v <= 99).toBe(true));
      expect(c.nation && c.club && c.pos).toBeTruthy();
      expect(c.clues).toHaveLength(3);
    }
  });

  it('carries the published numbers through unchanged', () => {
    // Spot checks against values read from the EA page when the file was generated.
    const row = (name: string) => FC27_ROWS.find((r) => r.name === name)!;
    const card = (name: string) => fc27.find((c) => c.name === name)!;
    for (const name of ['Kylian Mbappé', 'Erling Haaland', 'Thibaut Courtois', 'Lionel Messi', 'Sunil Chhetri']) {
      expect(card(name).overall).toBe(row(name).overall);
      expect(card(name).stats).toEqual(row(name).stats);
      expect(card(name).pos).toBe(row(name).pos);
      expect(card(name).club).toBe(row(name).club);
    }
    expect(card('Kylian Mbappé')).toMatchObject({ overall: 91, pos: 'ST', stats: [96, 91, 80, 92, 29, 76] });
    expect(card('Thibaut Courtois')).toMatchObject({ overall: 90, pos: 'GK', line: 'GK', stats: [87, 89, 78, 90, 46, 90] }); // DIV HAN KIC REF SPD POS
  });

  it('never presents a custom card as official, and never an official one as custom', () => {
    for (const c of catalog) {
      if (c.ratingMode === 'fc27') expect(c.id.startsWith('fc27-')).toBe(true);
      else expect(c).toMatchObject({ ratingMode: 'prime', edition: 'Prime Legends', cardType: 'custom', verificationStatus: 'custom', source: null });
    }
    // A host edit to an official card removes its verified status, so it drops out of the official pool.
    const target = fc27[0];
    const edited = applyCustom(catalog, { edits: { [target.id]: { overall: 99, stats: target.stats } }, imported: [] }, 'football') as FootballCard[];
    expect(edited.find((c) => c.id === target.id)!.verificationStatus).toBe('unverified');
    expect(buildPool(edited, cfg27).some((c) => c.id === target.id)).toBe(false);
  });

  it('builds an official pool, with legends only as clearly labelled custom guests', () => {
    const both = buildPool(catalog, cfg27) as FootballCard[];
    const officialOnly = buildPool(catalog, { ...cfg27, packs: ['modern'] }) as FootballCard[];
    const legends = both.filter((c) => c.ratingMode !== 'fc27');
    expect(officialOnly).toHaveLength(fc27.length);
    expect(officialOnly.every((c) => c.verificationStatus === 'verified')).toBe(true);
    expect(legends.length).toBeGreaterThan(40);
    expect(legends.every((c) => c.pack === 'legends' && c.verificationStatus === 'custom' && c.era === 'Legend')).toBe(true);
    // Classic custom versions of current players never leak into an official match.
    expect(both.some((c) => c.id === 'f-lionel-messi')).toBe(false);
    expect(both.filter((c) => c.name === 'Lionel Messi')).toHaveLength(1);
    // Prime Legends mode is unchanged: the classic custom table only.
    const prime = buildPool(catalog, defaultConfig('football')) as FootballCard[];
    expect(prime.every((c) => c.ratingMode === 'prime')).toBe(true);
    expect(prime).toHaveLength(134);
  });

  it('has enough official players of every position for eight strict squads in each formation', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (const formation of ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '5-3-2'] as const) {
      const slots = { '4-3-3': { GK: 1, DEF: 4, MID: 3, ATT: 3 }, '4-4-2': { GK: 1, DEF: 4, MID: 4, ATT: 2 }, '4-2-3-1': { GK: 1, DEF: 4, MID: 5, ATT: 1 }, '3-5-2': { GK: 1, DEF: 3, MID: 5, ATT: 2 }, '5-3-2': { GK: 1, DEF: 5, MID: 3, ATT: 2 } }[formation];
      const cfg = { ...cfg27, packs: ['modern'], formation, slots };
      expect(validateSetup(cfg, names, buildPool(catalog, cfg)).errors, formation).toEqual([]);
    }
  });

  it('plays whole auctions on official data with money and ownership intact', () => {
    for (const seed of [11, 12, 13]) {
      const sim = new Sim('football', 2 + seed % 5, { ratingMode: 'fc27', shuffle: true, seed, timerSec: 10 });
      expect(Object.values(sim.s.cards).some((c) => (c as FootballCard).ratingMode === 'fc27')).toBe(true);
      const s = playOut(sim, seed * 17);
      expect(s.phase).toBe('finished');
      const owned = new Set<string>();
      for (const p of s.participants) {
        expect(p.budget + p.squad.reduce((a, o) => a + o.price, 0)).toBe(s.config.budget);
        for (const o of p.squad) { expect(owned.has(o.cardId)).toBe(false); owned.add(o.cardId); }
      }
      const ranking = rankTeams(s.participants, s.config, s.cards);
      expect(ranking[0].rank).toBe(1);
      expect(ranking.every((r) => r.score.total >= 0 && r.score.total <= 100)).toBe(true);
    }
  });
});

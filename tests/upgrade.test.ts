import { describe, expect, it } from 'vitest';
import { normalizeCard, applyCustom, getCatalog } from '../shared/catalog';
import { parseCardCsv } from '../shared/cardImport';
import { act, autoLineup, buildPool, defaultConfig, fitOf, FORMATIONS, positionRows, slotPositions, slotsForFormation, teamConfig } from '../shared/engine';
import { sanitizeAction, sanitizeConfig } from '../shared/config';
import { FOOTBALLERS } from '../shared/data/football';
import type { FootballCard } from '../shared/types';
import { Sim } from './helpers';
import { scoreTeam } from '../shared/scoring';
import { createFriendsChampionship } from '../shared/demo';

const official = {
  name: 'Import Test Player', overall: 88, stats: [80, 82, 91, 89, 75, 78], pos: 'CM',
  nation: 'India', club: 'Test FC', ratingMode: 'fc27', cardType: 'standard',
  source: 'https://www.ea.com/games/ea-sports-fc/ratings/player-ratings/test/1',
  verifiedAt: '2026-11-15', verificationStatus: 'verified',
};

describe('official rating import integrity', () => {
  it('keeps editions separate and excludes incomplete, edited and unverified cards', () => {
    const a = normalizeCard(official, 'football') as FootballCard;
    const b = normalizeCard({ ...official, ratingMode: 'fc26' }, 'football') as FootballCard;
    const incomplete = normalizeCard({ ...official, name: 'Incomplete', overall: undefined, stats: [88] }, 'football') as FootballCard;
    expect(a.id).not.toBe(b.id);
    expect(incomplete.overall).toBe(0);
    expect(incomplete.stats).toEqual([88, 0, 0, 0, 0, 0]);
    expect(incomplete.verificationStatus).toBe('unverified');
    expect(normalizeCard(incomplete, 'football')).toEqual(incomplete);
    const cfg = { ...defaultConfig('football'), ratingMode: 'fc27' as const };
    // Imported cards: only the complete, verified FC 27 one joins the official pool.
    const pool = buildPool([...getCatalog('football'), a, b, incomplete], cfg);
    expect(pool.filter((c) => c.pack === 'custom')).toEqual([a]);
    // FC 26 has no bundled data, so its pool is exactly the verified import plus optional legend guests.
    expect(buildPool(getCatalog('football'), { ...cfg, ratingMode: 'fc26' as const })).toEqual([]); // no official data → no pool, even with legends on
    const fc26 = { ...cfg, ratingMode: 'fc26' as const, packs: ['modern'] };
    expect(buildPool([...getCatalog('football'), a, b, incomplete], fc26)).toEqual([b]);
    const edited = applyCustom([a], { edits: { [a.id]: { overall: 99, stats: a.stats } }, imported: [] }, 'football');
    expect(buildPool(edited, cfg)).toEqual([]);
  });

  it('requires complete identity, real calendar dates and an HTTPS EA source', () => {
    for (const patch of [
      { nation: '' }, { club: '' }, { pos: 'INVALID' }, { stats: [80, 82, 91, 89, 75, 100] },
      { source: 'https://ea.com.attacker.example/ratings' }, { source: 'http://www.ea.com/ratings' },
      { verifiedAt: '2026-02-30' }, { cardType: 'custom' },
    ]) expect((normalizeCard({ ...official, ...patch }, 'football') as FootballCard).verificationStatus).toBe('unverified');
  });

  it('parses quoted CSV, UTF-8 names, GK attributes, source and image attribution', () => {
    const csv = 'name,ovr,pos,nationality,club,DIV,HAN,KIC,REF,SPD,positioning,rating_system,card_type,source_url,date_verified,verification_status,playstyles,image_license,image_attribution\r\n"José, Keeper",88,GK,Spain,"Example ""FC""",90,85,82,91,60,89,fc27,standard,https://www.ea.com/ratings,2026-11-15,verified,Far Reach|Footwork,CC BY 4.0,Photographer';
    const card = normalizeCard(parseCardCsv(csv, 'football', 'prime')[0], 'football') as FootballCard;
    expect(card).toMatchObject({ name: 'José, Keeper', club: 'Example "FC"', stats: [90, 85, 82, 91, 60, 89], verificationStatus: 'verified', playStyles: ['Far Reach', 'Footwork'] });
    expect(card.imageMeta).toMatchObject({ license: 'CC BY 4.0', attribution: 'Photographer' });
    expect(() => parseCardCsv('name,overall\n"Incomplete,88', 'football', 'fc27')).toThrow(/Unclosed/);
  });

  it('keeps blank official CSV numbers missing instead of filling them with invented defaults', () => {
    const card = normalizeCard(parseCardCsv('name,overall,pos\nMissing,,ST', 'football', 'fc26')[0], 'football') as FootballCard;
    expect(card.overall).toBe(0);
    expect(card.stats).toEqual([0, 0, 0, 0, 0, 0]);
    expect(card.verificationStatus).toBe('unverified');
  });

  it('continues applying legacy custom-card edits after the edition-aware ID upgrade', () => {
    const cards = applyCustom([], { imported: [{ name: 'Local Star', overall: 80 }], edits: { 'c-local-star': { overall: 90, stats: [90, 90, 90, 90, 90, 90] } } }, 'football');
    expect(cards[0].overall).toBe(90);
  });
  it('retains the source edition on a verified Icon included in Prime mode', () => {
    const icon = normalizeCard({ ...official, ratingMode: 'prime', cardType: 'icon', edition: 'FC 26' }, 'football') as FootballCard;
    expect(icon).toMatchObject({ ratingMode: 'prime', edition: 'FC 26', cardType: 'icon', verificationStatus: 'verified' });
  });
});

describe('position-aware team formations', () => {
  it('optimizes the whole XI rather than stranding Ballack at right-back behind Desailly', () => {
    const state = createFriendsChampionship(0);
    const team = state.participants.find((p) => p.name === 'Saqib')!;
    const positions = slotPositions(state.config);
    const rightBack = state.cards[team.lineup[positions.indexOf('RB')]!] as FootballCard;
    expect(rightBack.line).toBe('DEF');
    const ballackIndex = team.lineup.findIndex((id) => id && state.cards[id].name === 'Michael Ballack');
    expect(['CM', 'CDM']).toContain(positions[ballackIndex]);
    expect(new Set(team.lineup).size).toBe(11);
  });
  it('awards no tactical points to an empty squad', () => {
    const sim = new Sim('football', 2);
    const score = scoreTeam(sim.p(1), sim.cfg, sim.s.cards);
    expect(score.parts.every((p) => p.score === 0)).toBe(true);
    expect(score.total).toBe(0);
  });
  it('represents all six presets as eleven precise slots with one goalkeeper', () => {
    for (const formation of FORMATIONS) {
      const cfg = { ...defaultConfig('football'), formation, slots: slotsForFormation(formation) };
      expect(slotPositions(cfg)).toHaveLength(11);
      expect(slotPositions(cfg).filter((p) => p === 'GK')).toHaveLength(1);
    }
    expect(positionRows({ ...defaultConfig('football'), formation: '4-2-3-1', slots: slotsForFormation('4-2-3-1') })).toHaveLength(5);
  });

  it('distinguishes natural, listed secondary and same-line positions', () => {
    const maldini = FOOTBALLERS.find((c) => c.name === 'Paolo Maldini')!;
    expect(fitOf(maldini, maldini.pos)).toBe(1);
    expect(fitOf(maldini, maldini.alt[0])).toBe(0.92);
    expect(fitOf({ ...maldini, pos: 'LB', alt: [], altLines: [] }, 'RB')).toBe(0.82);
    expect(fitOf(maldini, 'GK')).toBe(0.4);
  });

  it('authenticates formation actions and preserves all owners and balances', () => {
    const sim = new Sim('football', 2, { rules: 'casual' });
    sim.open(); sim.bid('p1', sim.s.lot!.opening); sim.close();
    const before = structuredClone(sim.p(1));
    const action = sanitizeAction({ type: 'formation', pid: 'p2', formation: '4-2-3-1' }, 'p1')!;
    expect(act(sim.s, action, sim.now).ok).toBe(true);
    expect(sim.p(1)).toMatchObject({ squad: before.squad, budget: before.budget, formation: '4-2-3-1' });
    expect(sim.p(2).formation).toBeUndefined();
    expect(sim.p(1).lineup.filter(Boolean)).toEqual(before.squad.map((o) => o.cardId));
    expect(teamConfig(sim.p(1), sim.cfg).slots.MID).toBe(5);
    expect(sanitizeAction({ type: 'formation', formation: '__proto__' }, 'p1')).toBeNull();
  });

  it('keeps strict line limits enforced and locks tactical changes after the final result', () => {
    const sim = new Sim('football', 2);
    const defs = FOOTBALLERS.filter((c) => c.line === 'DEF').slice(0, 4);
    sim.p(1).squad = defs.map((c, round) => ({ cardId: c.id, price: 1000, round }));
    sim.p(1).lineup = autoLineup(defs.map((c) => c.id), sim.cfg, sim.s.cards);
    expect(act(sim.s, { type: 'formation', pid: 'p1', formation: '3-5-2' }, sim.now)).toMatchObject({ ok: false, code: 'slot' });
    act(sim.s, { type: 'end' }, sim.now);
    expect(act(sim.s, { type: 'formation', pid: 'p1', formation: '4-4-2' }, sim.now)).toMatchObject({ ok: false, code: 'finished' });
  });

  it('preserves explicitly custom formations from saved settings', () => {
    const cfg = sanitizeConfig({ ...defaultConfig('football'), formation: null }, 'local');
    expect(cfg.formation).toBeNull();
    expect(slotPositions(cfg)).toEqual(['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT']);
  });
});

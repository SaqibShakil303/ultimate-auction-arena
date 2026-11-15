import type { Card, MatchConfig, MatchState, Mode, Participant } from '../shared/types';
import { act, buildPool, checkBid, createMatch, defaultConfig, tick } from '../shared/engine';
import { getCatalog } from '../shared/catalog';
import { mulberry32 } from '../shared/util';

export const NAMES = ['Saqib', 'Rahul', 'Aman', 'Priya', 'Zoya', 'Kabir', 'Meera', 'Dev'];

/** Deterministic test harness around the engine with a fake clock. */
export class Sim {
  now = 1_000_000;
  s: MatchState;
  cfg: MatchConfig;
  private n = 0;

  constructor(mode: Mode, players: number, over: Partial<MatchConfig> = {}, pool?: Card[]) {
    this.cfg = { ...defaultConfig(mode), shuffle: false, ...over };
    const cards = pool ?? buildPool(getCatalog(mode), this.cfg);
    this.s = createMatch(this.cfg, NAMES.slice(0, players).map((name, i) => ({ id: 'p' + (i + 1), name, team: '' })), cards, this.now);
  }
  advance(ms: number) {
    this.now += ms;
    return tick(this.s, this.now);
  }
  /** Runs the clock until bidding opens (or the match finishes). */
  open() {
    let guard = 0;
    while (this.s.phase !== 'bidding' && this.s.phase !== 'finished' && guard++ < 500) this.advance(250);
    return this.s.lot;
  }
  /** Runs the clock until the current lot is resolved. */
  close() {
    let guard = 0;
    while (this.s.phase === 'bidding' && guard++ < 2000) this.advance(250);
  }
  bid(pid: string, amount: number, bidId?: string) {
    return act(this.s, { type: 'bid', pid, amount, bidId: bidId ?? `b${++this.n}` }, this.now);
  }
  p(i: number): Participant {
    return this.s.participants[i - 1];
  }
  card(): Card {
    return this.s.cards[this.s.lot!.cardId];
  }
}

/** Plays a whole auction with seeded random bidders. */
export function playOut(sim: Sim, seed: number, appetite = 0.75) {
  const rnd = mulberry32(seed);
  let guard = 0;
  while (sim.s.phase !== 'finished' && guard++ < 5000) {
    sim.open();
    if ((sim.s.phase as string) === 'finished') break;
    for (let round = 0; round < 6; round++) {
      for (const p of sim.s.participants) {
        const chk = checkBid(sim.s, sim.s.cards, p.id);
        if (chk.ok && rnd() < appetite / (round + 1)) {
          const extra = Math.floor(rnd() * 3) * sim.cfg.increment;
          sim.bid(p.id, Math.min(chk.max, chk.min + extra));
        }
      }
      sim.advance(500);
      if ((sim.s.phase as string) !== 'bidding') break;
    }
    sim.close();
  }
  return sim.s;
}

export function fakeParticipant(id: string, cardIds: string[], budget: number, cfg: MatchConfig): Participant {
  return {
    id, name: id, team: id, budget, squad: cardIds.map((cardId, i) => ({ cardId, price: 1000, round: i + 1 })),
    lineup: [], manual: false, guessHits: 0, connected: true,
  };
}

// The auction engine: one deterministic, clock-injected state machine shared by Football and
// Avengers modes. The browser runs it for local pass-and-play; the server runs the very same
// code as the single authority for online rooms.

import type {
  Action, ActResult, BidCheck, BidCtx, Card, FootballCard, FormationName, HeroCard, Line, Lot,
  MatchConfig, MatchState, Mode, Participant, PublicMatch, Sale,
} from './types';
import { LINES } from './types';
import { LINE_OF } from './data/football';
import { compactINR, formatINR, shuffled } from './util';

export const INTRO_MS = 2500;
export const RESULT_MS = 3200;
export const CLUE_STEP_MS = 5000;
export const CLUE_STAGES = 3;
export const UNCONTESTED_MS = 2500;
export const EMPTY_MS = 1200;
export const MAX_PASS = 1;
export const GUESS_BONUS = 0.5;
export const GUESS_CAP = 3;

/** Named 11-player formations expressed through the engine's established line model. */
export const FORMATION_SLOTS: Record<FormationName, Record<Line, number>> = {
  '4-3-3': { GK: 1, DEF: 4, MID: 3, ATT: 3 },
  '4-4-2': { GK: 1, DEF: 4, MID: 4, ATT: 2 },
  '4-2-3-1': { GK: 1, DEF: 4, MID: 5, ATT: 1 },
  '4-1-2-1-2': { GK: 1, DEF: 4, MID: 4, ATT: 2 },
  '3-5-2': { GK: 1, DEF: 3, MID: 5, ATT: 2 },
  '5-3-2': { GK: 1, DEF: 5, MID: 3, ATT: 2 },
};
export const FORMATIONS = Object.keys(FORMATION_SLOTS) as FormationName[];
export const slotsForFormation = (formation: FormationName): Record<Line, number> => ({ ...FORMATION_SLOTS[formation] });
export const FORMATION_ROWS: Record<FormationName, string[][]> = {
  '4-3-3': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CM', 'CDM', 'CM'], ['LW', 'ST', 'RW']],
  '4-4-2': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['LM', 'CM', 'CM', 'RM'], ['ST', 'ST']],
  '4-2-3-1': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM', 'CDM'], ['LM', 'CAM', 'RM'], ['ST']],
  '4-1-2-1-2': [['GK'], ['LB', 'CB', 'CB', 'RB'], ['CDM'], ['CM', 'CM'], ['CAM'], ['ST', 'ST']],
  '3-5-2': [['GK'], ['CB', 'CB', 'CB'], ['LM', 'CDM', 'CM', 'CAM', 'RM'], ['ST', 'ST']],
  '5-3-2': [['GK'], ['LWB', 'CB', 'CB', 'CB', 'RWB'], ['CM', 'CDM', 'CM'], ['ST', 'ST']],
};
/** Starting places in a football formation (the XI); for heroes the whole team. */
export function startersOf(cfg: MatchConfig): number {
  return cfg.mode === 'football' ? LINES.reduce((a, l) => a + (cfg.slots[l] || 0), 0) : cfg.squadSize;
}
/** Football substitutes: squad places beyond the starting formation. */
export function subsOf(cfg: MatchConfig): number {
  return cfg.mode === 'football' ? Math.max(0, cfg.squadSize - startersOf(cfg)) : 0;
}
export const MAX_SUBS = 7;
/** At most this many goalkeepers may sit on the bench under Strict rules. */
export const MAX_BENCH_GK = 1;

/**
 * Strict roster check for a football squad: each line fills its starting places first; anything
 * beyond goes to the bench, which holds subsOf(cfg) players and at most one extra goalkeeper.
 * Returns why the counts do not fit, or null when they do.
 */
export function benchProblem(counts: Record<Line, number>, cfg: MatchConfig): string | null {
  const subs = subsOf(cfg);
  const extra = LINES.reduce((a, l) => a + Math.max(0, counts[l] - (cfg.slots[l] || 0)), 0);
  if (extra > subs) return subs ? `Bench full (${subs}/${subs} substitutes)` : 'No bench in this format';
  if (counts.GK - (cfg.slots.GK || 0) > MAX_BENCH_GK) return `Only ${MAX_BENCH_GK} substitute goalkeeper allowed`;
  return null;
}
export function lineCounts(ids: string[], cards: Record<string, Card>): Record<Line, number> {
  const counts: Record<Line, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const id of ids) { const c = cards[id]; if (c?.kind === 'football') counts[c.line]++; }
  return counts;
}

/** Tactical settings can vary per team; auction-wide budgets and squad limits never change. */
export function teamConfig(p: Participant, cfg: MatchConfig): MatchConfig {
  return cfg.mode === 'football' && startersOf(cfg) === 11 && p.formation && FORMATIONS.includes(p.formation)
    ? { ...cfg, formation: p.formation, slots: slotsForFormation(p.formation) } : cfg;
}
export function positionRows(cfg: MatchConfig): string[][] {
  if (cfg.formation && startersOf(cfg) === 11 && LINES.every((l) => cfg.slots[l] === FORMATION_SLOTS[cfg.formation!][l])) {
    return FORMATION_ROWS[cfg.formation];
  }
  return LINES.map((l) => Array<string>(cfg.slots[l] || 0).fill(l)).filter((row) => row.length);
}
export const slotPositions = (cfg: MatchConfig): string[] => positionRows(cfg).flat();

// ───────────────────────── pricing (scales with budget) ─────────────────────────

const TIERS: [number, number][] = [[94, 0.05], [90, 0.04], [86, 0.03], [82, 0.02], [0, 0.01]];

export function priceUnit(budget: number): number {
  return Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(budget, 10))) - 3));
}
function roundTo(x: number, unit: number): number {
  return Math.max(unit, Math.round(x / unit) * unit);
}
/** Opening price: a rating-tier share of the starting budget, scaled so a full squad of minimum-price cards costs 10% of it. */
export function basePrice(overall: number, cfg: MatchConfig): number {
  const f = TIERS.find((t) => overall >= t[0])![1];
  return roundTo(cfg.budget * f * (10 / cfg.squadSize), priceUnit(cfg.budget));
}
export function minPrice(cfg: MatchConfig): number {
  return basePrice(0, cfg);
}
export function lotPrice(card: Card, cfg: MatchConfig, pass: number): number {
  const b = basePrice(card.overall, cfg);
  return pass > 0 ? Math.max(minPrice(cfg), roundTo(b * 0.5, priceUnit(cfg.budget))) : b;
}
export function incrementOptions(budget: number): number[] {
  const u = Math.max(1, priceUnit(budget) / 2);
  return [0.0025, 0.005, 0.01, 0.02].map((f) => roundTo(budget * f, u));
}
export function quickSteps(budget: number): number[] {
  const u = Math.max(1, priceUnit(budget) / 2);
  return [0.005, 0.01, 0.025].map((f) => roundTo(budget * f, u));
}

export function defaultConfig(mode: Mode, budget = 1_000_000): MatchConfig {
  return {
    mode, play: 'local', ratingMode: 'prime', formation: mode === 'football' ? '4-3-3' : null, budget,
    squadSize: mode === 'football' ? 11 : 5,
    auctionType: 'classic', timerSec: 15,
    increment: incrementOptions(budget)[1], antiSnipeSec: 5,
    rules: 'strict', reserve: true, shuffle: true, reauction: true, preview: true,
    slots: mode === 'football' ? slotsForFormation('4-3-3') : { GK: 1, DEF: 3, MID: 3, ATT: 3 },
    maxPerClass: 2,
    packs: mode === 'football' ? ['legends', 'modern'] : ['core'],
    excluded: [], emptyPenalty: 5, completeFirst: true, seed: 1,
  };
}

// ───────────────────────── pool + setup validation ─────────────────────────

export function buildPool(catalog: Card[], cfg: MatchConfig): Card[] {
  const kind = cfg.mode === 'football' ? 'football' : 'hero';
  const ratingMode = cfg.ratingMode ?? 'prime'; // backward-compatible with pre-V2 saved settings
  const pool = catalog.filter(
    (c) => c.kind === kind
      && (c.kind !== 'football' || (c.ratingMode ?? 'prime') === ratingMode)
      && (c.kind !== 'football' || ratingMode === 'prime' || (c.verificationStatus === 'verified' && c.overall > 0 && c.stats.length === 6 && c.stats.every((v) => v > 0)))
      && (c.pack === 'custom' || cfg.packs.includes(c.pack))
      && !cfg.excluded.includes(c.id),
  );
  // An "official" auction made only of custom-rated legends would be official in name only.
  if (kind === 'football' && ratingMode !== 'prime' && !pool.some((c) => c.kind === 'football' && c.verificationStatus === 'verified')) return [];
  return pool;
}

export interface SetupCheck { errors: string[]; warnings: string[]; needed: number; poolSize: number }

/** Blocks matches whose card pool cannot possibly fill every squad. */
export function validateSetup(cfg: MatchConfig, names: string[], pool: Card[]): SetupCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const n = names.length;
  const needed = n * cfg.squadSize;
  if (n < 2 || n > 8) errors.push('A match needs between 2 and 8 participants.');
  const clean = names.map((x) => x.trim().toLowerCase());
  if (clean.some((x) => !x)) errors.push('Every participant needs a name.');
  if (new Set(clean).size !== clean.length) errors.push('Participant names must be unique.');
  if (!(cfg.budget >= 1000)) errors.push('Starting budget must be at least ₹1,000.');
  if (!(cfg.increment >= 1)) errors.push('Minimum bid increment must be positive.');
  if (cfg.squadSize < 1 || cfg.squadSize > 20) errors.push('Squad size must be between 1 and 20.');
  if (pool.length === 0) errors.push(cfg.mode === 'football' && cfg.ratingMode !== 'prime'
    ? 'The official card pool is empty. Import complete, host-verified EA ratings with source references, or select Prime Legends.'
    : 'The card pool is empty — enable at least one card pack.');
  else if (pool.length < needed) errors.push(`Card pool too small: ${pool.length} cards for ${needed} squad slots (${n} × ${cfg.squadSize}).`);

  if (cfg.mode === 'football') {
    const total = LINES.reduce((a, l) => a + (cfg.slots[l] || 0), 0);
    if (total < 1 || total > 15) errors.push(`A formation needs between 1 and 15 starting places (it has ${total}).`);
    else if (total > cfg.squadSize) errors.push(`Formation slots add up to ${total}, but the squad size is only ${cfg.squadSize}.`);
    else if (cfg.squadSize - total > MAX_SUBS) errors.push(`At most ${MAX_SUBS} substitutes are allowed (this squad has ${cfg.squadSize - total}).`);
    if (cfg.rules === 'strict') {
      for (const l of LINES) {
        const have = pool.filter((c) => (c as FootballCard).line === l).length;
        const need = (cfg.slots[l] || 0) * n;
        if (have < need) errors.push(`Not enough ${l} cards for Strict rules: ${have} available, ${need} needed.`);
      }
    }
  } else if (cfg.rules === 'strict') {
    const counts: Record<string, number> = {};
    for (const c of pool) counts[(c as HeroCard).cls] = (counts[(c as HeroCard).cls] || 0) + 1;
    const usable = Object.values(counts).reduce((a, c) => a + Math.min(c, cfg.maxPerClass * n), 0);
    if (usable < needed) errors.push(`Class limit of ${cfg.maxPerClass} per team leaves only ${usable} usable heroes for ${needed} slots.`);
  }
  if (!errors.length && pool.length < needed * 1.25) {
    warnings.push(`Tight pool: ${pool.length} cards for ${needed} slots. Unsold cards may leave squads incomplete${cfg.reauction ? '' : ' — consider enabling re-auction'}.`);
  }
  if (cfg.auctionType === 'mystery' && cfg.preview) warnings.push('Next-card preview is hidden in Mystery Auction.');
  return { errors, warnings, needed, poolSize: pool.length };
}

// ───────────────────────── squads, slots and lineups ─────────────────────────

export function slotLines(cfg: MatchConfig): Line[] {
  const out: Line[] = [];
  for (const l of LINES) for (let i = 0; i < (cfg.slots[l] || 0); i++) out.push(l);
  return out;
}

/** How well a footballer suits a line: 1 natural, 0.92 secondary position, 0.72 out of position, 0.4 keeper mismatch. */
export function fitOf(card: FootballCard, position: string): number {
  const line = LINE_OF[position] ?? position as Line;
  if (!LINES.includes(position as Line)) {
    if (card.pos === position) return 1;
    if (card.alt.includes(position)) return 0.92;
    if (card.line === 'GK' || position === 'GK') return 0.4;
    if (card.line === line) return 0.82;
    if (card.altLines.includes(line)) return 0.78;
    return 0.65;
  }
  if (card.line === line) return 1;
  if (card.altLines.includes(line)) return 0.92;
  if (card.line === 'GK' || line === 'GK') return 0.4;
  return 0.72;
}

/**
 * Best starting XI by total OVR × position fit, chosen from the whole squad; everyone else goes to
 * the bench (strongest first). Independent of purchase prices. The lineup array holds the starting
 * slots first, then one entry per substitute place.
 */
export function autoLineup(ids: string[], cfg: MatchConfig, cards: Record<string, Card>): (string | null)[] {
  if (cfg.mode !== 'football') {
    const out: (string | null)[] = ids.slice(0, cfg.squadSize);
    while (out.length < cfg.squadSize) out.push(null);
    return out;
  }
  const lines = slotPositions(cfg);
  const benchSize = subsOf(cfg);
  const out: (string | null)[] = Array(lines.length + benchSize).fill(null);
  const owned = [...new Set(ids)].filter((id) => cards[id]?.kind === 'football').slice(0, lines.length + benchSize);
  if (!owned.length) return out;
  // Dynamic program over (player, filled-slot mask): each player either takes a free slot or sits
  // on the bench. At most 15 slots and 22 players keeps this to a few million cheap steps, and it
  // never strands a specialist behind a versatile player the way greedy placement can.
  const S = lines.length;
  const width = 1 << S;
  const P = owned.length;
  const best = new Float64Array((P + 1) * width).fill(-Infinity);
  const move = new Int8Array((P + 1) * width).fill(-2); // -1 = benched, >= 0 = slot taken
  const values = owned.map((id) => lines.map((position) => {
    const c = cards[id] as FootballCard;
    const fit = fitOf(c, position);
    return c.overall * fit + (fit === 1 ? 0.5 : 0);
  }));
  best[0] = 0;
  for (let k = 0; k < P; k++) {
    const benchedSoFar = (mask: number) => k - popcount(mask);
    for (let mask = 0; mask < width; mask++) {
      const here = best[k * width + mask];
      if (!Number.isFinite(here)) continue;
      const row = (k + 1) * width;
      if (benchedSoFar(mask) < benchSize && here > best[row + mask] + 1e-9) { best[row + mask] = here; move[row + mask] = -1; }
      for (let slot = 0; slot < S; slot++) {
        if (mask & (1 << slot)) continue;
        const next = mask | (1 << slot);
        const value = here + values[k][slot];
        if (value > best[row + next] + 1e-9) { best[row + next] = value; move[row + next] = slot; }
      }
    }
  }
  let mask = 0;
  for (let m = 0; m < width; m++) if (best[P * width + m] > best[P * width + mask]) mask = m;
  const benched: string[] = [];
  for (let k = P; k > 0; k--) {
    const slot = move[k * width + mask];
    if (slot === -1) benched.push(owned[k - 1]);
    else if (slot >= 0) { out[slot] = owned[k - 1]; mask &= ~(1 << slot); }
  }
  benched.sort((a, b) => (cards[b] as FootballCard).overall - (cards[a] as FootballCard).overall || a.localeCompare(b));
  benched.forEach((id, i) => { out[S + i] = id; });
  return out;
}
function popcount(x: number): number {
  let n = 0;
  while (x) { x &= x - 1; n++; }
  return n;
}

export function lineupValid(p: Participant, lineup: (string | null)[], cfg: MatchConfig): boolean {
  if (lineup.length !== cfg.squadSize) return false;
  const ids = lineup.filter((x): x is string => !!x);
  if (new Set(ids).size !== ids.length || ids.length !== p.squad.length) return false;
  return p.squad.every((o) => ids.includes(o.cardId));
}

export function effectiveLineup(p: Participant, cfg: MatchConfig, cards: Record<string, Card>): (string | null)[] {
  cfg = teamConfig(p, cfg);
  if (lineupValid(p, p.lineup, cfg)) return p.lineup;
  return autoLineup(p.squad.map((o) => o.cardId), cfg, cards);
}

function placeNew(p: Participant, cfg: MatchConfig, cards: Record<string, Card>) {
  cfg = teamConfig(p, cfg);
  const ids = p.squad.map((o) => o.cardId);
  if (!p.manual) {
    p.lineup = autoLineup(ids, cfg, cards);
    return;
  }
  // Manual lineups are respected: the new card takes its best empty starting slot, or a bench place
  // when every open starting slot would put it out of position.
  const lines = slotPositions(cfg);
  const BENCH_PREFERENCE = 0.85;
  const lineup = p.lineup.slice(0, cfg.squadSize);
  while (lineup.length < cfg.squadSize) lineup.push(null);
  const fresh = ids.filter((id) => !lineup.includes(id));
  for (const id of fresh) {
    const c = cards[id] as FootballCard;
    let best = -1;
    let bestFit = -1;
    lineup.forEach((cur, i) => {
      const fit = c.kind !== 'football' ? 1 : i < lines.length ? fitOf(c, lines[i]) : BENCH_PREFERENCE;
      if (cur === null && fit > bestFit) { best = i; bestFit = fit; }
    });
    if (best >= 0) lineup[best] = id;
  }
  p.lineup = lineup;
}

/** Strict-rule roster restrictions. Returns a human explanation, or null when the card fits. */
export function slotBlock(p: Participant, card: Card, cfg: MatchConfig, cards: Record<string, Card>): string | null {
  cfg = teamConfig(p, cfg);
  if (cfg.rules !== 'strict') return null;
  if (card.kind === 'football') {
    const counts = lineCounts(p.squad.map((o) => o.cardId), cards);
    const cap = cfg.slots[card.line] || 0;
    if (counts[card.line] < cap) return null;
    counts[card.line]++;
    const problem = benchProblem(counts, cfg);
    if (problem) return subsOf(cfg) ? `${card.line} places full (${cap}/${cap}) · ${problem}` : `No open ${card.line} slot (${counts[card.line] - 1}/${cap} filled)`;
  } else {
    const have = p.squad.filter((o) => (cards[o.cardId] as HeroCard)?.cls === card.cls).length;
    if (have >= cfg.maxPerClass) return `${card.cls} limit reached (${have}/${cfg.maxPerClass})`;
  }
  return null;
}

export function reserveFor(p: Participant, cfg: MatchConfig): number {
  if (cfg.rules !== 'strict' || !cfg.reserve) return 0;
  return Math.max(0, cfg.squadSize - p.squad.length - 1) * minPrice(cfg);
}
export function maxBid(p: Participant, cfg: MatchConfig): number {
  return p.budget - reserveFor(p, cfg);
}

/** The single source of truth for "may this participant bid?" — used by the engine and by the UI to explain disabled buttons. */
export function checkBid(ctx: BidCtx, cards: Record<string, Card>, pid: string, amount?: number): BidCheck {
  const cfg = ctx.config;
  const p = ctx.participants.find((x) => x.id === pid);
  const lot = ctx.lot;
  const min = lot ? (lot.leader ? lot.bid + cfg.increment : lot.opening) : 0;
  const max = p ? maxBid(p, cfg) : 0;
  const no = (code: string, reason: string): BidCheck => ({ ok: false, code, reason, min, max });
  if (!p) return no('unknown', 'Not a participant in this match');
  if (ctx.phase !== 'bidding' || !lot || !lot.cardId) return no('closed', 'Bidding is not open right now');
  if (ctx.paused) return no('paused', 'Auction is paused');
  if (p.squad.length >= cfg.squadSize) return no('full', 'Squad complete — no more bids');
  const card = cards[lot.cardId];
  const block = card ? slotBlock(p, card, cfg, cards) : 'Unknown card';
  if (block) return no('slot', block);
  if (lot.leader === pid) return no('leading', 'You already hold the highest bid');
  if (lot.passed.includes(pid)) return no('passed', 'You passed on this card');
  if (max < min) {
    if (p.budget >= min) {
      const left = cfg.squadSize - p.squad.length - 1;
      return no('reserve', `Strict reserve: keep ${formatINR(reserveFor(p, cfg))} for ${left} more slot${left === 1 ? '' : 's'}`);
    }
    return no('funds', `Insufficient funds: need ${compactINR(min)}, have ${compactINR(p.budget)}`);
  }
  if (amount !== undefined) {
    if (!Number.isInteger(amount) || amount <= 0) return no('invalid', 'Bid must be a whole positive amount');
    if (amount < min) return no('low', `Minimum bid is ${formatINR(min)}`);
    if (amount > p.budget) return no('funds', `Insufficient funds: you have ${formatINR(p.budget)}`);
    if (amount > max) return no('reserve', `Strict reserve: your maximum bid is ${formatINR(max)}`);
  }
  return { ok: true, min, max };
}

// ───────────────────────── match lifecycle ─────────────────────────

export function createMatch(
  cfg: MatchConfig,
  players: { id: string; name: string; team: string }[],
  pool: Card[],
  now: number,
): MatchState {
  const cards: Record<string, Card> = {};
  for (const c of pool) cards[c.id] = c;
  const ids = Object.keys(cards);
  const s: MatchState = {
    config: cfg,
    cards,
    participants: players.map((p) => ({
      id: p.id, name: p.name.trim(), team: p.team.trim() || `Team ${p.name.trim()}`,
      budget: cfg.budget, squad: [], lineup: Array(cfg.squadSize).fill(null), manual: false,
      guessHits: 0, connected: true,
    })),
    queue: cfg.shuffle ? shuffled(ids, cfg.seed) : ids,
    unsold: [], pass: 0, round: 0,
    phase: 'result', lot: null, last: null, resumeAt: now + INTRO_MS,
    paused: false, pausedAt: 0, bids: [], sales: [],
    finishReason: '', startedAt: now, finishedAt: 0, version: 1,
  };
  if (!ids.length) finish(s, 'The card pool was empty', now);
  return s;
}

function finish(s: MatchState, reason: string, now: number) {
  s.phase = 'finished';
  s.lot = null;
  s.paused = false;
  s.finishReason = reason;
  s.finishedAt = now;
  for (const p of s.participants) {
    if (!lineupValid(p, p.lineup, s.config)) p.lineup = autoLineup(p.squad.map((o) => o.cardId), s.config, s.cards);
  }
}

function canBuy(s: MatchState, p: Participant, card: Card, pass: number): boolean {
  if (p.squad.length >= s.config.squadSize) return false;
  if (slotBlock(p, card, s.config, s.cards)) return false;
  return maxBid(p, s.config) >= lotPrice(card, s.config, pass);
}

/** Picks the next card, silently skipping cards nobody could legally buy, and ends the auction when nothing remains possible. */
function nextLot(s: MatchState, now: number) {
  const cfg = s.config;
  for (;;) {
    if (s.participants.every((p) => p.squad.length >= cfg.squadSize)) return finish(s, 'Every squad is complete', now);
    if (!s.queue.length) {
      if (cfg.reauction && s.unsold.length && s.pass < MAX_PASS) {
        s.pass++;
        s.queue = shuffled(s.unsold, cfg.seed + s.pass * 7919);
        s.unsold = [];
        continue;
      }
      const broke = s.participants.every((p) => p.squad.length >= cfg.squadSize || maxBid(p, cfg) < minPrice(cfg));
      return finish(s, broke ? 'No participant can afford another legal bid' : 'Every available card has been auctioned', now);
    }
    const cardId = s.queue.shift()!;
    const card = s.cards[cardId];
    if (!s.participants.some((p) => canBuy(s, p, card, s.pass))) {
      s.unsold.push(cardId); // may return cheaper in the re-auction pass
      continue;
    }
    const mystery = cfg.auctionType === 'mystery';
    s.round++;
    s.lot = {
      cardId, opening: lotPrice(card, cfg, s.pass), bid: 0, leader: null, startedAt: now,
      deadline: mystery ? 0 : now + cfg.timerSec * 1000,
      clueStage: mystery ? 1 : 0, clueEndsAt: mystery ? now + CLUE_STAGES * CLUE_STEP_MS : 0,
      guesses: {}, correct: [], passed: [], bidIds: [], bidCount: 0, pass: s.pass, uncontested: false,
    };
    s.phase = mystery ? 'clue' : 'bidding';
    return;
  }
}

function reveal(s: MatchState, now: number) {
  const lot = s.lot!;
  for (const p of s.participants) {
    if (lot.guesses[p.id] === lot.cardId) { lot.correct.push(p.id); p.guessHits++; }
  }
  lot.clueStage = CLUE_STAGES;
  lot.startedAt = now;
  lot.deadline = now + s.config.timerSec * 1000;
  s.phase = 'bidding';
}

/** Countdown expired: transfer ownership exactly once, or mark UNSOLD. */
function resolve(s: MatchState, now: number) {
  const lot = s.lot!;
  let sale: Sale;
  if (lot.leader) {
    const p = s.participants.find((x) => x.id === lot.leader)!;
    p.budget -= lot.bid;
    p.squad.push({ cardId: lot.cardId, price: lot.bid, round: s.round });
    placeNew(p, s.config, s.cards);
    sale = { round: s.round, cardId: lot.cardId, pid: p.id, price: lot.bid, pass: lot.pass, type: 'sold', at: now, bidCount: lot.bidCount };
  } else {
    s.unsold.push(lot.cardId);
    sale = { round: s.round, cardId: lot.cardId, pid: null, price: 0, pass: lot.pass, type: 'unsold', at: now, bidCount: 0 };
  }
  s.sales.push(sale);
  s.last = sale;
  s.lot = null;
  s.phase = 'result';
  s.resumeAt = now + RESULT_MS;
}

/** When nobody else can legally outbid, there is no reason to keep everyone waiting. */
function contest(s: MatchState, now: number) {
  const lot = s.lot!;
  const rivals = s.participants.filter((p) => p.id !== lot.leader && checkBid(s, s.cards, p.id).ok);
  if (!rivals.length) {
    lot.uncontested = true;
    lot.deadline = Math.min(lot.deadline, now + (lot.leader ? UNCONTESTED_MS : EMPTY_MS));
  }
}

/** Advances time-driven transitions. Returns true when the state changed. */
export function tick(s: MatchState, now: number): boolean {
  if (s.phase === 'finished' || s.paused) return false;
  let changed = false;
  for (let guard = 0; guard < 6; guard++) {
    const lot = s.lot;
    if (s.phase === 'clue' && lot) {
      if (now >= lot.clueEndsAt) { reveal(s, now); changed = true; continue; }
      const stage = Math.min(CLUE_STAGES, Math.floor((now - lot.startedAt) / CLUE_STEP_MS) + 1);
      if (stage > lot.clueStage) { lot.clueStage = stage; changed = true; }
      break;
    }
    if (s.phase === 'bidding' && lot) {
      if (now >= lot.deadline) { resolve(s, now); changed = true; continue; }
      break;
    }
    if (s.phase === 'result') {
      if (now >= s.resumeAt) { nextLot(s, now); changed = true; continue; }
      break;
    }
    break;
  }
  if (changed) s.version++;
  return changed;
}

const fail = (code: string, message: string): ActResult => ({ ok: false, code, message });

export function act(s: MatchState, a: Action, now: number): ActResult {
  const r = apply(s, a, now);
  if (r.ok && !r.dup) s.version++;
  return r;
}

function apply(s: MatchState, a: Action, now: number): ActResult {
  const lot = s.lot;
  if (s.phase === 'finished') return fail('finished', 'The auction is over');
  switch (a.type) {
    case 'bid': {
      if (s.bids.some((b) => b.id === a.bidId)) return { ok: true, dup: true }; // idempotent re-submission
      if (s.phase === 'bidding' && lot && !s.paused && now >= lot.deadline) return fail('late', 'Too late — the hammer has already fallen');
      if (typeof a.amount !== 'number' || !Number.isInteger(a.amount) || a.amount <= 0) return fail('invalid', 'Bid must be a whole positive amount');
      const chk = checkBid(s, s.cards, a.pid, a.amount);
      if (!chk.ok || !lot) return fail(chk.code || 'closed', chk.reason || 'Bidding is not open right now');
      lot.bid = a.amount;
      lot.leader = a.pid;
      lot.bidCount++;
      lot.bidIds.push(a.bidId);
      s.bids.push({ id: a.bidId, round: s.round, cardId: lot.cardId, pid: a.pid, amount: a.amount, at: now });
      const snipe = s.config.antiSnipeSec * 1000;
      if (lot.deadline - now < snipe) lot.deadline = now + snipe; // anti-sniping extension
      lot.uncontested = false;
      contest(s, now);
      return { ok: true };
    }
    case 'pass': {
      if (s.phase !== 'bidding' || !lot || s.paused) return fail('closed', 'Bidding is not open right now');
      if (!s.participants.some((p) => p.id === a.pid)) return fail('unknown', 'Not a participant in this match');
      if (lot.leader === a.pid) return fail('leading', 'You hold the highest bid');
      if (lot.passed.includes(a.pid)) return { ok: true, dup: true };
      lot.passed.push(a.pid);
      contest(s, now);
      return { ok: true };
    }
    case 'guess': {
      if (s.phase !== 'clue' || !lot) return fail('closed', 'Guessing is closed');
      if (!s.participants.some((p) => p.id === a.pid)) return fail('unknown', 'Not a participant in this match');
      if (lot.guesses[a.pid]) return fail('guessed', 'You already locked in a guess');
      if (!s.cards[a.cardId]) return fail('invalid', 'Unknown card');
      lot.guesses[a.pid] = a.cardId;
      if (s.participants.every((p) => lot.guesses[p.id] || !p.connected)) lot.clueEndsAt = Math.min(lot.clueEndsAt, now + 800);
      return { ok: true };
    }
    case 'lineup': {
      const p = s.participants.find((x) => x.id === a.pid);
      if (!p) return fail('unknown', 'Not a participant in this match');
      if (!Array.isArray(a.lineup) || !lineupValid(p, a.lineup, s.config)) return fail('invalid', 'Lineup does not match your squad');
      p.lineup = a.lineup.slice();
      p.manual = true;
      return { ok: true };
    }
    case 'autoLineup': {
      const p = s.participants.find((x) => x.id === a.pid);
      if (!p) return fail('unknown', 'Not a participant in this match');
      p.manual = false;
      p.lineup = autoLineup(p.squad.map((o) => o.cardId), teamConfig(p, s.config), s.cards);
      return { ok: true };
    }
    case 'formation': {
      const p = s.participants.find((x) => x.id === a.pid);
      if (!p) return fail('unknown', 'Not a participant in this match');
      if (s.config.mode !== 'football' || startersOf(s.config) !== 11 || !FORMATIONS.includes(a.formation)) return fail('invalid', 'Choose a supported 11-player formation');
      const next = { ...s.config, formation: a.formation, slots: slotsForFormation(a.formation) };
      if (s.config.rules === 'strict' && benchProblem(lineCounts(p.squad.map((o) => o.cardId), s.cards), next)) {
        return fail('slot', 'Your current squad does not fit this formation and bench. Use Casual rules for unrestricted tactics.');
      }
      p.formation = a.formation;
      p.manual = false;
      p.lineup = autoLineup(p.squad.map((o) => o.cardId), next, s.cards);
      return { ok: true };
    }
    case 'pause': {
      if (s.paused) return { ok: true, dup: true };
      s.paused = true;
      s.pausedAt = now;
      return { ok: true };
    }
    case 'resume': {
      if (!s.paused) return { ok: true, dup: true };
      const d = Math.max(0, now - s.pausedAt);
      if (lot) {
        lot.deadline += lot.deadline ? d : 0;
        lot.startedAt += d;
        lot.clueEndsAt += lot.clueEndsAt ? d : 0;
      }
      s.resumeAt += d;
      s.paused = false;
      return { ok: true };
    }
    case 'hammer': {
      if (s.config.play !== 'local') return fail('forbidden', 'The hammer is only available in local play');
      if (s.phase !== 'bidding' || !lot || s.paused) return fail('closed', 'Nothing to close');
      resolve(s, now);
      return { ok: true };
    }
    case 'skipClues': {
      if (s.phase !== 'clue' || !lot) return fail('closed', 'No clue phase running');
      reveal(s, now);
      return { ok: true };
    }
    case 'end': {
      if (s.phase === 'bidding' && lot && lot.leader) resolve(s, now);
      finish(s, 'Auction ended by the host', now);
      return { ok: true };
    }
  }
}

/** Freeze a restored match (page refresh, server restart) so no timer silently expires while nobody is watching. */
export function suspend(s: MatchState, at: number) {
  if (s.phase === 'finished' || s.paused) return;
  s.paused = true;
  s.pausedAt = at;
}

/** Redacted view for clients: hides the future auction order, and the card identity during Mystery clue phases. */
export function toPublic(s: MatchState, viewer: string | null): PublicMatch {
  const lot: Lot | null = s.lot;
  const hidden = s.phase === 'clue';
  const done = s.phase === 'finished';
  const mystery = s.config.auctionType === 'mystery';
  return {
    config: s.config,
    participants: s.participants,
    queueCount: s.queue.length,
    unsold: s.unsold,
    nextCardId: s.config.preview && !mystery && s.queue.length ? s.queue[0] : null,
    pass: s.pass,
    round: s.round,
    phase: s.phase,
    lot: lot && {
      cardId: hidden ? null : lot.cardId,
      clues: mystery ? s.cards[lot.cardId].clues.slice(0, lot.clueStage) : [],
      clueStage: lot.clueStage,
      clueEndsAt: lot.clueEndsAt,
      opening: hidden ? 0 : lot.opening,
      bid: lot.bid,
      leader: lot.leader,
      startedAt: lot.startedAt,
      deadline: lot.deadline,
      guessed: Object.keys(lot.guesses),
      myGuess: viewer ? lot.guesses[viewer] ?? null : null,
      correct: hidden ? [] : lot.correct,
      passed: lot.passed,
      bidCount: lot.bidCount,
      pass: lot.pass,
      uncontested: lot.uncontested,
    },
    last: s.last,
    resumeAt: s.resumeAt,
    paused: s.paused,
    pausedAt: s.pausedAt,
    bids: done ? s.bids : s.bids.slice(-60),
    totalBids: s.bids.length,
    sales: s.sales,
    finishReason: s.finishReason,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    version: s.version,
  };
}

// Defensive normalisation of settings and actions that arrive from untrusted clients.

import type { Action, Custom, FormationName, MatchConfig, Mode, RatingMode, RoomSettings } from './types';
import { FORMATIONS, FORMATION_SLOTS, defaultConfig, incrementOptions, slotsForFormation } from './engine';
import { clamp } from './util';

const int = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : d;
const strArr = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, max).map((x) => String(x).slice(0, 80)) : [];

export function sanitizeConfig(raw: unknown, play: 'local' | 'online'): MatchConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const mode: Mode = r.mode === 'avengers' ? 'avengers' : 'football';
  const d = defaultConfig(mode);
  const budget = int(r.budget, 1000, 1e11, d.budget);
  const rawSlots = r.slots && typeof r.slots === 'object' ? r.slots : null;
  const hasSlots = !!rawSlots && ['GK', 'DEF', 'MID', 'ATT'].some((line) => typeof rawSlots[line] === 'number');
  let formation: FormationName | null = null;
  if (mode === 'football') {
    if (FORMATIONS.includes(r.formation as FormationName)) formation = r.formation as FormationName;
    else if (r.formation === null) formation = null;
    else if (!hasSlots) formation = '4-3-3';
    else {
      formation = FORMATIONS.find((name) =>
        (['GK', 'DEF', 'MID', 'ATT'] as const).every((line) => Number(rawSlots[line]) === FORMATION_SLOTS[name][line]),
      ) ?? null;
    }
  }
  const slotDefaults = formation ? slotsForFormation(formation) : d.slots;
  const slots = {
    GK: int(rawSlots?.GK, 0, 5, slotDefaults.GK),
    DEF: int(rawSlots?.DEF, 0, 8, slotDefaults.DEF),
    MID: int(rawSlots?.MID, 0, 8, slotDefaults.MID),
    ATT: int(rawSlots?.ATT, 0, 8, slotDefaults.ATT),
  };
  const slotTotal = slots.GK + slots.DEF + slots.MID + slots.ATT;
  const ratingMode: RatingMode = r.ratingMode === 'fc26' || r.ratingMode === 'fc27' ? r.ratingMode : 'prime';
  const packs = strArr(r.packs, 10);
  return {
    mode, play, ratingMode, formation, budget,
    squadSize: int(r.squadSize, 1, 15, hasSlots ? slotTotal : d.squadSize),
    auctionType: r.auctionType === 'mystery' ? 'mystery' : 'classic',
    timerSec: int(r.timerSec, 5, 120, d.timerSec),
    increment: int(r.increment, 1, budget, incrementOptions(budget)[1]),
    antiSnipeSec: int(r.antiSnipeSec, 0, 30, d.antiSnipeSec),
    rules: r.rules === 'casual' ? 'casual' : 'strict',
    reserve: r.reserve !== false,
    shuffle: r.shuffle !== false,
    reauction: r.reauction !== false,
    preview: r.preview !== false,
    slots,
    maxPerClass: int(r.maxPerClass, 1, 15, d.maxPerClass),
    packs: packs.length ? packs : d.packs,
    excluded: strArr(r.excluded, 600),
    emptyPenalty: int(r.emptyPenalty, 0, 30, d.emptyPenalty),
    completeFirst: r.completeFirst !== false,
    seed: int(r.seed, 0, 2 ** 31 - 1, 1),
  };
}

export function sanitizeCustom(raw: unknown): Custom {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const edits: Custom['edits'] = {};
  if (r.edits && typeof r.edits === 'object') {
    for (const [k, v] of Object.entries(r.edits as Record<string, any>).slice(0, 600)) {
      if (v && typeof v === 'object' && Array.isArray(v.stats)) {
        edits[k.slice(0, 80)] = { overall: int(v.overall, 1, 99, 75), stats: [0, 1, 2, 3, 4, 5].map((i) => int(v.stats[i], 1, 99, 75)) };
      }
    }
  }
  return { edits, imported: Array.isArray(r.imported) ? r.imported.slice(0, 300) : [] };
}

export function sanitizeSettings(raw: unknown, play: 'local' | 'online'): RoomSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { config: sanitizeConfig(r.config, play), custom: sanitizeCustom(r.custom) };
}

/** Rebuilds an action from untrusted input, forcing the participant id to the authenticated sender. */
export function sanitizeAction(raw: unknown, pid: string): Action | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  switch (r.type) {
    case 'bid': return { type: 'bid', pid, amount: typeof r.amount === 'number' ? r.amount : NaN, bidId: String(r.bidId || '').slice(0, 64) || `${pid}-${Date.now()}` };
    case 'pass': return { type: 'pass', pid };
    case 'guess': return { type: 'guess', pid, cardId: String(r.cardId || '').slice(0, 80) };
    case 'lineup': return { type: 'lineup', pid, lineup: Array.isArray(r.lineup) ? r.lineup.slice(0, 15).map((x: unknown) => (typeof x === 'string' ? x : null)) : [] };
    case 'autoLineup': return { type: 'autoLineup', pid };
    case 'formation': return FORMATIONS.includes(r.formation) ? { type: 'formation', pid, formation: r.formation } : null;
    case 'pause': case 'resume': case 'hammer': case 'skipClues': case 'end': return { type: r.type };
    default: return null;
  }
}

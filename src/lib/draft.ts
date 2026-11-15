import type { Card, Custom, MatchConfig, Mode } from '../../shared/types';
import { buildPool, defaultConfig, incrementOptions } from '../../shared/engine';
import { applyCustom, emptyCustom, getCatalog } from '../../shared/catalog';
import { sanitizeCustom } from '../../shared/config';

/** Everything the setup wizard collects before a match. */
export interface Draft {
  config: MatchConfig;
  count: number;
  names: string[];
  teams: string[];
}

export const PLAYER_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#4ade80', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf'];

export function newDraft(mode: Mode = 'football'): Draft {
  return { config: defaultConfig(mode), count: 4, names: Array(8).fill(''), teams: Array(8).fill('') };
}

/** Switches mode while keeping budget-independent choices; mode-specific fields reset to sensible defaults. */
export function withMode(d: Draft, mode: Mode): Draft {
  if (d.config.mode === mode) return d;
  const base = defaultConfig(mode, d.config.budget);
  return {
    ...d,
    config: {
      ...base, play: d.config.play, auctionType: d.config.auctionType, timerSec: d.config.timerSec,
      increment: d.config.increment, antiSnipeSec: d.config.antiSnipeSec, rules: d.config.rules,
      shuffle: d.config.shuffle, reauction: d.config.reauction, preview: d.config.preview,
    },
  };
}

export function withBudget(cfg: MatchConfig, budget: number): MatchConfig {
  const before = incrementOptions(cfg.budget);
  const idx = Math.max(0, before.indexOf(cfg.increment));
  return { ...cfg, budget, increment: incrementOptions(budget)[before.includes(cfg.increment) ? idx : 1] };
}

const customKey = (mode: Mode) => `uaa.custom.${mode}`;
export function loadCustom(mode: Mode): Custom {
  try {
    return sanitizeCustom(JSON.parse(localStorage.getItem(customKey(mode)) || 'null'));
  } catch {
    return emptyCustom();
  }
}
export function saveCustom(mode: Mode, c: Custom) {
  localStorage.setItem(customKey(mode), JSON.stringify(c));
}

export function catalogFor(mode: Mode, custom: Custom): Card[] {
  return applyCustom(getCatalog(mode), custom, mode);
}
export function poolFor(cfg: MatchConfig, custom: Custom): Card[] {
  return buildPool(catalogFor(cfg.mode, custom), cfg);
}

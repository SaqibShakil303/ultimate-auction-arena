// Card catalog access, pack metadata and host customisation (rating edits + JSON import).

import type {
  Card, Custom, FootballCard, FootballCardType, HeroCard, HeroClass, Line, Mode,
  RatedFootballCard, RatingMode, RatingVerificationStatus, Threat,
} from './types';
import { HERO_CLASSES, THREATS } from './types';
import { FOOTBALLERS, LINE_NAME, LINE_OF } from './data/football';
import { HEROES } from './data/heroes';
import { clamp, rarityOf, slug } from './util';

export const PACKS: Record<Mode, { id: string; label: string; note: string }[]> = {
  football: [
    { id: 'legends', label: 'Legends', note: 'All-time greats' },
    { id: 'modern', label: 'Modern Stars', note: 'Contemporary players' },
  ],
  avengers: [
    { id: 'core', label: 'Heroes (Marvel-inspired)', note: 'Core roster' },
    { id: 'expansion', label: 'Villains Expansion', note: 'Powerful, but poor team players' },
    { id: 'original', label: 'Original Heroes', note: 'IP-free roster — no Marvel names' },
  ],
};

export function getCatalog(mode: Mode): Card[] {
  if (mode !== 'football') return HEROES;
  // The legacy built-in table explicitly contains custom game-balance values. Materialise
  // honest Prime-mode provenance without mutating that table or implying official EA data.
  return FOOTBALLERS.map((card): RatedFootballCard => ({
    ...card,
    ratingMode: 'prime',
    edition: 'Prime Legends',
    cardType: 'custom',
    source: null,
    verifiedAt: null,
    verificationStatus: 'custom',
    playStyles: [],
  }));
}

export const emptyCustom = (): Custom => ({ edits: {}, imported: [] });

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), 1, 99) : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v.slice(0, 140) : d);
const strs = (v: unknown, max = 6) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, max).map((x) => String(x).slice(0, 140)) : []);
const RATING_MODES: RatingMode[] = ['fc26', 'fc27', 'prime'];
const CARD_TYPES: FootballCardType[] = ['standard', 'icon', 'hero', 'special', 'custom'];
const safeUrl = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 2000) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};
const isoDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(`${v}T00:00:00Z`))) return null;
  return new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null;
};
const validRating = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99;
const officialSource = (v: string | null): boolean => {
  if (!v) return false;
  const url = new URL(v);
  return url.protocol === 'https:' && (url.hostname === 'ea.com' || url.hostname.endsWith('.ea.com'));
};

/** Validates one imported card. Returns null when the object is unusable. Missing optional fields get safe defaults. */
export function normalizeCard(raw: unknown, mode: Mode): Card | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name).trim();
  if (!name) return null;
  const official = mode === 'football' && (r.ratingMode === 'fc26' || r.ratingMode === 'fc27');
  // Zero is an explicit missing-data sentinel for official imports, never a fictional default.
  const overall = official ? (validRating(r.overall) ? r.overall : 0) : num(r.overall, 75);
  const statsIn = Array.isArray(r.stats) ? r.stats : [];
  const stats = [0, 1, 2, 3, 4, 5].map((i) => official ? (validRating(statsIn[i]) ? statsIn[i] : 0) : num(statsIn[i], overall));
  const image = typeof r.image === 'string' && /^(https?:|data:image\/)/.test(r.image) ? r.image.slice(0, 2000) : undefined;
  const base = {
    id: 'c-' + slug(name), name, overall, rarity: rarityOf(overall), stats, pack: 'custom', image,
    trait: str(r.trait, 'Custom Card'),
    strengths: strs(r.strengths), weaknesses: strs(r.weaknesses),
  };
  const meta = r.imageMeta && typeof r.imageMeta === 'object' ? r.imageMeta as Record<string, unknown> : null;
  const imageMeta = meta ? {
    source: str(meta.source), sourceUrl: safeUrl(meta.sourceUrl), license: str(meta.license),
    attribution: str(meta.attribution), verifiedAt: isoDate(meta.verifiedAt),
    verified: meta.verified === true && !!str(meta.license) && !!str(meta.attribution),
  } : undefined;
  Object.assign(base, { imageMeta });
  if (mode === 'football') {
    const pos = str(r.pos, 'CM').toUpperCase();
    const line: Line = LINE_OF[pos] || (['GK', 'DEF', 'MID', 'ATT'].includes(str(r.line)) ? (r.line as Line) : 'MID');
    const alt = strs(r.alt).map((a) => a.toUpperCase()).filter((a) => LINE_OF[a]);
    const nation = str(r.nation, 'Unknown');
    const style = str(r.style, 'All-Rounder');
    const ratingMode: RatingMode = RATING_MODES.includes(r.ratingMode as RatingMode) ? (r.ratingMode as RatingMode) : 'prime';
    const source = safeUrl(r.source);
    const verifiedAt = isoDate(r.verifiedAt);
    const claimedVerified = r.verificationStatus === 'verified';
    let verificationStatus: RatingVerificationStatus;
    const complete = validRating(r.overall) && statsIn.length === 6 && statsIn.every(validRating)
      && !!LINE_OF[str(r.pos).toUpperCase()] && !!str(r.nation).trim() && r.nation !== 'Unknown'
      && !!str(r.club).trim() && r.club !== 'Free Agent';
    const sourcedPrimeItem = (r.cardType === 'icon' || r.cardType === 'hero') && (r.edition === 'FC 26' || r.edition === 'FC 27');
    if (claimedVerified && officialSource(source) && verifiedAt && complete && r.cardType !== 'custom' && (ratingMode !== 'prime' || sourcedPrimeItem)) verificationStatus = 'verified';
    else verificationStatus = ratingMode === 'prime' ? 'custom' : 'unverified';
    const cardType: FootballCardType = CARD_TYPES.includes(r.cardType as FootballCardType)
      ? (r.cardType as FootballCardType)
      : ratingMode === 'prime' ? 'custom' : 'standard';
    const card: FootballCard = {
      ...base, id: `c-${ratingMode}-${slug(name)}`, kind: 'football', line, pos: LINE_OF[pos] ? pos : line, alt,
      altLines: [...new Set(alt.map((a) => LINE_OF[a]).filter((l) => l !== line))],
      role: str(r.role, LINE_NAME[line]), style, nation, club: str(r.club, 'Free Agent'),
      era: r.era === 'Legend' ? 'Legend' : 'Modern',
      ratingMode,
      edition: ratingMode === 'fc26' ? 'FC 26' : ratingMode === 'fc27' ? 'FC 27' : verificationStatus === 'verified' && r.edition === 'FC 26' ? 'FC 26' : verificationStatus === 'verified' && r.edition === 'FC 27' ? 'FC 27' : 'Prime Legends',
      cardType,
      source,
      verifiedAt,
      verificationStatus,
      playStyles: strs(r.playStyles, 20),
      clues: strs(r.clues, 3),
    };
    if (card.clues.length < 3) card.clues = [`${LINE_NAME[line]} (${card.pos}) from ${nation}`, `Rated ${overall} overall in this game`, `Playing style: ${style}`];
    return card;
  }
  const cls: HeroClass = HERO_CLASSES.includes(r.cls as HeroClass) ? (r.cls as HeroClass) : 'Damage';
  const weakTo: Threat = THREATS.includes(r.weakTo as Threat) ? (r.weakTo as Threat) : 'magic';
  const ability = str(r.ability, 'Signature Power');
  const card: HeroCard = {
    ...base, kind: 'hero', cls, role: str(r.role, cls), ability, attack: str(r.attack, 'Special Attack'),
    passive: str(r.passive, base.trait), weakTo, tags: strs(r.tags, 10).map((t) => t.toLowerCase()),
    clues: strs(r.clues, 3),
  };
  if (card.clues.length < 3) card.clues = [`Hero class: ${cls} · Team role: ${card.role}`, `Primary ability: ${ability}`, `Rated ${overall} overall in this game`];
  return card;
}

/** Applies a host's rating edits and imported cards on top of the built-in catalog. */
export function applyCustom(catalog: Card[], custom: Custom | undefined, mode: Mode): Card[] {
  if (!custom) return catalog;
  const edits = custom.edits || {};
  const out: Card[] = catalog.map((c) => {
    const e = edits[c.id];
    if (!e) return c;
    const overall = num(e.overall, c.overall);
    const changed = { ...c, overall, rarity: rarityOf(overall), stats: c.stats.map((v, i) => num(e.stats?.[i], v)) };
    // A local rating edit invalidates any prior verification claim, while retaining the
    // source as a useful reference for a future re-verification pass.
    return c.kind === 'football'
      ? { ...changed, verificationStatus: c.ratingMode === 'prime' ? 'custom' : 'unverified', verifiedAt: null }
      : changed;
  });
  const seen = new Set(out.map((c) => c.id));
  for (const raw of (custom.imported || []).slice(0, 300)) {
    const card = normalizeCard(raw, mode);
    if (card && !seen.has(card.id)) {
      const e = edits[card.id] ?? (card.kind === 'football' && card.ratingMode === 'prime' ? edits['c-' + slug(card.name)] : undefined);
      if (e) {
        const overall = num(e.overall, card.overall);
        if (card.kind === 'football') {
          out.push({
            ...card, overall, rarity: rarityOf(overall), stats: card.stats.map((v, i) => num(e.stats?.[i], v)),
            verificationStatus: card.ratingMode === 'prime' ? 'custom' : 'unverified', verifiedAt: null,
          });
        } else {
          out.push({ ...card, overall, rarity: rarityOf(overall), stats: card.stats.map((v, i) => num(e.stats?.[i], v)) });
        }
      } else out.push(card);
      seen.add(card.id);
    }
  }
  return out;
}

/** Resolves which artwork a card shows; generated placeholder art is the fallback for missing or broken images. */
export function artSource(card: Card, imageFailed: boolean): 'image' | 'generated' {
  return card.image && !imageFailed ? 'image' : 'generated';
}

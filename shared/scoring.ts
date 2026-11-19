// Transparent, deterministic winner calculation. Every number shown on the championship screen
// comes from these pure functions and the pre-configured rules below — nothing is decided ad hoc.

import type { Card, FootballCard, HeroCard, HeroClass, Line, MatchConfig, Participant, Sale, Threat } from './types';
import { HERO_CLASSES, LINES, THREATS } from './types';
import { effectiveLineup, fitOf, GUESS_BONUS, GUESS_CAP, slotLines, slotPositions, subsOf, teamConfig } from './engine';
import { avg, clamp, compactINR, mulberry32, round1, round2 } from './util';

export interface ScorePart { key: string; label: string; weight: number; score: number; lines: string[] }
export interface Flag { tone: 'good' | 'warn' | 'bad'; text: string }
export interface SynergyHit { id: string; name: string; desc: string; points: number; active: boolean }
export interface TeamScore {
  pid: string;
  total: number;
  parts: ScorePart[];
  penalties: { label: string; points: number }[];
  bonuses: { label: string; points: number }[];
  filled: number;
  size: number;
  complete: boolean;
  coverage: number; // tie-break #3: positional balance (football) or role diversity (avengers)
  chem: number;
  avgOverall: number;
  compare: { label: string; value: number }[];
  flags: Flag[];
  synergies: SynergyHit[];
}

/** Ratings are rescaled so that 70 → 0 and 96 → 100. */
export const norm = (x: number) => clamp((x - 70) / 26, 0, 1) * 100;

export const FOOTBALL_WEIGHTS = { quality: 0.4, balance: 0.2, tactics: 0.15, coverage: 0.15, chemistry: 0.1 };
/**
 * With substitutes, the starting XI keeps 90% of the score (each XI part scaled by 0.9) and the
 * bench is worth the remaining 10%. Without a bench the published XI weights apply unchanged.
 */
export const BENCH_WEIGHT = 0.1;
export function footballWeights(cfg: MatchConfig) {
  const bench = subsOf(cfg) > 0;
  const k = bench ? 1 - BENCH_WEIGHT : 1;
  return {
    quality: FOOTBALL_WEIGHTS.quality * k, balance: FOOTBALL_WEIGHTS.balance * k, tactics: FOOTBALL_WEIGHTS.tactics * k,
    coverage: FOOTBALL_WEIGHTS.coverage * k, chemistry: FOOTBALL_WEIGHTS.chemistry * k, bench: bench ? BENCH_WEIGHT : 0,
  };
}
export const AVENGERS_WEIGHTS = { capability: 0.4, synergy: 0.25, diversity: 0.2, strategy: 0.15 };
export const SYNERGY_CAP = 25;
export const AFFINITY_CAP = 8;

/** DIV, HAN, KIC, REF, SPD, POS — reflexes and positioning matter most. */
export const GK_STAT_WEIGHTS = [0.2, 0.15, 0.1, 0.25, 0.1, 0.2] as const;
export function goalkeeperAttributeRating(card: FootballCard): number {
  if (card.line !== 'GK') return 0;
  return card.stats.reduce((sum, value, i) => sum + value * GK_STAT_WEIGHTS[i], 0);
}

function footballQualityRating(card: FootballCard): number {
  if (card.line !== 'GK') return card.overall;
  return card.overall * 0.6 + goalkeeperAttributeRating(card) * 0.4;
}

function suitabilityScore(fit: number): number {
  if (fit >= 0.999) return 100;
  if (fit >= 0.92) return 92;
  if (fit >= 0.82) return 70;
  if (fit >= 0.78) return 45;
  if (fit >= 0.6) return 20;
  return 0;
}

// ───────────────────────── football ─────────────────────────

export const TACTIC_CHECKS: { id: string; label: string; rule: string }[] = [
  { id: 'keeper', label: 'Reliable keeper', rule: 'A goalkeeper with weighted GK attributes 86+ in goal' },
  { id: 'finish', label: 'Clinical finishing', rule: 'An attacker with SHO 90+' },
  { id: 'pace', label: 'Pace on the break', rule: 'Two outfield players with PAC 88+' },
  { id: 'create', label: 'Creative hub', rule: 'A midfielder with PAS 88+' },
  { id: 'shield', label: 'Ball-winning shield', rule: 'A midfielder with DEF 75+' },
  { id: 'wall', label: 'Solid back line', rule: 'Every DEF slot filled, average DEF 86+' },
];

function scoreFootball(p: Participant, cfg: MatchConfig, cards: Record<string, Card>): TeamScore {
  cfg = teamConfig(p, cfg);
  const lines = slotLines(cfg);
  const positions = slotPositions(cfg);
  const lineup = effectiveLineup(p, cfg, cards);
  const slots = lines.map((line, i) => {
    const id = lineup[i];
    const card = id ? (cards[id] as FootballCard) : null;
    return { line, position: positions[i], card, fit: card ? fitOf(card, positions[i]) : 0 };
  });
  const n = lines.length || 1;
  const filled = slots.filter((s) => s.card);
  const inLine = (l: Line) => slots.filter((s) => s.line === l && s.card);

  // 1. Player quality — 40%. Goalkeepers explicitly blend OVR with their six GK attributes.
  const quality = avg(slots.map((s) => (s.card ? norm(footballQualityRating(s.card)) : 0)));
  const avgOverall = avg(filled.map((s) => s.card!.overall));
  const oop = filled.filter((s) => s.fit < 0.9);

  // 2. Positional suitability — 20%.
  const gkSlots = slots.filter((s) => s.line === 'GK');
  const noKeeper = gkSlots.length > 0 && !gkSlots.some((s) => s.card && s.card.line === 'GK');
  const balance = avg(slots.map((s) => (s.card ? suitabilityScore(s.fit) : 0)));

  // Chemistry — 10%.
  const chemLines: string[] = [];
  const nations: Record<string, number> = {};
  const clubs: Record<string, number> = {};
  for (const s of filled) {
    nations[s.card!.nation] = (nations[s.card!.nation] || 0) + 1;
    clubs[s.card!.club] = (clubs[s.card!.club] || 0) + 1;
  }
  let chemSum = 0;
  for (const s of filled) {
    const c = s.card!;
    const base = s.fit === 1 ? 5 : s.fit >= 0.92 ? 4 : 1;
    const links = 1.5 * Math.min(2, nations[c.nation] - 1) + 1.5 * Math.min(2, clubs[c.club] - 1);
    chemSum += Math.min(10, base + links);
  }
  const chemistry = (chemSum / (10 * n)) * 100;
  for (const [k, v] of Object.entries(nations)) if (v > 1) chemLines.push(`${v} × ${k} (nation link)`);
  for (const [k, v] of Object.entries(clubs)) if (v > 1) chemLines.push(`${v} × ${k} (club link)`);
  if (!chemLines.length) chemLines.push('No shared nations or clubs yet');

  // 3. Tactical balance — 15%: formation completion plus balance between team units.
  const requiredLines = LINES.filter((line) => (cfg.slots[line] || 0) > 0);
  const lineStrengths = requiredLines.map((line) => avg(
    slots.filter((s) => s.line === line).map((s) => (s.card ? norm(footballQualityRating(s.card) * s.fit) : 0)),
  ));
  const strengthSpread = lineStrengths.length ? Math.max(...lineStrengths) - Math.min(...lineStrengths) : 100;
  const strengthBalance = filled.length ? clamp(100 - strengthSpread * 1.25, 0, 100) : 0;
  const formationFill = (filled.length / n) * 100;
  const tactics = formationFill * 0.55 + strengthBalance * 0.45;

  // 4. Defensive, midfield and attacking role coverage — 15%.
  const outfield = filled.filter((s) => s.card!.line !== 'GK').map((s) => s.card!);
  const defs = inLine('DEF');
  const pass: Record<string, boolean> = {
    keeper: gkSlots.some((s) => s.card && s.card.line === 'GK' && goalkeeperAttributeRating(s.card) >= 86),
    finish: inLine('ATT').some((s) => s.card!.line !== 'GK' && s.card!.stats[1] >= 90),
    pace: outfield.filter((c) => c.stats[0] >= 88).length >= 2,
    create: inLine('MID').some((s) => s.card!.line !== 'GK' && s.card!.stats[2] >= 88),
    shield: inLine('MID').some((s) => s.card!.line !== 'GK' && s.card!.stats[4] >= 75),
    wall: defs.length === (cfg.slots.DEF || 0) && defs.length > 0 && avg(defs.map((s) => (s.card!.line === 'GK' ? 0 : s.card!.stats[4]))) >= 86,
  };
  const coverage = (TACTIC_CHECKS.filter((t) => pass[t.id]).length / TACTIC_CHECKS.length) * 100;

  // Head-to-head units use their relevant skill, not OVR: shooting, passing and defending.
  const lineAvg = (ls: Line[]) => round1(avg(slots.filter((s) => ls.includes(s.line) && s.card).map((s) =>
    s.card!.line === 'GK' ? 0 : s.card!.stats[s.line === 'ATT' ? 1 : s.line === 'MID' ? 2 : 4] * s.fit,
  )));
  const keeperRating = round1(avg(gkSlots.filter((s) => s.card?.line === 'GK').map((s) => goalkeeperAttributeRating(s.card!))));
  const flags: Flag[] = [];
  if (noKeeper) flags.push({ tone: 'bad', text: 'Missing goalkeeper' });
  if (defs.length && avg(defs.map((s) => s.card!.overall * s.fit)) < 84) flags.push({ tone: 'warn', text: 'Weak defense' });
  if (inLine('ATT').length >= 2 && lineAvg(['ATT']) >= 90) flags.push({ tone: 'good', text: 'Excellent attacking power' });
  if (filled.length >= 4 && chemistry / Math.max(filled.length / n, 0.01) < 55) flags.push({ tone: 'warn', text: 'Low squad chemistry' });
  const mids = inLine('MID');
  if (mids.length === (cfg.slots.MID || 0) && mids.length > 1 && pass.create && pass.shield) flags.push({ tone: 'good', text: 'Balanced midfield' });
  if (oop.length) flags.push({ tone: 'warn', text: `${oop.length} player${oop.length > 1 ? 's' : ''} out of position` });
  if (pass.wall) flags.push({ tone: 'good', text: 'Solid back line' });

  // 6. Bench depth — 10% when the format has substitutes: every bench place scores its player's
  //    quality (same 70 → 0, 96 → 100 scale); an empty place scores 0.
  const W = footballWeights(cfg);
  const benchSize = subsOf(cfg);
  const benchCards = lineup.slice(lines.length, lines.length + benchSize).map((id) => (id ? (cards[id] as FootballCard) : null));
  const bench = benchSize ? avg(benchCards.map((c) => (c ? norm(footballQualityRating(c)) : 0))) : 0;
  const benchFilled = benchCards.filter(Boolean) as FootballCard[];

  const parts: ScorePart[] = [
    {
      key: 'quality', label: 'Player quality', weight: W.quality, score: quality,
      lines: [
        `Average overall of ${filled.length} player${filled.length === 1 ? '' : 's'}: ${round1(avgOverall) || 0}`,
        'Outfield slots use OVR; goalkeepers use 60% OVR + 40% weighted GK attributes; ratings are rescaled 70 → 0 and 96 → 100',
        ...gkSlots.filter((s) => s.card?.line === 'GK').map((s) => `${s.card!.name}: GK attributes ${round1(goalkeeperAttributeRating(s.card!))} (DIV 20%, HAN 15%, KIC 10%, REF 25%, SPD 10%, POS 20%)`),
        ...(filled.length < n ? [`${n - filled.length} empty slot${n - filled.length === 1 ? '' : 's'} score 0`] : []),
      ],
    },
    {
      key: 'balance', label: 'Positional suitability', weight: W.balance, score: balance,
      lines: [
        ...LINES.filter((l) => cfg.slots[l]).map((l) => `${l}: ${slots.filter((s) => s.line === l && s.card && s.fit >= 0.92).length}/${cfg.slots[l]} natural`),
        'Natural position 100 · listed secondary 92 · same line 70 · secondary line 45 · other line 20 · goalkeeper mismatch 0',
        ...oop.map((s) => `${s.card!.name} plays out of position at ${s.position}`),
      ],
    },
    {
      key: 'tactics', label: 'Tactical balance', weight: W.tactics, score: tactics,
      lines: [
        `${cfg.formation ?? 'Custom'} formation completion: ${filled.length}/${n} (55%)`,
        `Unit-strength balance across ${requiredLines.join(', ')}: ${round1(strengthBalance)} (45%; spread ${round1(strengthSpread)})`,
      ],
    },
    { key: 'coverage', label: 'Role coverage', weight: W.coverage, score: coverage, lines: TACTIC_CHECKS.map((t) => `${pass[t.id] ? '✔' : '✘'} ${t.label} — ${t.rule}`) },
    { key: 'chemistry', label: 'Team chemistry', weight: W.chemistry, score: chemistry, lines: ['Per player: 5 in position (+1.5 per nation or club link, max 2 each), capped at 10', ...chemLines] },
    ...(benchSize ? [{
      key: 'bench', label: 'Bench depth', weight: W.bench, score: bench,
      lines: [
        `${benchFilled.length}/${benchSize} substitutes${benchFilled.length ? ` · average overall ${round1(avg(benchFilled.map((c) => c.overall)))}` : ''}`,
        'Each bench place scores its player on the same 70 → 0, 96 → 100 scale; empty places score 0',
        'The starting XI parts above are each scaled by 0.9 so the total stays out of 100',
      ],
    }] : []),
  ];
  if (benchSize && benchFilled.length === benchSize && !benchFilled.some((c) => c.line === 'GK')) flags.push({ tone: 'warn', text: 'No substitute goalkeeper' });
  if (benchSize && benchFilled.length === benchSize && avg(benchFilled.map((c) => c.overall)) >= 86) flags.push({ tone: 'good', text: 'Deep bench' });
  // Completeness counts the whole squad, starters and substitutes alike.
  const owned = filled.length + benchFilled.length;
  return finalize(p, cfg, parts, owned, balance, chemistry, avgOverall, flags, [], [
    { label: 'Attack', value: lineAvg(['ATT']) },
    { label: 'Midfield', value: lineAvg(['MID']) },
    { label: 'Defense', value: lineAvg(['DEF']) },
    { label: 'Goalkeeping', value: keeperRating },
    { label: 'Overall', value: round1(avgOverall) },
  ]);
}

// ───────────────────────── avengers ─────────────────────────

export const AFFINITIES: { tag: string; label: string; min: number }[] = [
  { tag: 'avengers', label: 'Assemble (Avengers)', min: 3 },
  { tag: 'guardians', label: 'Guardians Crew', min: 2 },
  { tag: 'xmen', label: 'X-Team', min: 2 },
  { tag: 'wakanda', label: 'Wakanda Forever', min: 2 },
  { tag: 'asgard', label: 'Sons & Daughters of Asgard', min: 2 },
  { tag: 'f4', label: 'First Family', min: 2 },
  { tag: 'mystic-arts', label: 'Masters of the Mystic Arts', min: 2 },
  { tag: 'street', label: 'Street-Level Defenders', min: 2 },
  { tag: 'spy', label: 'Covert Ops', min: 2 },
  { tag: 'science', label: 'Science Division', min: 3 },
  { tag: 'cosmic', label: 'Cosmic Alliance', min: 3 },
  { tag: 'villain', label: 'Sinister Alliance', min: 3 },
  { tag: 'vanguard', label: 'Vanguard Unit', min: 2 },
  { tag: 'nightwatch', label: 'Nightwatch', min: 2 },
  { tag: 'starborn', label: 'Starborn', min: 2 },
  { tag: 'foundry', label: 'The Foundry', min: 2 },
];

/** SynergyRule set — fixed before the auction, shown to players, and capped. */
export const SYNERGY_RULES: { id: string; name: string; desc: string; points: number; test: (h: HeroCard[]) => boolean }[] = [
  { id: 'tac', name: 'Tactical Equipment', desc: 'A Tech specialist arms a Tank power hero', points: 5, test: (h) => has(h, 'Tech') && has(h, 'Tank') },
  { id: 'ward', name: 'Arcane Ward', desc: 'A Mystic shields a defender (Tank, or DEF 90+)', points: 5, test: (h) => h.some((a) => a.cls === 'Mystic' && h.some((b) => b !== a && (b.cls === 'Tank' || b.stats[3] >= 90))) },
  { id: 'rally', name: 'Rally Command', desc: 'A Leader directs a Support hero', points: 5, test: (h) => h.some((a) => a.tags.includes('leader') && h.some((b) => b !== a && b.cls === 'Support')) },
  { id: 'cover', name: 'Battlefield Coverage', desc: 'A Tank holds the line for a ranged attacker', points: 5, test: (h) => h.some((a) => a.cls === 'Tank' && h.some((b) => b !== a && b.tags.includes('ranged'))) },
  { id: 'think', name: 'Think Tank', desc: 'Two heroes with INT 92+', points: 3, test: (h) => h.filter((a) => a.stats[2] >= 92).length >= 2 },
  { id: 'blitz', name: 'Blitz', desc: 'Two heroes with SPD 90+', points: 3, test: (h) => h.filter((a) => a.stats[1] >= 90).length >= 2 },
  { id: 'air', name: 'Air Superiority', desc: 'Three flyers', points: 3, test: (h) => h.filter((a) => a.tags.includes('flyer')).length >= 3 },
];
const has = (h: HeroCard[], cls: HeroClass) => h.some((x) => x.cls === cls);

export const THREAT_LABEL: Record<Threat, string> = {
  brute: 'Brute force', magic: 'Magic', tech: 'Technology', mind: 'Mind control', speed: 'Speed', energy: 'Energy blasts',
};

/** Which threats a hero counters — derived from class and stats, fixed in advance. */
export function covers(h: HeroCard): Threat[] {
  const out = new Set<Threat>();
  if (h.cls === 'Tank' || h.stats[3] >= 90) out.add('brute');
  if (h.cls === 'Mystic') out.add('magic');
  if (h.cls === 'Tech' || h.stats[2] >= 95) out.add('tech');
  if (h.cls === 'Controller') out.add('mind');
  if (h.stats[1] >= 88) out.add('speed');
  if (h.stats[4] >= 90) out.add('energy');
  return [...out];
}

export function evalSynergies(heroes: HeroCard[]): { hits: SynergyHit[]; penalties: SynergyHit[]; points: number } {
  const hits: SynergyHit[] = SYNERGY_RULES.map((r) => ({ id: r.id, name: r.name, desc: r.desc, points: r.points, active: r.test(heroes) }));
  let affinity = 0;
  for (const a of AFFINITIES) {
    const n = heroes.filter((h) => h.tags.includes(a.tag)).length;
    if (n >= a.min) {
      const pts = Math.min(6, 2 * (n - a.min + 1) + (a.min === 3 ? 1 : 0));
      affinity += pts;
      hits.push({ id: 'aff-' + a.tag, name: a.label, desc: `${n} heroes share this affiliation`, points: pts, active: true });
    }
  }
  const affinityCapped = Math.min(AFFINITY_CAP, affinity);
  const penalties: SynergyHit[] = heroes
    .filter((h) => h.stats[5] < 55)
    .map((h) => ({ id: 'lone-' + h.id, name: 'Lone Wolf', desc: `${h.name} (TMW ${h.stats[5]}) disrupts coordination`, points: -2, active: true }));
  const rulePts = hits.filter((h) => h.active && !h.id.startsWith('aff-')).reduce((a, h) => a + h.points, 0);
  const points = clamp(rulePts + affinityCapped + penalties.reduce((a, h) => a + h.points, 0), 0, SYNERGY_CAP);
  return { hits, penalties, points };
}

const DIVERSITY = [0, 15, 40, 65, 85, 100, 100];

function scoreAvengers(p: Participant, cfg: MatchConfig, cards: Record<string, Card>): TeamScore {
  const heroes = p.squad.map((o) => cards[o.cardId] as HeroCard).filter(Boolean);
  const n = cfg.squadSize;
  const fill = heroes.length / n;

  // 1. Individual capability — 40%
  const capability = heroes.reduce((a, h) => a + norm(h.overall), 0) / n;
  const avgOverall = avg(heroes.map((h) => h.overall));

  // 2. Team synergy — 25%
  const syn = evalSynergies(heroes);
  const synergy = (syn.points / SYNERGY_CAP) * 100;

  // 3. Role diversity — 15%
  const classes = new Set(heroes.map((h) => h.cls));
  const diversity = DIVERSITY[Math.min(classes.size, 6)] * (heroes.length ? Math.min(1, fill + 0.0001) : 0);

  // 4. Strategic balance & counter coverage — 10%
  const covered = new Set<Threat>();
  heroes.forEach((h) => covers(h).forEach((t) => covered.add(t)));
  const coverPct = (covered.size / THREATS.length) * 100;
  const protectedCount = heroes.filter((h) => heroes.some((o) => o !== h && covers(o).includes(h.weakTo))).length;
  const protectPct = heroes.length ? (protectedCount / heroes.length) * 100 : 0;
  const statAvgs = [0, 1, 2, 3, 4, 5].map((i) => avg(heroes.map((h) => h.stats[i])));
  const weakest = heroes.length ? Math.min(...statAvgs) : 0;
  const balancePct = heroes.length ? clamp(100 - Math.max(0, 78 - weakest) * 3, 0, 100) : 0;
  const strategy = (0.45 * coverPct + 0.35 * protectPct + 0.2 * balancePct) * fill;

  const stat = (i: number) => round1(statAvgs[i] || 0);
  const flags: Flag[] = [];
  if (heroes.length >= 3 && classes.size >= Math.min(heroes.length, 5)) flags.push({ tone: 'good', text: 'Diverse roles' });
  if (heroes.length >= 3 && classes.size <= 2) flags.push({ tone: 'warn', text: 'One-dimensional lineup' });
  if (syn.points >= 15) flags.push({ tone: 'good', text: 'Strong synergy' });
  if (heroes.length >= 3 && syn.points <= 3) flags.push({ tone: 'warn', text: 'Low team synergy' });
  const exposed = heroes.filter((h) => !heroes.some((o) => o !== h && covers(o).includes(h.weakTo)));
  if (exposed.length >= 2) flags.push({ tone: 'warn', text: `${exposed.length} exposed weaknesses` });
  if (covered.size >= 5) flags.push({ tone: 'good', text: 'Excellent counter coverage' });
  if (syn.penalties.length) flags.push({ tone: 'bad', text: `${syn.penalties.length} lone wolf${syn.penalties.length > 1 ? 'ves' : ''}` });

  const parts: ScorePart[] = [
    {
      key: 'capability', label: 'Individual capability', weight: AVENGERS_WEIGHTS.capability, score: capability,
      lines: [`Average overall of ${heroes.length} hero${heroes.length === 1 ? '' : 'es'}: ${round1(avgOverall) || 0}`, 'Each slot scores its overall rescaled 70 → 0 and 96 → 100; empty slots score 0'],
    },
    {
      key: 'synergy', label: 'Team synergy', weight: AVENGERS_WEIGHTS.synergy, score: synergy,
      lines: [
        `${syn.points} of ${SYNERGY_CAP} synergy points (hard cap; affiliations capped at ${AFFINITY_CAP})`,
        ...syn.hits.filter((h) => h.active).map((h) => `+${h.points} ${h.name} — ${h.desc}`),
        ...syn.penalties.map((h) => `${h.points} ${h.name} — ${h.desc}`),
      ],
    },
    { key: 'diversity', label: 'Role diversity', weight: AVENGERS_WEIGHTS.diversity, score: diversity, lines: [`${classes.size} distinct class${classes.size === 1 ? '' : 'es'}: ${HERO_CLASSES.filter((c) => classes.has(c)).join(', ') || '—'}`, '5 classes = 100 · 4 = 85 · 3 = 65 · 2 = 40 · 1 = 15'] },
    {
      key: 'strategy', label: 'Strategic balance & counters', weight: AVENGERS_WEIGHTS.strategy, score: strategy,
      lines: [
        `Threats countered ${covered.size}/${THREATS.length}: ${THREATS.filter((t) => covered.has(t)).map((t) => THREAT_LABEL[t]).join(', ') || '—'} (45%)`,
        `Weaknesses covered by a teammate: ${protectedCount}/${heroes.length} (35%)`,
        `Weakest team attribute average: ${round1(weakest)} (20%)`,
      ],
    },
  ];
  return finalize(p, cfg, parts, heroes.length, diversity, synergy, avgOverall, flags, [...syn.hits, ...syn.penalties], [
    { label: 'Power', value: round1((statAvgs[0] + statAvgs[4]) / 2 || 0) },
    { label: 'Defense', value: stat(3) },
    { label: 'Intelligence', value: stat(2) },
    { label: 'Speed', value: stat(1) },
    { label: 'Chemistry', value: round1(synergy) },
  ]);
}

function finalize(
  p: Participant, cfg: MatchConfig, parts: ScorePart[], filled: number, coverage: number, chem: number,
  avgOverall: number, flags: Flag[], synergies: SynergyHit[], compare: { label: string; value: number }[],
): TeamScore {
  const base = parts.reduce((a, x) => a + x.score * x.weight, 0);
  const empty = cfg.squadSize - filled;
  // The empty-slot penalty never removes more than half of the points a team actually earned.
  // Without this cap every badly incomplete squad (an auction ended early, say) collapses to 0.0
  // and the ranking stops reflecting the cards that were bought.
  const fullPenalty = empty * cfg.emptyPenalty;
  const penalty = round2(Math.min(fullPenalty, base / 2));
  const capped = penalty < fullPenalty;
  const penalties = empty > 0 && fullPenalty > 0
    ? [{ label: `${empty} empty squad slot${empty > 1 ? 's' : ''} × −${cfg.emptyPenalty}${capped ? ' (capped at half of the points earned)' : ''}`, points: -penalty }]
    : [];
  const bonus = Math.min(GUESS_CAP, p.guessHits * GUESS_BONUS);
  const bonuses = bonus > 0 ? [{ label: `${p.guessHits} correct Mystery guess${p.guessHits > 1 ? 'es' : ''} (+${GUESS_BONUS} each, cap +${GUESS_CAP})`, points: bonus }] : [];
  const total = round2(clamp(base + penalties.reduce((a, x) => a + x.points, 0) + bonus, 0, 100));
  if (empty > 0) flags.unshift({ tone: 'bad', text: `Incomplete squad (${filled}/${cfg.squadSize})` });
  return {
    pid: p.id, total, parts: parts.map((x) => ({ ...x, score: round1(x.score) })), penalties, bonuses,
    filled, size: cfg.squadSize, complete: empty <= 0, coverage: round2(coverage), chem: round1(chem),
    avgOverall: round1(avgOverall), compare, flags, synergies,
  };
}

export function scoreTeam(p: Participant, cfg: MatchConfig, cards: Record<string, Card>): TeamScore {
  return cfg.mode === 'football' ? scoreFootball(p, cfg, cards) : scoreAvengers(p, cfg, cards);
}

export interface Ranked { rank: number; shared: boolean; p: Participant; score: TeamScore }

/**
 * Ranking order: (complete squads first, unless the host disabled it) → total score →
 * squad completeness → positional/role coverage → remaining budget → shared placing.
 */
export function rankTeams(ps: Participant[], cfg: MatchConfig, cards: Record<string, Card>): Ranked[] {
  const rows = ps.map((p) => {
    const score = scoreTeam(p, cfg, cards);
    return { p, score, key: [cfg.completeFirst && score.complete ? 1 : 0, score.total, score.filled, score.coverage, p.budget] };
  });
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  };
  rows.sort((a, b) => cmp(a.key, b.key));
  const out: Ranked[] = [];
  rows.forEach((r, i) => {
    const tied = i > 0 && cmp(rows[i - 1].key, r.key) === 0;
    out.push({ rank: tied ? out[i - 1].rank : i + 1, shared: tied, p: r.p, score: r.score });
    if (tied) out[i - 1].shared = true;
  });
  return out;
}

// ───────────────────────── awards (from real auction records) ─────────────────────────

export interface Award { id: string; title: string; winner: string; detail: string }

export function computeAwards(ps: Participant[], sales: Sale[], cfg: MatchConfig, cards: Record<string, Card>, ranking: Ranked[]): Award[] {
  const out: Award[] = [];
  const name = (pid: string | null) => ps.find((p) => p.id === pid)?.name ?? '—';
  const sold = sales.filter((s) => s.type === 'sold' && cards[s.cardId]);
  if (sold.length) {
    const value = (s: Sale) => (cards[s.cardId].overall - 60) / ((s.price / cfg.budget) * 100);
    const bargain = sold.slice().sort((a, b) => value(b) - value(a) || a.round - b.round)[0];
    out.push({ id: 'bargain', title: 'Best Bargain', winner: name(bargain.pid), detail: `${cards[bargain.cardId].name} (${cards[bargain.cardId].overall}) for just ${compactINR(bargain.price)}` });
    const pricey = sold.slice().sort((a, b) => b.price - a.price || a.round - b.round)[0];
    out.push({ id: 'pricey', title: 'Most Expensive Purchase', winner: name(pricey.pid), detail: `${cards[pricey.cardId].name} for ${compactINR(pricey.price)}${pricey.bidCount ? ` after ${pricey.bidCount} bid${pricey.bidCount === 1 ? '' : 's'}` : ' (imported sale)'}` });
    const strong = sold.slice().sort((a, b) => cards[b.cardId].overall - cards[a.cardId].overall || a.price - b.price)[0];
    out.push({ id: 'strong', title: 'Strongest Individual Card', winner: name(strong.pid), detail: `${cards[strong.cardId].name} — ${cards[strong.cardId].overall} overall` });
  }
  const spenders = ranking.filter((r) => r.p.budget < cfg.budget);
  if (spenders.length) {
    const pool = spenders.some((r) => r.score.complete) ? spenders.filter((r) => r.score.complete) : spenders;
    const eff = (r: Ranked) => r.score.total / (((cfg.budget - r.p.budget) / cfg.budget) * 100);
    const smart = pool.slice().sort((a, b) => eff(b) - eff(a))[0];
    out.push({ id: 'smart', title: 'Smartest Budget Manager', winner: smart.p.name, detail: `${smart.score.total} points while keeping ${compactINR(smart.p.budget)} in the bank` });
    const chem = ranking.slice().sort((a, b) => b.score.chem - a.score.chem || a.rank - b.rank)[0];
    out.push({ id: 'chem', title: cfg.mode === 'football' ? 'Best Squad Chemistry' : 'Best Team Synergy', winner: chem.p.name, detail: `${chem.score.chem}/100 ${cfg.mode === 'football' ? 'chemistry' : 'synergy'}` });
    if (cfg.mode === 'football') {
      for (const [id, title, metric] of [['defense', 'Strongest Defense', 'Defense'], ['midfield', 'Most Creative Midfield', 'Midfield'], ['attack', 'Best Attack', 'Attack']] as const) {
        const value = (r: Ranked) => r.score.compare.find((m) => m.label === metric)?.value ?? 0;
        const winner = ranking.slice().sort((a, b) => value(b) - value(a) || a.rank - b.rank)[0];
        out.push({ id, title, winner: winner.p.name, detail: `${value(winner)}/100 ${metric.toLowerCase()} strength after position fit` });
      }
      const tactical = ranking.slice().sort((a, b) => (b.score.parts.find((p) => p.key === 'tactics')?.score ?? 0) - (a.score.parts.find((p) => p.key === 'tactics')?.score ?? 0) || a.rank - b.rank)[0];
      out.push({ id: 'tactics', title: 'Best Tactical Team', winner: tactical.p.name, detail: `${tactical.score.parts.find((p) => p.key === 'tactics')?.score}/100 tactical balance` });
    }
  }
  return out;
}

// ───────────────────────── optional exhibition battle (seeded) ─────────────────────────

export const BATTLE_RULES = [
  'Five rounds: Power Clash (STR + PWR), Speed Blitz (SPD), Mind Games (INT), Last Stand (DEF) and Team Finisher (TMW + synergy ÷ 5).',
  'Each side scores its squad average for the round plus a seeded dice roll between −6 and +6.',
  'The roll seed is fixed when the match is created, so the result is reproducible. Best of five wins.',
  'The battle is an exhibition: it never changes the championship ranking, which uses the published scoring formula.',
];

export interface BattleRound { name: string; a: number; b: number; rollA: number; rollB: number; winner: 'a' | 'b' | 'draw' }

export function simulateBattle(a: Participant, b: Participant, cards: Record<string, Card>, seed: number): { rounds: BattleRound[]; winsA: number; winsB: number } {
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const squad = (p: Participant) => p.squad.map((o) => cards[o.cardId] as HeroCard).filter(Boolean);
  const A = squad(a);
  const B = squad(b);
  const sa = evalSynergies(A).points;
  const sb = evalSynergies(B).points;
  const m = (h: HeroCard[], f: (x: HeroCard) => number) => avg(h.map(f));
  const defs: [string, (x: HeroCard) => number, number, number][] = [
    ['Power Clash', (x) => (x.stats[0] + x.stats[4]) / 2, 0, 0],
    ['Speed Blitz', (x) => x.stats[1], 0, 0],
    ['Mind Games', (x) => x.stats[2], 0, 0],
    ['Last Stand', (x) => x.stats[3], 0, 0],
    ['Team Finisher', (x) => x.stats[5], sa / 5, sb / 5],
  ];
  let winsA = 0;
  let winsB = 0;
  const rounds = defs.map(([name, f, ea, eb]) => {
    const rollA = Math.round((rnd() * 12 - 6) * 10) / 10;
    const rollB = Math.round((rnd() * 12 - 6) * 10) / 10;
    const va = round1(m(A, f) + ea + rollA);
    const vb = round1(m(B, f) + eb + rollB);
    const winner = va > vb ? 'a' : vb > va ? 'b' : 'draw';
    if (winner === 'a') winsA++;
    if (winner === 'b') winsB++;
    return { name, a: va, b: vb, rollA, rollB, winner } as BattleRound;
  });
  return { rounds, winsA, winsB };
}

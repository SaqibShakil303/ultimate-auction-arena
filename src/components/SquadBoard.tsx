import { useState } from 'react';
import { Check, Wand2, X as XIcon } from 'lucide-react';
import type { Card, FootballCard, FormationName, HeroCard, MatchConfig, Participant, Threat } from '../../shared/types';
import { HERO_CLASSES, THREATS } from '../../shared/types';
import { effectiveLineup, fitOf, FORMATIONS, positionRows, startersOf, subsOf, teamConfig } from '../../shared/engine';
import { covers, scoreTeam, THREAT_LABEL, type TeamScore } from '../../shared/scoring';
import { compactINR } from '../../shared/util';
import { GameCard } from './GameCard';
import { Bar, Btn, Chip, cx } from './ui';

export function ScoreBreakdown({ score, compact }: { score: TeamScore; compact?: boolean }) {
  return (
    <div className="space-y-3">
      {score.parts.map((part) => (
        <div key={part.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{part.label} <span className="text-xs font-normal text-muted">× {+(part.weight * 100).toFixed(1)}%</span></span>
            <span className="tnum"><b>{part.score}</b><span className="text-xs text-muted"> → {(part.score * part.weight).toFixed(1)} pts</span></span>
          </div>
          <Bar value={part.score} />
          {!compact && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted">{part.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          )}
        </div>
      ))}
      {[...score.penalties, ...score.bonuses].map((x) => (
        <div key={x.label} className={cx('flex justify-between rounded-lg px-3 py-1.5 text-sm', x.points < 0 ? 'bg-rose-500/10 text-rose-200' : 'bg-emerald-500/10 text-emerald-200')}>
          <span>{x.label}</span><b className="tnum">{x.points > 0 ? '+' : ''}{x.points}</b>
        </div>
      ))}
      <div className="flex items-baseline justify-between border-t border-line pt-2">
        <span className="font-display text-sm font-bold uppercase tracking-widest text-slate-300">Team score</span>
        <span className="font-display text-3xl font-bold gold-text tnum">{score.total.toFixed(1)}</span>
      </div>
    </div>
  );
}

export function Flags({ score }: { score: TeamScore }) {
  if (!score.flags.length) return null;
  return <div className="flex flex-wrap gap-1.5">{score.flags.map((f) => <Chip key={f.text} tone={f.tone}>{f.text}</Chip>)}</div>;
}

/** Tactical board: football pitch with drag-and-drop (or tap-to-swap) slots, or the hero team with its synergy sheet. */
export function SquadBoard({ p, cfg, cards, editable, onLineup, onAuto, onFormation, onCard, showScore = true }: {
  p: Participant; cfg: MatchConfig; cards: Record<string, Card>; editable?: boolean;
  onLineup?: (lineup: (string | null)[]) => void; onAuto?: () => void; onCard?: (id: string) => void; showScore?: boolean;
  onFormation?: (formation: FormationName) => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  cfg = teamConfig(p, cfg);
  const score = scoreTeam(p, cfg, cards);
  const price = (id: string) => p.squad.find((o) => o.cardId === id)?.price;
  const lineup = effectiveLineup(p, cfg, cards);
  const swap = (a: number, b: number) => {
    if (a === b || !onLineup || !editable || a < 0 || b < 0 || a >= lineup.length || b >= lineup.length) return;
    const next = lineup.slice();
    [next[a], next[b]] = [next[b], next[a]];
    onLineup(next);
  };
  const choose = (i: number, id: string | null) => {
    if (!editable) { if (id) onCard?.(id); return; }
    if (sel === null) { if (id) setSel(i); } else { swap(sel, i); setSel(null); }
  };

  if (cfg.mode === 'avengers') {
    const heroes = p.squad.map((o) => cards[o.cardId] as HeroCard).filter(Boolean);
    const covered = new Set<Threat>();
    heroes.forEach((h) => covers(h).forEach((t) => covered.add(t)));
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {Array.from({ length: cfg.squadSize }, (_, i) => {
            const h = lineup[i] ? cards[lineup[i]!] as HeroCard : null;
            return h ? (
              <div key={h.id} className={cx('rounded-xl', sel === i && 'ring-2 ring-gold')} draggable={!!editable}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                onDragOver={(e) => { if (editable) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); swap(Number(e.dataTransfer.getData('text/plain')), i); }}>
                <GameCard card={h} mini onClick={() => choose(i, h.id)} />
                <div className="mt-1 text-center text-[11px] text-muted tnum">{compactINR(price(h.id) ?? 0)}</div>
                {editable && <button className="w-full py-1 text-xs text-sky-200 underline" onClick={() => onCard?.(h.id)}>Details</button>}
              </div>
            ) : (
              <div key={i} className="grid aspect-[5/7] place-items-center rounded-xl border border-dashed border-line bg-white/[0.02] text-xs text-muted">Open</div>
            );
          })}
        </div>
        {editable && <p className="text-xs text-muted">Drag heroes or select two cards to swap their places. <button className="text-sky-200 underline" onClick={() => { setSel(null); onAuto?.(); }}>Reset arrangement</button></p>}
        {!heroes.length && <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">No heroes recruited yet. Win a bid to start building this team.</p>}
        <Flags score={score} />
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h4 className="mb-2 font-display text-sm font-bold uppercase tracking-widest text-slate-300">Synergies & penalties</h4>
            <ul className="space-y-1.5">
              {score.synergies.map((s) => (
                <li key={s.id} className={cx('flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm', s.points < 0 ? 'bg-rose-500/10' : s.active ? 'bg-emerald-500/10' : 'bg-white/[0.03] opacity-60')}>
                  {s.points < 0 ? <XIcon size={15} className="mt-0.5 flex-none text-rose-300" /> : <Check size={15} className={cx('mt-0.5 flex-none', s.active ? 'text-emerald-300' : 'text-slate-600')} />}
                  <span className="flex-1"><b>{s.name}</b> <span className="text-xs text-muted">— {s.desc}</span></span>
                  <b className="tnum text-xs">{s.points > 0 ? '+' : ''}{s.points}</b>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {HERO_CLASSES.map((c) => {
                const n = heroes.filter((h) => h.cls === c).length;
                return <Chip key={c} tone={n ? 'accent' : 'muted'}>{c} {n}{cfg.rules === 'strict' ? `/${cfg.maxPerClass}` : ''}</Chip>;
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {THREATS.map((t) => <Chip key={t} tone={covered.has(t) ? 'good' : 'muted'}>{covered.has(t) ? '✔' : '○'} vs {THREAT_LABEL[t]}</Chip>)}
            </div>
          </div>
          {showScore && <ScoreBreakdown score={score} />}
        </div>
      </div>
    );
  }

  let slotIndex = 0;
  const rows = positionRows(cfg).map((positions) => positions.map((position) => ({ position, i: slotIndex++ })));
  const starters = slotIndex;
  const subs = subsOf(cfg);
  const benchFilled = lineup.slice(starters, starters + subs).filter(Boolean).length;
  // One place on the pitch or the bench. Bench places have no position, so nothing there is out of position.
  const slot = (i: number, l: string, bench: boolean) => {
    const id = lineup[i];
    const card = id ? (cards[id] as FootballCard) : null;
    const fit = card && !bench ? fitOf(card, l) : 1;
    const label = bench ? (card ? card.pos : `SUB ${i - starters + 1}`) : l;
    return (
      <div
        key={i}
        data-slot={bench ? 'bench' : 'pitch'}
        className={cx('min-w-0 flex-1 max-w-[92px] rounded-xl p-0.5 transition', sel === i && 'ring-2 ring-gold', over === i && 'ring-2 ring-accent', card && fit < 0.9 && 'ring-2 ring-amber-400/80')}
        draggable={!!card && editable}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => { if (editable) { e.preventDefault(); setOver(i); } }}
        onDragLeave={() => setOver((o) => (o === i ? null : o))}
        onDrop={(e) => { e.preventDefault(); setOver(null); const from = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) swap(from, i); }}
        title={card ? `${card.name} · ${card.pos}${bench ? ' — substitute' : fit < 1 ? ` — playing ${l} (fit ×${fit})` : ''}` : bench ? 'Empty bench place' : `Empty ${l} slot`}
      >
        <div className={cx('mb-1 text-center text-[10px] font-bold', bench ? 'text-sky-200/80' : 'text-white/80')}>{label}{card && fit < 0.92 ? ' !' : ''}</div>
        {card ? <GameCard card={card} mini onClick={() => choose(i, card.id)} /> : (
          <button disabled={!editable} onClick={() => choose(i, null)} className={cx('grid w-full aspect-[5/7] place-items-center rounded-xl border border-dashed font-display text-sm font-bold', bench ? 'border-sky-200/20 bg-sky-950/30 text-sky-100/40' : 'border-white/25 bg-black/25 text-white/50')}>{bench ? 'SUB' : l}</button>
        )}
        <div className="mt-0.5 text-center text-[10px] font-semibold text-white/70 tnum">{card ? compactINR(price(card.id) ?? 0) : '—'}</div>
        {editable && card && <button className="w-full py-1 text-[10px] text-sky-100 underline" onClick={() => onCard?.(card.id)}>Details</button>}
      </div>
    );
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-display font-bold uppercase tracking-widest">Starting XI · {cfg.formation ?? 'Custom'}</span>
          {editable && onFormation && startersOf(cfg) === 11 && <select aria-label="Team formation" value={cfg.formation ?? ''} className="rounded-lg border border-line bg-panel px-2 py-2 text-sm" onChange={(e) => { setSel(null); onFormation(e.target.value as FormationName); }}>
            {!cfg.formation && <option value="" disabled>Custom</option>}{FORMATIONS.map((f) => <option key={f}>{f}</option>)}
          </select>}
        </div>
        <div className="pitch space-y-2 p-3 sm:p-4">
          {rows.slice().reverse().map((row, rowIndex) => (
            <div key={rowIndex} className="flex items-start justify-center gap-1 sm:gap-3">
              {row.map(({ position: l, i }) => slot(i, l, false))}
            </div>
          ))}
        </div>
        {subs > 0 && (
          <section className="bench mt-3 p-2.5 sm:p-3" aria-label="Substitutes bench">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-widest text-sky-100">Bench · <span className="tnum">{benchFilled}/{subs}</span> subs</span>
              <span className="text-[10px] text-muted">{editable ? 'Swap a sub with any starter' : 'Substitutes'}</span>
            </div>
            <div className="flex items-start justify-center gap-1 sm:gap-3">
              {Array.from({ length: subs }, (_, k) => slot(starters + k, 'SUB', true))}
            </div>
          </section>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{editable ? `Drag a player onto another slot — or tap two slots — to swap them${subs ? ', including bench places' : ''}.` : 'Lineup locked.'} Amber ring = out of position.</span>
          {editable && <Btn size="sm" variant="soft" onClick={onAuto}><Wand2 size={14} /> Auto-arrange</Btn>}
        </div>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {score.compare.map((c) => (
            <div key={c.label} className="rounded-xl bg-white/[0.04] p-2">
              <div className="font-display text-xl font-bold tnum">{c.value || '—'}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted">{c.label}</div>
            </div>
          ))}
        </div>
        <Flags score={score} />
        {showScore && <ScoreBreakdown score={score} />}
      </div>
    </div>
  );
}

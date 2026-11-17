import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronUp, Copy, Crown, Gavel, Hammer, HelpCircle, LayoutGrid, Lock, LogOut, Music, Pause, Play, Search, Settings, SkipForward, User, Volume2, VolumeX, WifiOff } from 'lucide-react';
import type { Card, Participant, PublicMatch } from '../../shared/types';
import { checkBid, CLUE_STAGES, CLUE_STEP_MS, GUESS_BONUS, quickSteps } from '../../shared/engine';
import { scoreTeam } from '../../shared/scoring';
import { compactINR, formatINR, uid } from '../../shared/util';
import type { Controller, Snap } from '../lib/controller';
import { PLAYER_COLORS } from '../lib/draft';
import { buzz, isMuted, musicOn, setMuted, sfx, startMusic, stopMusic } from '../lib/sound';
import { CardViewer } from '../components/CardViewer';
import { GameCard } from '../components/GameCard';
import { SquadBoard } from '../components/SquadBoard';
import { Btn, Chip, cx, inputCls, Logo, Modal, Money, Toast } from '../components/ui';

const useNow = (ms: number, active: boolean) => {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms, active]);
};

/** True on narrow phones (≤ 420 px), kept in sync with rotation and resizing. */
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 420px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 420px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Countdown driven by the authoritative deadline timestamp (corrected by the server clock offset). */
function Countdown({ deadline, total, offset, paused, pausedAt, tickSound, size = 132 }: { deadline: number; total: number; offset: number; paused: boolean; pausedAt: number; tickSound?: boolean; size?: number }) {
  useNow(80, !paused);
  const left = Math.max(0, deadline - (paused ? pausedAt : Date.now() + offset));
  const secs = Math.ceil(left / 1000);
  const last = useRef(secs);
  useEffect(() => {
    if (tickSound && !paused && secs !== last.current && secs <= 5 && secs > 0) sfx.tick();
    last.current = secs;
  }, [secs, tickSound, paused]);
  const r = 46;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, left / total);
  const hot = secs <= 5;
  return (
    <div className={cx('relative grid flex-none place-items-center rounded-full', hot && !paused && 'hot')} style={{ width: size, height: size, background: 'radial-gradient(circle, rgba(8,12,34,.92) 55%, transparent 56%)' }} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <defs>
          <linearGradient id="cd-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent3)" /><stop offset="0.5" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent2)" /></linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="7" />
        <circle cx="50" cy="50" r={r - 6.5} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="1.2 4.2" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={hot ? '#fb7185' : 'url(#cd-grad)'} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ filter: `drop-shadow(0 0 5px ${hot ? '#fb7185' : 'var(--accent)'})`, transition: 'stroke-dashoffset 120ms linear' }} />
      </svg>
      <div className="text-center leading-none">
        <div className={cx('font-display font-bold tnum', hot ? 'text-rose-200' : 'text-white')} style={{ fontSize: size * 0.36, textShadow: hot ? '0 0 18px #fb7185' : '0 0 14px var(--glow)' }}>{paused ? '❚❚' : secs}</div>
        {size >= 80 && <div className="mt-1 text-[10px] uppercase tracking-widest text-muted">{paused ? 'paused' : 'seconds'}</div>}
      </div>
    </div>
  );
}

function Avatar({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, #fff 0%, ${color} 42%, color-mix(in srgb, ${color} 70%, #000) 100%)`, fontSize: size * 0.46 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

interface Ctx {
  snap: Snap;
  ctl: Controller;
  m: PublicMatch;
  cards: Record<string, Card>;
  color: (pid: string | null) => string;
  name: (pid: string | null) => string;
}

// ───────────────────────── stage: the card on the block ─────────────────────────

function Stage({ x, onOpen }: { x: Ctx; onOpen: (id: string) => void }) {
  const { m, cards } = x;
  const showId = m.phase === 'result' ? m.last?.cardId ?? null : m.lot?.cardId ?? null;
  const card = showId ? cards[showId] ?? null : null;
  const [faceUp, setFaceUp] = useState<string | null>(m.phase === 'result' ? showId : null);
  useEffect(() => {
    if (!showId) return setFaceUp(null);
    const t = setTimeout(() => setFaceUp(showId), 90); // flip-to-reveal; bidding is already live underneath
    return () => clearTimeout(t);
  }, [showId]);
  const sale = m.phase === 'result' ? m.last : null;
  const premium = card && (['legendary', 'mythic'].includes(card.rarity) || (card.kind === 'football' && ['icon', 'special'].includes(card.cardType ?? '')));
  return (
    <div className="relative mx-auto w-[min(62vw,280px)] lg:w-full lg:max-w-[330px]">
      <GameCard card={card} down={!card || faceUp !== showId} tilt price={m.lot?.opening || undefined} onClick={card ? () => onOpen(card.id) : undefined} title="Tap for full analytics" />
      {premium && !sale && faceUp === showId && <div key={showId} className="legendary-walkout" aria-hidden="true">★ Legendary reveal ★</div>}
      {premium && sale?.type === 'sold' && <div key={`spark-${sale.round}`} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i} className="sale-spark" style={{ left: `${4 + i * 7}%`, animationDelay: `${(i % 4) * 0.09}s`, background: ['#f6c453', '#65e9ff', '#ff79c4'][i % 3] }} />)}</div>}
      <AnimatePresence>
        {sale && (
          <motion.div key={sale.round} className="pointer-events-none absolute inset-0 z-10 grid place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className={cx('stamp rounded-3xl border-4 px-7 py-2 font-display text-5xl font-bold uppercase tracking-widest backdrop-blur-sm sm:text-6xl', sale.type === 'sold' ? 'border-gold bg-black/55 shadow-[0_0_60px_-6px_rgba(255,210,87,.9)] text-gold shadow-[0_0_60px_-8px_#f6c453]' : 'border-slate-400 bg-black/60 text-slate-300')}>
              {sale.type === 'sold' ? 'Sold!' : 'Unsold'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {card && <p className="mt-4 hidden text-center text-xs text-muted lg:block">Tap the card for strengths, weaknesses and deeper analytics</p>}
    </div>
  );
}

// ───────────────────────── mystery clue phase ─────────────────────────

function GuessPicker({ x, pid, onClose }: { x: Ctx; pid: string; onClose: () => void }) {
  const [q, setQ] = useState('');
  const owned = new Set(x.m.participants.flatMap((p) => p.squad.map((o) => o.cardId)));
  const options = Object.values(x.cards).filter((c) => !owned.has(c.id) && c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Modal open onClose={onClose} title={<span>Secret guess — <span style={{ color: x.color(pid) }}>{x.name(pid)}</span></span>}>
      {x.snap.kind === 'local' && <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Pass the device to {x.name(pid)}. Everyone else: look away!</p>}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-3 text-muted" />
        <input autoFocus className={cx(inputCls, 'pl-9')} placeholder="Search a name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid max-h-[50vh] gap-1 overflow-y-auto sm:grid-cols-2">
        {options.map((c) => (
          <button key={c.id} className="rounded-lg bg-white/[0.04] px-3 py-2 text-left text-sm hover:bg-accent/25" onClick={() => { x.ctl.act({ type: 'guess', pid, cardId: c.id }); onClose(); }}>
            {c.name}
          </button>
        ))}
        {!options.length && <p className="p-4 text-sm text-muted">No matching cards.</p>}
      </div>
    </Modal>
  );
}

function MysteryPanel({ x }: { x: Ctx }) {
  const { m, snap, ctl } = x;
  const lot = m.lot!;
  const [picker, setPicker] = useState<string | null>(null);
  const last = useRef(lot.clueStage);
  useEffect(() => {
    if (lot.clueStage !== last.current) sfx.clue();
    last.current = lot.clueStage;
  }, [lot.clueStage]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-accent"><HelpCircle size={16} /> Mystery card</div>
          <h2 className="font-display text-4xl font-bold uppercase grad-text">Who is it?</h2>
          <p className="text-xs text-muted">A correct guess earns +{GUESS_BONUS} championship points. The card must still be won by bidding.</p>
        </div>
        <Countdown deadline={lot.clueEndsAt} total={CLUE_STAGES * CLUE_STEP_MS} offset={snap.offset} paused={m.paused} pausedAt={m.pausedAt} size={96} />
      </div>
      <ol className="space-y-2">
        {Array.from({ length: CLUE_STAGES }, (_, i) => (
          <li key={i} className={cx('flex items-start gap-3 rounded-2xl border-[1.5px] px-4 py-3', lot.clues[i] ? 'rise border-accent/60 bg-gradient-to-r from-accent/20 to-accent2/10 shadow-[0_10px_30px_-18px_var(--glow)]' : 'border-dashed border-white/15 bg-white/[0.02] text-muted')}>
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-bold" style={lot.clues[i] ? { background: 'var(--grad)', color: 'var(--on-accent)' } : { background: 'rgba(0,0,0,.4)' }}>{i + 1}</span>
            <span className="text-sm">{lot.clues[i] ?? <span className="flex items-center gap-1.5"><Lock size={13} /> Unlocks in a moment…</span>}</span>
          </li>
        ))}
      </ol>
      {snap.me ? (
        lot.myGuess ? (
          <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><Check size={15} className="mr-1 inline" /> Guess locked in: <b>{x.cards[lot.myGuess]?.name}</b>. Waiting for the reveal…</p>
        ) : (
          <Btn size="lg" className="w-full" onClick={() => setPicker(snap.me)}>Make my secret guess</Btn>
        )
      ) : (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Tap your name to guess privately</p>
          <div className="flex flex-wrap gap-2">
            {m.participants.map((p) => {
              const done = lot.guessed.includes(p.id);
              return (
                <button key={p.id} disabled={done} onClick={() => setPicker(p.id)} className={cx('flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold', done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-line bg-white/[0.04] hover:bg-white/10')}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color(p.id) }} />{p.name}{done && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{lot.guessed.length}/{m.participants.length} guesses locked</span>
        {snap.isHost && <button className="font-semibold text-accent" onClick={() => ctl.act({ type: 'skipClues' })}>Reveal now →</button>}
      </div>
      {picker && <GuessPicker x={x} pid={picker} onClose={() => setPicker(null)} />}
    </div>
  );
}

// ───────────────────────── bid console ─────────────────────────

function BidConsole({ x, layout, onOpenCard }: { x: Ctx; layout: 'all' | 'turn'; onOpenCard: (id: string) => void }) {
  const { m, snap, ctl, cards } = x;
  const cfg = m.config;
  const lot = m.lot;
  const steps = useMemo(() => quickSteps(cfg.budget), [cfg.budget]);
  const [extra, setExtra] = useState(0);
  const [custom, setCustom] = useState('');
  const [active, setActive] = useState(m.participants[0].id);
  const [bump, setBump] = useState(0);
  const narrow = useNarrow();
  useEffect(() => { setExtra(0); setCustom(''); }, [m.round]);
  useEffect(() => { setBump((b) => b + 1); }, [lot?.bid]);

  const customAmt = custom.trim() ? Number(custom) : null;
  const plan = (pid: string) => {
    const base = checkBid(m, cards, pid);
    const amount = customAmt ?? base.min + extra;
    return { amount, chk: base.ok ? checkBid(m, cards, pid, amount) : base, p: m.participants.find((q) => q.id === pid)! };
  };
  const place = (pid: string) => {
    const { amount, chk } = plan(pid);
    if (!chk.ok) { sfx.error(); return; }
    ctl.act({ type: 'bid', pid, amount, bidId: uid('b') });
    buzz(14);
    setCustom('');
  };
  const single = snap.me ?? (layout === 'turn' ? active : null);

  // Desktop keyboard shortcuts.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey || m.phase !== 'bidding') return;
      const k = e.key.toLowerCase();
      if (!single && /^[1-8]$/.test(k)) { const p = m.participants[Number(k) - 1]; if (p) { e.preventDefault(); place(p.id); } }
      else if (single && (k === ' ' || k === 'enter')) { e.preventDefault(); place(single); }
      else if ('qwer'.includes(k) && k.length === 1) { setCustom(''); setExtra([0, ...steps]['qwer'.indexOf(k)]); }
      else if (k === 'p' && snap.me) ctl.act({ type: 'pass', pid: snap.me });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (m.phase === 'clue' && lot) return <MysteryPanel x={x} />;

  if (m.phase === 'result' || !lot) {
    const sale = m.last;
    const c = sale ? cards[sale.cardId] : null;
    return (
      <div className="grid min-h-[260px] place-items-center text-center">
        {sale && c ? (
          <div className="rise">
            <div className={cx('font-display text-6xl font-bold uppercase tracking-wider sm:text-7xl', sale.type === 'sold' ? 'gold-text drop-shadow-[0_0_30px_rgba(255,210,87,.55)]' : 'text-slate-400')}>{sale.type === 'sold' ? 'Sold!' : 'Unsold'}</div>
            {sale.type === 'sold' ? (
              <p className="mt-3 font-display text-2xl font-bold uppercase sm:text-3xl">
                {c.name} <span className="text-muted">→</span> <span style={{ color: x.color(sale.pid) }}>{x.name(sale.pid)}</span> <span className="text-muted">—</span> <span className="tnum">{formatINR(sale.price)}</span>
              </p>
            ) : (
              <p className="mt-3 text-slate-300">{c.name} drew no bids{cfg.reauction && sale.pass === 0 ? ' and returns later at half price.' : '.'}</p>
            )}
            {sale.type === 'sold' && (
              <p className="mt-2 text-sm text-muted">
                {x.name(sale.pid)} now has <b className="text-white">{formatINR(m.participants.find((p) => p.id === sale.pid)?.budget ?? 0)}</b> · squad {m.participants.find((p) => p.id === sale.pid)?.squad.length}/{cfg.squadSize}
              </p>
            )}
            <p className="mt-5 text-xs uppercase tracking-widest text-muted">Next card coming up…</p>
          </div>
        ) : (
          <div className="float">
            <Gavel size={44} className="mx-auto text-gold" />
            <div className="mt-3 font-display text-5xl font-bold uppercase grad-text">Get ready</div>
            <p className="mt-1 text-sm text-muted">The first card enters the arena in a moment.</p>
          </div>
        )}
      </div>
    );
  }

  const leader = lot.leader ? m.participants.find((p) => p.id === lot.leader) : null;
  const card = lot.cardId ? cards[lot.cardId] : null;
  const stepChips = (
    <div className="flex flex-wrap items-center gap-2">
      {[0, ...steps].map((s, i) => (
        <button key={s} onClick={() => { setExtra(s); setCustom(''); }} aria-pressed={!customAmt && extra === s}
          className={cx('seg px-3.5 py-2 text-sm', !customAmt && extra === s ? 'seg-on' : 'hover:bg-white/10')}>
          {i === 0 ? 'Min bid' : `+${compactINR(s)}`}<kbd className="ml-1.5 hidden text-[10px] font-normal text-muted lg:inline">{'QWER'[i]}</kbd>
        </button>
      ))}
      <div className="relative min-w-[130px] flex-1">
        <span className="absolute left-3 top-2.5 text-sm text-muted">₹</span>
        <input className={cx(inputCls, 'pl-7', customAmt !== null && 'border-accent')} inputMode="numeric" placeholder="Custom bid" aria-label="Custom bid amount" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 12))} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="kicker">{leader ? 'Current bid' : 'Opening price'}{lot.pass > 0 && <Chip tone="warn" className="ml-2 !py-0.5">Re-auction · half price</Chip>}</div>
          <div key={bump} className="bump price mt-1 text-[clamp(2.1rem,10vw,3.2rem)] tnum sm:text-7xl"><Money value={leader ? lot.bid : lot.opening} /></div>
          <div className="mt-2 flex min-h-[34px] flex-wrap items-center gap-2">
            {leader ? (
              <span className="pulse leader-pill" style={{ background: `linear-gradient(90deg, ${x.color(leader.id)}, color-mix(in srgb, ${x.color(leader.id)} 70%, #fff))`, color: '#06101f' }}>
                <Avatar name={leader.name} color="#ffffffaa" size={24} /><Crown size={14} /> {leader.name} leads
              </span>
            ) : (
              <Chip>No bids yet — who opens?</Chip>
            )}
            <span className="text-xs text-muted">{lot.bidCount} bid{lot.bidCount === 1 ? '' : 's'}</span>
            {lot.uncontested && <Chip tone="warn">No challengers left — closing</Chip>}
          </div>
        </div>
        <Countdown deadline={lot.deadline} total={cfg.timerSec * 1000} offset={snap.offset} paused={m.paused} pausedAt={m.pausedAt} tickSound size={narrow ? 104 : 132} />
      </div>

      {cfg.auctionType === 'mystery' && card && (
        <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-slate-300">
          Revealed: <button className="font-bold text-white underline" onClick={() => onOpenCard(card.id)}>{card.name}</button>.{' '}
          {lot.correct.length ? <span className="text-emerald-300">Correct guess: {lot.correct.map((id) => x.name(id)).join(', ')} (+{GUESS_BONUS} pts)</span> : lot.guessed.length ? 'Nobody guessed it.' : ''}
        </p>
      )}

      {stepChips}

      {single ? (
        (() => {
          const { amount, chk, p } = plan(single);
          const pending = !!snap.pending;
          const leading = lot.leader === single;
          return (
            <div className="space-y-3">
              {!snap.me && (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who is bidding">
                  {m.participants.map((q) => (
                    <button key={q.id} role="radio" aria-checked={q.id === active} onClick={() => setActive(q.id)} className={cx('seg flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm', q.id === active && 'seg-on')}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color(q.id) }} />{q.name}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => place(single)} disabled={!chk.ok || pending} aria-describedby="bid-reason"
                className={cx('bid-btn sticky bottom-2 z-20 lg:static', leading ? 'bid-lead' : chk.ok && !pending ? 'bid-go' : 'bid-off')}
              >
                <span className="block text-[1.65rem] leading-tight sm:text-4xl">{leading ? 'You hold the highest bid' : pending ? 'Confirming…' : <>Place bid <span className="tnum">{formatINR(amount)}</span></>}</span>
                <span id="bid-reason" className="mt-0.5 block text-xs font-semibold normal-case tracking-normal opacity-90">
                  {chk.ok ? `${p.name}: ${formatINR(p.budget - amount)} left after this bid` : chk.reason}
                </span>
              </button>
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>{p.name}: balance <b className="text-white tnum">{formatINR(p.budget)}</b> · max bid <b className="text-white tnum">{formatINR(Math.max(0, chk.max))}</b></span>
                {snap.me && <button disabled={leading || lot.passed.includes(single) || !checkBid(m, cards, single).ok} onClick={() => ctl.act({ type: 'pass', pid: single })} className="rounded-lg border border-line px-3 py-1.5 font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40">{lot.passed.includes(single) ? 'Passed' : 'Pass (P)'}</button>}
              </div>
            </div>
          );
        })()
      ) : (
        <div className={cx('grid gap-2', m.participants.length > 4 ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-2')}>
          {m.participants.map((p, i) => {
            const { amount, chk } = plan(p.id);
            const leading = lot.leader === p.id;
            return (
              <button key={p.id} onClick={() => place(p.id)} disabled={!chk.ok}
                className={cx('bid-tile', leading ? 'border-gold! bg-gold/15 shadow-[0_0_24px_-8px_rgba(255,210,87,.8)]' : !chk.ok && 'opacity-55')}
                style={!leading && chk.ok ? { borderColor: x.color(p.id), background: `linear-gradient(135deg, color-mix(in srgb, ${x.color(p.id)} 22%, transparent), rgba(255,255,255,.04))` } : undefined}
              >
                <span className="flex items-center gap-2 font-display text-lg font-bold uppercase leading-tight">
                  <span className="h-3 w-3 flex-none rounded-full" style={{ background: x.color(p.id) }} /><span className="truncate">{p.name}</span>
                  <kbd className="ml-auto hidden rounded bg-black/40 px-1.5 text-[10px] font-normal text-muted lg:inline">{i + 1}</kbd>
                </span>
                <span className={cx('block text-xs font-semibold', leading ? 'text-gold' : chk.ok ? 'text-white' : 'text-slate-400')}>
                  {leading ? '★ Highest bidder' : chk.ok ? <>Bid <span className="tnum">{formatINR(amount)}</span></> : chk.reason}
                </span>
                {chk.ok && !leading && <span className="block text-[11px] text-muted tnum">{compactINR(p.budget - amount)} left after</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="hidden lg:inline">{single ? 'Space / Enter = place bid · Q W E R = bid size' : 'Keys 1–8 = instant bid for that player · Q W E R = bid size'}</span>
        {snap.kind === 'local' && (
          <button onClick={() => ctl.act({ type: 'hammer' })} className="btn btn-soft ml-auto h-9 px-3.5 text-xs">
            <Hammer size={13} /> {lot.leader ? 'Hammer — sell now' : 'Nobody wants it — skip'}
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── participants / leaderboard ─────────────────────────

function Roster({ x, onSquad }: { x: Ctx; onSquad: (pid: string) => void }) {
  const { m, cards, snap } = x;
  const scores = m.participants.map((p) => scoreTeam(p, m.config, cards));
  // Live standing ignores the empty-slot penalty so it is meaningful while squads are still being built.
  const live = scores.map((s) => s.parts.reduce((a, part) => a + part.score * part.weight, 0));
  const order = live.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t).map((o) => o.i);
  const anyBought = m.participants.some((p) => p.squad.length);
  return (
    <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-1">
      {m.participants.map((p, i) => {
        const leading = m.lot?.leader === p.id;
        const full = p.squad.length >= m.config.squadSize;
        return (
          <button key={p.id} onClick={() => onSquad(p.id)} className={cx('team-row', leading && 'leading')} style={{ '--team': x.color(p.id) } as React.CSSProperties}>
            <div className="flex items-center gap-2.5">
              <Avatar name={p.name} color={x.color(p.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{p.name}</span>
                  {snap.me === p.id && <Chip tone="accent" className="!px-1.5 !py-0 !text-[10px]">You</Chip>}
                  {leading && <Crown size={14} className="flex-none text-gold" />}
                  {snap.kind === 'online' && !p.connected && <WifiOff size={13} className="flex-none text-rose-300" aria-label="Disconnected" />}
                </div>
                <div className="truncate text-[11px] text-muted">{p.team}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-lg font-bold leading-none"><Money value={p.budget} compact /></div>
                <div className="mt-0.5 text-[11px] text-muted">{anyBought ? <>#{order.indexOf(i) + 1} · <b className="text-slate-200 tnum">{live[i].toFixed(1)}</b> pts · avg {scores[i].avgOverall}</> : 'no cards yet'}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex flex-1 gap-1" aria-label={`Squad ${p.squad.length} of ${m.config.squadSize}`}>
                {Array.from({ length: m.config.squadSize }, (_, k) => <span key={k} className="h-2 flex-1 rounded-full" style={{ background: k < p.squad.length ? x.color(p.id) : 'rgba(255,255,255,0.1)', boxShadow: k < p.squad.length ? `0 0 8px -1px ${x.color(p.id)}` : undefined }} />)}
              </div>
              <span className={cx('text-[11px] font-bold tnum', full ? 'text-emerald-300' : 'text-slate-300')}>{p.squad.length}/{m.config.squadSize}{full ? ' ✔' : ''}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── history feed ─────────────────────────

function Feed({ x, onOpenCard }: { x: Ctx; onOpenCard: (id: string) => void }) {
  const { m, cards } = x;
  const [tab, setTab] = useState<'bids' | 'sales' | 'next'>('bids');
  const next = m.nextCardId ? cards[m.nextCardId] : null;
  const bids = m.bids.slice(-30).reverse();
  const sales = m.sales.slice().reverse();
  return (
    <div>
      <div className="mb-3 flex gap-1.5" role="tablist">
        {([['bids', `Live bids (${m.totalBids})`], ['sales', `Sales (${m.sales.length})`], ['next', 'Up next']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition', tab === k ? 'bg-accent/25 text-white ring-1 ring-accent/60 shadow-[0_0_18px_-8px_var(--glow)] bg-accent/25 text-white' : 'text-muted hover:text-white')}>{label}</button>
        ))}
      </div>
      {tab === 'bids' && (
        <ul className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
          {bids.map((b, i) => (
            <li key={b.id} className={cx('flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm', i === 0 && b.round === m.round ? 'bg-accent/15' : 'bg-white/[0.03]')}>
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: x.color(b.pid) }} />
              <b className="truncate">{x.name(b.pid)}</b><span className="truncate text-xs text-muted">on {cards[b.cardId]?.name ?? 'card'}</span>
              <span className="ml-auto font-semibold tnum">{formatINR(b.amount)}</span>
            </li>
          ))}
          {!bids.length && <li className="col-span-full rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">No bids yet. The first bid sets the pace.</li>}
        </ul>
      )}
      {tab === 'sales' && (
        <ul className="grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
          {sales.map((s) => (
            <li key={s.round} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-sm">
              <span className="w-7 flex-none text-xs text-muted tnum">#{s.round}</span>
              <button className="truncate font-semibold hover:underline" onClick={() => onOpenCard(s.cardId)}>{cards[s.cardId]?.name}</button>
              {s.type === 'sold' ? <><span className="truncate text-xs" style={{ color: x.color(s.pid) }}>→ {x.name(s.pid)}</span><span className="ml-auto font-semibold tnum">{compactINR(s.price)}</span></> : <span className="ml-auto text-xs font-bold uppercase text-slate-500">Unsold</span>}
            </li>
          ))}
          {!sales.length && <li className="col-span-full rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">Sold and unsold cards will be listed here.</li>}
        </ul>
      )}
      {tab === 'next' && (
        <div className="flex items-center gap-4">
          {next ? (
            <>
              <div className="w-20 flex-none"><GameCard card={next} mini onClick={() => onOpenCard(next.id)} /></div>
              <div className="text-sm"><div className="text-xs uppercase tracking-widest text-muted">Next on the block</div><b className="font-display text-xl">{next.name}</b><div className="text-xs text-muted">{next.overall} overall · {next.kind === 'football' ? next.pos : next.cls}</div></div>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">{m.config.auctionType === 'mystery' ? 'Mystery Auction keeps the next card secret.' : m.queueCount ? 'Next-card preview is switched off for this match.' : 'This is the last card in the current round.'}</p>
          )}
          {m.unsold.length > 0 && <p className="ml-auto text-right text-xs text-muted">{m.unsold.length} unsold card{m.unsold.length === 1 ? '' : 's'}{m.config.reauction && m.pass === 0 ? ' will return at half price' : ''}</p>}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── host controls ─────────────────────────

function HostPanel({ x, onClose, muted, toggleMute }: { x: Ctx; onClose: () => void; muted: boolean; toggleMute: () => void }) {
  const { m, ctl, snap, cards } = x;
  const [music, setMusic] = useState(musicOn());
  const [confirmEnd, setConfirmEnd] = useState(false);
  const cfg = m.config;
  return (
    <Modal open onClose={onClose} title="Match controls">
      <div className="space-y-5">
        {snap.isHost ? (
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="soft" onClick={() => ctl.act({ type: m.paused ? 'resume' : 'pause' })}>{m.paused ? <><Play size={15} /> Resume auction</> : <><Pause size={15} /> Pause auction</>}</Btn>
            {m.phase === 'clue' && <Btn variant="soft" onClick={() => ctl.act({ type: 'skipClues' })}><SkipForward size={15} /> Reveal card now</Btn>}
            {snap.kind === 'local' && m.phase === 'bidding' && <Btn variant="soft" onClick={() => ctl.act({ type: 'hammer' })}><Hammer size={15} /> Hammer current card</Btn>}
            {confirmEnd ? (
              <Btn variant="danger" onClick={() => { ctl.act({ type: 'end' }); onClose(); }}>Yes, end the auction now</Btn>
            ) : (
              <Btn variant="ghost" onClick={() => setConfirmEnd(true)}>End auction early…</Btn>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-white/[0.05] p-3 text-sm text-muted">Only the host can pause or end the auction.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="soft" onClick={toggleMute}>{muted ? <><VolumeX size={15} /> Sound off</> : <><Volume2 size={15} /> Sound on</>}</Btn>
          <Btn variant="soft" disabled={muted} onClick={() => { if (music) stopMusic(); else startMusic(); setMusic(!music); }}><Music size={15} /> Music {music ? 'on' : 'off'}</Btn>
        </div>
        <div className="rounded-xl border border-line bg-black/20 p-3 text-xs text-muted">
          <b className="text-slate-200">Locked for this match:</b> {formatINR(cfg.budget)} budget · {cfg.squadSize}-card squads · {cfg.rules} rules · {cfg.timerSec}s timer · +{formatINR(cfg.increment)} increment · {cfg.auctionType} auction.
          Auction rules and rating data are locked. Arrange your own squad during play; the final championship locks when the auction ends.
        </div>
        <div>
          <h4 className="mb-2 font-display text-sm font-bold uppercase tracking-widest text-slate-300">Bid history ({m.totalBids})</h4>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {m.bids.slice().reverse().map((b) => (
              <li key={b.id} className="flex gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1"><span className="w-8 text-xs text-muted tnum">#{b.round}</span><b style={{ color: x.color(b.pid) }}>{x.name(b.pid)}</b><span className="truncate text-muted">{cards[b.cardId]?.name ?? 'Mystery card'}</span><span className="ml-auto tnum">{formatINR(b.amount)}</span></li>
            ))}
            {!m.bids.length && <li className="text-muted">No bids recorded yet.</li>}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── screen ─────────────────────────

export function Auction({ snap, ctl, onExit }: { snap: Snap; ctl: Controller; onExit: () => void }) {
  const m = snap.match!;
  const cards = snap.cards;
  const cfg = m.config;
  const [viewer, setViewer] = useState<string | null>(null);
  const [squadPid, setSquadPid] = useState<string | null>(null);
  const [host, setHost] = useState(false);
  const [muted, setMute] = useState(isMuted());
  const [layout, setLayout] = useState<'all' | 'turn'>(() => (window.innerWidth < 640 ? 'turn' : 'all'));
  const [copied, setCopied] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const x: Ctx = {
    snap, ctl, m, cards,
    color: (pid) => PLAYER_COLORS[Math.max(0, m.participants.findIndex((p) => p.id === pid)) % PLAYER_COLORS.length],
    name: (pid) => m.participants.find((p) => p.id === pid)?.name ?? '—',
  };

  // Sound + haptics derived from state changes — never blocks input.
  const prev = useRef({ bids: m.lot?.bidCount ?? 0, phase: m.phase, round: m.round });
  useEffect(() => {
    const p = prev.current;
    const bids = m.lot?.bidCount ?? 0;
    if (m.round === p.round && bids > p.bids) sfx.bid();
    if (m.phase === 'result' && p.phase !== 'result' && m.last) { if (m.last.type === 'sold') { sfx.sold(); buzz([20, 40, 60]); } else sfx.unsold(); }
    if (m.phase === 'bidding' && (p.phase !== 'bidding' || p.round !== m.round)) sfx.reveal();
    prev.current = { bids, phase: m.phase, round: m.round };
  }, [m.version]);
  useEffect(() => () => stopMusic(), []);
  useEffect(() => {
    // Public next-card identity is absent in Mystery mode; preloading never reveals a hidden lot.
    const src = m.nextCardId ? cards[m.nextCardId]?.image : null;
    if (!src) return;
    const img = new Image(); img.decoding = 'async'; img.src = src;
  }, [m.nextCardId, cards]);

  const toggleMute = () => { setMuted(!muted); setMute(!muted); };
  const owner = (cardId: string) => {
    const p = m.participants.find((q) => q.squad.some((o) => o.cardId === cardId));
    return p ? { p, name: p.name, color: x.color(p.id), price: p.squad.find((o) => o.cardId === cardId)!.price } : null;
  };
  const squadP: Participant | undefined = m.participants.find((p) => p.id === squadPid);
  const canEdit = (pid: string) => snap.kind === 'local' || snap.me === pid;
  const vOwner = viewer ? owner(viewer) : null;
  const filled = m.participants.reduce((a, p) => a + p.squad.length, 0);

  return (
    <div className="screen-in mx-auto flex min-h-screen max-w-[1400px] flex-col gap-3 p-2 sm:p-4" data-mode={cfg.mode}>
      <div className={cx('scene', cfg.mode)} />
      <header className="hud sticky top-2 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
        <Logo size="sm" />
        <Chip tone="accent">{cfg.mode === 'football' ? 'Football' : 'Heroes'} · {cfg.auctionType === 'mystery' ? 'Mystery' : 'Classic'}</Chip>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
          <span className="hud-stat">Round <b className="tnum">{m.round}</b>{m.pass > 0 && <span className="text-amber-300"> · re-auction</span>}</span>
          <span className="hud-stat"><b className="tnum">{m.queueCount}</b> cards left</span>
          <span className="hud-stat hidden sm:inline-flex"><b className="tnum">{m.unsold.length}</b> unsold</span>
          <span className="hud-stat hidden md:inline-flex"><b className="tnum">{filled}</b>/{m.participants.length * cfg.squadSize} slots filled</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {m.phase === 'bidding' && m.lot && <div className="lg:hidden" aria-label="Live auction countdown"><Countdown size={48} deadline={m.lot.deadline} total={cfg.timerSec * 1000} offset={snap.offset} paused={m.paused} pausedAt={m.pausedAt} /></div>}
          {snap.room && (
            <button onClick={() => { void navigator.clipboard?.writeText(snap.room!.code); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-display text-sm font-bold tracking-widest" title="Copy room code">
              {snap.room.code} {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} className="text-muted" />}
            </button>
          )}
          {snap.kind === 'online' && snap.status !== 'open' && <Chip tone="warn"><WifiOff size={12} /> Reconnecting…</Chip>}
          {snap.kind === 'local' && (
            <button onClick={() => setLayout(layout === 'all' ? 'turn' : 'all')} title={layout === 'all' ? 'Switch to turn-taking view (one bidder at a time)' : 'Switch to all-players view'} aria-label="Toggle bidding layout" className="icon-btn">
              {layout === 'all' ? <User size={17} /> : <LayoutGrid size={17} />}
            </button>
          )}
          <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="icon-btn">{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
          {snap.isHost && <button onClick={() => ctl.act({ type: m.paused ? 'resume' : 'pause' })} aria-label={m.paused ? 'Resume' : 'Pause'} className="icon-btn">{m.paused ? <Play size={17} /> : <Pause size={17} />}</button>}
          <button onClick={() => setHost(true)} aria-label="Match controls" className="icon-btn"><Settings size={17} /></button>
          <button onClick={() => window.confirm(snap.kind === 'local' ? 'Leave this match? You can resume it from the home screen.' : 'Leave this room? Your squad stays reserved while the match runs.') && onExit()} aria-label="Leave match" className="icon-btn"><LogOut size={17} /></button>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 content-start gap-3 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)_minmax(270px,330px)]">
        <section className="panel stage order-2 flex flex-col items-center justify-center p-4 sm:p-5 lg:order-none" aria-label="Card on auction">
          <Stage x={x} onOpen={setViewer} />
        </section>
        <section className="panel relative order-1 p-4 sm:p-6 lg:order-none" aria-label="Bidding">
          <BidConsole x={x} layout={layout} onOpenCard={setViewer} />
          {m.paused && (
            <div className="absolute inset-0 z-20 grid place-items-center rounded-[24px] bg-[#050814]/85 backdrop-blur-sm">
              <div className="text-center">
                <Pause size={40} className="mx-auto text-gold" />
                <div className="mt-2 font-display text-4xl font-bold uppercase">Auction paused</div>
                <p className="mt-1 text-sm text-muted">{snap.isHost ? 'The clock is frozen. Nothing is lost.' : 'The host has paused the auction.'}</p>
                {snap.isHost && <Btn size="lg" variant="gold" className="mt-4" onClick={() => ctl.act({ type: 'resume' })}><Play size={18} /> Resume</Btn>}
              </div>
            </div>
          )}
        </section>
        <aside className="panel order-3 p-3 sm:p-4 lg:order-none lg:col-span-2 xl:col-span-1" aria-label="Participants">
          <button type="button" onClick={() => setTeamsOpen((v) => !v)} aria-expanded={teamsOpen} className="mb-2.5 flex w-full items-center justify-between font-display text-sm font-bold uppercase tracking-widest text-slate-300 lg:pointer-events-none">
            <span>Teams <span className="text-[10px] font-normal normal-case tracking-normal text-muted">tap for squad board</span></span>
            {teamsOpen ? <ChevronUp size={16} className="lg:hidden" /> : <ChevronDown size={16} className="lg:hidden" />}
          </button>
          <div className={cx(teamsOpen ? 'block' : 'hidden', 'lg:block')}><Roster x={x} onSquad={setSquadPid} /></div>
        </aside>
        <section className="panel order-4 p-3 sm:p-4 lg:order-none lg:col-span-2 xl:col-span-3" aria-label="History">
          <button type="button" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen} className="flex w-full items-center justify-between py-1 font-display text-sm font-bold uppercase tracking-widest text-slate-300 lg:hidden">
            Auction activity {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <div className={cx(historyOpen ? 'mt-2 block' : 'hidden', 'lg:block')}><Feed x={x} onOpenCard={setViewer} /></div>
        </section>
      </main>

      <CardViewer card={viewer ? cards[viewer] ?? null : null} cfg={cfg} cards={cards} sales={m.sales} owner={vOwner} price={vOwner?.price} onClose={() => setViewer(null)} />
      <Modal open={!!squadP} onClose={() => setSquadPid(null)} wide title={squadP && <span className="flex items-center gap-2.5"><Avatar name={squadP.name} color={x.color(squadP.id)} size={30} /> {squadP.team} <span className="text-sm font-normal text-muted">· {squadP.name} · {compactINR(squadP.budget)} left</span></span>}>
        {squadP && (
          <SquadBoard
            p={squadP} cfg={cfg} cards={cards} editable={canEdit(squadP.id)}
            onLineup={(lineup) => ctl.act({ type: 'lineup', pid: squadP.id, lineup })}
            onAuto={() => ctl.act({ type: 'autoLineup', pid: squadP.id })}
            onFormation={(formation) => ctl.act({ type: 'formation', pid: squadP.id, formation })}
            onCard={(id) => { setSquadPid(null); setViewer(id); }}
          />
        )}
      </Modal>
      {host && <HostPanel x={x} onClose={() => setHost(false)} muted={muted} toggleMute={toggleMute} />}
      <Toast notice={snap.notice} />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Award as AwardIcon, Download, Repeat, RotateCcw, Share2, Shuffle, Swords, Trophy, Crown } from 'lucide-react';
import type { Card, Participant } from '../../shared/types';
import { autoLineup, teamConfig } from '../../shared/engine';
import { BATTLE_RULES, computeAwards, rankTeams, simulateBattle, type Award, type Ranked } from '../../shared/scoring';
import { compactINR, formatINR } from '../../shared/util';
import type { Controller, Snap } from '../lib/controller';
import { PLAYER_COLORS } from '../lib/draft';
import { sfx } from '../lib/sound';
import { CardViewer } from '../components/CardViewer';
import { GameCard } from '../components/GameCard';
import { ScoreBreakdown, SquadBoard } from '../components/SquadBoard';
import { Bar, Btn, Chip, cx, Logo, Toast } from '../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/shadcn/tabs';

function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const g = cv.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (cv.width = innerWidth * dpr);
    const H = (cv.height = innerHeight * dpr);
    const colors = ['#f6c453', '#2e90ff', '#a855f7', '#f43f5e', '#22d3ee', '#4ade80', '#ffffff'];
    const parts = Array.from({ length: 170 }, () => ({
      x: Math.random() * W, y: -Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr,
      s: (5 + Math.random() * 7) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      g.clearRect(0, 0, W, H);
      const fade = Math.max(0, 1 - (t - t0 - 4500) / 1500);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.02 * dpr;
        if (p.y > H + 20 && fade === 1) { p.y = -20; p.vy = (2 + Math.random() * 4) * dpr; }
        g.save(); g.globalAlpha = fade; g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
      }
      if (fade > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-40 h-full w-full" aria-hidden="true" />;
}

const ordinal = (n: number) => ['Champion', 'Runner-up', 'Third place'][n - 1] ?? `${n}th place`;

/** Draws the shareable match-summary image on a canvas (no external assets). */
function drawSummary(title: string, sub: string, ranking: Ranked[], awards: Award[], colors: string[], budget: number): HTMLCanvasElement {
  const W = 1080;
  const rowH = 96;
  const H = 520 + ranking.length * rowH + awards.length * 54 + 120;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#101a3d'); bg.addColorStop(0.6, '#070b1a'); bg.addColorStop(1, '#04060f');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, 700);
  glow.addColorStop(0, 'rgba(246,196,83,0.28)'); glow.addColorStop(1, 'rgba(246,196,83,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, 700);
  g.textAlign = 'center';
  g.fillStyle = '#f6c453'; g.font = '700 34px Rajdhani, Segoe UI, sans-serif'; g.fillText('ULTIMATE AUCTION ARENA', W / 2, 80);
  g.fillStyle = '#8f9bbd'; g.font = '500 24px Inter, Segoe UI, sans-serif'; g.fillText(sub, W / 2, 120);
  g.fillStyle = '#fff'; g.font = '700 30px Rajdhani, Segoe UI, sans-serif'; g.fillText(title.toUpperCase(), W / 2, 215);
  const champs = ranking.filter((r) => r.rank === 1);
  g.fillStyle = '#f6c453'; g.font = '700 92px Rajdhani, Segoe UI, sans-serif'; g.fillText(champs.map((r) => r.p.name).join(' & ').toUpperCase().slice(0, 22), W / 2, 310);
  g.fillStyle = '#e9edfa'; g.font = '500 28px Inter, Segoe UI, sans-serif'; g.fillText(`${champs[0].p.team} · ${champs[0].score.total.toFixed(1)} points`, W / 2, 360);
  let y = 440;
  g.textAlign = 'left';
  ranking.forEach((r, i) => {
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.roundRect(60, y, W - 120, rowH - 14, 18); g.fill();
    g.fillStyle = colors[i]; g.beginPath(); g.roundRect(60, y, 10, rowH - 14, 5); g.fill();
    g.fillStyle = r.rank === 1 ? '#f6c453' : '#fff'; g.font = '700 40px Rajdhani, Segoe UI, sans-serif'; g.fillText(`#${r.rank}`, 96, y + 54);
    g.fillStyle = '#fff'; g.font = '700 34px Rajdhani, Segoe UI, sans-serif'; g.fillText(r.p.name.toUpperCase(), 190, y + 40);
    g.fillStyle = '#8f9bbd'; g.font = '500 20px Inter, Segoe UI, sans-serif';
    g.fillText(`${r.p.team} · ${r.score.filled}/${r.score.size} cards · spent ${compactINR(budget - r.p.budget)} · avg ${r.score.avgOverall}`, 190, y + 68);
    g.textAlign = 'right'; g.fillStyle = r.rank === 1 ? '#f6c453' : '#fff'; g.font = '700 48px Rajdhani, Segoe UI, sans-serif'; g.fillText(r.score.total.toFixed(1), W - 90, y + 58); g.textAlign = 'left';
    y += rowH;
  });
  y += 40;
  awards.forEach((a) => {
    g.fillStyle = '#f6c453'; g.font = '700 24px Rajdhani, Segoe UI, sans-serif'; g.fillText(a.title.toUpperCase(), 70, y);
    g.fillStyle = '#e9edfa'; g.font = '500 22px Inter, Segoe UI, sans-serif'; g.fillText(`${a.winner} — ${a.detail}`.slice(0, 68), 400, y);
    y += 54;
  });
  g.textAlign = 'center'; g.fillStyle = '#5b678c'; g.font = '500 18px Inter, Segoe UI, sans-serif';
  g.fillText('Ratings are fictionalized game values · scored by the published formula', W / 2, H - 40);
  return cv;
}

export function Results({ snap, ctl, onHome, onRematch, onSwitch }: { snap: Snap; ctl: Controller; onHome: () => void; onRematch: () => void; onSwitch: () => void }) {
  const m = snap.match!;
  const cfg = m.config;
  const cards = snap.cards;
  const ranking = useMemo(() => rankTeams(m.participants, cfg, cards), [m.participants, cfg, cards]);
  const awards = useMemo(() => computeAwards(m.participants, m.sales, cfg, cards, ranking), [m, cards, ranking]);
  const colorOf = (pid: string | null) => PLAYER_COLORS[Math.max(0, m.participants.findIndex((p) => p.id === pid)) % PLAYER_COLORS.length];
  const nameOf = (pid: string | null) => m.participants.find((p) => p.id === pid)?.name ?? '—';

  // Cinematic reveal: scores appear from last place up to the champion.
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [revealed, setRevealed] = useState(reduce ? ranking.length : 0);
  const done = revealed >= ranking.length;
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => { setRevealed((r) => r + 1); sfx.clue(); }, revealed === 0 ? 1400 : 1150);
    return () => clearTimeout(t);
  }, [revealed, done]);
  useEffect(() => { if (done) sfx.win(); }, [done]);

  const [tab, setTab] = useState<'squads' | 'scoring' | 'purchases' | 'history' | 'battle'>('squads');
  const [focus, setFocus] = useState(ranking[0].p.id);
  const [compareA, setCompareA] = useState(ranking[0].p.id);
  const [compareB, setCompareB] = useState(ranking[1]?.p.id ?? ranking[0].p.id);
  const [viewer, setViewer] = useState<string | null>(null);
  const [lab, setLab] = useState<Participant | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string; tone: string } | null>(null);
  const champs = ranking.filter((r) => r.rank === 1);
  const focusRow = ranking.find((r) => r.p.id === focus) ?? ranking[0];
  const labTeam = lab?.id === focusRow.p.id ? lab : focusRow.p;
  const sold = m.sales.filter((s) => s.type === 'sold');
  const battle = useMemo(() => (cfg.mode === 'avengers' && ranking.length >= 2 ? simulateBattle(ranking[0].p, ranking[1].p, cards, cfg.seed) : null), [ranking, cards, cfg]);
  const ownerOf = (cardId: string) => {
    const p = m.participants.find((q) => q.squad.some((o) => o.cardId === cardId));
    return p ? { name: p.name, color: colorOf(p.id), price: p.squad.find((o) => o.cardId === cardId)!.price } : null;
  };

  const title = cfg.mode === 'football' ? 'Football Auction Champion' : 'Heroes Auction Champion';
  const summary = () => drawSummary(title, `${m.participants.length} teams · ${formatINR(cfg.budget)} each · ${sold.length} cards sold`, ranking, awards, ranking.map((r) => colorOf(r.p.id)), cfg.budget);
  const download = () => {
    const a = document.createElement('a');
    a.href = summary().toDataURL('image/png');
    a.download = 'ultimate-auction-arena-result.png';
    a.click();
  };
  const share = () => {
    summary().toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'ultimate-auction-arena-result.png', { type: 'image/png' });
      const text = `${champs.map((c) => c.p.name).join(' & ')} won the ${title.replace(' Champion', '')} with ${champs[0].score.total.toFixed(1)} points!`;
      try {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Ultimate Auction Arena', text });
        else { await navigator.clipboard.writeText(text); setNotice({ id: Date.now(), text: 'Result copied to clipboard — image sharing is not supported here, use Download instead.', tone: 'info' }); }
      } catch { /* share cancelled */ }
    });
  };
  const hostOnly = snap.kind === 'online' && !snap.isHost;
  const podium = [ranking[1], ranking[0], ranking[2]].filter(Boolean);
  const maxCompare = 100;
  const headA = ranking.find((r) => r.p.id === compareA) ?? ranking[0];
  const headB = ranking.find((r) => r.p.id === compareB) ?? ranking[1] ?? ranking[0];
  const headRows = [
    ...headA.score.compare.filter((m) => m.label !== 'Overall').map((metric) => ({ label: metric.label, a: metric.value, b: headB.score.compare.find((m) => m.label === metric.label)?.value ?? 0 })),
    { label: cfg.mode === 'football' ? 'Chemistry' : 'Synergy', a: headA.score.chem, b: headB.score.chem },
    { label: 'Tactical effectiveness', a: headA.score.parts.find((p) => p.key === (cfg.mode === 'football' ? 'tactics' : 'strategy'))?.score ?? 0, b: headB.score.parts.find((p) => p.key === (cfg.mode === 'football' ? 'tactics' : 'strategy'))?.score ?? 0 },
    { label: 'Overall score', a: headA.score.total, b: headB.score.total },
  ];
  const downloadSquad = () => {
    const cv = document.createElement('canvas');
    cv.width = 1000; cv.height = 480 + focusRow.p.squad.length * 58;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#080e24'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = colorOf(focusRow.p.id); ctx.fillRect(0, 0, 16, cv.height);
    const line = (text: string, y: number, size = 24, color = '#dce5f9') => { ctx.fillStyle = color; ctx.font = `600 ${size}px Arial`; ctx.fillText(text, 55, y, 890); };
    line('ULTIMATE AUCTION ARENA', 65, 26, '#f6c453');
    line(focusRow.p.team || focusRow.p.name, 132, 46);
    line(`${focusRow.p.name} · Rank #${focusRow.rank} · Score ${focusRow.score.total.toFixed(2)}/100`, 182, 26);
    line(cfg.mode === 'football' ? `${cfg.ratingMode === 'prime' ? 'Prime Legends · Custom game ratings' : cfg.ratingMode.toUpperCase() + ' · Host-verified import'} · ${teamConfig(focusRow.p, cfg).formation ?? 'Custom'}` : 'Heroes Arena · Custom game-power ratings', 226, 22, '#9aaecf');
    line(`Spent ${formatINR(cfg.budget - focusRow.p.budget)} · Remaining ${formatINR(focusRow.p.budget)}`, 272, 23);
    focusRow.p.squad.forEach((o, i) => {
      const c = cards[o.cardId];
      const y = 338 + i * 58;
      ctx.fillStyle = i % 2 ? '#0e1833' : '#111f3b'; ctx.fillRect(42, y - 32, 915, 49);
      line(`${c.kind === 'football' ? c.pos : c.cls}  ·  ${c.name}  ·  ${c.overall} OVR`, y, 23);
      ctx.textAlign = 'right'; ctx.fillStyle = '#f6c453'; ctx.fillText(formatINR(o.price), 935, y); ctx.textAlign = 'left';
    });
    line('Final auction squad · Original typography-only share card', cv.height - 64, 19, '#9aaecf');
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `arena-${focusRow.p.name}-squad.png`; a.click();
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-6 p-3 pb-16 sm:p-6" data-mode={cfg.mode}>
      <div className={cx('scene', cfg.mode)} />
      {done && <Confetti />}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Logo size="sm" />
        <Chip>{m.finishReason}</Chip>
      </header>

      {/* ───── championship reveal ───── */}
      <section className="glass spotlight overflow-hidden p-5 text-center sm:p-8">
        <div className="kicker">{done ? title : 'Final scores incoming'}</div>
        {done ? (
          <div className="rise">
            <div className="relative mx-auto mt-3 grid h-28 w-28 place-items-center rounded-full bg-[radial-gradient(circle,rgba(255,210,87,.45),transparent_68%)]">
              <Trophy size={72} className="float text-gold drop-shadow-[0_0_30px_#ffd257]" />
            </div>
            <h1 className="mt-1 font-display text-5xl font-bold uppercase gold-text drop-shadow-[0_0_34px_rgba(255,210,87,.5)] sm:text-8xl">{champs.map((c) => c.p.name).join(' & ')}</h1>
            <p className="mt-1 text-slate-300">{champs.length > 1 ? 'Shared victory — identical on every tie-breaker' : `${champs[0].p.team} · ${champs[0].score.total.toFixed(1)} points`}</p>
          </div>
        ) : (
          <h1 className="mt-4 font-display text-4xl font-bold uppercase grad-text sm:text-6xl">The auction is over</h1>
        )}

        <div className="mx-auto mt-6 max-w-2xl space-y-2 text-left">
          {ranking.map((r, i) => {
            const shown = ranking.length - i <= revealed;
            return (
              <div key={r.p.id} className={cx('rank-row', shown && 'rise', shown && r.rank === 1 && 'champ')} style={{ '--team': colorOf(r.p.id) } as React.CSSProperties}>
                <span className={cx('grid h-10 w-10 flex-none place-items-center rounded-xl font-display text-xl font-bold tnum', shown && r.rank === 1 ? 'bg-gradient-to-b from-[#fff3bf] to-[#f59e0b] text-[#2a1900]' : 'bg-black/30 text-slate-300')}>{shown ? r.rank : '?'}</span>
                <span className="avatar h-9 w-9 text-base" style={{ background: `radial-gradient(circle at 35% 30%, #fff 0%, ${colorOf(r.p.id)} 42%, color-mix(in srgb, ${colorOf(r.p.id)} 70%, #000) 100%)` }}>{r.p.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{r.p.name} <span className="text-xs font-normal text-muted">{r.p.team}</span></span>
                    <span className="font-display text-2xl font-bold tnum">{shown ? r.score.total.toFixed(1) : '— —'}</span>
                  </div>
                  <Bar value={shown ? r.score.total : 0} color={colorOf(r.p.id)} />
                </div>
              </div>
            );
          })}
        </div>
        {!done && <button className="btn btn-ghost mt-4 h-9 px-4 text-xs" onClick={() => setRevealed(ranking.length)}>Skip the reveal →</button>}

        {done && (
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 items-end gap-2 sm:gap-4">
            {podium.map((r) => {
              const place = r.rank;
              const h = place === 1 ? 'h-36 sm:h-44' : place === 2 ? 'h-24 sm:h-32' : 'h-16 sm:h-24';
              return (
                <div key={r.p.id} className="rise text-center">
                  {place === 1 && <Crown size={26} className="float mx-auto mb-1 text-gold drop-shadow-[0_0_12px_#ffd257]" />}
                  <div className="truncate font-display text-lg font-bold uppercase sm:text-2xl" style={{ color: colorOf(r.p.id), textShadow: `0 0 18px ${colorOf(r.p.id)}` }}>{r.p.name}</div>
                  <div className="text-xs text-slate-300 tnum">{r.score.total.toFixed(1)} pts</div>
                  <div className={cx('pillar mt-2', h, place === 1 && 'first')} style={{ '--team': colorOf(r.p.id) } as React.CSSProperties}>
                    <div><div className="font-display text-5xl font-bold">{place}</div><div className={cx('text-[10px] font-bold uppercase tracking-widest', place === 1 ? 'text-[#2a1900]/80' : 'text-slate-200')}>{ordinal(place)}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {done && (
        <>
          <section className="flex flex-wrap justify-center gap-2">
            <Btn variant="gold" onClick={onRematch} disabled={hostOnly} title={hostOnly ? 'Only the host can start a rematch' : undefined}><Repeat size={16} /> Rematch with same players</Btn>
            <Btn variant="soft" onClick={onSwitch} disabled={hostOnly}><Shuffle size={16} /> Switch game mode</Btn>
            <Btn variant="soft" onClick={onHome}><RotateCcw size={16} /> Play again</Btn>
            <Btn variant="ghost" onClick={download}><Download size={16} /> Download summary image</Btn>
            <Btn variant="ghost" onClick={share}><Share2 size={16} /> Share</Btn>
          </section>

          {/* ───── awards ───── */}
          {awards.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-3xl font-bold uppercase"><span className="gold-text">Auction awards</span></h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {awards.map((a) => (
                  <div key={a.id} className="award rise">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-b from-[#fff3bf] to-[#f59e0b] text-[#2a1900] shadow-[0_8px_20px_-8px_#ffd257]"><AwardIcon size={20} /></span>
                    <div className="mt-2 font-display text-sm font-bold uppercase tracking-wider text-gold">{a.title}</div>
                    <div className="font-display text-xl font-bold">{a.winner}</div>
                    <div className="text-xs text-muted">{a.detail}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ───── team comparison ───── */}
          <section className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-accent">Head-to-head lab</div>
                <h2 className="font-display text-2xl font-bold uppercase">Team {headA.p.name} vs Team {headB.p.name}</h2>
              </div>
              <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(150px,1fr)_auto_minmax(150px,1fr)] sm:items-center">
                <select aria-label="First comparison team" value={compareA} onChange={(e) => setCompareA(e.target.value)} className="h-10 rounded-xl border border-line bg-[#080d20] px-3 text-sm font-semibold text-white">
                  {ranking.map((r) => <option key={r.p.id} value={r.p.id}>{r.p.name}</option>)}
                </select>
                <Swords size={18} className="mx-auto hidden text-gold sm:block" />
                <select aria-label="Second comparison team" value={compareB} onChange={(e) => setCompareB(e.target.value)} className="h-10 rounded-xl border border-line bg-[#080d20] px-3 text-sm font-semibold text-white">
                  {ranking.map((r) => <option key={r.p.id} value={r.p.id}>{r.p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                <div><div className="font-display text-3xl font-bold tnum" style={{ color: colorOf(headA.p.id) }}>{headA.score.total.toFixed(1)}</div><div className="text-xs text-muted">#{headA.rank} · {compactINR(cfg.budget - headA.p.budget)} spent</div></div>
                <div className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-display text-xs font-bold uppercase text-gold">Overall</div>
                <div><div className="font-display text-3xl font-bold tnum" style={{ color: colorOf(headB.p.id) }}>{headB.score.total.toFixed(1)}</div><div className="text-xs text-muted">#{headB.rank} · {compactINR(cfg.budget - headB.p.budget)} spent</div></div>
              </div>
              {headRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[1fr_78px_1fr] items-center gap-2 sm:gap-4">
                  <div className="flex items-center justify-end gap-2"><b className="w-10 text-right tnum">{row.a || '—'}</b><Bar value={row.a} max={maxCompare} color={colorOf(headA.p.id)} className="max-w-40 flex-1" /></div>
                  <div className="text-center text-[10px] font-bold uppercase tracking-wider text-muted">{row.label}</div>
                  <div className="flex items-center gap-2"><Bar value={row.b} max={maxCompare} color={colorOf(headB.p.id)} className="max-w-40 flex-1" /><b className="w-10 tnum">{row.b || '—'}</b></div>
                </div>
              ))}
              <p className="text-center text-xs text-muted">{headA.score.total === headB.score.total ? 'Scores are tied; documented tie-breakers decide the order.' : `${headA.score.total > headB.score.total ? headA.p.name : headB.p.name} leads by ${Math.abs(headA.score.total - headB.score.total).toFixed(1)} points.`}</p>
            </div>
            <details className="mt-4 rounded-xl border border-line bg-black/15 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">View all-team comparison table</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wider text-muted"><th className="pb-2">Team</th>{ranking[0].score.compare.map((c) => <th key={c.label} className="pb-2">{c.label}</th>)}<th className="pb-2 text-right">Spent</th><th className="pb-2 text-right">Left</th><th className="pb-2 text-right">Score</th></tr></thead>
                  <tbody>{ranking.map((r) => <tr key={r.p.id} className="border-t border-white/5"><td className="py-2 pr-3"><span className="flex items-center gap-2 font-semibold"><span className="text-muted tnum">#{r.rank}</span><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(r.p.id) }} />{r.p.name}{!r.score.complete && <Chip tone="bad" className="!py-0">{r.score.filled}/{r.score.size}</Chip>}</span></td>{r.score.compare.map((c) => <td key={c.label} className="py-2 pr-3"><div className="flex items-center gap-2"><span className="w-9 tnum">{c.value || '—'}</span><Bar value={c.value} max={maxCompare} color={colorOf(r.p.id)} className="w-16" /></div></td>)}<td className="py-2 text-right tnum">{compactINR(cfg.budget - r.p.budget)}</td><td className="py-2 text-right tnum">{compactINR(r.p.budget)}</td><td className="py-2 text-right font-display text-lg font-bold tnum">{r.score.total.toFixed(1)}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
            <p className="mt-2 text-xs text-muted">Starting budget {formatINR(cfg.budget)} each · {sold.length} cards sold for {formatINR(sold.reduce((a, s) => a + s.price, 0))} in total · {m.totalBids} bids placed.</p>
          </section>

          {/* ───── detailed dashboard ───── */}
          <section className="panel p-4 sm:p-5">
            <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <TabsList variant="line" className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1.5 p-0">
              {([['squads', 'Final lineups'], ['scoring', 'Scoring explained'], ['purchases', 'Purchases & value'], ['history', 'Bidding history'], ...(battle ? [['battle', 'Exhibition battle']] : [])] as [typeof tab, string][]).map(([k, label]) => (
                <TabsTrigger key={k} value={k} className="flex-none rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted data-[state=active]:bg-accent/25 data-[state=active]:text-white">{label}</TabsTrigger>
              ))}
            </TabsList>
            {(tab === 'squads' || tab === 'scoring') && (
              <div className="mb-4 flex flex-wrap gap-2">
                {ranking.map((r) => (
                  <button key={r.p.id} onClick={() => setFocus(r.p.id)} aria-pressed={focus === r.p.id} className={cx('flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold', focus === r.p.id ? 'border-white bg-white/15' : 'border-line bg-white/[0.03] text-slate-300')}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(r.p.id) }} />#{r.rank} {r.p.name}
                  </button>
                ))}
              </div>
            )}
            <TabsContent value="squads">
              <Btn variant="soft" size="sm" className="mb-4" onClick={downloadSquad}><Download size={14} /> Download {focusRow.p.name}'s squad</Btn>
              <SquadBoard p={focusRow.p} cfg={cfg} cards={cards} onCard={setViewer} showScore={false} />
              <details className="mt-5 rounded-xl border border-line bg-black/20 p-4">
                <summary className="cursor-pointer font-display text-lg font-bold">Tactics lab · try another arrangement</summary>
                <p className="my-3 text-xs text-muted">Preview only. The final championship rankings, purchases and budgets stay locked. The score below shows how this arrangement would perform.</p>
                <SquadBoard p={labTeam} cfg={cfg} cards={cards} editable onCard={setViewer}
                  onLineup={(lineup) => setLab({ ...labTeam, lineup, manual: true })}
                  onAuto={() => setLab({ ...labTeam, lineup: autoLineup(labTeam.squad.map((o) => o.cardId), teamConfig(labTeam, cfg), cards), manual: false })}
                  onFormation={(formation) => { const next = { ...labTeam, formation, manual: false }; setLab({ ...next, lineup: autoLineup(next.squad.map((o) => o.cardId), teamConfig(next, cfg), cards) }); }} />
                <Btn className="mt-3" variant="ghost" size="sm" onClick={() => setLab(null)}>Reset preview</Btn>
              </details>
            </TabsContent>
            {tab === 'scoring' && (
              <TabsContent value="scoring" className="grid gap-6 md:grid-cols-2">
                <ScoreBreakdown score={focusRow.score} />
                <div className="space-y-2 text-sm text-slate-300">
                  <h3 className="font-display text-sm font-bold uppercase tracking-widest text-slate-200">How ranking works</h3>
                  <p>The team score is the weighted sum of the {cfg.mode === 'football' ? 'five' : 'four'} parts on the left, minus {cfg.emptyPenalty} points per empty slot{cfg.auctionType === 'mystery' ? ', plus the capped Mystery guess bonus' : ''}, capped at 100. Every input comes from data fixed before the auction.</p>
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
                    {cfg.completeFirst && <li>Complete squads rank above incomplete squads.</li>}
                    <li>Highest team score.</li><li>Better squad completeness.</li>
                    <li>Better {cfg.mode === 'football' ? 'positional balance' : 'role diversity'}.</li><li>Greater remaining budget.</li><li>Still identical → shared victory.</li>
                  </ol>
                  <p className="text-xs text-muted">{focusRow.p.name}: rank #{focusRow.rank}{focusRow.shared ? ' (shared)' : ''} · {focusRow.score.filled}/{focusRow.score.size} cards · {formatINR(focusRow.p.budget)} left.</p>
                </div>
              </TabsContent>
            )}
            {tab === 'purchases' && (
              <TabsContent value="purchases" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {[['Most expensive cards', sold.slice().sort((a, b) => b.price - a.price)], ['Best-value purchases', sold.slice().sort((a, b) => (cards[b.cardId].overall - 60) / b.price - (cards[a.cardId].overall - 60) / a.price)]].map(([label, list]) => (
                    <div key={label as string}>
                      <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-widest text-slate-200">{label as string}</h3>
                      <ul className="space-y-1 text-sm">
                        {(list as typeof sold).slice(0, 5).map((s) => (
                          <li key={s.round} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                            <button className="truncate font-semibold hover:underline" onClick={() => setViewer(s.cardId)}>{cards[s.cardId].name}</button>
                            <span className="text-xs text-muted">{cards[s.cardId].overall}</span>
                            <span className="truncate text-xs" style={{ color: colorOf(s.pid) }}>→ {nameOf(s.pid)}</span>
                            <span className="ml-auto tnum">{formatINR(s.price)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {ranking.map((r) => (
                  <div key={r.p.id}>
                    <h3 className="mb-2 flex flex-wrap items-baseline gap-x-3 font-display text-lg font-bold" style={{ color: colorOf(r.p.id) }}>
                      {r.p.name} <span className="text-xs font-normal text-muted">started {formatINR(cfg.budget)} · spent {formatINR(cfg.budget - r.p.budget)} · left {formatINR(r.p.budget)}</span>
                    </h3>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
                      {r.p.squad.map((o) => (
                        <div key={o.cardId}><GameCard card={cards[o.cardId] as Card} mini onClick={() => setViewer(o.cardId)} /><div className="mt-0.5 text-center text-[10px] text-muted tnum">{compactINR(o.price)}</div></div>
                      ))}
                      {!r.p.squad.length && <p className="col-span-full text-sm text-muted">Bought nothing.</p>}
                    </div>
                  </div>
                ))}
              </TabsContent>
            )}
            {tab === 'history' && (
              <TabsContent value="history" className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {m.sales.map((s) => (
                  <div key={s.round} className="rounded-xl bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-xs text-muted tnum">Round {s.round}{s.pass ? ' · re-auction' : ''}</span>
                      <b>{cards[s.cardId].name}</b>
                      {s.type === 'sold' ? <span>→ <b style={{ color: colorOf(s.pid) }}>{nameOf(s.pid)}</b> for <b className="tnum">{formatINR(s.price)}</b></span> : <Chip>Unsold</Chip>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.bids.filter((b) => b.round === s.round).map((b) => (
                        <span key={b.id} className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] tnum"><span style={{ color: colorOf(b.pid) }}>{nameOf(b.pid)}</span> {compactINR(b.amount)}</span>
                      ))}
                    </div>
                  </div>
                ))}
                {!m.sales.length && <p className="text-sm text-muted">No cards were auctioned.</p>}
              </TabsContent>
            )}
            {tab === 'battle' && battle && (
              <TabsContent value="battle" className="space-y-4">
                <div className="flex items-center justify-center gap-4 font-display text-2xl font-bold uppercase">
                  <span style={{ color: colorOf(ranking[0].p.id) }}>{ranking[0].p.name}</span>
                  <span className="rounded-xl bg-white/10 px-4 py-1 tnum">{battle.winsA} – {battle.winsB}</span>
                  <span style={{ color: colorOf(ranking[1].p.id) }}>{ranking[1].p.name}</span>
                </div>
                <ul className="mx-auto max-w-xl space-y-1.5">
                  {battle.rounds.map((r, i) => (
                    <li key={r.name} className="rise grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm" style={{ animationDelay: `${i * 0.25}s` }}>
                      <span className={cx('text-right tnum', r.winner === 'a' && 'font-bold text-emerald-300')}>{r.a} <span className="text-[10px] text-muted">({r.rollA >= 0 ? '+' : ''}{r.rollA})</span></span>
                      <span className="flex items-center gap-1.5 font-display font-bold uppercase"><Swords size={14} className="text-accent" />{r.name}</span>
                      <span className={cx('tnum', r.winner === 'b' && 'font-bold text-emerald-300')}>{r.b} <span className="text-[10px] text-muted">({r.rollB >= 0 ? '+' : ''}{r.rollB})</span></span>
                    </li>
                  ))}
                </ul>
                <ul className="mx-auto max-w-xl list-disc space-y-1 pl-5 text-xs text-muted">{BATTLE_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
              </TabsContent>
            )}
            </Tabs>
          </section>
        </>
      )}
      <CardViewer card={viewer ? cards[viewer] ?? null : null} cfg={cfg} cards={cards} sales={m.sales} owner={viewer ? ownerOf(viewer) : null} price={viewer ? ownerOf(viewer)?.price : undefined} onClose={() => setViewer(null)} />
      <Toast notice={notice ?? snap.notice} />
      {hostOnly && done && <p className="text-center text-xs text-muted">Waiting for the host to start a rematch or switch modes. Room {snap.room?.code}.</p>}
    </div>
  );
}

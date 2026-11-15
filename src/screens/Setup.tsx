import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Download, FileSpreadsheet, Globe, Minus, Plus, RotateCcw, Search, Shield, Smartphone, Trophy, Upload, Users, Zap } from 'lucide-react';
import type { Card, Custom, FormationName, Line, MatchConfig, Mode, RatingMode } from '../../shared/types';
import { HERO_CLASSES, LINES } from '../../shared/types';
import { basePrice, CLUE_STEP_MS, FORMATIONS, GUESS_BONUS, GUESS_CAP, incrementOptions, minPrice, quickSteps, slotsForFormation, validateSetup } from '../../shared/engine';
import { normalizeCard, PACKS } from '../../shared/catalog';
import { parseCardCsv } from '../../shared/cardImport';
import { AVENGERS_WEIGHTS, BATTLE_RULES, FOOTBALL_WEIGHTS, SYNERGY_CAP } from '../../shared/scoring';
import { compactINR, formatINR } from '../../shared/util';
import { catalogFor, poolFor, withBudget, withMode, type Draft } from '../lib/draft';
import { RARITY_COLOR, statKeys } from '../components/GameCard';
import { Btn, Chip, cx, Field, inputCls, Logo, Modal, Seg, Toggle } from '../components/ui';
import { Progress } from '../components/shadcn/progress';

const BUDGETS = [500_000, 1_000_000, 2_000_000, 5_000_000];


function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2">
      <span className="text-sm font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <button aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 disabled:opacity-30"><Minus size={14} /></button>
        <b className="w-6 text-center tnum">{value}</b>
        <button aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 disabled:opacity-30"><Plus size={14} /></button>
      </span>
    </div>
  );
}

// ───────────────────────── card pool administration ─────────────────────────

function CardAdmin({ cfg, setCfg, custom, setCustom, onClose }: { cfg: MatchConfig; setCfg: (c: MatchConfig) => void; custom: Custom; setCustom: (c: Custom) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const kind = cfg.mode === 'football' ? 'football' : 'hero';
  const catalog = useMemo(() => catalogFor(cfg.mode, custom).filter((c) => c.kind === kind), [cfg.mode, custom, kind]);
  const list = catalog
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) && (c.kind !== 'football' || (c.ratingMode ?? 'prime') === cfg.ratingMode))
    .sort((a, b) => b.overall - a.overall);

  const edit = (c: Card, overall: number, stats: number[]) => setCustom({ ...custom, edits: { ...custom.edits, [c.id]: { overall, stats } } });
  const unedit = (id: string) => {
    const edits = { ...custom.edits };
    delete edits[id];
    setCustom({ ...custom, edits });
  };
  const toggle = (id: string) => setCfg({ ...cfg, excluded: cfg.excluded.includes(id) ? cfg.excluded.filter((x) => x !== id) : [...cfg.excluded, id] });
  const importCards = (text: string, filename = '') => {
    try {
      let arr: unknown[];
      if (filename.toLowerCase().endsWith('.csv') || !/^[\s]*[\[{]/.test(text)) arr = parseCardCsv(text, cfg.mode, cfg.ratingMode);
      else {
        const data = JSON.parse(text);
        arr = Array.isArray(data) ? data : Array.isArray(data?.cards) ? data.cards : [];
      }
      const ok = arr.map((r) => normalizeCard(r, cfg.mode)).filter((c): c is Card => !!c);
      if (!ok.length) return setMsg('No valid cards found. Each row/card needs at least a name.');
      const imported = new Map(custom.imported.map((raw) => normalizeCard(raw, cfg.mode)).filter((c): c is Card => !!c).map((c) => [c.id, c]));
      for (const card of ok) imported.set(card.id, card);
      if (imported.size > 300) return setMsg('Import exceeds the 300-card custom library limit. No changes were made; import a smaller auction pool.');
      const edits = { ...custom.edits };
      for (const card of ok) delete edits[card.id];
      setCustom({ edits, imported: [...imported.values()] });
      const verified = ok.filter((c) => c.kind === 'football' && c.verificationStatus === 'verified').length;
      setMsg(`Imported/updated ${ok.length} card${ok.length === 1 ? '' : 's'}${ok.length < arr.length ? ` (${arr.length - ok.length} skipped)` : ''}.${cfg.mode === 'football' ? ` ${verified} have complete ratings and host verification metadata. The app does not independently verify source contents. Unverified cards cannot enter official auctions.` : ''}`);
      setPaste('');
    } catch {
      setMsg('That file is not valid JSON/CSV or its columns could not be read.');
    }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `uaa-${cfg.mode}-cards.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportCsvTemplate = () => {
    const football = 'name,overall,pos,secondary_positions,nationality,club,PAC,SHO,PAS,DRI,DEF,PHY,DIV,HAN,KIC,REF,SPD,positioning,rating_system,card_type,playstyles,source_url,date_verified,verification_status,image_url,image_source,image_source_url,image_license,image_attribution,image_verified_at,image_verified\n';
    const heroes = 'name,overall,class,STR,SPD,INT,DEF,PWR,TMW,role,ability,weak_to,tags,image_url\n';
    const blob = new Blob([cfg.mode === 'football' ? football : heroes], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `uaa-${cfg.mode}-import-template.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const num = (v: string, d: number) => Math.max(1, Math.min(99, Math.round(Number(v) || d)));

  return (
    <Modal open onClose={onClose} wide title="Card pool administration">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-3 text-muted" />
          <input className={cx(inputCls, 'pl-9')} placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Btn variant="soft" size="sm" onClick={exportJson}><Download size={14} /> Export JSON</Btn>
        <Btn variant="soft" size="sm" onClick={exportCsvTemplate}><FileSpreadsheet size={14} /> CSV template</Btn>
        <Btn variant="soft" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import file</Btn>
        <input ref={fileRef} type="file" accept="application/json,text/csv,.json,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((text) => importCards(text, f.name)); e.target.value = ''; }} />
        <Btn variant="ghost" size="sm" onClick={() => { setCustom({ edits: {}, imported: [] }); setMsg('All edits and imported cards cleared.'); }}><RotateCcw size={14} /> Reset all</Btn>
      </div>
      <details className="mb-4 rounded-xl border border-line bg-black/20 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Paste a JSON or CSV dataset</summary>
        <p className="mt-2 text-xs text-muted">
          JSON may be an array or <code>{'{ cards: [...] }'}</code>. Official cards need a name, position, nationality, club, OVR, all six attributes (1–99), ratingMode (fc26/fc27), an HTTPS EA source, verifiedAt (YYYY-MM-DD), and verificationStatus: verified. Mark verified only after checking that edition's source yourself. Missing ratings display — and stay out of official auctions. GK columns: DIV, HAN, KIC, REF, SPD, positioning. Separate positions/PlayStyles with |. Up to 300 imported cards; reimporting updates the same name and edition.
        </p>
        <textarea className={cx(inputCls, 'mt-2 h-24 py-2 font-mono text-xs')} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='[{"name":"My Player","overall":84,"pos":"ST","nation":"India","stats":[88,84,70,82,40,76]}]' />
        <Btn size="sm" className="mt-2" disabled={!paste.trim()} onClick={() => importCards(paste)}>Import pasted cards</Btn>
      </details>
      {msg && <p className="mb-3 rounded-lg bg-accent/15 px-3 py-2 text-sm">{msg}</p>}
      <p className="mb-2 text-xs text-muted">{catalog.length} cards · {Object.keys(custom.edits).length} rating edits · {custom.imported.length} imported · {cfg.excluded.length} excluded. Untick a card to exclude it from this match.</p>
      <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
        {list.map((c) => {
          const included = !cfg.excluded.includes(c.id);
          const packOn = c.pack === 'custom' || cfg.packs.includes(c.pack);
          const edited = !!custom.edits[c.id];
          return (
            <div key={c.id} className={cx('rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2', (!included || !packOn) && 'opacity-50')}>
              <div className="flex items-center gap-3">
                <input type="checkbox" aria-label={`Include ${c.name}`} checked={included} onChange={() => toggle(c.id)} className="h-4 w-4 accent-[var(--accent)]" />
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: RARITY_COLOR[c.rarity] }} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name} <span className="text-xs font-normal text-muted">· {c.kind === 'football' ? `${c.pos} · ${c.nation} · ${c.edition ?? 'Prime Legends'} · ${c.verificationStatus ?? 'custom'}` : c.cls}{!packOn ? ' · pack disabled' : ''}{c.pack === 'custom' ? ' · imported' : ''}</span></span>
                {edited && <button className="text-xs text-amber-300 underline" onClick={() => unedit(c.id)}>reset</button>}
                <label className="flex items-center gap-1.5 text-xs text-muted">OVR
                  <input aria-label={`${c.name} overall`} type="number" min={1} max={99} placeholder="—" value={c.overall || ''} onChange={(e) => edit(c, num(e.target.value, c.overall), c.stats)} className="h-8 w-14 rounded-lg border border-line bg-black/30 px-2 text-sm text-white" />
                </label>
                <button className="text-xs font-semibold text-accent" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Close' : 'Stats'}</button>
              </div>
              {open === c.id && (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {statKeys(c).map((k, i) => (
                    <label key={k} className="text-[11px] text-muted">{k}
                      <input type="number" min={1} max={99} placeholder="—" value={c.stats[i] || ''} onChange={(e) => edit(c, c.overall, c.stats.map((v, j) => (j === i ? num(e.target.value, v) : v)))} className="mt-0.5 h-8 w-full rounded-lg border border-line bg-black/30 px-2 text-sm text-white" />
                    </label>
                  ))}
                  {c.kind === 'football' && <div className="col-span-3 text-[11px] text-muted sm:col-span-6">{c.verificationStatus === 'verified' ? <><BadgeCheck size={12} className="mr-1 inline text-emerald-300" />Verified {c.verifiedAt} · <a href={c.source ?? '#'} target="_blank" rel="noreferrer" className="text-accent underline">official source</a></> : 'Not verified as official. Local rating edits always clear verification.'}</div>}
                </div>
              )}
            </div>
          );
        })}
        {!list.length && <p className="p-6 text-center text-sm text-muted">No cards match “{q}”.</p>}
      </div>
    </Modal>
  );
}

// ───────────────────────── the wizard ─────────────────────────

const STEPS = ['Mode', 'Players', 'Rules', 'Cards', 'Review'] as const;
type Step = (typeof STEPS)[number];

export function Setup({ initial, initialCustom, roomMode, onCancel, onSubmit }: {
  initial: Draft; initialCustom: (mode: Mode) => Custom; roomMode?: boolean; onCancel: () => void; onSubmit: (d: Draft, custom: Custom) => void;
}) {
  const steps: Step[] = roomMode ? ['Mode', 'Rules', 'Cards', 'Review'] : [...STEPS];
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(initial);
  const [customs, setCustoms] = useState<Record<Mode, Custom>>(() => ({ football: initialCustom('football'), avengers: initialCustom('avengers') }));
  const [admin, setAdmin] = useState(false);
  const [customBudget, setCustomBudget] = useState(BUDGETS.includes(initial.config.budget) ? '' : String(initial.config.budget));
  const cfg = d.config;
  const custom = customs[cfg.mode];
  const online = cfg.play === 'online';
  const set = (patch: Partial<MatchConfig>) => setD((x) => ({ ...x, config: { ...x.config, ...patch } }));
  const pool = useMemo(() => poolFor(cfg, custom), [cfg, custom]);
  const names = online || roomMode ? [d.names[0] || 'Host', 'Guest'] : d.names.slice(0, d.count);
  const check = useMemo(() => validateSetup(cfg, names, pool), [cfg, pool, names.join('|')]);
  const cur = steps[step];
  const incs = incrementOptions(cfg.budget);

  const nameErrors = (() => {
    if (roomMode) return [];
    if (online) return d.names[0].trim() ? [] : ['Enter your display name.'];
    const n = d.names.slice(0, d.count).map((x) => x.trim().toLowerCase());
    if (n.some((x) => !x)) return ['Every participant needs a name.'];
    if (new Set(n).size !== n.length) return ['Participant names must be unique.'];
    return [];
  })();
  const canNext = cur === 'Players' ? !nameErrors.length : cur === 'Rules' ? cfg.budget >= 1000 : true;
  const canStart = !check.errors.length && !nameErrors.length;

  const setSlots = (line: Line, v: number) => {
    const slots = { ...cfg.slots, [line]: v };
    set({ slots, squadSize: LINES.reduce((a, l) => a + slots[l], 0), formation: null });
  };
  const setFormation = (formation: FormationName) => set({ formation, slots: slotsForFormation(formation), squadSize: 11 });
  const fullCatalog = useMemo(() => catalogFor(cfg.mode, custom), [cfg.mode, custom]);
  const counts = (key: (c: Card) => string) => pool.reduce<Record<string, number>>((a, c) => ((a[key(c)] = (a[key(c)] || 0) + 1), a), {});
  const byGroup = counts((c) => (c.kind === 'football' ? c.line : c.cls));
  const byRarity = counts((c) => c.rarity);
  const ratingCounts = cfg.mode === 'football' ? fullCatalog.reduce<Record<RatingMode, number>>((acc, card) => {
    if (card.kind === 'football' && ((card.ratingMode ?? 'prime') === 'prime' || card.verificationStatus === 'verified')) acc[card.ratingMode ?? 'prime']++;
    return acc;
  }, { fc26: 0, fc27: 0, prime: 0 }) : null;
  const verifiedCount = pool.filter((c) => c.kind === 'football' && c.verificationStatus === 'verified').length;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6 sm:py-10" data-mode={cfg.mode}>
      <div className={cx('scene', cfg.mode)} />
      <header className="mb-6 flex items-center justify-between gap-3">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-muted hover:text-white"><ArrowLeft size={16} /> {roomMode ? 'Back to lobby' : 'Home'}</button>
        <Logo size="sm" />
      </header>

      <ol className="mb-6 flex items-center gap-1.5 sm:gap-2" aria-label="Setup steps">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => i < step && setStep(i)} disabled={i > step} aria-current={i === step ? 'step' : undefined}
              className={cx('flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-bold sm:px-3.5', i === step ? 'border-accent bg-accent/20 text-white' : i < step ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-line text-muted')}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-black/40 tnum">{i + 1}</span>
              <span className="hidden sm:inline">{s}</span>
            </button>
            {i < steps.length - 1 && <span className={cx('h-px flex-1', i < step ? 'bg-emerald-500/50' : 'bg-line')} />}
          </li>
        ))}
      </ol>

      <main className="glass flex-1 space-y-7 p-5 sm:p-8">
        {cur === 'Mode' && (
          <>
            <h1 className="font-display text-3xl font-bold">Choose your arena</h1>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ['football', 'Football Auction', 'Draft an 11-player XI. Win on quality, positional suitability, tactical balance, role coverage and chemistry.', <Trophy key="i" size={26} />, '#2e90ff'],
                ['avengers', 'Heroes Auction', 'Recruit 5 heroes. Win on power, synergy, role diversity and counter coverage.', <Zap key="i" size={26} />, '#a855f7'],
              ] as const).map(([mode, title, text, icon, color]) => (
                <button
                  key={mode} onClick={() => setD((x) => withMode(x, mode))} aria-pressed={cfg.mode === mode}
                  className={cx('relative overflow-hidden rounded-2xl border p-5 text-left transition', cfg.mode === mode ? 'border-transparent glow-accent' : 'border-line hover:border-white/30')}
                  style={{ background: `radial-gradient(120% 90% at 0% 0%, ${color}40, transparent 60%), #0b1124` }}
                >
                  <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl text-white" style={{ background: color }}>{icon}</span>
                  <span className="block font-display text-2xl font-bold">{title}</span>
                  <span className="mt-1 block text-sm text-slate-300">{text}</span>
                </button>
              ))}
            </div>
            {!roomMode && (
              <Field label="How are you playing?">
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ['local', 'Local Pass-and-Play', 'Everyone shares this screen. Works instantly, no server needed.', <Smartphone key="i" size={20} />],
                    ['online', 'Online Multiplayer', 'Friends join from their own phones with an invite code.', <Globe key="i" size={20} />],
                  ] as const).map(([play, title, text, icon]) => (
                    <button key={play} onClick={() => set({ play })} aria-pressed={cfg.play === play}
                      className={cx('flex items-start gap-3 rounded-xl border p-4 text-left transition', cfg.play === play ? 'border-accent bg-accent/15' : 'border-line bg-white/[0.03] hover:bg-white/[0.06]')}>
                      <span className="mt-0.5 text-accent">{icon}</span>
                      <span><span className="block font-semibold">{title}</span><span className="block text-xs text-muted">{text}</span></span>
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}

        {cur === 'Players' && (
          <>
            <h1 className="font-display text-3xl font-bold">{online ? 'Your host profile' : 'Who is bidding?'}</h1>
            {online ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Your display name"><input className={inputCls} maxLength={20} autoFocus value={d.names[0]} onChange={(e) => setD((p) => ({ ...p, names: p.names.map((x, i) => (i === 0 ? e.target.value : x)) }))} placeholder="e.g. Saqib" /></Field>
                <Field label="Team name" hint="optional"><input className={inputCls} maxLength={20} value={d.teams[0]} onChange={(e) => setD((p) => ({ ...p, teams: p.teams.map((x, i) => (i === 0 ? e.target.value : x)) }))} placeholder="e.g. Royal Strikers" /></Field>
                <p className="text-sm text-muted sm:col-span-2"><Users size={14} className="mr-1 inline" /> You will get a private room with an invite code and link. Between 2 and 8 players can join before you start the match.</p>
              </div>
            ) : (
              <>
                <Field label="Number of participants">
                  <Seg value={d.count} onChange={(count) => setD((p) => ({ ...p, count }))} options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))} />
                </Field>
                <div className="space-y-2">
                  {Array.from({ length: d.count }, (_, i) => (
                    <div key={i} className="grid grid-cols-[28px_1fr_1fr] items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/25 text-xs font-bold">{i + 1}</span>
                      <input className={inputCls} maxLength={20} aria-label={`Participant ${i + 1} name`} placeholder={`Player ${i + 1} name`} value={d.names[i]} onChange={(e) => setD((p) => ({ ...p, names: p.names.map((x, j) => (j === i ? e.target.value : x)) }))} />
                      <input className={inputCls} maxLength={20} aria-label={`Participant ${i + 1} team name`} placeholder="Team name (optional)" value={d.teams[i]} onChange={(e) => setD((p) => ({ ...p, teams: p.teams.map((x, j) => (j === i ? e.target.value : x)) }))} />
                    </div>
                  ))}
                </div>
              </>
            )}
            {nameErrors.map((e) => <p key={e} className="text-sm text-amber-300">{e}</p>)}
          </>
        )}

        {cur === 'Rules' && (
          <>
            <h1 className="font-display text-3xl font-bold">Match rules</h1>
            <Field label="Starting budget" hint="identical for every participant">
              <div className="flex flex-wrap items-center gap-2">
                <Seg value={customBudget ? -1 : cfg.budget} onChange={(v) => { if (v > 0) { setCustomBudget(''); set(withBudget(cfg, v)); } }} options={BUDGETS.map((b) => ({ value: b, label: compactINR(b).replace('L', ' lakh') }))} />
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-muted">₹</span>
                  <input className={cx(inputCls, 'w-44 pl-7', customBudget && 'border-accent')} inputMode="numeric" placeholder="Custom amount" aria-label="Custom budget" value={customBudget}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 11); setCustomBudget(v); if (Number(v) >= 1000) set(withBudget(cfg, Number(v))); }} />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">Opening prices scale with the budget: {formatINR(minPrice(cfg))} for a common card up to {formatINR(basePrice(99, cfg))} for a mythic.</p>
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Auction type">
                <Seg value={cfg.auctionType} onChange={(auctionType) => set({ auctionType })} options={[{ value: 'classic', label: 'Classic Auction' }, { value: 'mystery', label: 'Mystery Auction' }]} />
                <p className="mt-2 text-xs text-muted">{cfg.auctionType === 'mystery' ? `Three clues appear every ${CLUE_STEP_MS / 1000}s. Guess the hidden card for +${GUESS_BONUS} points (max +${GUESS_CAP}), then bid as normal.` : 'Every card is revealed immediately and bidding starts at once.'}</p>
              </Field>
              <Field label="Squad rules">
                <Seg value={cfg.rules} onChange={(rules) => set({ rules })} options={[{ value: 'strict', label: 'Strict' }, { value: 'casual', label: 'Casual' }]} />
                <p className="mt-2 text-xs text-muted">{cfg.rules === 'strict' ? (cfg.mode === 'football' ? 'You may only buy players for open formation slots.' : `At most ${cfg.maxPerClass} heroes of the same class per team.`) : (cfg.mode === 'football' ? 'Buy anyone — but players out of position are penalised in scoring.' : 'Buy anyone — role diversity still counts for 20% of the score.')}</p>
              </Field>
              <Field label="Time per card">
                <Seg value={cfg.timerSec} onChange={(timerSec) => set({ timerSec })} options={[10, 15, 20, 30].map((s) => ({ value: s, label: `${s}s` }))} />
              </Field>
              <Field label="Minimum bid increment">
                <Seg value={cfg.increment} onChange={(increment) => set({ increment })} options={incs.map((v) => ({ value: v, label: `+${compactINR(v)}` }))} />
              </Field>
              <Field label="Anti-sniping extension" hint="late bids reset the clock">
                <Seg value={cfg.antiSnipeSec} onChange={(antiSnipeSec) => set({ antiSnipeSec })} options={[3, 5, 8].map((s) => ({ value: s, label: `${s}s` }))} />
              </Field>
              <Field label={cfg.mode === 'football' ? 'Formation (squad size follows)' : 'Team size'}>
                {cfg.mode === 'football' ? (
                  <div className="space-y-3">
                    <Seg value={cfg.formation ?? 'custom'} onChange={(value) => { if (value !== 'custom') setFormation(value); else set({ formation: null }); }} options={[...FORMATIONS.map((formation) => ({ value: formation as FormationName | 'custom', label: formation })), { value: 'custom' as const, label: 'Custom' }]} />
                    <p className="text-xs text-muted">{cfg.formation ? `${cfg.formation} · ${LINES.map((l) => `${cfg.slots[l]} ${l}`).join(' / ')} · 11 players` : `Custom formation · ${cfg.squadSize} total players`}</p>
                    <details open={!cfg.formation} className="rounded-xl border border-line bg-black/15 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-300">Fine-tune line counts</summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">{LINES.map((l) => <Stepper key={l} label={l} value={cfg.slots[l]} min={l === 'GK' ? 0 : 1} max={l === 'GK' ? 2 : 6} onChange={(v) => setSlots(l, v)} />)}</div>
                    </details>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Stepper label="Heroes per team" value={cfg.squadSize} min={3} max={8} onChange={(squadSize) => set({ squadSize })} />
                    <Stepper label="Max per class (Strict)" value={cfg.maxPerClass} min={1} max={5} onChange={(maxPerClass) => set({ maxPerClass })} />
                  </div>
                )}
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={cfg.shuffle} onChange={(shuffle) => set({ shuffle })} label="Shuffle auction order" hint="Off = cards appear in catalog order" />
              <Toggle checked={cfg.reauction} onChange={(reauction) => set({ reauction })} label="Re-auction unsold cards" hint="Unsold cards return once at half price" />
              <Toggle checked={cfg.reserve} disabled={cfg.rules !== 'strict'} onChange={(reserve) => set({ reserve })} label="Reserve money for empty slots" hint="Strict only: you can never bid so much that you cannot fill your squad at minimum prices" />
              <Toggle checked={cfg.preview && cfg.auctionType === 'classic'} disabled={cfg.auctionType !== 'classic'} onChange={(preview) => set({ preview })} label="Show next-card preview" hint="Hidden automatically in Mystery Auction" />
              <Toggle checked={cfg.completeFirst} onChange={(completeFirst) => set({ completeFirst })} label="Complete squads rank first" hint="Off = an incomplete squad can still win on points" />
              <Stepper label="Penalty per empty slot (pts)" value={cfg.emptyPenalty} min={0} max={15} onChange={(emptyPenalty) => set({ emptyPenalty })} />
            </div>
          </>
        )}

        {cur === 'Cards' && (
          <>
            <h1 className="font-display text-3xl font-bold">Card pool</h1>
            {cfg.mode === 'football' && ratingCounts && (
              <Field label="Rating database" hint="chosen before the auction and never mixed silently">
                <Seg value={cfg.ratingMode} onChange={(ratingMode) => set({ ratingMode, excluded: [] })} options={[
                  { value: 'fc26', label: `FC 26 Official (${ratingCounts.fc26})` },
                  { value: 'fc27', label: `FC 27 Official (${ratingCounts.fc27})` },
                  { value: 'prime', label: `Prime Legends / Custom (${ratingCounts.prime})` },
                ]} />
                <div className={cx('mt-3 rounded-xl border p-3 text-xs', cfg.ratingMode === 'prime' ? 'border-gold/25 bg-gold/5 text-slate-300' : verifiedCount ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100')}>
                  {cfg.ratingMode === 'prime' ? (
                    <>Built-in values are explicitly custom game-balance ratings, never presented as official EA data. Imported verified Icon/Hero items may also carry their specific source.</>
                  ) : verifiedCount ? (
                    <><BadgeCheck size={13} className="mr-1 inline" />{verifiedCount} host-verified {cfg.ratingMode === 'fc27' ? 'FC 27' : 'FC 26'} card{verifiedCount === 1 ? '' : 's'} ready. The app checks completeness and source metadata; the host is responsible for checking the source values.</>
                  ) : (
                    <>No verified {cfg.ratingMode === 'fc27' ? 'FC 27' : 'FC 26'} dataset is installed. Use <b>Manage, edit & import cards</b> for a provenance-bearing CSV/JSON file. The app deliberately does not scrape EA or invent official ratings.</>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted">Primary reference: <a className="text-accent underline" href="https://www.ea.com/games/ea-sports-fc/ratings" target="_blank" rel="noreferrer">EA SPORTS FC Ratings</a>. FC 27’s live database covers launch base items; FC 26 requires a preserved, sourced import.</p>
              </Field>
            )}
            <Field label="Card packs">
              <div className="grid gap-3 sm:grid-cols-3">
                {PACKS[cfg.mode].map((pk) => {
                  const on = cfg.packs.includes(pk.id);
                  const n = fullCatalog.filter((c) => c.pack === pk.id && (c.kind !== 'football' || (c.ratingMode ?? 'prime') === cfg.ratingMode)).length;
                  return (
                    <button key={pk.id} aria-pressed={on} onClick={() => set({ packs: on ? cfg.packs.filter((x) => x !== pk.id) : [...cfg.packs, pk.id] })}
                      className={cx('rounded-xl border p-3 text-left transition', on ? 'border-accent bg-accent/15' : 'border-line bg-white/[0.03] opacity-70 hover:opacity-100')}>
                      <span className="flex items-center justify-between font-semibold">{pk.label}<span className="text-xs text-muted tnum">{n}</span></span>
                      <span className="block text-xs text-muted">{pk.note}</span>
                    </button>
                  );
                })}
              </div>
              {cfg.mode === 'avengers' && <p className="mt-2 text-xs text-muted">Marvel-inspired names use generated placeholder art only and are for private play. For a commercial release, switch to the <b>Original Heroes</b> pack or license the characters.</p>}
            </Field>
            <div className="rounded-xl border border-line bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-display text-3xl font-bold tnum">{pool.length} <span className="text-base font-semibold text-muted">cards in play</span></div>
                  <div className="text-xs text-muted">{online || roomMode ? `Enough for up to ${Math.min(8, Math.floor(pool.length / cfg.squadSize))} players` : `${check.needed} needed for ${d.count} × ${cfg.squadSize}`}</div>
                </div>
                <Btn variant="soft" onClick={() => setAdmin(true)}><Shield size={15} /> Manage, edit & import cards</Btn>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(cfg.mode === 'football' ? LINES : HERO_CLASSES).map((g) => <Chip key={g}>{g} {byGroup[g] || 0}</Chip>)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(['mythic', 'legendary', 'epic', 'rare', 'common'] as const).map((r) => <Chip key={r}><span className="h-2 w-2 rounded-full" style={{ background: RARITY_COLOR[r] }} /> {r} {byRarity[r] || 0}</Chip>)}
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Minimum pool coverage</span><span className="tnum">{pool.length}/{check.needed}</span></div>
                <Progress value={Math.min(100, check.needed ? (pool.length / check.needed) * 100 : 0)} className="h-2 bg-white/10 [&_[data-slot=progress-indicator]]:bg-accent" />
              </div>
            </div>
          </>
        )}

        {cur === 'Review' && (
          <>
            <h1 className="font-display text-3xl font-bold">Final summary</h1>
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              {([
                ['Mode', cfg.mode === 'football' ? 'Football Auction' : 'Heroes Auction'],
                ...(cfg.mode === 'football' ? [['Ratings', cfg.ratingMode === 'fc27' ? `FC 27 Official · ${verifiedCount} verified cards` : cfg.ratingMode === 'fc26' ? `FC 26 Official · ${verifiedCount} verified cards` : 'Prime Legends / Custom']] as [string, string][] : []),
                ['Play', roomMode || online ? 'Online multiplayer room' : 'Local pass-and-play'],
                ...(roomMode ? [] : [['Participants', online ? `${d.names[0] || '—'} (host) + invited friends` : d.names.slice(0, d.count).map((n, i) => (d.teams[i] ? `${n} (${d.teams[i]})` : n)).join(', ')] as [string, string]]),
                ['Starting budget', `${formatINR(cfg.budget)} each`],
                ['Squad', cfg.mode === 'football' ? `${cfg.squadSize} players · ${cfg.formation ?? 'Custom'} · ${LINES.map((l) => `${cfg.slots[l]} ${l}`).join(' / ')}` : `${cfg.squadSize} heroes`],
                ['Squad rules', cfg.rules === 'strict' ? `Strict${cfg.reserve ? ' + slot reserve' : ''}` : 'Casual'],
                ['Auction', `${cfg.auctionType === 'mystery' ? 'Mystery' : 'Classic'} · ${cfg.timerSec}s per card · +${cfg.antiSnipeSec}s anti-snipe`],
                ['Bidding', `Min increment ${formatINR(cfg.increment)} · quick bids +${quickSteps(cfg.budget).map((v) => compactINR(v).slice(1)).join(' / +')}`],
                ['Order', `${cfg.shuffle ? 'Shuffled' : 'Catalog order'}${cfg.reauction ? ' · unsold cards re-auctioned once' : ''}`],
                ['Card pool', `${pool.length} cards (${cfg.packs.map((p) => PACKS[cfg.mode].find((x) => x.id === p)?.label).filter(Boolean).join(', ') || 'none'})`],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-white/5 py-1.5"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
            {[...nameErrors, ...check.errors].map((e) => <p key={e} className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{e}</p>)}
            {check.warnings.map((e) => <p key={e} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">{e}</p>)}
            <details className="rounded-xl border border-line bg-black/20 p-4 text-sm" open>
              <summary className="cursor-pointer font-display text-sm font-bold uppercase tracking-widest text-slate-300">How the winner is decided</summary>
              <ul className="mt-3 space-y-1.5 text-slate-300">
                {cfg.mode === 'football' ? (
                  <>
                    <li><b>{Math.round(FOOTBALL_WEIGHTS.quality * 100)}%</b> player quality · <b>{Math.round(FOOTBALL_WEIGHTS.balance * 100)}%</b> positional suitability · <b>{Math.round(FOOTBALL_WEIGHTS.tactics * 100)}%</b> tactical balance · <b>{Math.round(FOOTBALL_WEIGHTS.coverage * 100)}%</b> role coverage · <b>{Math.round(FOOTBALL_WEIGHTS.chemistry * 100)}%</b> chemistry.</li>
                    <li>Position fit: natural ×1, listed secondary ×0.92, same line ×0.82, secondary line ×0.78, other line ×0.65, goalkeeper mismatch ×0.4. Custom formations use broad line fit.</li>
                    <li>Goalkeepers use their dedicated DIV / HAN / KIC / REF / SPD / POS profile in team evaluation.</li>
                  </>
                ) : (
                  <>
                    <li><b>{Math.round(AVENGERS_WEIGHTS.capability * 100)}%</b> individual capability · <b>{Math.round(AVENGERS_WEIGHTS.synergy * 100)}%</b> team synergy (capped at {SYNERGY_CAP} points) · <b>{Math.round(AVENGERS_WEIGHTS.diversity * 100)}%</b> role diversity · <b>{Math.round(AVENGERS_WEIGHTS.strategy * 100)}%</b> strategic balance and counter coverage.</li>
                    <li>Heroes with Teamwork below 55 are Lone Wolves: −2 synergy points each.</li>
                    {BATTLE_RULES.map((r) => <li key={r} className="text-xs text-muted">Exhibition battle — {r}</li>)}
                  </>
                )}
                <li>Each empty squad slot costs <b>{cfg.emptyPenalty}</b> points{cfg.completeFirst ? ', and complete squads always rank above incomplete ones' : ''}.</li>
                <li>Ties: higher score → fuller squad → better {cfg.mode === 'football' ? 'positional' : 'role'} coverage → more money left → shared victory.</li>
                {cfg.auctionType === 'mystery' && <li>Correct Mystery guesses add +{GUESS_BONUS} each, capped at +{GUESS_CAP}. Guessing never wins the card itself.</li>}
              </ul>
            </details>
          </>
        )}
      </main>

      <footer className="mt-5 flex items-center justify-between gap-3">
        <Btn variant="ghost" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}><ArrowLeft size={16} /> Back</Btn>
        {cur !== 'Review' ? (
          <Btn size="lg" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue <ArrowRight size={18} /></Btn>
        ) : (
          <Btn size="lg" variant="gold" disabled={!canStart} onClick={() => onSubmit(d, custom)}>{roomMode ? 'Save settings' : online ? 'Create private room' : 'Start the auction'} <ArrowRight size={18} /></Btn>
        )}
      </footer>

      {admin && <CardAdmin cfg={cfg} setCfg={(c) => setD((p) => ({ ...p, config: c }))} custom={custom} setCustom={(c) => setCustoms({ ...customs, [cfg.mode]: c })} onClose={() => setAdmin(false)} />}
    </div>
  );
}

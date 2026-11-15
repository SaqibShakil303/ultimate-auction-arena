import { lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Gavel, Globe, History, Sparkles, Trophy, Users, Zap } from 'lucide-react';
import type { Custom, MatchState, Mode } from '../shared/types';
import { createMatch } from '../shared/engine';
import { createFriendsChampionship } from '../shared/demo';
import {
  clearLocal, clearOnlineSession, createLocal, createOnline, getActive, loadLocal, loadOnlineSession, loadSavedOnline, setActive,
  type Controller, type OnlineSession,
} from './lib/controller';
import { loadCustom, newDraft, poolFor, saveCustom, withMode, type Draft } from './lib/draft';
import { Btn, cx, Field, inputCls, Logo } from './components/ui';
import { Lobby, LobbySkeleton } from './screens/Lobby';
const Auction = lazy(() => import('./screens/Auction').then((m) => ({ default: m.Auction })));
const Results = lazy(() => import('./screens/Results').then((m) => ({ default: m.Results })));
const Setup = lazy(() => import('./screens/Setup').then((m) => ({ default: m.Setup })));

const DRAFT_KEY = 'uaa.draft.v1';
function loadDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') as Draft | null;
    if (d?.config?.mode && Array.isArray(d.names) && d.names.length === 8) return { ...newDraft(d.config.mode), ...d, config: { ...newDraft(d.config.mode).config, ...d.config, excluded: [] } };
  } catch { /* fall through */ }
  return newDraft();
}
const seed = () => Math.floor(Math.random() * (2 ** 31 - 2)) + 1;

function Home({ onNew, onDemo, onJoin, resume, onResume, onDiscard, saved, onRejoin, onForget }: {
  onNew: (mode: Mode) => void; onDemo: () => void; onJoin: () => void; resume: MatchState | null; onResume: () => void;
  onDiscard: () => void; saved: OnlineSession | null; onRejoin: () => void; onForget: () => void;
}) {
  return (
    <div className="arena-home min-h-screen overflow-hidden px-3 pb-6 sm:px-5 sm:pb-8">
      <div className="scene home" />
      <header className="mx-auto flex w-full max-w-[1380px] items-center justify-between gap-3 py-4 sm:py-5">
        <Logo size="sm" />
        <Btn variant="soft" onClick={onJoin}><Globe size={17} /> <span className="hidden sm:inline">Join a room</span><span className="sm:hidden">Join</span></Btn>
      </header>

      <main className="mx-auto w-full max-w-[1380px]">
        <section className="arena-intro mx-auto max-w-4xl text-center">
          <div className="arena-live-pill"><span className="arena-live-dot" /><Gavel size={13} /> Live multiplayer auction</div>
          <h1 className="arena-title" aria-label="Ultimate Auction Arena">
            <span>Ultimate Auction</span>
            <strong>Arena</strong>
          </h1>
          <p className="arena-subtitle">Build Your Dream Team. Win the Bid. Rule the Arena.</p>
        </section>

        <section className="arena-mode-grid mt-7 sm:mt-9" aria-label="Choose your game mode">
          <button className="arena-mode-card arena-football-card" onClick={() => onNew('football')} aria-label="Enter Football Auction">
            <span className="arena-card-atmosphere" aria-hidden="true">
              <span className="stadium-light stadium-light-left" />
              <span className="stadium-light stadium-light-right" />
              <span className="stadium-crowd" />
              <span className="arena-pitch"><span className="pitch-circle" /><span className="pitch-ball" /></span>
              <span className="collectible-card football-collectible"><b>96</b><i>ST</i><Trophy size={32} /></span>
            </span>
            <span className="arena-card-copy">
              <span className="arena-kicker"><span>01</span> Stadium draft</span>
              <span className="arena-mode-title">Football <b>Arena</b></span>
              <span className="arena-mode-desc">Command an 11-player dream squad with real formations, tactical balance, and legendary auction drama.</span>
              <span className="arena-card-meta"><span>11v11 squads</span><span>130+ cards</span><span>Live bidding</span></span>
              <span className="arena-card-cta">Enter Football Auction <ArrowRight size={18} /></span>
            </span>
          </button>

          <button className="arena-mode-card arena-heroes-card" onClick={() => onNew('avengers')} aria-label="Assemble Your Heroes">
            <span className="arena-card-atmosphere" aria-hidden="true">
              <span className="hero-grid" />
              <span className="energy-orbit energy-orbit-one" />
              <span className="energy-orbit energy-orbit-two" />
              <span className="hero-reactor"><Zap size={34} /></span>
              <span className="collectible-card hero-collectible"><b>97</b><i>MYSTIC</i><Zap size={32} /></span>
            </span>
            <span className="arena-card-copy">
              <span className="arena-kicker"><span>02</span> Command center</span>
              <span className="arena-mode-title">Heroes <b>Arena</b></span>
              <span className="arena-mode-desc">Assemble a five-hero strike team where power, teamwork, counters, and bold synergies decide the champion.</span>
              <span className="arena-card-meta"><span>5-hero teams</span><span>Power synergies</span><span>Mystery rounds</span></span>
              <span className="arena-card-cta">Assemble Your Heroes <ArrowRight size={18} /></span>
            </span>
          </button>
        </section>

        <section className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr]" aria-label="Quick play and saved matches">
          <button className="friends-demo-button" onClick={onDemo}>
            <span className="friends-demo-icon"><Users size={19} /></span>
            <span className="text-left"><b>Legends Auction — Friends Championship</b><small>Haarish · Farhaan · Faizan · Imam · Saqib</small></span>
            <ArrowRight size={17} className="ml-auto flex-none" />
          </button>
          <div className="grid gap-3 sm:grid-cols-2">
            {resume && (
              <div className="arena-save-card flex flex-wrap items-center gap-3 p-3.5">
                <History size={19} className="text-gold" />
                <div className="min-w-0 flex-1 text-sm">
                  <b>{resume.phase === 'finished' ? 'Last local result' : 'Unfinished local match'}</b>
                  <div className="truncate text-xs text-muted">{resume.config.mode === 'football' ? 'Football' : 'Heroes'} · {resume.participants.map((p) => p.name).join(', ')} · round {resume.round}</div>
                </div>
                <Btn size="sm" onClick={onResume}>{resume.phase === 'finished' ? 'View' : 'Resume'}</Btn>
                <Btn size="sm" variant="ghost" onClick={onDiscard}>Discard</Btn>
              </div>
            )}
            {saved && (
              <div className="arena-save-card flex flex-wrap items-center gap-3 p-3.5">
                <Globe size={19} className="text-cyan-300" />
                <div className="min-w-0 flex-1 text-sm">
                  <b>Online room {saved.code}</b>
                  <div className="truncate text-xs text-muted">Your squad and budget are reserved{saved.name ? ` for ${saved.name}` : ''}.</div>
                </div>
                <Btn size="sm" onClick={onRejoin}>Rejoin</Btn>
                <Btn size="sm" variant="ghost" onClick={onForget}>Forget</Btn>
              </div>
            )}
            {!resume && !saved && (
              <div className="arena-trust-strip sm:col-span-2">
                <span><Trophy size={15} /> Transparent scoring</span><span><Users size={15} /> 2–8 players</span><span><Zap size={15} /> Local or online</span>
              </div>
            )}
          </div>
        </section>
      </main>
      <footer className="mx-auto mt-5 max-w-5xl text-center text-[11px] leading-relaxed text-muted"><Sparkles size={11} className="mr-1 inline" />Fan-made party game. Prime Legends ratings are clearly labelled custom unless verified; official imports retain source and verification status. Original fallback artwork. Not affiliated with any league, club, publisher, or studio.</footer>
    </div>
  );
}

function Join({ code: initial, onBack, onJoin, saved, onRejoin }: { code: string; onBack: () => void; onJoin: (code: string, name: string, team: string) => void; saved: OnlineSession | null; onRejoin: () => void }) {
  const [code, setCode] = useState(initial);
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const ok = code.trim().length >= 4 && name.trim().length > 0;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-5">
      <div className="scene home" />
      <button onClick={onBack} className="flex items-center gap-1.5 self-start text-sm text-muted hover:text-white"><ArrowLeft size={16} /> Home</button>
      <form className="glass space-y-5 p-6" onSubmit={(e) => { e.preventDefault(); if (ok) onJoin(code.trim().toUpperCase(), name.trim(), team.trim()); }}>
        <h1 className="font-display text-3xl font-bold uppercase">Join a private room</h1>
        <Field label="Invite code"><input className={cx(inputCls, 'h-14 text-center font-display text-3xl font-bold uppercase tracking-[0.3em]')} maxLength={5} autoFocus={!initial} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCDE" aria-label="Invite code" /></Field>
        <Field label="Your display name"><input className={inputCls} maxLength={20} autoFocus={!!initial} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya" /></Field>
        <Field label="Team name" hint="optional"><input className={inputCls} maxLength={20} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Midnight XI" /></Field>
        <Btn size="lg" variant="gold" className="w-full" disabled={!ok} type="submit">Join room <ArrowRight size={18} /></Btn>
        {saved && saved.code === code.trim().toUpperCase() && (
          <button type="button" onClick={onRejoin} className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10">Already in this room? Rejoin{saved.name ? ` as ${saved.name}` : ''}</button>
        )}
      </form>
    </div>
  );
}

function Game({ ctl, onExit, onRematch, onSwitch, onPlayAgain }: { ctl: Controller; onExit: () => void; onRematch: () => void; onSwitch: () => void; onPlayAgain: () => void }) {
  const snap = useSyncExternalStore(ctl.subscribe, ctl.get);
  const [editing, setEditing] = useState<Mode | null>(null);
  const mode = snap.match?.config.mode ?? snap.room?.settings.config.mode;
  useEffect(() => { if (mode) document.documentElement.dataset.mode = mode; return () => { delete document.documentElement.dataset.mode; }; }, [mode]);

  if (snap.fatal) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="scene home" />
        <Globe size={40} className="text-rose-300" />
        <h1 className="font-display text-3xl font-bold uppercase">Connection problem</h1>
        <p className="text-slate-300">{snap.fatal}</p>
        <Btn variant="gold" onClick={onExit}>Back to home</Btn>
      </div>
    );
  }
  if (snap.kind === 'online' && !snap.room) {
    const text = snap.status === 'open' ? 'Entering the room…' : snap.slow ? 'Waking the game server — on free hosting this can take up to a minute…' : 'Connecting to the game server…';
    return <LobbySkeleton text={text} onCancel={onExit} />;
  }
  if (snap.kind === 'online' && !snap.match) {
    const room = snap.room!;
    if (editing && snap.isHost) {
      const base: Draft = { ...newDraft(room.settings.config.mode), config: { ...room.settings.config } };
      return (
        <Setup
          roomMode initial={editing === room.settings.config.mode ? base : withMode(base, editing)}
          initialCustom={(m) => (m === room.settings.config.mode ? room.settings.custom : loadCustom(m))}
          onCancel={() => setEditing(null)}
          onSubmit={(d, custom) => { saveCustom(d.config.mode, custom); ctl.send({ t: 'settings', settings: { config: { ...d.config, play: 'online' }, custom } }); setEditing(null); }}
        />
      );
    }
    return <Lobby snap={snap} ctl={ctl} onLeave={onExit} onEdit={() => setEditing(room.settings.config.mode)} />;
  }
  if (!snap.match || (snap.kind === 'online' && !Object.keys(snap.cards).length)) return <LobbySkeleton text="Loading the card catalog…" />;
  if (snap.match.phase === 'finished') {
    return (
      <Results
        snap={snap} ctl={ctl} onHome={onPlayAgain} onRematch={onRematch}
        onSwitch={() => {
          if (snap.kind === 'online') { ctl.send({ t: 'rematch' }); setEditing(snap.match!.config.mode === 'football' ? 'avengers' : 'football'); }
          else onSwitch();
        }}
      />
    );
  }
  return <Auction snap={snap} ctl={ctl} onExit={onExit} />;
}

export default function App() {
  const [ctl, setCtl] = useState<Controller | null>(null);
  const [view, setView] = useState<'home' | 'setup' | 'join'>('home');
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [joinCode, setJoinCode] = useState('');
  const [resume, setResume] = useState<MatchState | null>(null);
  const [, refresh] = useState(0); // saved-room card reads storage directly, so storage changes need a nudge
  const booted = useRef(false);
  const ctlRef = useRef<Controller | null>(null);

  const swap = (next: Controller | null) => {
    ctlRef.current?.dispose();
    ctlRef.current = next;
    setCtl(next);
  };

  // Boot: honour invite links, then restore whatever was running before a refresh.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    const session = loadOnlineSession();
    const saved = loadLocal();
    if (session && (!code || code === session.code) && getActive() === 'online') swap(createOnline({ type: 'rejoin', code: session.code, token: session.token }));
    else if (code) { setJoinCode(code); setView('join'); }
    else if (saved && getActive() === 'local') swap(createLocal(saved));
    else setResume(saved);
  }, []);

  const goHome = () => {
    swap(null);
    setActive(null);
    if (location.search) history.replaceState(null, '', location.pathname);
    setResume(loadLocal());
    setView('home');
  };

  const startLocal = (d: Draft, custom: Custom) => {
    const cfg = { ...d.config, play: 'local' as const, seed: seed() };
    const players = d.names.slice(0, d.count).map((name, i) => ({ id: `p${i + 1}`, name: name.trim(), team: d.teams[i].trim() }));
    swap(createLocal(createMatch(cfg, players, poolFor(cfg, custom), Date.now())));
    setActive('local');
  };

  const submit = (d: Draft, custom: Custom) => {
    setDraft(d);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    saveCustom(d.config.mode, custom);
    if (d.config.play === 'online') {
      clearOnlineSession();
      swap(createOnline({ type: 'create', name: d.names[0].trim(), team: d.teams[0].trim(), settings: { config: { ...d.config, play: 'online' }, custom } }));
    } else startLocal(d, custom);
  };

  if (ctl) {
    const snap = ctl.get();
    const localDraft = (): Draft | null => {
      const m = ctl.get().match;
      if (!m) return null;
      const names = Array(8).fill('').map((_, i) => m.participants[i]?.name ?? '');
      const teams = Array(8).fill('').map((_, i) => m.participants[i]?.team ?? '');
      return { config: { ...m.config, excluded: [] }, count: m.participants.length, names, teams };
    };
    return (
      <Game
        key={snap.kind + (snap.room?.code ?? '')}
        ctl={ctl}
        onExit={() => { if (ctl.get().kind === 'online') ctl.dispose(true); goHome(); }}
        onPlayAgain={() => {
          const d = localDraft();
          if (ctl.get().kind === 'online') ctl.dispose(true); else if (!ctl.get().demo) clearLocal();
          if (d) setDraft({ ...d, config: { ...d.config, play: ctl.get().kind === 'online' ? 'online' : 'local' } });
          goHome();
          setResume(null);
          setView('setup');
        }}
        onRematch={() => {
          const s = ctl.get();
          if (s.kind === 'online') return ctl.send({ t: 'rematch' });
          const m = s.match!;
          const cfg = { ...m.config, seed: seed() };
          swap(createLocal(createMatch(cfg, m.participants.map((p) => ({ id: p.id, name: p.name, team: p.team })), Object.values(s.cards), Date.now()), !s.demo));
        }}
        onSwitch={() => {
          const d = localDraft();
          if (!ctl.get().demo) clearLocal();
          if (d) setDraft(withMode(d, d.config.mode === 'football' ? 'avengers' : 'football'));
          goHome();
          setResume(null);
          setView('setup');
        }}
      />
    );
  }

  const saved = loadSavedOnline();
  const rejoin = () => { if (saved) swap(createOnline({ type: 'rejoin', code: saved.code, token: saved.token })); };
  if (view === 'setup') return <Setup key={draft.config.mode + draft.count} initial={draft} initialCustom={loadCustom} onCancel={() => setView('home')} onSubmit={submit} />;
  if (view === 'join') {
    return (
      <Join
        code={joinCode} onBack={goHome} saved={saved} onRejoin={rejoin}
        onJoin={(code, name, team) => { clearOnlineSession(); swap(createOnline({ type: 'join', code, name, team })); }}
      />
    );
  }
  return (
    <Home
      onNew={(mode) => { setDraft((d) => withMode(d, mode)); setView('setup'); }}
      onDemo={() => { swap(createLocal(createFriendsChampionship(), false)); setActive(null); }}
      onJoin={() => setView('join')} resume={resume}
      onResume={() => { const s = loadLocal(); if (s) { swap(createLocal(s)); setActive('local'); } }}
      onDiscard={() => { clearLocal(); setResume(null); }}
      saved={saved} onRejoin={rejoin} onForget={() => { clearOnlineSession(); refresh((n) => n + 1); }}
    />
  );
}

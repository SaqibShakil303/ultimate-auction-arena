import { useState } from 'react';
import { Check, Copy, Crown, Link2, LogOut, Play, Settings, Share2, UserX, WifiOff } from 'lucide-react';
import { LINES } from '../../shared/types';
import { formatINR } from '../../shared/util';
import type { Controller, Snap } from '../lib/controller';
import { PLAYER_COLORS } from '../lib/draft';
import { Btn, Chip, cx, Logo, Toast } from '../components/ui';

export function LobbySkeleton({ text, onCancel }: { text: string; onCancel?: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 p-6">
      <div className="scene home" />
      <Logo size="sm" />
      <div className="skeleton h-28" />
      <div className="grid grid-cols-2 gap-3"><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>
      <p className="text-center text-sm text-muted" role="status">{text}</p>
      {onCancel && <button onClick={onCancel} className="mx-auto rounded-lg border border-line px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">Cancel</button>}
    </div>
  );
}

export function Lobby({ snap, ctl, onLeave, onEdit }: { snap: Snap; ctl: Controller; onLeave: () => void; onEdit: () => void }) {
  const room = snap.room!;
  const cfg = room.settings.config;
  const [copied, setCopied] = useState('');
  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  const me = room.members.find((m) => m.id === snap.me);
  const others = room.members.filter((m) => m.id !== room.hostId);
  const waiting = others.filter((m) => !m.ready || !m.connected);
  const blocker = room.members.length < 2 ? 'Invite at least one more player.' : waiting.length ? `Waiting for: ${waiting.map((m) => m.name).join(', ')}` : room.errors[0] ?? '';
  const copy = (text: string, what: string) => { void navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1400); };
  const football = cfg.mode === 'football';

  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-5 p-4 sm:p-8" data-mode={cfg.mode}>
      <div className={cx('scene', cfg.mode)} />
      <header className="flex items-center justify-between gap-3">
        <Logo size="sm" />
        <button onClick={onLeave} className="flex items-center gap-1.5 text-sm text-muted hover:text-white"><LogOut size={15} /> Leave room</button>
      </header>

      <section className="glass relative overflow-hidden p-5 sm:p-8">
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-accent">{football ? 'The players’ tunnel · draft night' : 'Headquarters · team assembly'}</div>
        <h1 className="mt-1 font-display text-4xl font-bold uppercase sm:text-5xl">{football ? 'Football Auction' : 'Heroes Auction'} lobby</h1>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted">Invite code</div>
            <button onClick={() => copy(room.code, 'code')} className="flex items-center gap-3 font-display text-5xl font-bold tracking-[0.25em] gold-text sm:text-6xl" title="Copy code">
              {room.code} {copied === 'code' ? <Check size={22} className="text-emerald-300" /> : <Copy size={20} className="text-muted" />}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="soft" onClick={() => copy(link, 'link')}>{copied === 'link' ? <Check size={15} /> : <Link2 size={15} />} {copied === 'link' ? 'Link copied' : 'Copy invite link'}</Btn>
            {typeof navigator.share === 'function' && <Btn variant="soft" onClick={() => void navigator.share({ title: 'Ultimate Auction Arena', text: `Join my auction room ${room.code}`, url: link }).catch(() => {})}><Share2 size={15} /> Share</Btn>}
          </div>
        </div>
        <p className="mt-3 break-all text-xs text-muted">{link}</p>
        {snap.status !== 'open' && <Chip tone="warn" className="mt-3"><WifiOff size={12} /> Reconnecting to the server…</Chip>}
      </section>

      <section className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
        <div className="panel p-4 sm:p-5">
          <h2 className="mb-3 flex items-center justify-between font-display text-lg font-bold uppercase tracking-wider">Players <span className="text-sm font-normal normal-case text-muted">{room.members.length}/8</span></h2>
          <ul className="space-y-2">
            {room.members.map((m, i) => (
              <li key={m.id} className={cx('flex items-center gap-3 rounded-xl border p-3', m.ready && m.connected ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-line bg-white/[0.03]')}>
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full font-display text-lg font-bold text-[#06101f]" style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}>{m.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold"><span className="truncate">{m.name}</span>{m.id === room.hostId && <Crown size={14} className="text-gold" aria-label="Host" />}{m.id === snap.me && <Chip tone="accent" className="!px-1.5 !py-0 !text-[10px]">You</Chip>}</div>
                  <div className="truncate text-xs text-muted">{m.team}</div>
                </div>
                {!m.connected ? <Chip tone="bad"><WifiOff size={12} /> Offline</Chip> : m.id === room.hostId ? <Chip tone="gold">Host</Chip> : m.ready ? <Chip tone="good"><Check size={12} /> Ready</Chip> : <Chip>Not ready</Chip>}
                {snap.isHost && m.id !== room.hostId && (
                  <button onClick={() => ctl.send({ t: 'kick', pid: m.id })} aria-label={`Remove ${m.name}`} title="Remove player" className="rounded-lg p-1.5 text-muted hover:bg-rose-500/20 hover:text-rose-300"><UserX size={16} /></button>
                )}
              </li>
            ))}
            {room.members.length < 2 && <li className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">Share the code or link — friends join from their own phone or laptop.</li>}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <h2 className="mb-3 flex items-center justify-between font-display text-lg font-bold uppercase tracking-wider">Match settings
              {snap.isHost && <button onClick={onEdit} className="flex items-center gap-1 text-xs font-semibold normal-case text-accent"><Settings size={13} /> Edit</button>}
            </h2>
            <dl className="space-y-1.5 text-sm">
              {([
                ['Budget', `${formatINR(cfg.budget)} each`],
                ['Squad', football ? `${cfg.squadSize} · ${LINES.map((l) => `${cfg.slots[l]} ${l}`).join(' / ')}` : `${cfg.squadSize} heroes`],
                ['Rules', `${cfg.rules === 'strict' ? 'Strict' : 'Casual'} · ${cfg.auctionType === 'mystery' ? 'Mystery' : 'Classic'}`],
                ['Timer', `${cfg.timerSec}s · +${cfg.antiSnipeSec}s anti-snipe`],
                ['Increment', formatINR(cfg.increment)],
                ['Card pool', `${room.poolSize} cards`],
              ] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
            </dl>
            {room.errors.filter((e) => room.members.length >= 2 || !/between 2 and 8/.test(e)).map((e) => <p key={e} className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{e}</p>)}
            {room.warnings.map((e) => <p key={e} className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{e}</p>)}
          </div>

          {snap.isHost ? (
            <div>
              <Btn size="lg" variant="gold" className="w-full" disabled={!!blocker} onClick={() => ctl.send({ t: 'start' })}><Play size={18} /> Start the auction</Btn>
              <p className="mt-2 text-center text-xs text-muted">{blocker || 'Everyone is ready. Only you can start the match.'}</p>
            </div>
          ) : (
            <div>
              <Btn size="lg" variant={me?.ready ? 'soft' : 'primary'} className="w-full" onClick={() => ctl.send({ t: 'ready', ready: !me?.ready })}>{me?.ready ? <><Check size={18} /> Ready — tap to undo</> : 'I’m ready'}</Btn>
              <p className="mt-2 text-center text-xs text-muted">The host starts the match once everyone is ready.</p>
            </div>
          )}
        </div>
      </section>
      <Toast notice={snap.notice} />
    </div>
  );
}

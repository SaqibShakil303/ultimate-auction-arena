import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { compactINR, formatINR } from '../../shared/util';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'gold' | 'ghost' | 'danger' | 'soft'; size?: 'sm' | 'md' | 'lg' };
export function Btn({ variant = 'primary', size = 'md', className, ...rest }: BtnProps) {
  const v = { primary: 'btn-primary', gold: 'btn-gold', ghost: 'btn-ghost', soft: 'btn-soft', danger: 'btn-danger' }[variant];
  const s = { sm: 'h-9 px-3.5 text-xs', md: 'h-11 px-5 text-sm', lg: 'h-13 px-7 text-base' }[size];
  return <button {...rest} className={cx('btn', v, s, className)} />;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#03050f]/75 backdrop-blur-md" />
          <DialogPrimitive.Content aria-describedby={undefined}
            className={cx('panel fixed bottom-0 left-1/2 z-50 flex max-h-[92vh] w-full -translate-x-1/2 flex-col overflow-hidden rounded-b-none outline-none sm:bottom-auto sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-y-1/2 sm:rounded-b-[18px]', wide ? 'sm:max-w-5xl' : 'sm:max-w-xl')}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-accent/20 via-transparent to-accent2/20 px-5 py-3">
              <DialogPrimitive.Title className="font-display text-xl font-bold uppercase tracking-wide">{title ?? 'Details'}</DialogPrimitive.Title>
              <DialogPrimitive.Close aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-white"><X size={18} /></DialogPrimitive.Close>
            </div>
            <div className="overflow-y-auto p-5">{children}</div>
          </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}

export function Seg<T extends string | number>({ options, value, onChange, className }: { options: { value: T; label: ReactNode; hint?: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="radiogroup" className={cx('flex flex-wrap gap-2', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)} role="radio" aria-checked={o.value === value} title={o.hint} onClick={() => onChange(o.value)}
          className={cx('seg px-3.5 py-2 text-sm', o.value === value && 'seg-on')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]', checked && 'border-accent/50 bg-accent/10', disabled && 'opacity-50')}>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 flex-none rounded-full transition', checked ? 'shadow-[0_0_16px_-4px_var(--glow)]' : 'bg-slate-600/60')} style={checked ? { background: 'var(--grad)' } : undefined}
      >
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="field-label">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export const inputCls = 'h-11 w-full rounded-2xl border-[1.5px] border-white/15 bg-[#070b22]/70 px-3.5 text-sm text-white placeholder:text-slate-500 transition focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_22%,transparent)] focus:outline-none';

/** Smoothly counting rupee amount. */
export function Money({ value, compact, className }: { value: number; compact?: boolean; className?: string }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  useEffect(() => {
    const from = cur.current;
    if (from === value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cur.current = value; setShown(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 420);
      const v = Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      cur.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cx('tnum', className)}>{compact ? compactINR(shown) : formatINR(shown)}</span>;
}

export function Bar({ value, max = 100, color = 'var(--accent)', className }: { value: number; max?: number; color?: string; className?: string }) {
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-white/10', className)}>
      <div className="h-full rounded-full shadow-[0_0_10px_-2px_currentColor] transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color === 'var(--accent)' ? 'var(--grad)' : color, color }} />
    </div>
  );
}

export function Chip({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'good' | 'warn' | 'bad' | 'accent' | 'gold'; className?: string }) {
  const t = {
    muted: 'bg-white/[0.08] text-slate-200 ring-1 ring-white/10', good: 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30', warn: 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30',
    bad: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30', accent: 'bg-accent/20 text-white ring-1 ring-accent/40', gold: 'bg-gold/15 text-gold ring-1 ring-gold/40',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', t, className)}>{children}</span>;
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'text-lg', md: 'text-2xl', lg: 'text-5xl sm:text-7xl' }[size];
  return (
    <span className={cx('inline-flex items-center gap-2 font-display font-bold uppercase leading-none tracking-wide', s)}>
      <svg viewBox="0 0 32 32" className="h-[1.35em] w-[1.35em] flex-none drop-shadow-[0_0_8px_rgba(255,210,87,.6)]" aria-hidden="true">
        <defs><linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff3bf" /><stop offset=".5" stopColor="#ffd257" /><stop offset="1" stopColor="#f59e0b" /></linearGradient></defs>
        <path d="M16 2l12 5.4v9.2C28 24 22.6 28.6 16 30 9.4 28.6 4 24 4 16.6V7.4z" fill="#0b1029" stroke="url(#logo-g)" strokeWidth="2.4" />
        <path d="M11 21l5-11 5 11M13 17h6" fill="none" stroke="url(#logo-g)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span><span className="gold-text">Ultimate</span> <span className="text-white">Auction</span> <span className="grad-text">Arena</span></span>
    </span>
  );
}

export function Toast({ notice }: { notice: { id: number; text: string; tone: string } | null }) {
  const [shown, setShown] = useState(notice);
  useEffect(() => {
    setShown(notice);
    if (!notice) return;
    const t = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id} role="status" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
          className={cx('fixed bottom-5 left-1/2 z-[60] w-max max-w-[92vw] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-2xl',
            shown.tone === 'error' ? 'border-rose-400/60 bg-rose-950/95 text-rose-100 shadow-[0_0_30px_-8px_#fb7185]' : shown.tone === 'good' ? 'border-emerald-400/60 bg-emerald-950/95 text-emerald-100 shadow-[0_0_30px_-8px_#4ade80]' : 'border-white/20 bg-panel2 text-white')}
        >
          {shown.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

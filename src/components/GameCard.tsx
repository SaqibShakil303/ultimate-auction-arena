import { memo, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { Card, HeroClass } from '../../shared/types';
import { STAT_KEYS } from '../../shared/types';
import { artSource } from '../../shared/catalog';
import { compactINR, hashStr } from '../../shared/util';
import { cx } from './ui';

export function statKeys(card: Card): readonly string[] {
  return card.kind === 'hero' ? STAT_KEYS.hero : card.line === 'GK' ? STAT_KEYS.gk : STAT_KEYS.football;
}
export const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' } as const;
export const RARITY_COLOR = { common: '#b7c0d4', rare: '#58aaff', epic: '#b97aff', legendary: '#f6c453', mythic: '#ff5d73' } as const;

const initials = (name: string) => name.split(/[\s-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// Simple original class emblems for hero placeholder art.
const EMBLEM: Record<HeroClass, string> = {
  Tank: 'M100 52l44 16v34c0 30-19 51-44 62-25-11-44-32-44-62V68z',
  Damage: 'M112 44L70 114h28l-10 50 46-74h-30z',
  Mystic: 'M100 46l14 36 38 4-29 25 9 38-32-20-32 20 9-38-29-25 38-4z',
  Tech: 'M70 70h60v60H70zM84 52v18M100 52v18M116 52v18M84 130v18M100 130v18M116 130v18M52 84h18M52 100h18M52 116h18M130 84h18M130 100h18M130 116h18',
  Controller: 'M100 48a56 56 0 1 0 .1 0M100 72a32 32 0 1 0 .1 0M100 92a12 12 0 1 0 .1 0',
  Support: 'M86 56h28v30h30v28h-30v30H86v-30H56V86h30z',
};

/** Original, procedurally generated placeholder artwork — no third-party images are fetched. */
function GeneratedArt({ card }: { card: Card }) {
  const uidRaw = useId();
  const id = uidRaw.replace(/[^a-zA-Z0-9]/g, '');
  const h1 = hashStr(card.kind === 'football' ? card.nation : card.name) % 360;
  const h2 = (hashStr(card.kind === 'football' ? card.club : card.cls) + 40) % 360;
  if (card.kind === 'football') {
    const num = (hashStr(card.name) % 30) + 1;
    const keeper = card.line === 'GK';
    return (
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id={`j${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={`hsl(${h1} 75% ${keeper ? 60 : 52}%)`} />
            <stop offset="1" stopColor={`hsl(${h2} 70% 32%)`} />
          </linearGradient>
          <radialGradient id={`g${id}`} cx="50%" cy="35%" r="65%">
            <stop offset="0" stopColor={`hsl(${h1} 80% 60%)`} stopOpacity="0.5" />
            <stop offset="1" stopColor={`hsl(${h1} 80% 40%)`} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="200" height="200" fill={`url(#g${id})`} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M100 60 L${-40 + i * 56} 220 L${-10 + i * 56} 220Z`} fill="#fff" opacity="0.035" />
        ))}
        <text x="100" y="92" textAnchor="middle" fontSize="92" fontWeight="700" fontFamily="Rajdhani, sans-serif" fill="#fff" opacity="0.07">{initials(card.name)}</text>
        <path d="M30 210c0-52 30-78 70-78s70 26 70 78z" fill={`url(#j${id})`} />
        <path d="M30 210c0-52 30-78 70-78" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" />
        <path d="M82 134l18 18 18-18" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="100" cy="92" r="33" fill="#0d1226" stroke={`hsl(${h1} 70% 62%)`} strokeOpacity="0.8" strokeWidth="2.5" />
        <path d="M70 84c6-22 54-22 60 0-10-9-50-9-60 0z" fill={`hsl(${h2} 50% 30%)`} opacity="0.9" />
        <text x="100" y="192" textAnchor="middle" fontSize="34" fontWeight="700" fontFamily="Rajdhani, sans-serif" fill="#fff" opacity="0.92">{num}</text>
      </svg>
    );
  }
  const stroke = card.cls === 'Tech' || card.cls === 'Controller';
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`g${id}`} cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor={`hsl(${h1} 85% 60%)`} stopOpacity="0.6" />
          <stop offset="1" stopColor={`hsl(${h2} 80% 35%)`} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`e${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor={`hsl(${h1} 90% 65%)`} />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill={`url(#g${id})`} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={i} x1="100" y1="106" x2={100 + 150 * Math.cos((i * Math.PI) / 4 + h1)} y2={106 + 150 * Math.sin((i * Math.PI) / 4 + h1)} stroke="#fff" strokeOpacity="0.07" strokeWidth="10" />
      ))}
      <path d="M100 28l68 39v78l-68 39-68-39V67z" fill="#0b1024" fillOpacity="0.72" stroke={`hsl(${h1} 85% 65%)`} strokeOpacity="0.9" strokeWidth="2.5" />
      <path d="M100 40l57 33v66l-57 33-57-33V73z" fill="none" stroke={`hsl(${h2} 85% 65%)`} strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="6 7" />
      <path d={EMBLEM[card.cls]} fill={stroke ? 'none' : `url(#e${id})`} stroke={`url(#e${id})`} strokeWidth={stroke ? 7 : 2} strokeLinejoin="round" strokeLinecap="round" />
      <text x="100" y="190" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="Rajdhani, sans-serif" fill="#fff" opacity="0.5" letterSpacing="4">{initials(card.name)}</text>
    </svg>
  );
}

export function Portrait({ card }: { card: Card }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (artSource(card, failed) === 'image') {
    return <>
      {!loaded && <GeneratedArt card={card} />}
      <img src={card.image} alt={`${card.name} portrait`} loading="lazy" decoding="async" sizes="(max-width: 640px) 44vw, (max-width: 1024px) 28vw, 300px" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={{ opacity: loaded ? 1 : 0, transition: 'opacity 220ms ease' }} />
    </>;
  }
  return <GeneratedArt card={card} />;
}

interface Props {
  card: Card | null;
  down?: boolean;
  mini?: boolean;
  tilt?: boolean;
  price?: number;
  owner?: { name: string; color: string } | null;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export const GameCard = memo(function GameCard({ card, down, mini, tilt, price, owner, onClick, className, style, title }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent) => {
    if (!tilt || !ref.current || e.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 16}deg`);
    ref.current.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 12}deg`);
  };
  const leave = () => {
    ref.current?.style.setProperty('--ry', '0deg');
    ref.current?.style.setProperty('--rx', '0deg');
  };
  const keys = card ? statKeys(card) : [];
  return (
    <div
      ref={ref} data-r={card?.rarity ?? 'common'} title={title}
      className={cx('uc', (down || !card) && 'down', mini && 'mini', onClick && 'cursor-pointer', className)} style={style}
      onPointerMove={move} onPointerLeave={leave} onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      aria-label={card && !down ? `${card.name}, ${card.overall || 'unverified'} overall, ${card.kind === 'football' ? card.edition ?? 'Prime Legends custom' : 'custom hero rating'}, ${RARITY_LABEL[card.rarity]}` : 'Hidden card'}
    >
      <div className="uc-flip">
        <div className="uc-face uc-front">
          {card && (
            <div className="uc-in">
              <div className="uc-ovr">
                <b>{card.overall || '—'}</b>
                <i>{card.kind === 'football' ? card.pos : card.cls}</i>
                <u>{card.kind === 'football' ? card.nation.slice(0, 3).toUpperCase() : card.role.split(' ')[0]}</u>
              </div>
              <div className="uc-rar">{card.kind === 'football' && card.verificationStatus === 'verified' ? card.cardType === 'standard' ? card.overall >= 75 ? 'Gold' : card.overall >= 65 ? 'Silver' : 'Bronze' : card.cardType : `${RARITY_LABEL[card.rarity]} theme`}</div>
              <div className={cx('uc-edition', card.kind === 'football' && card.verificationStatus === 'verified' && 'verified')}>{card.kind === 'football' ? card.verificationStatus === 'verified' ? `${card.edition} ✓` : (card.ratingMode ?? 'prime') === 'prime' ? mini ? 'Prime' : 'Prime · Custom' : `${card.edition} · Unverified` : mini ? 'Custom' : 'Custom power'}</div>
              <div className="uc-art"><Portrait key={`${card.id}:${card.image ?? ''}`} card={card} /></div>
              <div className="uc-name">{card.name}</div>
              <div className="uc-sub">{card.kind === 'football' ? `${card.club} · ${card.role}` : `${card.role} · ${card.ability}`}</div>
              <div className="uc-rule" />
              <div className="uc-stats">
                {keys.map((k, i) => (
                  <div key={k}><b>{card.stats[i] || '—'}</b><span>{k}</span></div>
                ))}
              </div>
              <div className="uc-foot">
                <em>{card.trait}</em>
                {price !== undefined && <strong>{compactINR(price)}</strong>}
              </div>
            </div>
          )}
        </div>
        <div className="uc-face uc-back">
          <div className="uc-backin"><span>?</span><small>ARENA</small></div>
        </div>
      </div>
      {owner && <div className="uc-owner" style={{ background: owner.color }}>{owner.name}</div>}
    </div>
  );
});

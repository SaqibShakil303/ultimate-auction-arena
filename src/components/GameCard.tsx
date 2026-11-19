import { memo, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { Card } from '../../shared/types';
import { STAT_KEYS } from '../../shared/types';
import { artSource } from '../../shared/catalog';
import { compactINR, hashStr } from '../../shared/util';
import { HeroArt } from './heroArt';
import { cx } from './ui';

export function statKeys(card: Card): readonly string[] {
  return card.kind === 'hero' ? STAT_KEYS.hero : card.line === 'GK' ? STAT_KEYS.gk : STAT_KEYS.football;
}
export const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' } as const;
export const RARITY_COLOR = { common: '#c9d2e6', rare: '#4cc9ff', epic: '#c77dff', legendary: '#ffd257', mythic: '#ff5d8f' } as const;

const initials = (name: string) => name.split(/[\s-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Original generated artwork shown whenever a card has no licensed photo (or the photo fails to load). */
function GeneratedArt({ card }: { card: Card }) {
  const uidRaw = useId();
  const id = uidRaw.replace(/[^a-zA-Z0-9]/g, '');
  if (card.kind === 'hero') return <HeroArt card={card} />;
  const h1 = hashStr(card.nation) % 360;
  const h2 = (hashStr(card.club) + 40) % 360;
  const num = (hashStr(card.name) % 30) + 1;
  const keeper = card.line === 'GK';
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id={`j${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${h1} 85% ${keeper ? 62 : 55}%)`} />
          <stop offset="1" stopColor={`hsl(${h2} 78% 36%)`} />
        </linearGradient>
        <radialGradient id={`g${id}`} cx="50%" cy="30%" r="75%">
          <stop offset="0" stopColor={`hsl(${h1} 90% 62%)`} stopOpacity="0.85" />
          <stop offset="0.6" stopColor={`hsl(${h2} 80% 34%)`} stopOpacity="0.55" />
          <stop offset="1" stopColor="#070a1c" />
        </radialGradient>
      </defs>
      <rect width="200" height="200" fill={`url(#g${id})`} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={`M100 40 L${-40 + i * 56} 220 L${-10 + i * 56} 220Z`} fill="#fff" opacity="0.06" />
      ))}
      <text x="100" y="92" textAnchor="middle" fontSize="92" fontWeight="700" fontFamily="Rajdhani, sans-serif" fill="#fff" opacity="0.1">{initials(card.name)}</text>
      <path d="M30 210c0-52 30-78 70-78s70 26 70 78z" fill={`url(#j${id})`} />
      <path d="M30 210c0-52 30-78 70-78" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2" />
      <path d="M82 134l18 18 18-18" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="100" cy="92" r="33" fill="#0d1226" stroke={`hsl(${h1} 80% 68%)`} strokeOpacity="0.9" strokeWidth="2.5" />
      <path d="M70 84c6-22 54-22 60 0-10-9-50-9-60 0z" fill={`hsl(${h2} 55% 34%)`} opacity="0.95" />
      <text x="100" y="192" textAnchor="middle" fontSize="34" fontWeight="700" fontFamily="Rajdhani, sans-serif" fill="#fff" opacity="0.95">{num}</text>
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
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--ry', `${(px - 0.5) * 16}deg`);
    ref.current.style.setProperty('--rx', `${-(py - 0.5) * 12}deg`);
    ref.current.style.setProperty('--mx', `${px * 100}%`);
    ref.current.style.setProperty('--my', `${py * 100}%`);
  };
  const leave = () => {
    ref.current?.style.setProperty('--ry', '0deg');
    ref.current?.style.setProperty('--rx', '0deg');
  };
  const keys = card ? statKeys(card) : [];
  const verified = card?.kind === 'football' && card.verificationStatus === 'verified';
  return (
    <div
      ref={ref} data-r={card?.rarity ?? 'common'} data-kind={card?.kind ?? 'football'} data-photo={card?.image ? 'yes' : 'no'} title={title}
      className={cx('uc', (down || !card) && 'down', mini && 'mini', tilt && 'tilt', onClick && 'cursor-pointer', className)} style={style}
      onPointerMove={move} onPointerLeave={leave} onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      aria-label={card && !down ? `${card.name}, ${card.overall || 'unverified'} overall, ${card.kind === 'football' ? card.edition ?? 'Prime Legends custom' : 'custom hero rating'}, ${RARITY_LABEL[card.rarity]}` : 'Hidden card'}
    >
      <div className="uc-flip">
        <div className="uc-face uc-front">
          {card && (
            <div className="uc-in">
              <div className="uc-art"><Portrait key={`${card.id}:${card.image ?? ''}`} card={card} /></div>
              <div className="uc-ovr">
                <b>{card.overall || '—'}</b>
                <i>{card.kind === 'football' ? card.pos : card.cls}</i>
                <u>{card.kind === 'football' ? card.nation.slice(0, 3).toUpperCase() : card.role.split(' ')[0]}</u>
              </div>
              <div className="uc-rar">{card.kind === 'football' ? card.cardType === 'icon' ? (mini ? 'Icon' : 'Mythic · Icon') : RARITY_LABEL[card.rarity] : `${RARITY_LABEL[card.rarity]} theme`}</div>
              <div className={cx('uc-edition', verified && 'verified')}>{card.kind === 'football' ? verified ? `${card.edition}${card.cardType === 'icon' && !mini ? ' Icon' : ''} ✓` : (card.ratingMode ?? 'prime') === 'prime' ? mini ? 'Custom' : 'Legend · Custom' : `${card.edition} · Unverified` : mini ? 'Custom' : 'Custom power'}</div>
              <div className="uc-body">
                <div className="uc-name">{card.name}</div>
                <div className="uc-sub">{card.kind === 'football' ? `${card.club} · ${card.role}` : `${card.role} · ${card.ability}`}</div>
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
              <div className="uc-holo" aria-hidden="true" />
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

import { BadgeCheck, ExternalLink, ShieldAlert } from 'lucide-react';
import type { Card, MatchConfig, Sale } from '../../shared/types';
import { basePrice } from '../../shared/engine';
import { cardImageRecord } from '../../shared/imageManifest';
import { AFFINITIES, covers, norm, SYNERGY_RULES, THREAT_LABEL, FOOTBALL_WEIGHTS, AVENGERS_WEIGHTS } from '../../shared/scoring';
import { formatINR, round1 } from '../../shared/util';
import { GameCard, RARITY_COLOR, RARITY_LABEL, statKeys } from './GameCard';
import { Bar, Chip, Modal } from './ui';
import { Tooltip, TooltipContent, TooltipTrigger } from './shadcn/tooltip';

const STAT_NAME: Record<string, string> = {
  PAC: 'Pace', SHO: 'Shooting', PAS: 'Passing', DRI: 'Dribbling', DEF: 'Defending', PHY: 'Physicality',
  DIV: 'Diving', HAN: 'Handling', KIC: 'Kicking', REF: 'Reflexes', SPD: 'Speed', POS: 'Positioning',
  STR: 'Strength', INT: 'Intelligence', PWR: 'Superpower / Energy', TMW: 'Teamwork',
};

function synergyOptions(card: Extract<Card, { kind: 'hero' }>): string[] {
  const out: string[] = [];
  const t = card.tags;
  if (card.cls === 'Tech' || card.cls === 'Tank') out.push('Tactical Equipment (Tech + Tank)');
  if (card.cls === 'Mystic' || card.cls === 'Tank' || card.stats[3] >= 90) out.push('Arcane Ward (Mystic + defender)');
  if (t.includes('leader') || card.cls === 'Support') out.push('Rally Command (Leader + Support)');
  if (card.cls === 'Tank' || t.includes('ranged')) out.push('Battlefield Coverage (Tank + ranged)');
  if (card.stats[2] >= 92) out.push('Think Tank (two INT 92+)');
  if (card.stats[1] >= 90) out.push('Blitz (two SPD 90+)');
  if (t.includes('flyer')) out.push('Air Superiority (three flyers)');
  for (const a of AFFINITIES) if (t.includes(a.tag)) out.push(`${a.label} (${a.min}+ members)`);
  return out;
}

export function CardViewer({ card, cfg, cards, owner, price, sales = [], onClose }: {
  card: Card | null; cfg: MatchConfig; cards: Record<string, Card>; owner?: { name: string; color: string } | null; price?: number; onClose: () => void;
  sales?: Sale[];
}) {
  if (!card) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const keys = statKeys(card);
  const imageRecord = cardImageRecord(card);
  const status = card.kind === 'football' ? card.verificationStatus ?? 'custom' : 'custom';
  const pool = Object.values(cards);
  const weight = card.kind === 'football' ? FOOTBALL_WEIGHTS.quality : AVENGERS_WEIGHTS.capability;
  const impact = round1((norm(card.overall) * weight) / cfg.squadSize);
  const sameNation = card.kind === 'football' ? pool.filter((c) => c.kind === 'football' && c.id !== card.id && c.nation === card.nation) : [];
  const sameClub = card.kind === 'football' ? pool.filter((c) => c.kind === 'football' && c.id !== card.id && c.club === card.club) : [];
  const rows: [string, string][] = card.kind === 'football'
    ? [
        ['Primary position', `${card.pos} (${card.line})`],
        ['Secondary positions', card.alt.join(', ') || '—'],
        ['Tactical role', card.role],
        ['Playing style', card.style],
        ['Special trait', card.trait],
        ['Nationality', card.nation],
        ['Iconic club', card.club],
        ['Era', card.era],
        ['Rating system', card.edition ?? 'Prime Legends'],
        ['Card type', card.cardType ?? 'custom'],
        ['PlayStyles', card.playStyles?.join(', ') || 'Not supplied'],
      ]
    : [
        ['Hero class', card.cls],
        ['Team role', card.role],
        ['Signature ability', card.ability],
        ['Special attack', card.attack],
        ['Passive trait', card.passive],
        ['Strategic weakness', THREAT_LABEL[card.weakTo]],
        ['Counters', covers(card).map((t) => THREAT_LABEL[t]).join(', ') || 'None'],
        ['Affiliations', card.tags.join(', ')],
      ];
  return (
    <Modal open onClose={onClose} wide title={<span className="flex flex-wrap items-center gap-2">{card.name}<Chip className="!text-[11px]"><span style={{ color: RARITY_COLOR[card.rarity] }}>{RARITY_LABEL[card.rarity]} theme</span></Chip>{card.kind === 'football' && <Tooltip><TooltipTrigger asChild><span tabIndex={0}><Chip tone={status === 'verified' ? 'good' : status === 'custom' ? 'warn' : 'bad'} className="!text-[11px]">{status === 'verified' ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />}{status === 'verified' ? 'Host verified' : status === 'custom' ? 'Custom rating' : 'Rating not verified'}</Chip></span></TooltipTrigger><TooltipContent sideOffset={8} className="max-w-64 bg-[#e9edfa] text-[#071022]">{status === 'verified' ? `The host marked this source checked on ${card.verifiedAt}. Source contents are not checked automatically.` : 'This card is not represented as official EA data.'}</TooltipContent></Tooltip>}</span>}>
      <div className="grid gap-6 md:grid-cols-[minmax(220px,300px)_1fr]">
        <div className="mx-auto w-full max-w-[300px]">
          <GameCard card={card} tilt price={price ?? basePrice(card.overall, cfg)} owner={owner} />
          <p className="mt-5 text-center text-xs text-muted">
            {owner ? <>Owned by <b style={{ color: owner.color }}>{owner.name}</b>{price ? ` · bought for ${formatINR(price)}` : ''}</> : 'Not yet owned'}
          </p>
        </div>
        <div className="space-y-5">
          <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {keys.map((k, i) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">{STAT_NAME[k]} <span className="text-muted">({k})</span></span><b className="tnum">{card.stats[i] || '—'}</b></div>
                <Bar value={card.stats[i]} max={99} color={card.stats[i] >= 90 ? '#f6c453' : card.stats[i] >= 75 ? 'var(--accent)' : '#64748b'} />
              </div>
            ))}
          </div>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-white/5 py-1"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-1.5 font-display text-sm font-bold uppercase tracking-widest text-emerald-300">Strengths</h4>
              <div className="flex flex-wrap gap-1.5">{card.strengths.map((s) => <Chip key={s} tone="good">{s}</Chip>)}</div>
            </div>
            <div>
              <h4 className="mb-1.5 font-display text-sm font-bold uppercase tracking-widest text-rose-300">Weaknesses</h4>
              <div className="flex flex-wrap gap-1.5">{card.weaknesses.map((s) => <Chip key={s} tone="bad">{s}</Chip>)}</div>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-black/20 p-3 text-sm">
            <h4 className="mb-1.5 font-display text-sm font-bold uppercase tracking-widest text-slate-300">Deeper analytics</h4>
            <ul className="space-y-1 text-slate-300">
              <li>Opening bid: <b>{formatINR(basePrice(card.overall, cfg))}</b> ({round1((basePrice(card.overall, cfg) / cfg.budget) * 100)}% of the starting budget)</li>
              <li>Estimated impact: about <b>+{impact}</b> points of final team score {card.kind === 'football' ? 'when played in position' : 'from raw capability'}</li>
              {card.kind === 'football' ? (
                <>
                  <li>Chemistry — nation links: <b>{sameNation.length}</b> other {card.nation} card{sameNation.length === 1 ? '' : 's'} in this pool{sameNation.length ? ` (${sameNation.slice(0, 4).map((c) => c.name).join(', ')}${sameNation.length > 4 ? '…' : ''})` : ''}</li>
                  <li>Chemistry — club links: <b>{sameClub.length}</b> other {card.club} card{sameClub.length === 1 ? '' : 's'}{sameClub.length ? ` (${sameClub.slice(0, 4).map((c) => c.name).join(', ')}${sameClub.length > 4 ? '…' : ''})` : ''}</li>
                  {card.line === 'GK' && <li className="text-muted">Goalkeepers use DIV / HAN / KIC / REF / SPD / POS in place of the outfield attributes.</li>}
                  <li className={card.verificationStatus === 'verified' ? 'text-emerald-200' : 'text-amber-200'}>
                    {card.verificationStatus === 'verified' ? <BadgeCheck size={13} className="mr-1 inline" /> : <ShieldAlert size={13} className="mr-1 inline" />}
                    {status === 'verified' ? <>Host checked the source on {card.verifiedAt}. {card.source && <a href={card.source} target="_blank" rel="noreferrer" className="font-semibold underline">Open EA source <ExternalLink size={11} className="inline" /></a>}</> : status === 'custom' ? 'Prime Legends/custom game-balance data — not an official FC rating.' : 'Rating not verified. Complete all rating fields and check the edition against its EA source before marking verified.'}
                  </li>
                </>
              ) : (
                <li>
                  Synergies this hero can unlock:
                  <span className="mt-1.5 flex flex-wrap gap-1.5">{synergyOptions(card).map((s) => <Chip key={s} tone="accent">{s}</Chip>)}{!synergyOptions(card).length && <span className="text-muted">none — a pure solo pick</span>}</span>
                  {card.stats[5] < 55 && <span className="mt-1.5 block text-rose-300">Lone Wolf: TMW below 55 costs the team 2 synergy points.</span>}
                </li>
              )}
            </ul>
            <p className="mt-2 text-[11px] text-muted">Artwork: {imageRecord.kind === 'generated-fallback' ? 'deterministic identity-based fallback (no licensed portrait available)' : imageRecord.verified ? `${imageRecord.source}${imageRecord.attribution ? ` · ${imageRecord.attribution}` : ''}` : 'imported HTTPS image; license and attribution not verified'}. {card.kind === 'hero' ? `Character scores are custom game-balance values. Synergy list: ${SYNERGY_RULES.length} rules + affiliations.` : 'The active rating system is shown on the card and above.'}</p>
          </div>
          {sales.some((s) => s.cardId === card.id) && <div className="rounded-xl border border-line p-3 text-sm"><h4 className="mb-2 font-display font-bold uppercase">Auction price history</h4>{sales.filter((s) => s.cardId === card.id).map((s) => <p key={s.round} className="text-slate-300">Round {s.round}{s.pass ? ' · re-auction' : ''} · {s.type === 'sold' ? `Sold for ${formatINR(s.price)}` : 'Unsold'} · {s.bidCount ? `${s.bidCount} bids` : 'No individual bid log'}</p>)}</div>}
        </div>
      </div>
    </Modal>
  );
}

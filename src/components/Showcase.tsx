// Home-screen showcase: a fanned spread of real cards from the game — a Mythic FC 27 Icon, top
// official FC 27 Gold players (with their licensed photos) and a few heroes. Purely decorative; nothing here affects play.

import { memo, useMemo } from 'react';
import { BadgeCheck, Camera, Crown } from 'lucide-react';
import type { Card } from '../../shared/types';
import { getCatalog } from '../../shared/catalog';
import { FC27_RETRIEVED } from '../../shared/data/fc27';
import { FC27_ICONS } from '../../shared/data/fc27Icons';
import { PORTRAITS } from '../../shared/data/portraits';
import { GameCard } from './GameCard';

const HERO_PICKS = ['Thor', 'Doctor Strange', 'Captain Marvel', 'Black Panther'];

export const Showcase = memo(function Showcase() {
  const { football, icon, heroes, photos } = useMemo(() => {
    const all = getCatalog('football');
    const byRating = (a: Card, b: Card) => b.overall - a.overall || a.name.localeCompare(b.name);
    const official = all.filter((c) => c.kind === 'football' && c.ratingMode === 'fc27' && c.cardType === 'standard' && c.image).sort(byRating);
    const topIcon = all.filter((c) => c.kind === 'football' && c.cardType === 'icon' && c.image).sort(byRating)[0];
    // A spread of positions so the fan is not five strikers.
    const picks: Card[] = [];
    for (const line of ['ATT', 'MID', 'ATT', 'DEF', 'MID', 'GK', 'ATT']) {
      const next = official.find((c) => c.kind === 'football' && c.line === line && !picks.includes(c));
      if (next) picks.push(next);
    }
    const hero = getCatalog('avengers').filter((c) => HERO_PICKS.includes(c.name));
    return { football: picks.slice(0, 6), icon: topIcon, heroes: hero, photos: Object.keys(PORTRAITS).length };
  }, []);
  // The Mythic Icon takes the centre of the fan.
  const fan = [football[0], football[1], heroes[0], icon, football[2], heroes[1], football[3]].filter(Boolean) as Card[];
  const mid = (fan.length - 1) / 2;
  return (
    <section className="showcase mt-8" aria-label="Featured cards">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <div className="kicker">Featured cards</div>
          <h2 className="font-display text-2xl font-bold uppercase sm:text-3xl"><span className="gold-text">Real ratings.</span> <span className="grad-text">Real faces.</span></h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-200 ring-1 ring-emerald-400/30"><BadgeCheck size={13} /> Official EA SPORTS FC 27 ratings · {FC27_RETRIEVED}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-400/15 px-2.5 py-1 text-rose-100 ring-1 ring-rose-300/30"><Crown size={13} /> All {FC27_ICONS.length} FC 27 Icons · Mythic</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-slate-200 ring-1 ring-white/15"><Camera size={13} /> {photos} licensed player photos</span>
        </div>
      </div>
      <div className="showcase-fan" aria-hidden="true">
        {fan.map((c, i) => (
          <div key={c.id} className="showcase-slot" style={{ '--i': i - mid, '--abs': Math.abs(i - mid) } as React.CSSProperties}>
            <div className="showcase-pop"><GameCard card={c} tilt /></div>
          </div>
        ))}
      </div>
    </section>
  );
});

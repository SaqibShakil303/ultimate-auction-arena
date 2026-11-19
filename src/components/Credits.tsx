// Photo credits: every bundled player photo with its author and licence, as the licences require.

import { useMemo, useState } from 'react';
import { Camera, ExternalLink, Search } from 'lucide-react';
import { PORTRAITS, PORTRAITS_RETRIEVED } from '../../shared/data/portraits';
import { FC27_RETRIEVED, FC27_SOURCE } from '../../shared/data/fc27';
import { FC27_ICONS, FC27_ICONS_RETRIEVED, FC27_ICONS_SOURCE } from '../../shared/data/fc27Icons';
import { getCatalog } from '../../shared/catalog';
import { slug } from '../../shared/util';
import { cx, inputCls, Modal } from './ui';

export function CreditsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of getCatalog('football')) names.set(slug(c.name), c.name);
    return Object.entries(PORTRAITS).map(([key, p]) => ({ name: names.get(key) ?? key, ...p })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const shown = rows.filter((r) => `${r.name} ${r.artist}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <button onClick={() => setOpen(true)} className={cx('inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-white', className)}>
        <Camera size={11} /> Photo credits & data sources
      </button>
      <Modal open={open} onClose={() => setOpen(false)} wide title="Photo credits & data sources">
        <div className="space-y-4 text-sm">
          <p className="text-slate-300">
            <b>Ratings.</b> Football cards marked “FC 27 ✓” use official EA SPORTS FC 27 base ratings read from{' '}
            <a className="text-accent underline" href={FC27_SOURCE} target="_blank" rel="noreferrer">EA’s public ratings page</a> on {FC27_RETRIEVED}; each card links to its own EA page.
            Only Gold cards (75+ overall) are included. EA publishes no Icon ratings page, so the {FC27_ICONS.length} men’s FC 27 Icons (“FC 27 Icon ✓”) use their in-game
            Base Icon values as listed in{' '}<a className="text-accent underline" href={FC27_ICONS_SOURCE} target="_blank" rel="noreferrer">FUT.GG’s item database</a> on {FC27_ICONS_RETRIEVED}; each Icon links to its FUT.GG page.
            The optional Prime Legends mode uses this game’s own custom ratings and says “Custom” on every card. Hero powers are custom game values.
          </p>
          <p className="text-slate-300">
            <b>Photos.</b> {rows.length} player photos come from Wikimedia Commons under free licences, matched to each player through Wikidata
            (retrieved {PORTRAITS_RETRIEVED}). Photos are cropped to fit the cards. Players without a free photo, and all heroes, use original artwork made for this game — no studio or publisher artwork is used.
          </p>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3.5 text-muted" />
            <input className={cx(inputCls, 'pl-9')} placeholder="Search a player or photographer…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search credits" />
          </div>
          <ul className="grid max-h-[46vh] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {shown.map((r) => (
              <li key={r.file} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2">
                <img src={`/portraits/${r.file}`} alt="" loading="lazy" className="h-12 w-10 flex-none rounded-lg object-cover object-top" />
                <div className="min-w-0 text-xs">
                  <div className="truncate font-semibold text-white">{r.name}</div>
                  <div className="truncate text-muted">Photo: {r.artist}</div>
                  <a className="inline-flex items-center gap-1 text-accent underline" href={r.page} target="_blank" rel="noreferrer">
                    {r.license}{r.licenseUrl ? '' : ''} <ExternalLink size={10} />
                  </a>
                </div>
              </li>
            ))}
            {!shown.length && <li className="col-span-full p-6 text-center text-muted">No match.</li>}
          </ul>
        </div>
      </Modal>
    </>
  );
}

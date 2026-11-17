// Pulls official EA SPORTS FC 27 player ratings from EA's public ratings page and writes
// shared/data/fc27.ts. Nothing is typed by hand: every number in that file comes from
// https://www.ea.com/games/ea-sports-fc/ratings on the date recorded in the file.
//
//   node scripts/fetch-fc27.mjs
//
// The script reads the same public pages a visitor sees (one request every ~1.2 s), keeps the
// best-rated men's players per line so that eight full squads can always be built, and adds any
// current player named in the classic roster who was not already included.

import fs from 'node:fs';

const BASE = 'https://www.ea.com/games/ea-sports-fc/ratings';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const QUOTA = { GK: 26, DEF: 84, MID: 72, ATT: 72 };
const MAX_PAGES = 16;
const LINE = { GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID', ST: 'ATT', CF: 'ATT', LW: 'ATT', RW: 'ATT' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(query) {
  const res = await fetch(`${BASE}?${query}`, { headers: { 'user-agent': UA, 'accept-language': 'en' } });
  if (!res.ok) throw new Error(`EA ratings page answered ${res.status} for ${query}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('ratings data not found in page');
  const props = JSON.parse(m[1]).props.pageProps;
  const edition = /EA SPORTS FC 27/.test(props.gameDetails?.shortDescription || '') ? 'FC 27' : null;
  return { items: props.ratingDetails.items, total: props.ratingDetails.totalItems, edition };
}

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "6/15/1992 12:00:00 AM" → "1992-06-15" */
function isoBirth(raw) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw || '');
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

function toRow(p) {
  const name = (p.commonName || `${p.firstName} ${p.lastName}`).trim();
  const pos = p.position.shortLabel;
  const s = p.stats;
  const v = (k) => s[k]?.value;
  // For goalkeepers EA stores the face stats DIV/HAN/KIC/REF/SPD/POS in the same six fields.
  const stats = [v('pac'), v('sho'), v('pas'), v('dri'), v('def'), v('phy')];
  if (!LINE[pos] || stats.some((x) => !Number.isInteger(x)) || !Number.isInteger(p.overallRating)) return null;
  return {
    id: p.id, name, full: `${p.firstName} ${p.lastName}`.trim(), pos,
    alt: (p.alternatePositions || []).map((a) => a.shortLabel).filter((a) => LINE[a]),
    nation: p.nationality?.label || '', club: p.team?.label || '', league: p.leagueName || '',
    overall: p.overallRating, stats, born: isoBirth(p.birthdate),
    playStyles: (p.playerAbilities || []).map((a) => a.label).filter(Boolean),
    url: `${BASE}/player-ratings/${slugify(`${p.firstName} ${p.lastName}`)}/${p.id}`,
  };
}

const picked = new Map();
const count = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
let edition = null;
for (let n = 1; n <= MAX_PAGES; n++) {
  const r = await page(`gender=0&page=${n}`);
  edition = edition || r.edition;
  if (!r.edition) throw new Error('The page no longer identifies itself as EA SPORTS FC 27 — refusing to label this data.');
  for (const p of r.items) {
    const row = toRow(p);
    if (!row || !row.nation || !row.club) continue;
    const line = LINE[row.pos];
    if (count[line] >= QUOTA[line]) continue;
    picked.set(row.id, row);
    count[line]++;
  }
  console.log(`page ${n}: ${picked.size} players`, JSON.stringify(count));
  if (Object.keys(QUOTA).every((l) => count[l] >= QUOTA[l])) break;
  await sleep(1200);
}

// Current players from the classic roster who should also be available in FC 27 mode.
const extras = (process.argv.slice(2).length ? process.argv.slice(2) : fs.readFileSync(new URL('./fc27-extra-names.txt', import.meta.url), 'utf8').split('\n'))
  .map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
const norm = (s) => slugify(s).replace(/-/g, ' ');
const have = () => new Set([...picked.values()].flatMap((r) => [norm(r.name), norm(r.full)]));
const missing = [];
for (const line of extras) {
  const [want, nation] = line.split('|').map((x) => x.trim());
  if (have().has(norm(want))) continue;
  await sleep(1200);
  const r = await page(`gender=0&search=${encodeURIComponent(want)}`);
  const hit = r.items.map(toRow).filter(Boolean)
    .find((row) => (norm(row.name) === norm(want) || norm(row.full) === norm(want)) && (!nation || row.nation === nation));
  if (hit && hit.nation && hit.club) { picked.set(hit.id, hit); console.log(`+ ${hit.name} ${hit.overall}`); }
  else missing.push(want);
}

const rows = [...picked.values()].sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
const today = new Date().toISOString().slice(0, 10);
const out = `// GENERATED by scripts/fetch-fc27.mjs — do not edit by hand.
// Official EA SPORTS FC 27 base player ratings, read from EA's public ratings page:
//   ${BASE}
// Retrieved ${today}. ${rows.length} men's players. Each row links to its own official page.
// EA's page covers standard player items only: it does not include Icons, Heroes or campaign items.
// Goalkeeper stat order is DIV HAN KIC REF SPD POS; outfield is PAC SHO PAS DRI DEF PHY.

export const FC27_SOURCE = '${BASE}';
export const FC27_RETRIEVED = '${today}';

export interface Fc27Row {
  id: number; name: string; pos: string; alt: string[]; nation: string; club: string; league: string;
  overall: number; stats: number[]; born: string; playStyles: string[]; url: string;
}

export const FC27_ROWS: Fc27Row[] = ${JSON.stringify(rows.map(({ full, ...r }) => r), null, 0).replace(/\},\{/g, '},\n  {').replace(/^\[/, '[\n  ').replace(/\]$/, ',\n]')};
`;
fs.writeFileSync(new URL('../shared/data/fc27.ts', import.meta.url), out);
console.log(`\nWrote ${rows.length} players to shared/data/fc27.ts (${edition}, ${today}).`, JSON.stringify(count));
if (missing.length) console.log(`Not in FC 27 (retired, or no exact match): ${missing.join(', ')}`);

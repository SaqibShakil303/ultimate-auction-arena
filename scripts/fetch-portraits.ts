// Finds a freely licensed portrait for every footballer and records who to credit.
//
//   npx tsx scripts/fetch-portraits.ts            (re-uses photos already downloaded)
//   npx tsx scripts/fetch-portraits.ts --refresh  (download everything again)
//
// How a photo is chosen — nothing is guessed:
//   1. The player is matched to a Wikidata entry that is a human association-football player.
//      Current players must ALSO have the same date of birth as EA's official record; legends
//      are matched on their exact name, taking the most widely documented entry.
//   2. Only the image Wikidata lists for that person (always hosted on Wikimedia Commons) is used.
//   3. The file's licence is read from Commons. Only Creative Commons BY / BY-SA / CC0 and
//      public-domain files are accepted; anything else is skipped and the card keeps its
//      generated artwork.
//   4. A 330 px copy is saved to public/portraits/ and the author + licence are written to
//      shared/data/portraits.ts so the game can show the required credit.
//
// The lookups are batched (a handful of requests in total) to stay light on Wikimedia's servers.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOOTBALLERS } from '../shared/data/football';
import { FC27_ROWS } from '../shared/data/fc27';
import { EXTRA_PRIME_LEGENDS } from '../shared/demo';
import { slug } from '../shared/util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(root, 'public', 'portraits');
const UA = 'UltimateAuctionArena/1.0 (fan-made party game; portrait credit lookup)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const refresh = process.argv.includes('--refresh');

interface Person { key: string; name: string; born: string }
interface Match { qid: string; label: string; image: string | null; note?: string }
interface Credit { key: string; file: string; license: string; licenseUrl: string; artist: string; page: string; wikidata: string }

// Classic-roster names that Wikidata lists under a different English label.
const LABELS: Record<string, string> = {
  'ronaldo-nazario': 'Ronaldo', 'xavi': 'Xavi Hernández', 'marcelo': 'Marcelo', 'ederson': 'Ederson',
  'alisson-becker': 'Alisson', 'vinicius-junior': 'Vinícius Júnior', 'dani-alves': 'Dani Alves', 'dani-carvajal': 'Dani Carvajal',
  'emiliano-martinez': 'Emiliano Martínez', 'son-heung-min': 'Son Heung-min', 'kim-min-jae': 'Kim Min-jae',
  'mesut-ozil': 'Mesut Özil', 'gerard-pique': 'Gerard Piqué',
};

const people = new Map<string, Person>();
for (const r of FC27_ROWS) people.set(slug(r.name), { key: slug(r.name), name: r.name, born: r.born });
for (const c of [...FOOTBALLERS, ...EXTRA_PRIME_LEGENDS]) if (!people.has(slug(c.name))) people.set(slug(c.name), { key: slug(c.name), name: c.name, born: '' });

/** fetch() that turns connection errors into a retry instead of a crash. */
async function fetchRetry(url: string, init: RequestInit, tries = 5): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(3000 * (i + 1));
    }
  }
}

async function sparql(query: string): Promise<any[]> {
  for (let i = 0; i < 5; i++) {
    const res = await fetchRetry('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: { 'user-agent': UA, accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status === 429 || res.status >= 500) { await sleep(4000 * (i + 1)); continue; }
    throw new Error(`Wikidata query service answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('Wikidata query service kept failing');
}

const norm = (s: string) => slug(s).replace(/-/g, ' ');
const tokens = (s: string) => new Set(norm(s).split(' ').filter((t) => t.length > 1));
const fileOf = (url?: string) => (url ? decodeURIComponent(url.split('/Special:FilePath/')[1] || '').replace(/_/g, ' ') : null);
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** 3 = exact name or alias, 2 = every word of one name appears in the other, 1 = shares a surname-like word. */
function nameScore(want: string, label: string, alts: string[]): number {
  const w = norm(want);
  if ([label, ...alts].some((x) => norm(x) === w)) return 3;
  const a = tokens(want);
  let best = 0;
  for (const cand of [label, ...alts]) {
    const b = tokens(cand);
    const shared = [...a].filter((t) => b.has(t)).length;
    if (shared && (shared === a.size || shared === b.size)) best = Math.max(best, 2);
    else if (shared) best = Math.max(best, 1);
  }
  return best;
}

const matches = new Map<string, Match>();
const problems: string[] = [];

// ── current players: same date of birth as EA's record + a matching name ──
const withBirth = [...people.values()].filter((p) => p.born);
for (const group of chunk([...new Set(withBirth.map((p) => p.born))], 45)) {
  const rows = await sparql(`
    SELECT ?item ?itemLabel ?dob (SAMPLE(?i) AS ?img) (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) WHERE {
      VALUES ?dob { ${group.map((d) => `"${d}T00:00:00Z"^^xsd:dateTime`).join(' ')} }
      ?item wdt:P569 ?dob ; wdt:P106 wd:Q937857 ; wdt:P31 wd:Q5 .
      OPTIONAL { ?item wdt:P18 ?i }
      OPTIONAL { ?item skos:altLabel ?alt FILTER(LANG(?alt) IN ("en", "es", "pt", "fr", "de", "it")) }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,pt,fr,de,it". }
    } GROUP BY ?item ?itemLabel ?dob`);
  for (const p of withBirth.filter((x) => group.includes(x.born))) {
    const scored = rows.filter((r) => r.dob.value.startsWith(p.born))
      .map((r) => ({ r, score: nameScore(p.name, r.itemLabel?.value || '', (r.alts?.value || '').split('|').filter(Boolean)) }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) { problems.push(`${p.name}: no football player born ${p.born} with a matching name`); continue; }
    if (scored.length > 1 && scored[0].score === scored[1].score) { problems.push(`${p.name}: ambiguous (${scored.slice(0, 3).map((x) => x.r.itemLabel.value).join(' / ')})`); continue; }
    const r = scored[0].r;
    matches.set(p.key, { qid: r.item.value.split('/').pop()!, label: r.itemLabel.value, image: fileOf(r.img?.value) });
  }
  console.log(`matched ${matches.size} current players…`);
  await sleep(1500);
}

// ── legends and retired players: exact name, most widely documented entry ──
const byName = [...people.values()].filter((p) => !p.born);
for (const group of chunk(byName, 40)) {
  const label = (p: Person) => LABELS[p.key] ?? p.name;
  const rows = await sparql(`
    SELECT ?item ?itemLabel ?name ?links (SAMPLE(?i) AS ?img) WHERE {
      VALUES ?name { ${group.map((p) => JSON.stringify(label(p)) + '@en').join(' ')} }
      ?item rdfs:label ?name ; wdt:P106 wd:Q937857 ; wdt:P31 wd:Q5 ; wikibase:sitelinks ?links .
      OPTIONAL { ?item wdt:P18 ?i }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } GROUP BY ?item ?itemLabel ?name ?links`);
  for (const p of group) {
    const cands = rows.filter((r) => r.name.value === label(p)).sort((a, b) => Number(b.links.value) - Number(a.links.value));
    if (!cands.length) { problems.push(`${p.name}: no football player with that exact name`); continue; }
    // Two famous people with one name would be a coin toss: require a clear lead in coverage.
    if (cands.length > 1 && Number(cands[1].links.value) > Number(cands[0].links.value) * 0.6) { problems.push(`${p.name}: ambiguous name`); continue; }
    matches.set(p.key, { qid: cands[0].item.value.split('/').pop()!, label: cands[0].itemLabel.value, image: fileOf(cands[0].img?.value) });
  }
  await sleep(1500);
}
console.log(`matched ${matches.size} of ${people.size} players to Wikidata`);

// ── licence + author from Commons, then download ──
fs.mkdirSync(OUT_DIR, { recursive: true });
// Free licences that allow reuse with credit. "Attribution" is the Commons licence of that name; GODL-India is
// the Government Open Data Licence – India. GFDL-only and non-free files are refused.
const FREE = /^(cc0( 1\.0)?|cc[ -]by(-sa)?([ -]\d\.\d)?( [a-z-]+)?|public domain|pdm|no restrictions|attribution|godl-india)$/i;
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const credits: Credit[] = [];
const withImage = [...matches.entries()].filter(([, m]) => m.image);
for (const [key, m] of matches) if (!m.image) problems.push(`${people.get(key)!.name}: Wikidata has no photo`);

for (const group of chunk(withImage, 40)) {
  const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '330', titles: group.map(([, m]) => `File:${m.image}`).join('|') });
  const res = await fetchRetry('https://commons.wikimedia.org/w/api.php', { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: params });
  if (!res.ok) throw new Error(`Commons answered ${res.status}`);
  const data = await res.json();
  const renamed = new Map<string, string>((data.query?.normalized || []).map((n: any) => [n.from, n.to]));
  const pages: any[] = Object.values(data.query?.pages || {});
  for (const [key, m] of group) {
    const name = people.get(key)!.name;
    const title = renamed.get(`File:${m.image}`) ?? `File:${m.image}`;
    const ii = pages.find((pg) => pg.title === title)?.imageinfo?.[0];
    if (!ii) { problems.push(`${name}: photo file not found on Commons`); continue; }
    const meta = ii.extmetadata || {};
    const license = plain(meta.LicenseShortName?.value || '');
    if (!FREE.test(license)) { problems.push(`${name}: licence "${license || 'unknown'}" not accepted`); continue; }
    if (!/^image\/(jpeg|png|webp|tiff)$/.test(ii.mime || '')) { problems.push(`${name}: unsupported image type ${ii.mime}`); continue; }
    // Commons renders TIFF originals as JPEG thumbnails, which is what gets downloaded.
    if (ii.mime === 'image/tiff' && !ii.thumburl) { problems.push(`${name}: no JPEG rendering of the TIFF original`); continue; }
    const ext = ii.mime === 'image/png' ? 'png' : ii.mime === 'image/webp' ? 'webp' : 'jpg';
    const file = `${key}.${ext}`;
    const dest = path.join(OUT_DIR, file);
    if (refresh || !fs.existsSync(dest) || fs.statSync(dest).size < 2000) {
      let saved = false;
      for (let i = 0; i < 5 && !saved; i++) {
        try {
          const img = await fetch(ii.thumburl || ii.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
          if (img.ok) { fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer())); saved = true; }
          else await sleep(img.status === 429 ? 6000 * (i + 1) : 1500);
        } catch {
          await sleep(3000 * (i + 1)); // connection timeout or reset: wait and try again
        }
      }
      if (!saved) { problems.push(`${name}: photo download failed`); continue; }
      await sleep(350);
    }
    credits.push({
      key, file, license, licenseUrl: meta.LicenseUrl?.value || '',
      artist: plain(meta.Artist?.value || meta.Credit?.value || 'Unknown author').slice(0, 140) || 'Unknown author',
      page: ii.descriptionurl, wikidata: m.qid,
    });
  }
  console.log(`${credits.length} portraits ready…`);
  await sleep(800);
}

// Remove photos that are no longer credited (e.g. a licence that changed).
const keep = new Set(credits.map((c) => c.file));
for (const f of fs.readdirSync(OUT_DIR)) if (!keep.has(f)) fs.rmSync(path.join(OUT_DIR, f));

credits.sort((a, b) => a.key.localeCompare(b.key));
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(root, 'shared', 'data', 'portraits.ts'), `// GENERATED by scripts/fetch-portraits.ts — do not edit by hand.
// Freely licensed portraits from Wikimedia Commons, matched to each player through Wikidata
// (football player + date of birth for current players, exact name for legends). Retrieved ${today}.
// Every entry carries the author and licence that must be credited wherever the photo is shown.

export interface PortraitInfo { file: string; license: string; licenseUrl: string; artist: string; page: string; wikidata: string }

export const PORTRAITS_RETRIEVED = '${today}';

export const PORTRAITS: Record<string, PortraitInfo> = {
${credits.map(({ key, ...c }) => `  ${JSON.stringify(key)}: ${JSON.stringify(c)},`).join('\n')}
};
`);
fs.mkdirSync(path.join(root, 'scripts', '.cache'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts', '.cache', 'portrait-report.txt'), problems.join('\n') + '\n');
console.log(`\n${credits.length} of ${people.size} players have a licensed portrait; ${problems.length} keep generated artwork.`);
console.log(problems.slice(0, 80).join('\n'));

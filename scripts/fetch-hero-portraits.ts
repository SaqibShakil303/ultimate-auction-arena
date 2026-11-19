// Finds a freely licensed photo for the Marvel-inspired hero cards and records who to credit.
//
//   npx tsx scripts/fetch-hero-portraits.ts            (re-uses photos already downloaded)
//   npx tsx scripts/fetch-hero-portraits.ts --refresh  (download everything again)
//
// Character artwork is owned by its publisher and studio, so it is never used. Instead a hero card
// shows a photo of the ACTOR who plays (or voices) that hero on film, exactly like the footballer
// photos:
//   1. The actor comes from the hand-checked CAST list below (hero → actor → film).
//   2. The actor is matched to the Wikidata entry with that exact English name that is a human
//      actor, taking the most widely documented entry.
//   3. Only the image Wikidata lists for that person (hosted on Wikimedia Commons) is used, and only
//      when its Commons licence is CC BY / BY-SA / CC0 or public domain.
//   4. A 330 px copy goes to public/hero-portraits/ and the author + licence to
//      shared/data/heroPortraits.ts. Heroes with no film actor, or no free photo, and the invented
//      "Original Heroes" pack keep their original emblem art.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug } from '../shared/util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(root, 'public', 'hero-portraits');
const UA = 'UltimateAuctionArena/1.0 (fan-made party game; portrait credit lookup)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const refresh = process.argv.includes('--refresh');

/** hero → [actor, role ('plays' | 'voices'), film the role is best known from]. */
const CAST: Record<string, [string, 'plays' | 'voices', string]> = {
  'Iron Man': ['Robert Downey Jr.', 'plays', 'Iron Man (2008)'],
  'Thor': ['Chris Hemsworth', 'plays', 'Thor (2011)'],
  'Hulk': ['Mark Ruffalo', 'plays', 'The Avengers (2012)'],
  'Captain America': ['Chris Evans', 'plays', 'Captain America: The First Avenger (2011)'],
  'Black Widow': ['Scarlett Johansson', 'plays', 'Black Widow (2021)'],
  'Hawkeye': ['Jeremy Renner', 'plays', 'Hawkeye (2021)'],
  'Doctor Strange': ['Benedict Cumberbatch', 'plays', 'Doctor Strange (2016)'],
  'Scarlet Witch': ['Elizabeth Olsen', 'plays', 'WandaVision (2021)'],
  'Spider-Man': ['Tom Holland', 'plays', 'Spider-Man: Homecoming (2017)'],
  'Black Panther': ['Chadwick Boseman', 'plays', 'Black Panther (2018)'],
  'Ant-Man': ['Paul Rudd', 'plays', 'Ant-Man (2015)'],
  'Wasp': ['Evangeline Lilly', 'plays', 'Ant-Man and the Wasp (2018)'],
  'Vision': ['Paul Bettany', 'plays', 'Avengers: Age of Ultron (2015)'],
  'Captain Marvel': ['Brie Larson', 'plays', 'Captain Marvel (2019)'],
  'Loki': ['Tom Hiddleston', 'plays', 'Loki (2021)'],
  'Winter Soldier': ['Sebastian Stan', 'plays', 'Captain America: The Winter Soldier (2014)'],
  'Falcon': ['Anthony Mackie', 'plays', 'The Falcon and the Winter Soldier (2021)'],
  'War Machine': ['Don Cheadle', 'plays', 'Iron Man 2 (2010)'],
  'Star-Lord': ['Chris Pratt', 'plays', 'Guardians of the Galaxy (2014)'],
  'Gamora': ['Zoe Saldaña', 'plays', 'Guardians of the Galaxy (2014)'],
  'Groot': ['Vin Diesel', 'voices', 'Guardians of the Galaxy (2014)'],
  'Rocket Raccoon': ['Bradley Cooper', 'voices', 'Guardians of the Galaxy (2014)'],
  'Drax': ['Dave Bautista', 'plays', 'Guardians of the Galaxy (2014)'],
  'Nebula': ['Karen Gillan', 'plays', 'Guardians of the Galaxy (2014)'],
  'Mantis': ['Pom Klementieff', 'plays', 'Guardians of the Galaxy Vol. 2 (2017)'],
  'Shuri': ['Letitia Wright', 'plays', 'Black Panther (2018)'],
  'Okoye': ['Danai Gurira', 'plays', 'Black Panther (2018)'],
  'Valkyrie': ['Tessa Thompson', 'plays', 'Thor: Ragnarok (2017)'],
  'Wong': ['Benedict Wong', 'plays', 'Doctor Strange (2016)'],
  'Nick Fury': ['Samuel L. Jackson', 'plays', 'The Avengers (2012)'],
  'Daredevil': ['Charlie Cox', 'plays', 'Daredevil (2015)'],
  'Wolverine': ['Hugh Jackman', 'plays', 'X-Men (2000)'],
  'Deadpool': ['Ryan Reynolds', 'plays', 'Deadpool (2016)'],
  'Storm': ['Halle Berry', 'plays', 'X-Men (2000)'],
  'Professor X': ['Patrick Stewart', 'plays', 'X-Men (2000)'],
  'Jean Grey': ['Famke Janssen', 'plays', 'X-Men (2000)'],
  'Cyclops': ['James Marsden', 'plays', 'X-Men (2000)'],
  'Shang-Chi': ['Simu Liu', 'plays', 'Shang-Chi and the Legend of the Ten Rings (2021)'],
  'Moon Knight': ['Oscar Isaac', 'plays', 'Moon Knight (2022)'],
  'She-Hulk': ['Tatiana Maslany', 'plays', 'She-Hulk: Attorney at Law (2022)'],
  'Ms. Marvel': ['Iman Vellani', 'plays', 'Ms. Marvel (2022)'],
  'Silver Surfer': ['Doug Jones', 'plays', 'Fantastic Four: Rise of the Silver Surfer (2007)'],
  'Quicksilver': ['Aaron Taylor-Johnson', 'plays', 'Avengers: Age of Ultron (2015)'],
  'Nightcrawler': ['Alan Cumming', 'plays', 'X2 (2003)'],
  'Mister Fantastic': ['Pedro Pascal', 'plays', 'The Fantastic Four: First Steps (2025)'],
  'Invisible Woman': ['Vanessa Kirby', 'plays', 'The Fantastic Four: First Steps (2025)'],
  'Human Torch': ['Joseph Quinn', 'plays', 'The Fantastic Four: First Steps (2025)'],
  'The Thing': ['Ebon Moss-Bachrach', 'plays', 'The Fantastic Four: First Steps (2025)'],
  'Thanos': ['Josh Brolin', 'plays', 'Avengers: Infinity War (2018)'],
  'Ultron': ['James Spader', 'plays', 'Avengers: Age of Ultron (2015)'],
  'Hela': ['Cate Blanchett', 'plays', 'Thor: Ragnarok (2017)'],
  'Killmonger': ['Michael B. Jordan', 'plays', 'Black Panther (2018)'],
  'Green Goblin': ['Willem Dafoe', 'plays', 'Spider-Man (2002)'],
  'Doctor Octopus': ['Alfred Molina', 'plays', 'Spider-Man 2 (2004)'],
  'Venom': ['Tom Hardy', 'plays', 'Venom (2018)'],
  'Magneto': ['Ian McKellen', 'plays', 'X-Men (2000)'],
  'Doctor Doom': ['Julian McMahon', 'plays', 'Fantastic Four (2005)'],
  'Kang': ['Jonathan Majors', 'plays', 'Ant-Man and the Wasp: Quantumania (2023)'],
  'Red Skull': ['Hugo Weaving', 'plays', 'Captain America: The First Avenger (2011)'],
  'Mysterio': ['Jake Gyllenhaal', 'plays', 'Spider-Man: Far From Home (2019)'],
  'Juggernaut': ['Vinnie Jones', 'plays', 'X-Men: The Last Stand (2006)'],
  'Mystique': ['Jennifer Lawrence', 'plays', 'X-Men: First Class (2011)'],
  'Abomination': ['Tim Roth', 'plays', 'The Incredible Hulk (2008)'],
  // Dormammu is a CGI character performed by the same actor as Doctor Strange: emblem art instead.
};

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
const fileOf = (url?: string) => (url ? decodeURIComponent(url.split('/Special:FilePath/')[1] || '').replace(/_/g, ' ') : null);
const FREE = /^(cc0( 1\.0)?|cc[ -]by(-sa)?([ -]\d\.\d)?( [a-z-]+)?|public domain|pdm|no restrictions|attribution)$/i;
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

const problems: string[] = [];
const actors = [...new Set(Object.values(CAST).map(([a]) => a))];
// Actor, film actor, television actor, voice actor, stage actor.
const rows = await sparql(`
  SELECT ?item ?name ?links (SAMPLE(?i) AS ?img) WHERE {
    VALUES ?name { ${actors.map((a) => JSON.stringify(a) + '@en').join(' ')} }
    ?item rdfs:label ?name ; wdt:P31 wd:Q5 ; wdt:P106 ?occ ; wikibase:sitelinks ?links .
    VALUES ?occ { wd:Q33999 wd:Q10800557 wd:Q10798782 wd:Q2405480 wd:Q2259451 }
    OPTIONAL { ?item wdt:P18 ?i }
  } GROUP BY ?item ?name ?links`);
const actorMatch = new Map<string, { qid: string; image: string | null }>();
for (const a of actors) {
  const c = rows.filter((r) => r.name.value === a).sort((x, y) => Number(y.links.value) - Number(x.links.value));
  if (!c.length) { problems.push(`${a}: no actor with that exact name on Wikidata`); continue; }
  actorMatch.set(a, { qid: c[0].item.value.split('/').pop()!, image: fileOf(c[0].img?.value) });
}

interface Credit { key: string; hero: string; actor: string; role: string; film: string; file: string; license: string; licenseUrl: string; artist: string; page: string; wikidata: string }
const credits: Credit[] = [];
fs.mkdirSync(OUT_DIR, { recursive: true });
const withImage = actors.filter((a) => actorMatch.get(a)?.image);
for (const a of actors) if (actorMatch.has(a) && !actorMatch.get(a)!.image) problems.push(`${a}: Wikidata has no photo`);
// Commons answers at most 50 titles per request.
const renamed = new Map<string, string>();
const pages: any[] = [];
for (let i = 0; i < withImage.length; i += 40) {
  const titles = withImage.slice(i, i + 40).map((a) => `File:${actorMatch.get(a)!.image}`).join('|');
  const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '330', titles });
  const res = await fetchRetry('https://commons.wikimedia.org/w/api.php', { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: params });
  if (!res.ok) throw new Error(`Commons answered ${res.status}`);
  const data = await res.json();
  for (const n of data.query?.normalized || []) renamed.set(n.from, n.to);
  pages.push(...Object.values(data.query?.pages || {}));
  await sleep(800);
}
const files = new Map<string, Omit<Credit, 'key' | 'hero' | 'role' | 'film'>>();
for (const a of withImage) {
  const m = actorMatch.get(a)!;
  const title = renamed.get(`File:${m.image}`) ?? `File:${m.image}`;
  const ii = pages.find((pg) => pg.title === title)?.imageinfo?.[0];
  if (!ii) { problems.push(`${a}: photo file not found on Commons`); continue; }
  const meta = ii.extmetadata || {};
  const license = plain(meta.LicenseShortName?.value || '');
  if (!FREE.test(license)) { problems.push(`${a}: licence "${license || 'unknown'}" not accepted`); continue; }
  if (!/^image\/(jpeg|png|webp|tiff)$/.test(ii.mime || '')) { problems.push(`${a}: unsupported image type ${ii.mime}`); continue; }
  const ext = ii.mime === 'image/png' ? 'png' : ii.mime === 'image/webp' ? 'webp' : 'jpg';
  const file = `${slug(a)}.${ext}`;
  const dest = path.join(OUT_DIR, file);
  if (refresh || !fs.existsSync(dest) || fs.statSync(dest).size < 2000) {
    let saved = false;
    for (let i = 0; i < 5 && !saved; i++) {
      try {
        const img = await fetch(ii.thumburl || ii.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
        if (img.ok) { fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer())); saved = true; }
        else await sleep(img.status === 429 ? 6000 * (i + 1) : 1500);
      } catch {
        await sleep(3000 * (i + 1));
      }
    }
    if (!saved) { problems.push(`${a}: photo download failed`); continue; }
    await sleep(350);
  }
  files.set(a, {
    actor: a, file, license, licenseUrl: meta.LicenseUrl?.value || '',
    artist: plain(meta.Artist?.value || meta.Credit?.value || 'Unknown author').slice(0, 140) || 'Unknown author',
    page: ii.descriptionurl, wikidata: m.qid,
  });
}
for (const [hero, [actor, role, film]] of Object.entries(CAST)) {
  const f = files.get(actor);
  if (f) credits.push({ key: slug(hero), hero, role, film, ...f });
}
const keep = new Set(credits.map((c) => c.file));
for (const f of fs.readdirSync(OUT_DIR)) if (!keep.has(f)) fs.rmSync(path.join(OUT_DIR, f));

credits.sort((a, b) => a.key.localeCompare(b.key));
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(root, 'shared', 'data', 'heroPortraits.ts'), `// GENERATED by scripts/fetch-hero-portraits.ts — do not edit by hand.
// No character artwork is used: each Marvel-inspired hero card shows a freely licensed Wikimedia
// Commons photo of the actor who plays (or voices) that hero on film. Retrieved ${today}.
// Every entry carries the author and licence that must be credited wherever the photo is shown.

export interface HeroPortraitInfo {
  hero: string; actor: string; role: 'plays' | 'voices'; film: string;
  file: string; license: string; licenseUrl: string; artist: string; page: string; wikidata: string;
}

export const HERO_PORTRAITS_RETRIEVED = '${today}';

export const HERO_PORTRAITS: Record<string, HeroPortraitInfo> = {
${credits.map(({ key, ...c }) => `  ${JSON.stringify(key)}: ${JSON.stringify(c)},`).join('\n')}
};
`);
console.log(`${credits.length} of ${Object.keys(CAST).length} film heroes have a licensed actor photo.`);
console.log(problems.join('\n'));

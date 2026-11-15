import type { Mode, RatingMode } from './types';

const csvCells = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const listCell = (value = '') => value.split(/[|;]/).map((x) => x.trim()).filter(Boolean);

export function parseCardCsv(text: string, mode: Mode, fallbackRating: RatingMode): unknown[] {
  const rows = csvCells(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
  return rows.slice(1).map((values) => {
    const get = (...names: string[]) => {
      const i = headers.findIndex((h) => names.includes(h));
      return i >= 0 ? values[i] ?? '' : '';
    };
    if (mode === 'football') {
      const pos = get('pos', 'position').toUpperCase();
      const keys = pos === 'GK' ? ['div', 'han', 'kic', 'ref', 'spd', 'positioning'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
      const rawRating = (get('ratingmode', 'ratingsystem') || fallbackRating).toLowerCase().replace(/[\s_-]+/g, '');
      const ratingMode: RatingMode = rawRating === 'fc26' ? 'fc26' : rawRating === 'fc27' ? 'fc27' : 'prime';
      return {
        name: get('name', 'fullname'), overall: Number(get('overall', 'ovr')),
        pos, alt: listCell(get('alt', 'secondarypositions')), nation: get('nation', 'nationality'), club: get('club'),
        stats: keys.map((k) => Number(get(k))), trait: get('trait'), style: get('style'), role: get('role'),
        era: get('era'), ratingMode, edition: get('edition'),
        cardType: get('cardtype', 'itemtype').toLowerCase(), source: get('source', 'sourceurl'),
        verifiedAt: get('verifiedat', 'dateverified'), verificationStatus: get('verificationstatus', 'status').toLowerCase(),
        playStyles: listCell(get('playstyles', 'playstyle')), image: get('image', 'imageurl'),
        imageMeta: { source: get('imagesource'), sourceUrl: get('imagesourceurl'), license: get('imagelicense'), attribution: get('imageattribution'), verifiedAt: get('imageverifiedat'), verified: get('imageverified') === 'true' },
      };
    }
    return {
      name: get('name'), overall: Number(get('overall', 'ovr')), cls: get('class', 'cls'),
      stats: ['str', 'spd', 'int', 'def', 'pwr', 'tmw'].map((k) => Number(get(k))),
      role: get('role'), ability: get('ability'), weakTo: get('weakto'), tags: listCell(get('tags')), image: get('image', 'imageurl'),
    };
  });
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { getCatalog } from '../shared/catalog';
import { createFriendsChampionship } from '../shared/demo';
import { auditCardImages, cardImageRecord, PROJECT_IMAGE_MANIFEST } from '../shared/imageManifest';

const builtIn = [...getCatalog('football'), ...getCatalog('avengers')];
const demo = Object.values(createFriendsChampionship(0).cards);
const all = [...new Map([...builtIn, ...demo].map((card) => [card.id, card])).values()];
const records = all.map(cardImageRecord);
const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const fields = ['cardId', 'cardName', 'kind', 'src', 'source', 'license', 'attribution', 'verifiedAt', 'verified'] as const;
mkdirSync('docs', { recursive: true });
writeFileSync('docs/card-image-audit.csv', fields.join(',') + '\n' + records.map((r) => fields.map((f) => csv(r[f])).join(',')).join('\n') + '\n', 'utf8');
const report = { generatedAt: new Date().toISOString(), builtIn: auditCardImages(builtIn), demo: auditCardImages(demo), allDistinct: auditCardImages(all), arenaAssets: PROJECT_IMAGE_MANIFEST, cards: records };
writeFileSync('docs/asset-manifest.json', JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ builtIn: report.builtIn, demo: report.demo, allDistinct: report.allDistinct }, null, 2));

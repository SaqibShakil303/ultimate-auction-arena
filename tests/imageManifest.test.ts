import { describe, expect, it } from 'vitest';
import type { Card } from '../shared/types';
import { FOOTBALLERS } from '../shared/data/football';
import { HEROES } from '../shared/data/heroes';
import { auditCardImages, cardImageRecord, PROJECT_IMAGE_MANIFEST } from '../shared/imageManifest';
import { getCatalog } from '../shared/catalog';
import { PORTRAITS } from '../shared/data/portraits';
import fs from 'node:fs';

describe('central image manifest', () => {
  it('documents both generated arena assets', () => {
    expect(PROJECT_IMAGE_MANIFEST.map((asset) => asset.path)).toEqual([
      '/assets/arena-football.jpg',
      '/assets/arena-heroes.jpg',
    ]);
    for (const asset of PROJECT_IMAGE_MANIFEST) {
      expect(asset.generated).toBe(true);
      expect(asset.source).toBeTruthy();
      expect(asset.license).toBeTruthy();
      expect(asset.attribution).toBeTruthy();
    }
  });

  it('credits every bundled portrait and keeps an honest fallback for every other card', () => {
    const football = getCatalog('football');
    const audit = auditCardImages(football);
    const withPhoto = football.filter((c) => c.image);
    expect(withPhoto.length).toBeGreaterThan(0);
    expect(audit).toMatchObject({ total: football.length, verified: withPhoto.length, imported: withPhoto.length, missingAttribution: 0 });
    for (const card of withPhoto) {
      const record = cardImageRecord(card);
      expect(record).toMatchObject({ kind: 'bundled-licensed', verified: true });
      expect(record.license).toMatch(/^(CC|Public domain|PDM|No restrictions|Attribution$|GODL-India$)/i); // the free licences the fetch script accepts
      expect(record.attribution).toBeTruthy();
      expect(record.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(fs.existsSync(`public${card.image}`)).toBe(true); // the photo really ships with the game
    }
    // Every credited file exists, and no photo ships without a credit.
    const credited = new Set(Object.values(PORTRAITS).map((p) => p.file));
    for (const f of fs.readdirSync('public/portraits')) expect(credited.has(f)).toBe(true);
    // Heroes never use photos: there is no freely licensed artwork of those characters.
    expect(auditCardImages(getCatalog('avengers'))).toMatchObject({ imported: 0, verified: 0 });
  });

  it('reports zero portrait coverage in the raw built-in tables (photos are attached by the catalog)', () => {
    const cards: Card[] = [...FOOTBALLERS, ...HEROES];
    expect(cards.every((card) => card.image === undefined)).toBe(true);
    expect(auditCardImages(cards)).toEqual({
      total: cards.length,
      verified: 0,
      imported: 0,
      fallback: cards.length,
      missingAttribution: 0,
    });
    const first = cardImageRecord(cards[0]);
    expect(first).toMatchObject({ kind: 'generated-fallback', verified: false, missingAttribution: false });
    expect(first.fallbackKey).toBe(`${cards[0].kind}:${cards[0].id}`);
  });

  it('does not infer a license or attribution for an imported HTTPS portrait', () => {
    const imported = { ...FOOTBALLERS[0], image: 'https://images.example.test/player.jpg' } as Card;
    expect(cardImageRecord(imported)).toMatchObject({
      kind: 'imported-https',
      src: 'https://images.example.test/player.jpg',
      license: null,
      attribution: null,
      verified: false,
      missingAttribution: true,
    });
    expect(auditCardImages([imported])).toEqual({
      total: 1,
      verified: 0,
      imported: 1,
      fallback: 0,
      missingAttribution: 1,
    });
  });

  it('accepts narrowly validated optional image metadata', () => {
    const verified = {
      ...FOOTBALLERS[0],
      image: 'https://images.example.test/licensed-player.jpg',
      imageMeta: {
        source: 'Example photo archive',
        sourceUrl: 'https://images.example.test/source-page',
        license: 'CC BY 4.0',
        attribution: 'Photo: Example Photographer',
        verified: true,
        verifiedAt: '2026-11-15',
      },
    } as Card & { imageMeta: unknown };
    expect(cardImageRecord(verified)).toMatchObject({
      kind: 'imported-https',
      source: 'Example photo archive',
      sourceUrl: 'https://images.example.test/source-page',
      license: 'CC BY 4.0',
      attribution: 'Photo: Example Photographer',
      verifiedAt: '2026-11-15',
      verified: true,
      missingAttribution: false,
    });
    expect(auditCardImages([verified])).toMatchObject({ verified: 1, imported: 1, fallback: 0, missingAttribution: 0 });
  });
});

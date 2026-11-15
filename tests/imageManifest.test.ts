import { describe, expect, it } from 'vitest';
import type { Card } from '../shared/types';
import { FOOTBALLERS } from '../shared/data/football';
import { HEROES } from '../shared/data/heroes';
import { auditCardImages, cardImageRecord, PROJECT_IMAGE_MANIFEST } from '../shared/imageManifest';

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

  it('reports zero built-in portrait coverage and an honest fallback for every card', () => {
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

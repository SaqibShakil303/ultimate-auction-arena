import type { Card } from './types';

export interface ProjectImageAsset {
  id: 'arena-football' | 'arena-heroes';
  path: string;
  purpose: string;
  source: string;
  license: string;
  attribution: string;
  generated: true;
  verifiedAt: string;
}

/** Project-owned arena art. Card portraits are audited separately below. */
export const PROJECT_IMAGE_MANIFEST: readonly ProjectImageAsset[] = [
  {
    id: 'arena-football',
    path: '/assets/arena-football.jpg',
    purpose: 'Football Arena mode artwork',
    source: 'Generated specifically for Ultimate Auction Arena with OpenAI image generation',
    license: 'Project-generated asset; reuse is subject to this project’s distribution terms',
    attribution: 'Generated with OpenAI for Ultimate Auction Arena',
    generated: true,
    verifiedAt: '2026-11-15',
  },
  {
    id: 'arena-heroes',
    path: '/assets/arena-heroes.jpg',
    purpose: 'Heroes Arena mode artwork',
    source: 'Generated specifically for Ultimate Auction Arena with OpenAI image generation',
    license: 'Project-generated asset; reuse is subject to this project’s distribution terms',
    attribution: 'Generated with OpenAI for Ultimate Auction Arena',
    generated: true,
    verifiedAt: '2026-11-15',
  },
] as const;

export type CardImageKind = 'bundled-licensed' | 'imported-https' | 'generated-fallback';

export interface CardImageRecord {
  cardId: string;
  cardName: string;
  kind: CardImageKind;
  src: string | null;
  /** Stable identity consumed by the in-app generated-art renderer. */
  fallbackKey: string;
  source: string;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  verifiedAt: string | null;
  verified: boolean;
  missingAttribution: boolean;
}

export interface CardImageAudit {
  total: number;
  verified: number;
  imported: number;
  fallback: number;
  missingAttribution: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shortText(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function httpsUrl(value: unknown): string | null {
  const text = shortText(value, 2_000);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Reads optional future `imageMeta` without widening Card or trusting arbitrary data.
 * An external image is never called verified unless its own metadata explicitly says
 * so and includes both license and attribution information.
 */
function readImageMeta(card: Card): {
  source: string | null;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  verifiedAt: string | null;
  explicitlyVerified: boolean;
} {
  const candidate: unknown = card.imageMeta;
  if (!isRecord(candidate)) {
    return { source: null, sourceUrl: null, license: null, attribution: null, verifiedAt: null, explicitlyVerified: false };
  }
  return {
    source: shortText(candidate.source),
    sourceUrl: httpsUrl(candidate.sourceUrl),
    license: shortText(candidate.license),
    attribution: shortText(candidate.attribution),
    verifiedAt: shortText(candidate.verifiedAt, 40),
    explicitlyVerified: candidate.verified === true || candidate.verificationStatus === 'verified',
  };
}

/** Resolve honest portrait provenance for one card. */
export function cardImageRecord(card: Card): CardImageRecord {
  const fallbackKey = `${card.kind}:${card.id}`;
  // Photos shipped with the game (public/portraits) always carry their own licence record.
  if (typeof card.image === 'string' && /^\/portraits\/[a-z0-9-]+\.(jpg|png|webp)$/.test(card.image)) {
    const meta = readImageMeta(card);
    const verified = Boolean(meta.explicitlyVerified && meta.license && meta.attribution && meta.sourceUrl);
    return {
      cardId: card.id, cardName: card.name, kind: 'bundled-licensed', src: card.image, fallbackKey,
      source: meta.source ?? 'Bundled photo', sourceUrl: meta.sourceUrl, license: meta.license, attribution: meta.attribution,
      verifiedAt: verified ? meta.verifiedAt : null, verified, missingAttribution: !meta.attribution,
    };
  }
  const src = httpsUrl(card.image);
  if (!src) {
    return {
      cardId: card.id,
      cardName: card.name,
      kind: 'generated-fallback',
      src: null,
      fallbackKey,
      source: 'Deterministic in-app fallback artwork generated from card identity',
      sourceUrl: null,
      license: null,
      attribution: null,
      verifiedAt: null,
      verified: false,
      missingAttribution: false,
    };
  }

  const meta = readImageMeta(card);
  const verified = Boolean(meta.explicitlyVerified && meta.license && meta.attribution && (meta.sourceUrl || src));
  return {
    cardId: card.id,
    cardName: card.name,
    kind: 'imported-https',
    src,
    fallbackKey,
    source: meta.source ?? 'Imported HTTPS image (source not independently verified)',
    sourceUrl: meta.sourceUrl ?? src,
    license: meta.license,
    attribution: meta.attribution,
    verifiedAt: verified ? meta.verifiedAt : null,
    verified,
    missingAttribution: !meta.attribution,
  };
}

/** Summarize usable portrait coverage without treating generated fallbacks as licensed photos. */
export function auditCardImages(cards: readonly Card[]): CardImageAudit {
  const audit: CardImageAudit = { total: cards.length, verified: 0, imported: 0, fallback: 0, missingAttribution: 0 };
  for (const card of cards) {
    const record = cardImageRecord(card);
    if (record.kind !== 'generated-fallback') audit.imported += 1;
    else audit.fallback += 1;
    if (record.verified) audit.verified += 1;
    if (record.missingAttribution) audit.missingAttribution += 1;
  }
  return audit;
}


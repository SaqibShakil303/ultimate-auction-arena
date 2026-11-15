// Shared domain types — used by the browser client, the real-time server and the tests.

export type Mode = 'football' | 'avengers';
export type RatingMode = 'fc26' | 'fc27' | 'prime';
export type FormationName = '4-3-3' | '4-4-2' | '4-2-3-1' | '4-1-2-1-2' | '3-5-2' | '5-3-2';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type Line = 'GK' | 'DEF' | 'MID' | 'ATT';
export const LINES: Line[] = ['GK', 'DEF', 'MID', 'ATT'];
export type HeroClass = 'Tank' | 'Damage' | 'Mystic' | 'Tech' | 'Controller' | 'Support';
export const HERO_CLASSES: HeroClass[] = ['Tank', 'Damage', 'Mystic', 'Tech', 'Controller', 'Support'];
export type Threat = 'brute' | 'magic' | 'tech' | 'mind' | 'speed' | 'energy';
export const THREATS: Threat[] = ['brute', 'magic', 'tech', 'mind', 'speed', 'energy'];

export const STAT_KEYS = {
  football: ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'],
  gk: ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'],
  hero: ['STR', 'SPD', 'INT', 'DEF', 'PWR', 'TMW'],
} as const;

/** CharacterStats + presentation metadata shared by every AuctionCard. */
interface CardCommon {
  id: string;
  name: string;
  overall: number; // 1–99
  rarity: Rarity;
  stats: number[]; // six values, order given by STAT_KEYS
  trait: string;
  strengths: string[];
  weaknesses: string[];
  clues: string[]; // three progressive Mystery Auction clues
  pack: string;
  image?: string; // optional custom artwork URL; generated art is used when absent or broken
  imageMeta?: {
    source: string; sourceUrl: string | null; license: string; attribution: string;
    verifiedAt: string | null; verified: boolean;
  };
}

export type FootballEdition = 'FC 26' | 'FC 27' | 'Prime Legends';
export type FootballCardType = 'standard' | 'icon' | 'hero' | 'special' | 'custom';
export type RatingVerificationStatus = 'verified' | 'unverified' | 'custom';

/**
 * Provenance attached to every football card returned by the catalog/import pipeline.
 * The properties remain optional on the interface only so the legacy row builder can be
 * adapted without mutating its source table; getCatalog/normalizeCard always materialise them.
 */
export interface RatingProvenance {
  ratingMode: RatingMode;
  edition: FootballEdition;
  cardType: FootballCardType;
  source: string | null;
  verifiedAt: string | null; // ISO YYYY-MM-DD
  verificationStatus: RatingVerificationStatus;
}

export interface FootballCard extends CardCommon {
  kind: 'football';
  line: Line;
  pos: string;
  alt: string[];
  altLines: Line[];
  role: string;
  style: string;
  nation: string;
  club: string;
  era: 'Legend' | 'Modern';
  ratingMode?: RatingMode;
  edition?: FootballEdition;
  cardType?: FootballCardType;
  source?: string | null;
  verifiedAt?: string | null;
  verificationStatus?: RatingVerificationStatus;
  playStyles?: string[];
}

/** Fully materialised football card produced by catalog access and imports. */
export type RatedFootballCard = FootballCard & RatingProvenance & { playStyles: string[] };

export interface HeroCard extends CardCommon {
  kind: 'hero';
  cls: HeroClass;
  role: string;
  ability: string;
  attack: string;
  passive: string;
  weakTo: Threat;
  tags: string[];
}

export type Card = FootballCard | HeroCard;

/** MatchConfiguration */
export interface MatchConfig {
  mode: Mode;
  play: 'local' | 'online';
  ratingMode: RatingMode;
  formation: FormationName | null;
  budget: number;
  squadSize: number;
  auctionType: 'classic' | 'mystery';
  timerSec: number;
  increment: number;
  antiSnipeSec: number;
  rules: 'strict' | 'casual';
  reserve: boolean; // strict mode: keep enough money for remaining minimum-price slots
  shuffle: boolean;
  reauction: boolean; // bring unsold cards back once at a reduced price
  preview: boolean; // show the next card (classic mode only)
  slots: Record<Line, number>; // football formation
  maxPerClass: number; // avengers strict mode
  packs: string[];
  excluded: string[];
  emptyPenalty: number; // points lost per empty squad slot
  completeFirst: boolean; // complete squads always rank above incomplete ones
  seed: number;
}

export interface Owned {
  cardId: string;
  price: number;
  round: number;
}

export interface Participant {
  id: string;
  name: string;
  team: string;
  budget: number;
  squad: Owned[]; // TeamRoster
  lineup: (string | null)[];
  manual: boolean; // lineup arranged by hand
  formation?: FormationName; // per-team tactical choice; omitted in legacy saves
  guessHits: number;
  connected: boolean;
}

export interface BidRecord {
  id: string;
  round: number;
  cardId: string;
  pid: string;
  amount: number;
  at: number;
}

export interface Sale {
  round: number;
  cardId: string;
  pid: string | null;
  price: number;
  pass: number;
  type: 'sold' | 'unsold';
  at: number;
  bidCount: number;
}

/** AuctionRound — the card currently on the block. */
export interface Lot {
  cardId: string;
  opening: number;
  bid: number;
  leader: string | null;
  startedAt: number;
  deadline: number;
  clueStage: number;
  clueEndsAt: number;
  guesses: Record<string, string>;
  correct: string[];
  passed: string[];
  bidIds: string[];
  bidCount: number;
  pass: number;
  uncontested: boolean;
}

export type Phase = 'clue' | 'bidding' | 'result' | 'finished';

/** Full authoritative state. Never sent to clients as-is (see toPublic). */
export interface MatchState {
  config: MatchConfig;
  cards: Record<string, Card>;
  participants: Participant[];
  queue: string[];
  unsold: string[];
  pass: number;
  round: number;
  phase: Phase;
  lot: Lot | null;
  last: Sale | null;
  resumeAt: number;
  paused: boolean;
  pausedAt: number;
  bids: BidRecord[];
  sales: Sale[];
  finishReason: string;
  startedAt: number;
  finishedAt: number;
  version: number;
}

export interface PublicLot {
  cardId: string | null; // null while the identity is hidden in Mystery Auction
  clues: string[];
  clueStage: number;
  clueEndsAt: number;
  opening: number;
  bid: number;
  leader: string | null;
  startedAt: number;
  deadline: number;
  guessed: string[];
  myGuess: string | null;
  correct: string[];
  passed: string[];
  bidCount: number;
  pass: number;
  uncontested: boolean;
}

export interface PublicMatch {
  config: MatchConfig;
  participants: Participant[];
  queueCount: number;
  unsold: string[];
  nextCardId: string | null;
  pass: number;
  round: number;
  phase: Phase;
  lot: PublicLot | null;
  last: Sale | null;
  resumeAt: number;
  paused: boolean;
  pausedAt: number;
  bids: BidRecord[];
  totalBids: number;
  sales: Sale[];
  finishReason: string;
  startedAt: number;
  finishedAt: number;
  version: number;
}

export type Action =
  | { type: 'bid'; pid: string; amount: number; bidId: string }
  | { type: 'pass'; pid: string }
  | { type: 'guess'; pid: string; cardId: string }
  | { type: 'lineup'; pid: string; lineup: (string | null)[] }
  | { type: 'autoLineup'; pid: string }
  | { type: 'formation'; pid: string; formation: FormationName }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'hammer' }
  | { type: 'skipClues' }
  | { type: 'end' };

export const HOST_ACTIONS = ['pause', 'resume', 'hammer', 'skipClues', 'end'];

export type ActResult = { ok: true; dup?: boolean } | { ok: false; code: string; message: string };

export interface BidCtx {
  config: MatchConfig;
  participants: Participant[];
  phase: Phase;
  paused: boolean;
  lot: { cardId: string | null; bid: number; leader: string | null; opening: number; passed: string[] } | null;
}

export interface BidCheck {
  ok: boolean;
  code?: string;
  reason?: string;
  min: number;
  max: number;
}

/** Host card-pool customisation: rating edits and imported cards. */
export interface Custom {
  edits: Record<string, { overall: number; stats: number[] }>;
  imported: unknown[];
}

export interface RoomSettings {
  config: MatchConfig;
  custom: Custom;
}

export interface PublicMember {
  id: string;
  name: string;
  team: string;
  ready: boolean;
  connected: boolean;
}

/** GameRoom as seen by clients. */
export interface PublicRoom {
  code: string;
  hostId: string;
  members: PublicMember[];
  settings: RoomSettings;
  inMatch: boolean;
  poolSize: number;
  errors: string[];
  warnings: string[];
}

export type ClientMsg =
  | { t: 'create'; name: string; team: string; settings: RoomSettings }
  | { t: 'join'; code: string; name: string; team: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; settings: RoomSettings }
  | { t: 'kick'; pid: string }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'rematch' }
  | { t: 'leave' }
  | { t: 'ping'; id: number };

export type ServerMsg =
  | { t: 'joined'; code: string; pid: string; token: string }
  | { t: 'state'; room: PublicRoom; match: PublicMatch | null; now: number }
  | { t: 'catalog'; cards: Card[] }
  | { t: 'reject'; code: string; message: string; bidId?: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'kicked' }
  | { t: 'pong'; id: number; now: number };

// Deterministic preload for the real five-friend Legends auction supplied by the user.
// Ratings in this demo use the project's explicitly custom Prime Legends catalogue;
// purchase ownership and prices are the historical inputs and are never re-scored.

import { createMatch, autoLineup, defaultConfig } from './engine';
import { FOOTBALLERS, LINE_NAME, LINE_OF } from './data/football';
import { rankTeams } from './scoring';
import type { Card, FootballCard, MatchConfig, MatchState, Participant, Sale } from './types';
import { rarityOf, slug } from './util';

const STARTING_BUDGET = 1_000_000;

type Purchase = readonly [name: string, price: number];
type FriendRoster = { readonly name: string; readonly purchases: readonly Purchase[] };

const FRIEND_ROSTERS: readonly FriendRoster[] = [
  {
    name: 'Haarish',
    purchases: [
      ['Alessandro Nesta', 160_000], ['Carles Puyol', 200_000], ['Cafu', 190_000],
      ['Ronald Koeman', 100_000], ['Manuel Neuer', 65_000], ['Roy Keane', 65_000],
      ['Clarence Seedorf', 95_000], ['Paul Scholes', 75_000], ['Erling Haaland', 36_000],
      ['Didier Drogba', 9_000], ["Samuel Eto'o", 5_000],
    ],
  },
  {
    name: 'Farhaan',
    purchases: [
      ['Franz Beckenbauer', 180_000], ['Fabio Cannavaro', 160_000], ['Roberto Carlos', 200_000],
      ['Lilian Thuram', 40_000], ['Iker Casillas', 120_000], ['Toni Kroos', 175_000],
      ['Steven Gerrard', 90_000], ['Sergio Busquets', 10_000], ['Zlatan Ibrahimovic', 10_000],
      ['Karim Benzema', 5_000], ['Marco van Basten', 10_000],
    ],
  },
  {
    name: 'Faizan',
    purchases: [
      ['John Terry', 75_000], ['Nemanja Vidic', 95_000], ['Philipp Lahm', 100_000],
      ['Jaap Stam', 10_000], ['Peter Schmeichel', 5_000], ['Andres Iniesta', 110_000],
      ['Patrick Vieira', 60_000], ['Mesut Ozil', 5_000], ['Lionel Messi', 265_000],
      ['Cristiano Ronaldo', 265_000], ['Wayne Rooney', 10_000],
    ],
  },
  {
    name: 'Imam',
    purchases: [
      ['Rio Ferdinand', 70_000], ['Gerard Pique', 25_000], ['Giorgio Chiellini', 100_000],
      ['Dani Alves', 5_000], ['Gianluigi Buffon', 130_000], ['Zinedine Zidane', 220_000],
      ['Andrea Pirlo', 105_000], ['Frank Lampard', 80_000], ['Ronaldo Nazario', 75_000],
      ['Ronaldinho', 70_000], ['Kylian Mbappe', 50_000],
    ],
  },
  {
    name: 'Saqib',
    purchases: [
      ['Paolo Maldini', 150_000], ['Sergio Ramos', 180_000], ['Virgil van Dijk', 170_000],
      ['Marcel Desailly', 50_000], ['Lev Yashin', 20_000], ['Xavi', 130_000],
      ['Luka Modric', 130_000], ['Michael Ballack', 15_000], ['Thierry Henry', 65_000],
      ['Neymar', 55_000], ['Luis Suarez', 11_000],
    ],
  },
] as const;

/**
 * Nine supplied legends were not present in the original local catalogue. They are
 * deliberately labelled as custom Prime Legends, not as EA FC 26/27 official data.
 */
const EXTRA_PRIME_LEGENDS: FootballCard[] = [
  primeLegend('Ronald Koeman', 'CB', 'CDM', 'Netherlands', 'Barcelona', 89, [75, 88, 91, 80, 88, 84], 'Sweeper Cannon'),
  primeLegend('Roy Keane', 'CDM', 'CM', 'Ireland', 'Manchester United', 88, [70, 72, 82, 78, 90, 92], 'Midfield Enforcer'),
  primeLegend('Lilian Thuram', 'RB', 'CB', 'France', 'Parma', 89, [88, 55, 75, 76, 91, 91], 'Lockdown Full-Back'),
  primeLegend('John Terry', 'CB', '', 'England', 'Chelsea', 88, [62, 58, 70, 64, 92, 91], 'Captain Wall'),
  primeLegend('Jaap Stam', 'CB', '', 'Netherlands', 'Manchester United', 88, [78, 48, 64, 62, 92, 94], 'Unmovable Stopper'),
  primeLegend('Mesut Ozil', 'CAM', 'CM', 'Germany', 'Arsenal', 89, [76, 84, 94, 92, 35, 60], 'Final-Pass Artist'),
  primeLegend('Gerard Pique', 'CB', '', 'Spain', 'Barcelona', 88, [68, 62, 85, 76, 91, 86], 'Ball-Playing Tower'),
  primeLegend('Marcel Desailly', 'CB', 'CDM', 'France', 'Chelsea', 89, [82, 60, 76, 72, 92, 94], 'Defensive Colossus'),
  primeLegend('Michael Ballack', 'CM', 'CAM,CDM', 'Germany', 'Bayern Munich', 89, [78, 88, 88, 82, 82, 90], 'Midfield General'),
];

function primeLegend(
  name: string,
  pos: string,
  alt: string,
  nation: string,
  club: string,
  overall: number,
  stats: number[],
  trait: string,
): FootballCard {
  const line = LINE_OF[pos];
  const alts = alt ? alt.split(',') : [];
  return {
    kind: 'football', id: `f-${slug(name)}`, name, overall, rarity: rarityOf(overall), stats,
    trait, strengths: ['Prime-era impact', 'Elite tactical fit'], weaknesses: ['Custom balance rating'],
    clues: [`${LINE_NAME[line]} (${pos}) from ${nation}`, 'Prime Legends custom game-balance card', `Known as the “${trait}”`],
    pack: 'legends', line, pos, alt: alts,
    altLines: [...new Set(alts.map((value) => LINE_OF[value]).filter((value) => value && value !== line))],
    role: LINE_NAME[line], style: trait, nation, club, era: 'Legend',
  } as FootballCard;
}

/** Accent-, punctuation-, whitespace- and case-insensitive identity key. */
function identityKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function catalogIndex(cards: FootballCard[]): Map<string, FootballCard> {
  const result = new Map<string, FootballCard>();
  for (const card of cards) {
    const key = identityKey(card.name);
    if (result.has(key)) throw new Error(`Duplicate normalized footballer identity: ${card.name}`);
    result.set(key, card);
  }
  return result;
}

function validateDemo(state: MatchState): void {
  const owned = new Set<string>();
  for (const participant of state.participants) {
    if (participant.squad.length !== 11) throw new Error(`${participant.name} must own exactly 11 footballers`);
    const spent = participant.squad.reduce((sum, item) => sum + item.price, 0);
    if (spent > STARTING_BUDGET || participant.budget !== STARTING_BUDGET - spent) {
      throw new Error(`${participant.name} demo budget is inconsistent`);
    }
    if (participant.lineup.length !== 11 || participant.lineup.some((id) => !id)) {
      throw new Error(`${participant.name} could not be placed into the 4-3-3 lineup`);
    }
    for (const item of participant.squad) {
      if (!state.cards[item.cardId]) throw new Error(`Missing demo card: ${item.cardId}`);
      if (owned.has(item.cardId)) throw new Error(`Duplicate demo ownership: ${item.cardId}`);
      owned.add(item.cardId);
    }
  }
  if (owned.size !== 55 || state.sales.length !== 55) throw new Error('Friends Championship must contain exactly 55 unique sales');

  // Exercise the real scoring/ranking path as a construction invariant. The UI derives
  // its champion from this same function; no participant or winner is hardcoded here.
  const ranking = rankTeams(state.participants, state.config, state.cards);
  if (ranking.length !== state.participants.length || ranking[0]?.rank !== 1) {
    throw new Error('Friends Championship ranking could not be calculated');
  }
}

/** Build the completed “LEGENDS AUCTION — FRIENDS CHAMPIONSHIP” local demo. */
export function createFriendsChampionship(now = Date.now()): MatchState {
  const allCards: FootballCard[] = [...FOOTBALLERS, ...EXTRA_PRIME_LEGENDS].map((c) => ({
    ...c, ratingMode: 'prime', edition: 'Prime Legends', cardType: 'custom',
    source: null, verifiedAt: null, verificationStatus: 'custom', playStyles: [],
  }));
  const byName = catalogIndex(allCards);
  const selected: FootballCard[] = [];
  const resolved = FRIEND_ROSTERS.map((roster) => ({
    ...roster,
    cards: roster.purchases.map(([name, price]) => {
      const card = byName.get(identityKey(name));
      if (!card) throw new Error(`Friends Championship player did not resolve: ${name}`);
      selected.push(card);
      return { card, price };
    }),
  }));

  const config = {
    ...defaultConfig('football', STARTING_BUDGET),
    play: 'local', squadSize: 11, slots: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
    shuffle: false, seed: 27,
  } as MatchConfig;

  const state = createMatch(
    config,
    resolved.map((roster) => ({ id: identityKey(roster.name), name: roster.name, team: `Team ${roster.name}` })),
    selected as Card[],
    now - 55_000,
  );

  const sales: Sale[] = [];
  let round = 0;
  for (let rosterIndex = 0; rosterIndex < resolved.length; rosterIndex++) {
    const roster = resolved[rosterIndex];
    const participant = state.participants[rosterIndex] as Participant;
    participant.squad = roster.cards.map(({ card, price }) => {
      round += 1;
      const at = now - (55 - round) * 1_000;
      sales.push({ round, cardId: card.id, pid: participant.id, price, pass: 0, type: 'sold', at, bidCount: 0 });
      return { cardId: card.id, price, round };
    });
    participant.budget = STARTING_BUDGET - participant.squad.reduce((sum, item) => sum + item.price, 0);
    participant.lineup = autoLineup(participant.squad.map((item) => item.cardId), config, state.cards);
    participant.manual = false;
  }

  state.queue = [];
  state.unsold = [];
  state.pass = 0;
  state.round = sales.length;
  state.phase = 'finished';
  state.lot = null;
  state.last = sales.at(-1) ?? null;
  state.resumeAt = 0;
  state.paused = false;
  state.pausedAt = 0;
  state.bids = []; // The supplied history contains sale prices, not individual bids.
  state.sales = sales;
  state.finishReason = 'Every squad is complete — Friends Championship preload';
  state.finishedAt = now;
  state.version = sales.length + 1;

  validateDemo(state);
  return state;
}


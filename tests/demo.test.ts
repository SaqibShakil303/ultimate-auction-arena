import { describe, expect, it } from 'vitest';
import { createFriendsChampionship } from '../shared/demo';
import { rankTeams } from '../shared/scoring';

const EXPECTED: Record<string, Record<string, number>> = {
  Haarish: {
    'Alessandro Nesta': 160_000, 'Carles Puyol': 200_000, Cafu: 190_000,
    'Ronald Koeman': 100_000, 'Manuel Neuer': 65_000, 'Roy Keane': 65_000,
    'Clarence Seedorf': 95_000, 'Paul Scholes': 75_000, 'Erling Haaland': 36_000,
    'Didier Drogba': 9_000, "Samuel Eto'o": 5_000,
  },
  Farhaan: {
    'Franz Beckenbauer': 180_000, 'Fabio Cannavaro': 160_000, 'Roberto Carlos': 200_000,
    'Lilian Thuram': 40_000, 'Iker Casillas': 120_000, 'Toni Kroos': 175_000,
    'Steven Gerrard': 90_000, 'Sergio Busquets': 10_000, 'Zlatan Ibrahimović': 10_000,
    'Karim Benzema': 5_000, 'Marco van Basten': 10_000,
  },
  Faizan: {
    'John Terry': 75_000, 'Nemanja Vidić': 95_000, 'Philipp Lahm': 100_000,
    'Jaap Stam': 10_000, 'Peter Schmeichel': 5_000, 'Andrés Iniesta': 110_000,
    'Patrick Vieira': 60_000, 'Mesut Ozil': 5_000, 'Lionel Messi': 265_000,
    'Cristiano Ronaldo': 265_000, 'Wayne Rooney': 10_000,
  },
  Imam: {
    'Rio Ferdinand': 70_000, 'Gerard Pique': 25_000, 'Giorgio Chiellini': 100_000,
    'Dani Alves': 5_000, 'Gianluigi Buffon': 130_000, 'Zinedine Zidane': 220_000,
    'Andrea Pirlo': 105_000, 'Frank Lampard': 80_000, 'Ronaldo Nazário': 75_000,
    Ronaldinho: 70_000, 'Kylian Mbappé': 50_000,
  },
  Saqib: {
    'Paolo Maldini': 150_000, 'Sergio Ramos': 180_000, 'Virgil van Dijk': 170_000,
    'Marcel Desailly': 50_000, 'Lev Yashin': 20_000, Xavi: 130_000,
    'Luka Modrić': 130_000, 'Michael Ballack': 15_000, 'Thierry Henry': 65_000,
    Neymar: 55_000, 'Luis Suárez': 11_000,
  },
};

describe('Friends Championship preload', () => {
  it('preserves all 55 owners and exact historical prices', () => {
    const state = createFriendsChampionship(2_000_000);
    expect(state.phase).toBe('finished');
    expect(state.finishedAt).toBe(2_000_000);
    expect(state.finishReason).toContain('Friends Championship');
    expect(state.config).toMatchObject({ mode: 'football', play: 'local', budget: 1_000_000, squadSize: 11 });
    expect(state.config.slots).toEqual({ GK: 1, DEF: 4, MID: 3, ATT: 3 });
    expect((state.config as typeof state.config & { ratingMode?: string }).ratingMode).toBe('prime');
    expect(state.participants.map((participant) => participant.name)).toEqual(['Haarish', 'Farhaan', 'Faizan', 'Imam', 'Saqib']);
    expect(state.participants.map((participant) => participant.team)).toEqual(['Team Haarish', 'Team Farhaan', 'Team Faizan', 'Team Imam', 'Team Saqib']);

    const globallyOwned = new Set<string>();
    const remaining = { Haarish: 0, Farhaan: 0, Faizan: 0, Imam: 70_000, Saqib: 24_000 } as const;
    for (const participant of state.participants) {
      expect(participant.squad).toHaveLength(11);
      expect(participant.lineup.filter(Boolean)).toHaveLength(11);
      expect(participant.budget).toBe(remaining[participant.name as keyof typeof remaining]);
      expect(participant.squad.reduce((sum, item) => sum + item.price, 0) + participant.budget).toBe(1_000_000);
      const actual = Object.fromEntries(participant.squad.map((item) => {
        expect(globallyOwned.has(item.cardId)).toBe(false);
        globallyOwned.add(item.cardId);
        return [state.cards[item.cardId].name, item.price];
      }));
      expect(actual).toEqual(EXPECTED[participant.name]);
    }
    expect(globallyOwned.size).toBe(55);
    expect(state.sales).toHaveLength(55);
    expect(state.bids).toHaveLength(0);
    expect(state.sales.map(({ cardId, pid, price, round, type }) => ({ cardId, pid, price, round, type }))).toEqual(
      state.participants.flatMap((participant) => participant.squad.map((item) => ({
        cardId: item.cardId, pid: participant.id, price: item.price, round: item.round, type: 'sold',
      }))),
    );
  });

  it('derives a repeatable championship ranking through the normal scorer', () => {
    const one = createFriendsChampionship(2_000_000);
    const two = createFriendsChampionship(2_000_000);
    const ranking = rankTeams(one.participants, one.config, one.cards);
    const repeated = rankTeams(two.participants, two.config, two.cards);
    expect(ranking.map((row) => ({ rank: row.rank, name: row.p.name, total: row.score.total }))).toEqual(
      repeated.map((row) => ({ rank: row.rank, name: row.p.name, total: row.score.total })),
    );
    expect(ranking).toHaveLength(5);
    expect(ranking[0].rank).toBe(1);
    expect(ranking.every((row) => row.score.complete && row.score.filled === 11)).toBe(true);
  });
});

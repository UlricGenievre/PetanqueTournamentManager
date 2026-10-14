import { effectiveScores, matchPoints } from './scoring';
import type { Team, Tournament } from './types';

export interface StandingRow {
  team: Team;
  /** Rang ; les équipes à égalité parfaite (PG, PR et différence) partagent le même rang. */
  rank: number;
  played: number;
  /** Points gagnés (barème). */
  pg: number;
  /** Points réalisés (somme des scores marqués). */
  pr: number;
  /** Points encaissés. */
  pc: number;
  diff: number;
}

/**
 * Classement après les parties 1 à `upToRound` (toutes par défaut).
 * Ordre : points gagnés, puis points réalisés, puis différence, comme le tableau Excel historique.
 */
export function computeStandings(tournament: Tournament, upToRound = Infinity): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    tournament.teams.map((team) => [team.id, { team, rank: 0, played: 0, pg: 0, pr: 0, pc: 0, diff: 0 }]),
  );

  const add = (teamId: string, scoreFor: number, scoreAgainst: number, points: number) => {
    const row = rows.get(teamId);
    if (!row) return;
    row.played += 1;
    row.pg += points;
    row.pr += scoreFor;
    row.pc += scoreAgainst;
    row.diff += scoreFor - scoreAgainst;
  };

  for (const round of tournament.rounds) {
    if (round.number > upToRound) continue;
    for (const match of round.matches) {
      const scores = effectiveScores(match, tournament.settings);
      if (!scores) continue;
      const [a, b] = scores;
      const [pa, pb] = matchPoints(a, b, tournament.settings.scoring);
      add(match.teamA, a, b, pa);
      if (match.teamB !== null) add(match.teamB, b, a, pb);
    }
  }

  const sorted = [...rows.values()].sort(
    (x, y) => y.pg - x.pg || y.pr - x.pr || y.diff - x.diff || x.team.number - y.team.number,
  );
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    row.rank = prev && prev.pg === row.pg && prev.pr === row.pr && prev.diff === row.diff ? prev.rank : i + 1;
  });
  return sorted;
}

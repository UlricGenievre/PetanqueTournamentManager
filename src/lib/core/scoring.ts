import type { Match, Settings, ScoringSettings } from './types';

/** Barème des 12 Heures de Montesquieu : 10 points répartis selon l'écart de score. */
export const DEFAULT_SCORING: ScoringSettings = {
  total: 10,
  table: [5, 6, 7, 7, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10],
};

/** Points gagnés par chaque équipe pour un score donné. */
export function matchPoints(scoreA: number, scoreB: number, scoring: ScoringSettings): [number, number] {
  const diff = Math.abs(scoreA - scoreB);
  const winner = scoring.table[Math.min(diff, scoring.table.length - 1)];
  const loser = scoring.total - winner;
  return scoreA >= scoreB ? [winner, loser] : [loser, winner];
}

/** Scores effectifs d'un match : score forfaitaire pour un exempt, `null` si non encore saisi. */
export function effectiveScores(match: Match, settings: Settings): [number, number] | null {
  if (match.teamB === null) return [settings.bye.scoreFor, settings.bye.scoreAgainst];
  if (match.scoreA === null || match.scoreB === null) return null;
  return [match.scoreA, match.scoreB];
}

export function isPlayed(match: Match, settings: Settings): boolean {
  return effectiveScores(match, settings) !== null;
}

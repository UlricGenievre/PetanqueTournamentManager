/**
 * Terrains du tournoi, numérotés de 1 à n et partagés entre les parties, qui s'enchaînent
 * sans attendre la fin de la précédente. Au tirage, les rencontres reçoivent les terrains
 * libres, les autres attendent ; un terrain se libère quand le score de la rencontre qui
 * l'occupe est saisi (ou quand on le donne à la main à une autre rencontre) et passe alors
 * à la rencontre suivante dont les deux équipes ont fini leurs parties précédentes.
 */
import type { Match, Round, Tournament } from './types';

const isScored = (m: Match) => m.scoreA !== null && m.scoreB !== null;

/** Rencontre en cours sur son terrain : terrain attribué, score pas encore saisi. */
export function occupiesCourt(m: Match): boolean {
  return m.teamB !== null && m.court != null && !m.courtFreed && !isScored(m);
}

/** Rencontre qui attend un terrain. */
export function isWaiting(m: Match): boolean {
  return m.teamB !== null && m.court == null && !isScored(m);
}

/** Rencontre jouée (score saisi, ou terrain déjà rendu) ou exempte. */
function isFinished(m: Match): boolean {
  return m.teamB === null || isScored(m) || !!m.courtFreed;
}

/** Équipes qui n'ont pas fini une rencontre de chaque partie. */
function busyTeamsByRound(t: Tournament): Map<number, Set<string>> {
  const result = new Map<number, Set<string>>();
  for (const round of t.rounds) {
    const busy = new Set<string>();
    for (const m of round.matches) if (!isFinished(m)) busy.add(m.teamA).add(m.teamB!);
    result.set(round.number, busy);
  }
  return result;
}

/** Les deux équipes ont fini leurs rencontres des parties précédentes. */
export function teamsReady(t: Tournament, round: Round, m: Match): boolean {
  const busy = busyTeamsByRound(t);
  return t.rounds.every((r) => r.number >= round.number || ![m.teamA, m.teamB].some((id) => id && busy.get(r.number)!.has(id)));
}

function busyCourts(t: Tournament): Set<number> {
  return new Set(t.rounds.flatMap((r) => r.matches.filter(occupiesCourt).map((m) => m.court!)));
}

/** Terrains libres ; sans nombre de terrains réglé, il n'y a pas de liste à afficher. */
export function freeCourts(t: Tournament): number[] {
  const n = t.settings.courtCount;
  if (n == null) return [];
  const busy = busyCourts(t);
  return Array.from({ length: n }, (_, i) => i + 1).filter((c) => !busy.has(c));
}

/**
 * Donne les terrains libres aux rencontres en attente dont les équipes sont prêtes,
 * partie par partie puis dans l'ordre des rencontres. Sans nombre de terrains réglé,
 * chaque rencontre prête reçoit le plus petit numéro libre.
 */
export function assignCourts(t: Tournament): void {
  const limit = t.settings.courtCount ?? Infinity;
  const busy = busyCourts(t);
  const busyTeams = busyTeamsByRound(t);
  let next = 1;
  const takeCourt = () => {
    while (busy.has(next)) next++;
    if (next > limit) return null;
    busy.add(next);
    return next;
  };
  const rounds = [...t.rounds].sort((a, b) => a.number - b.number);
  for (const round of rounds) {
    const earlier = rounds.filter((r) => r.number < round.number).map((r) => busyTeams.get(r.number)!);
    for (const m of round.matches) {
      if (!isWaiting(m) || earlier.some((busy) => busy.has(m.teamA) || busy.has(m.teamB!))) continue;
      const court = takeCourt();
      if (court === null) return;
      m.court = court;
    }
  }
}

/** Terrains où une rencontre de `round` est en cours en même temps qu'une autre rencontre. */
export function courtConflicts(t: Tournament, round: Round): number[] {
  const counts = new Map<number, number>();
  for (const r of t.rounds) for (const m of r.matches) if (occupiesCourt(m)) counts.set(m.court!, (counts.get(m.court!) ?? 0) + 1);
  const mine = new Set(round.matches.filter(occupiesCourt).map((m) => m.court!));
  return [...mine].filter((c) => counts.get(c)! > 1).sort((a, b) => a - b);
}

/** Rencontres en cours que l'attribution du terrain `court` à `match` considère comme terminées. */
export function displacedBy(t: Tournament, match: Match, court: number | null): Match[] {
  if (court === null || match.teamB === null || isScored(match)) return [];
  return t.rounds.flatMap((r) => r.matches.filter((m) => m !== match && m.court === court && occupiesCourt(m)));
}

/** Attribue à la main le terrain `court` à `match` (ou le retire avec `null`). */
export function setCourt(t: Tournament, match: Match, court: number | null): void {
  for (const other of displacedBy(t, match, court)) other.courtFreed = true;
  match.court = court;
  delete match.courtFreed;
}

/** Sauvegardes d'avant la gestion des terrains : l'ordre des rencontres donnait le terrain. */
export function migrateCourts(rounds: Round[]): void {
  for (const round of rounds) {
    if (round.matches.some((m) => 'court' in m)) continue;
    let next = 1;
    for (const m of round.matches) m.court = m.teamB === null ? null : next++;
  }
}

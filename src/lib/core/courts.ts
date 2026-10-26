/**
 * Terrains du tournoi, numérotés de 1 à n et partagés entre les parties, qui s'enchaînent
 * sans attendre la fin de la précédente. Au tirage, les rencontres reçoivent les terrains
 * libres, les autres attendent ; un terrain se libère quand le score de la rencontre qui
 * l'occupe est saisi (ou quand on le donne à la main à une autre rencontre) et passe alors
 * à la rencontre suivante dont les deux équipes ont fini leurs parties précédentes.
 * Un terrain neutralisé à partir d'une partie n'est plus donné aux rencontres de cette
 * partie et des suivantes ; la rencontre qui l'occupe va jusqu'au bout.
 */
import type { Match, Round, Settings, Tournament } from './types';

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

/** Le terrain existe et n'est pas neutralisé pour les rencontres de la partie `roundNumber`. */
export function isCourtOpen(settings: Settings, court: number, roundNumber: number): boolean {
  if (court < 1 || (settings.courtCount != null && court > settings.courtCount)) return false;
  return !(settings.closedCourts ?? []).some((c) => roundNumber >= c.fromRound && c.courts.includes(court));
}

/** Terrains libres pour la partie `roundNumber` ; sans nombre de terrains réglé, il n'y a pas de liste à afficher. */
export function freeCourts(t: Tournament, roundNumber: number): number[] {
  const n = t.settings.courtCount;
  if (n == null) return [];
  const busy = busyCourts(t);
  return Array.from({ length: n }, (_, i) => i + 1).filter((c) => !busy.has(c) && isCourtOpen(t.settings, c, roundNumber));
}

/**
 * Donne les terrains libres aux rencontres en attente dont les équipes sont prêtes,
 * partie par partie puis dans l'ordre des rencontres. Chaque rencontre prête reçoit le
 * plus petit numéro libre et ouvert pour sa partie. À rappeler après toute modification
 * (score, tirage, terrain donné à la main, nombre de terrains, neutralisations).
 */
export function assignCourts(t: Tournament): void {
  const limit = t.settings.courtCount ?? Infinity;
  const busy = busyCourts(t);
  const busyTeams = busyTeamsByRound(t);
  const takeCourt = (roundNumber: number) => {
    for (let c = 1; c <= limit; c++) {
      if (busy.has(c) || !isCourtOpen(t.settings, c, roundNumber)) continue;
      busy.add(c);
      return c;
    }
    return null;
  };
  const rounds = [...t.rounds].sort((a, b) => a.number - b.number);
  for (const round of rounds) {
    const earlier = rounds.filter((r) => r.number < round.number).map((r) => busyTeams.get(r.number)!);
    for (const m of round.matches) {
      if (!isWaiting(m) || earlier.some((busy) => busy.has(m.teamA) || busy.has(m.teamB!))) continue;
      const court = takeCourt(round.number);
      // Une partie suivante n'a pas plus de terrains ouverts : les neutralisations ne font que s'ajouter.
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

/** Terrains neutralisés (ou au-delà du nombre de terrains) où une rencontre de `round` est en cours. */
export function closedCourtsInUse(t: Tournament, round: Round): number[] {
  const courts = round.matches.filter((m) => occupiesCourt(m) && !isCourtOpen(t.settings, m.court!, round.number)).map((m) => m.court!);
  return [...new Set(courts)].sort((a, b) => a - b);
}

/** Première partie à partir de laquelle le terrain est neutralisé, ou `null`. */
export function closedFrom(settings: Settings, court: number): number | null {
  const rounds = (settings.closedCourts ?? []).filter((c) => c.courts.includes(court)).map((c) => c.fromRound);
  return rounds.length ? Math.min(...rounds) : null;
}

export interface CourtStatus {
  court: number;
  /** Rencontres en cours sur ce terrain, avec leur partie (plusieurs : conflit). */
  playing: { match: Match; round: number }[];
  /** Le terrain peut être donné aux rencontres de la dernière partie tirée. */
  open: boolean;
  closedFrom: number | null;
}

/**
 * État de chaque terrain, vu depuis la dernière partie tirée. Sans nombre de terrains réglé,
 * on montre les terrains jusqu'au plus grand numéro utilisé ou neutralisé ; un terrain au-delà
 * du nombre réglé n'apparaît que s'il est encore occupé.
 */
export function courtBoard(t: Tournament): CourtStatus[] {
  const current = Math.max(1, ...t.rounds.map((r) => r.number));
  const playing = new Map<number, CourtStatus['playing']>();
  for (const r of [...t.rounds].sort((a, b) => a.number - b.number)) {
    for (const m of r.matches.filter(occupiesCourt)) playing.set(m.court!, [...(playing.get(m.court!) ?? []), { match: m, round: r.number }]);
  }
  const closed = (t.settings.closedCourts ?? []).flatMap((c) => c.courts);
  const last = Math.max(t.settings.courtCount ?? Math.max(0, ...closed), ...playing.keys());
  return Array.from({ length: last }, (_, i) => i + 1).map((court) => ({
    court,
    playing: playing.get(court) ?? [],
    open: isCourtOpen(t.settings, court, current),
    closedFrom: closedFrom(t.settings, court),
  }));
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

/** « 4, 9, 12-14 » → [4, 9, 12, 13, 14] ; les numéros hors de 1 à 99 sont ignorés. */
export function parseCourtList(text: string): number[] {
  const courts = new Set<number>();
  for (const part of text.replace(/\s*-\s*/g, '-').split(/[\s,;]+/)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
    for (let c = Math.max(1, Math.min(a, b)); c <= Math.min(99, Math.max(a, b)); c++) courts.add(c);
  }
  return [...courts].sort((a, b) => a - b);
}

/** [4, 9, 12, 13, 14] → « 4, 9, 12-14 ». */
export function formatCourtList(courts: number[]): string {
  const parts: string[] = [];
  const sorted = [...courts].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return parts.join(', ');
}

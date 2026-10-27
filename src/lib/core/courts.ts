/**
 * Terrains du tournoi, numérotés de 1 à n et partagés entre les parties, qui s'enchaînent
 * sans attendre la fin de la précédente. Au tirage, les rencontres reçoivent les terrains
 * libres, les autres attendent ; un terrain se libère quand le score de la rencontre qui
 * l'occupe est saisi (ou quand on le donne à la main à une autre rencontre) et passe alors
 * à la rencontre suivante dont les deux équipes ont fini leurs parties précédentes.
 * Parties synchronisées (`syncRounds`) : chaque partie démarre quand la précédente est finie,
 * les terrains ne sont partagés qu'entre les rencontres d'une même partie et sont donnés dès
 * le tirage ; s'il en manque, les rencontres restantes attendent un terrain de leur partie.
 * Un terrain neutralisé pour des parties n'est pas donné aux rencontres de ces parties ;
 * la rencontre qui l'occupe va jusqu'au bout.
 */
import type { CourtClosure, Match, Round, Settings, Tournament } from './types';

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

/** Rencontres qui se disputent les terrains avec celles de `round` : toutes, ou celles de sa partie si les parties sont synchronisées. */
function rivalRounds(t: Tournament, round: Round | number): Round[] {
  const n = typeof round === 'number' ? round : round.number;
  return t.settings.syncRounds ? t.rounds.filter((r) => r.number === n) : t.rounds;
}

function busyCourts(t: Tournament, roundNumber: number): Set<number> {
  return new Set(rivalRounds(t, roundNumber).flatMap((r) => r.matches.filter(occupiesCourt).map((m) => m.court!)));
}

/** Le terrain existe et n'est pas neutralisé pour les rencontres de la partie `roundNumber`. */
export function isCourtOpen(settings: Settings, court: number, roundNumber: number): boolean {
  if (court < 1 || court > settings.courtCount) return false;
  return !(settings.closedCourts ?? []).some((c) => coversRound(c, roundNumber) && c.courts.includes(court));
}

function coversRound(c: CourtClosure, roundNumber: number): boolean {
  return roundNumber >= c.fromRound && (c.toRound == null || roundNumber <= c.toRound);
}

/** Terrains libres pour la partie `roundNumber`. */
export function freeCourts(t: Tournament, roundNumber: number): number[] {
  const busy = busyCourts(t, roundNumber);
  return Array.from({ length: t.settings.courtCount }, (_, i) => i + 1).filter((c) => !busy.has(c) && isCourtOpen(t.settings, c, roundNumber));
}

/**
 * Donne les terrains libres aux rencontres en attente dont les équipes sont prêtes (toutes si
 * les parties sont synchronisées), partie par partie puis dans l'ordre des rencontres. Chaque
 * rencontre reçoit le plus petit numéro libre et ouvert pour sa partie. À rappeler après toute
 * modification (score, tirage, terrain donné à la main, nombre de terrains, neutralisations, mode).
 */
export function assignCourts(t: Tournament): void {
  const sync = !!t.settings.syncRounds;
  let busy = new Set<number>();
  const busyTeams = busyTeamsByRound(t);
  const takeCourt = (roundNumber: number) => {
    for (let c = 1; c <= t.settings.courtCount; c++) {
      if (busy.has(c) || !isCourtOpen(t.settings, c, roundNumber)) continue;
      busy.add(c);
      return c;
    }
    return null;
  };
  const rounds = [...t.rounds].sort((a, b) => a.number - b.number);
  for (const round of rounds) {
    if (sync || round === rounds[0]) busy = busyCourts(t, round.number);
    const earlier = sync ? [] : rounds.filter((r) => r.number < round.number).map((r) => busyTeams.get(r.number)!);
    for (const m of round.matches) {
      if (!isWaiting(m) || earlier.some((busy) => busy.has(m.teamA) || busy.has(m.teamB!))) continue;
      const court = takeCourt(round.number);
      // Plus de terrain pour cette partie ; une partie suivante peut en avoir un dont la neutralisation est finie.
      if (court === null) break;
      m.court = court;
    }
  }
}

/** Terrains où une rencontre de `round` est en cours en même temps qu'une autre rencontre (de sa partie, si synchronisées). */
export function courtConflicts(t: Tournament, round: Round): number[] {
  const counts = new Map<number, number>();
  for (const r of rivalRounds(t, round)) for (const m of r.matches) if (occupiesCourt(m)) counts.set(m.court!, (counts.get(m.court!) ?? 0) + 1);
  const mine = new Set(round.matches.filter(occupiesCourt).map((m) => m.court!));
  return [...mine].filter((c) => counts.get(c)! > 1).sort((a, b) => a - b);
}

/** Terrains neutralisés (ou au-delà du nombre de terrains) où une rencontre de `round` est en cours. */
export function closedCourtsInUse(t: Tournament, round: Round): number[] {
  const courts = round.matches.filter((m) => occupiesCourt(m) && !isCourtOpen(t.settings, m.court!, round.number)).map((m) => m.court!);
  return [...new Set(courts)].sort((a, b) => a - b);
}

/**
 * Neutralisation du terrain qui couvre la partie `roundNumber` (la plus longue s'il y en a
 * plusieurs), sinon la prochaine à venir, ou `null`.
 */
export function closureOf(settings: Settings, court: number, roundNumber: number): CourtClosure | null {
  const mine = (settings.closedCourts ?? []).filter((c) => c.courts.includes(court));
  const end = (c: CourtClosure) => c.toRound ?? Infinity;
  const current = mine.filter((c) => coversRound(c, roundNumber)).sort((a, b) => end(b) - end(a));
  const next = mine.filter((c) => c.fromRound > roundNumber).sort((a, b) => a.fromRound - b.fromRound);
  return current[0] ?? next[0] ?? null;
}

export interface CourtStatus {
  court: number;
  /**
   * Rencontres en cours sur ce terrain, avec leur partie, la plus ancienne en premier. Vue de
   * toutes les parties synchronisées : celles des parties suivantes sont à jouer ensuite.
   */
  playing: { match: Match; round: number }[];
  /** Vue d'une seule partie : ses rencontres déjà jouées sur ce terrain. */
  played: Match[];
  /** Plusieurs rencontres en cours en même temps sur ce terrain (de la même partie, si synchronisées). */
  conflict: boolean;
  /** Le terrain peut être donné aux rencontres de la partie vue (par défaut, la dernière tirée). */
  open: boolean;
  /** Neutralisation en cours, ou à venir si le terrain est ouvert ; `null` pour un terrain au-delà du nombre réglé. */
  closure: CourtClosure | null;
}

/**
 * État de chaque terrain, vu depuis la partie `roundNumber` : seules ses rencontres, jouées ou
 * en cours. Sans partie, vu depuis la dernière tirée, avec les rencontres en cours de toutes les
 * parties. Un terrain au-delà du nombre réglé n'apparaît que s'il sert encore (ou a servi à la partie vue).
 */
export function courtBoard(t: Tournament, roundNumber?: number): CourtStatus[] {
  const current = roundNumber ?? Math.max(1, ...t.rounds.map((r) => r.number));
  const rounds = roundNumber === undefined ? t.rounds : t.rounds.filter((r) => r.number === roundNumber);
  const playing = new Map<number, CourtStatus['playing']>();
  const played = new Map<number, Match[]>();
  for (const r of [...rounds].sort((a, b) => a.number - b.number)) {
    for (const m of r.matches.filter(occupiesCourt)) playing.set(m.court!, [...(playing.get(m.court!) ?? []), { match: m, round: r.number }]);
    if (roundNumber !== undefined) {
      for (const m of r.matches.filter((m) => m.teamB !== null && m.court != null && !occupiesCourt(m))) played.set(m.court!, [...(played.get(m.court!) ?? []), m]);
    }
  }
  const last = Math.max(t.settings.courtCount, ...playing.keys(), ...played.keys());
  return Array.from({ length: last }, (_, i) => i + 1).map((court) => {
    const open = isCourtOpen(t.settings, court, current);
    const closure = closureOf(t.settings, court, current);
    // Fermé sans neutralisation en cours : au-delà du nombre de terrains.
    const here = playing.get(court) ?? [];
    const conflict = t.settings.syncRounds ? new Set(here.map((p) => p.round)).size < here.length : here.length > 1;
    return { court, playing: here, played: played.get(court) ?? [], conflict, open, closure: open || (closure && closure.fromRound <= current) ? closure : null };
  });
}

/** Rencontres en cours que l'attribution du terrain `court` à `match` considère comme terminées. */
export function displacedBy(t: Tournament, match: Match, court: number | null): Match[] {
  if (court === null || match.teamB === null || isScored(match)) return [];
  const round = t.rounds.find((r) => r.matches.includes(match));
  return rivalRounds(t, round ?? 0).flatMap((r) => r.matches.filter((m) => m !== match && m.court === court && occupiesCourt(m)));
}

/**
 * Change de mode. Parties synchronisées, aucune rencontre n'a commencé tant que la partie
 * précédente n'est pas finie : en les quittant, ces rencontres rendent leur terrain, qui est
 * redonné en servant d'abord les parties précédentes.
 */
export function setSyncRounds(t: Tournament, sync: boolean): void {
  t.settings.syncRounds = sync;
  if (!sync) {
    let earlierUnfinished = false;
    for (const round of [...t.rounds].sort((a, b) => a.number - b.number)) {
      if (earlierUnfinished) for (const m of round.matches.filter(occupiesCourt)) m.court = null;
      earlierUnfinished ||= round.matches.some((m) => !isFinished(m));
    }
  }
  assignCourts(t);
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

import { newId } from './ids';
import type { Match, Round, Team, Tournament } from './types';

/**
 * Normalise un nom de club : « St. Oriel du Pré 2 » et « ST ORIEL DU PRE » sont le même club.
 * Ignore la casse, les accents, la ponctuation et un éventuel numéro d'équipe final.
 */
export function normalizeClub(club: string): string {
  return club
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/ \d+$/, '');
}

export function sameClub(a: Team, b: Team): boolean {
  const ca = normalizeClub(a.club);
  return ca !== '' && ca === normalizeClub(b.club);
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Rencontres déjà jouées (ou prévues) dans les parties autres que `exceptRound`. */
export function meetings(tournament: Tournament, exceptRound?: number): Set<string> {
  const set = new Set<string>();
  for (const round of tournament.rounds) {
    if (round.number === exceptRound) continue;
    for (const m of round.matches) if (m.teamB !== null) set.add(pairKey(m.teamA, m.teamB));
  }
  return set;
}

/** Nombre de fois où chaque équipe a été exempte, hors partie `exceptRound`. */
function byeCounts(tournament: Tournament, exceptRound?: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const round of tournament.rounds) {
    if (round.number === exceptRound) continue;
    for (const m of round.matches) if (m.teamB === null) counts.set(m.teamA, (counts.get(m.teamA) ?? 0) + 1);
  }
  return counts;
}

export type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Apparie toutes les équipes de `ids` deux à deux en respectant `allowed`.
 * Recherche avec retour arrière, en traitant d'abord l'équipe la plus contrainte.
 */
function pairUp(ids: string[], allowed: (a: string, b: string) => boolean, rng: Rng, budget: { left: number }) {
  const solve = (remaining: string[]): [string, string][] | null => {
    if (remaining.length === 0) return [];
    if (--budget.left < 0) return null;

    let best: string | null = null;
    let bestOptions: string[] = [];
    for (const id of shuffle(remaining, rng)) {
      const options = remaining.filter((o) => o !== id && allowed(id, o));
      if (best === null || options.length < bestOptions.length) {
        best = id;
        bestOptions = options;
        if (options.length === 0) return null;
      }
    }
    for (const partner of shuffle(bestOptions, rng)) {
      const rest = remaining.filter((id) => id !== best && id !== partner);
      const sub = solve(rest);
      if (sub) return [[best!, partner], ...sub];
    }
    return null;
  };
  return solve(ids);
}

/** Niveau de contraintes finalement respecté par un tirage. */
export type DrawLevel = 'strict' | 'rematch-allowed' | 'same-club-allowed' | 'unconstrained';

export interface DrawResult {
  matches: Match[];
  level: DrawLevel;
}

/**
 * Tire au sort les rencontres de la partie `roundNumber`.
 * Contraintes : pas deux équipes du même club, pas de rencontre déjà jouée.
 * Si le nombre d'équipes est impair, une équipe (parmi les moins souvent exemptées) est exempte.
 * Si aucun tirage strict n'existe, les contraintes sont relâchées progressivement (`level` l'indique).
 */
export function drawRound(tournament: Tournament, roundNumber: number, rng: Rng = Math.random): DrawResult {
  const teams = new Map(tournament.teams.map((t) => [t.id, t]));
  const met = meetings(tournament, roundNumber);
  const ids = tournament.teams.map((t) => t.id);

  let byeCandidates: (string | null)[] = [null];
  if (ids.length % 2 === 1) {
    const counts = byeCounts(tournament, roundNumber);
    const min = Math.min(...ids.map((id) => counts.get(id) ?? 0));
    byeCandidates = shuffle(ids.filter((id) => (counts.get(id) ?? 0) === min), rng);
  }

  const levels: [DrawLevel, (a: string, b: string) => boolean][] = [
    ['strict', (a, b) => !met.has(pairKey(a, b)) && !sameClub(teams.get(a)!, teams.get(b)!)],
    ['rematch-allowed', (a, b) => !sameClub(teams.get(a)!, teams.get(b)!)],
    ['same-club-allowed', (a, b) => !met.has(pairKey(a, b))],
    ['unconstrained', () => true],
  ];

  for (const [level, allowed] of levels) {
    for (const bye of byeCandidates) {
      const pool = ids.filter((id) => id !== bye);
      const pairs = pairUp(pool, allowed, rng, { left: 20000 });
      if (!pairs) continue;
      const matches: Match[] = pairs.map(([a, b]) => ({ id: newId(), teamA: a, teamB: b, scoreA: null, scoreB: null }));
      if (bye !== null) matches.push({ id: newId(), teamA: bye, teamB: null, scoreA: null, scoreB: null });
      return { matches, level };
    }
  }
  throw new Error('Tirage impossible');
}

export type IssueKind = 'duplicate' | 'missing' | 'same-club' | 'rematch' | 'multiple-byes';

export interface RoundIssue {
  kind: IssueKind;
  teamIds: string[];
  matchId?: string;
}

/** Contrôle une partie (tirage modifié à la main) : doublons, absents, même club, revanches. */
export function validateRound(tournament: Tournament, round: Round): RoundIssue[] {
  const issues: RoundIssue[] = [];
  const teams = new Map(tournament.teams.map((t) => [t.id, t]));
  const met = meetings(tournament, round.number);
  const seen = new Map<string, number>();
  let byes = 0;

  for (const m of round.matches) {
    for (const id of [m.teamA, m.teamB]) if (id !== null) seen.set(id, (seen.get(id) ?? 0) + 1);
    if (m.teamB === null) {
      byes++;
      continue;
    }
    const a = teams.get(m.teamA);
    const b = teams.get(m.teamB);
    if (a && b && sameClub(a, b)) issues.push({ kind: 'same-club', teamIds: [a.id, b.id], matchId: m.id });
    if (met.has(pairKey(m.teamA, m.teamB))) issues.push({ kind: 'rematch', teamIds: [m.teamA, m.teamB], matchId: m.id });
  }

  const duplicates = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicates.length) issues.push({ kind: 'duplicate', teamIds: duplicates });
  const missing = tournament.teams.filter((t) => !seen.has(t.id)).map((t) => t.id);
  if (missing.length) issues.push({ kind: 'missing', teamIds: missing });
  if (byes > 1) issues.push({ kind: 'multiple-byes', teamIds: round.matches.filter((m) => m.teamB === null).map((m) => m.teamA) });
  return issues;
}

import { newId } from './ids';
import { computeStandings } from './standings';
import type { Match, PairingMode, Round, Team, Tournament } from './types';

/** Normalise un libellé saisi à la main : ignore la casse, les accents et la ponctuation. */
function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Normalise un nom de club : « St. Oriel du Pré 2 » et « ST ORIEL DU PRE » sont le même club.
 * Ignore aussi un éventuel numéro d'équipe final.
 */
export function normalizeClub(club: string): string {
  return normalizeLabel(club).replace(/ \d+$/, '');
}

export function normalizeSector(sector: string | undefined): string {
  return normalizeLabel(sector ?? '');
}

export function sameClub(a: Team, b: Team): boolean {
  const ca = normalizeClub(a.club);
  return ca !== '' && ca === normalizeClub(b.club);
}

export function sameSector(a: Team, b: Team): boolean {
  const sa = normalizeSector(a.sector);
  return sa !== '' && sa === normalizeSector(b.sector);
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

/**
 * Apparie les équipes de `order` (classées de la première à la dernière) en respectant `allowed` :
 * la première affronte la mieux classée des équipes possibles, et ainsi de suite (1er contre 2e,
 * ou 3e, 4e… si les contraintes l'imposent). Un adversaire n'est choisi que si les équipes
 * restantes peuvent encore toutes être appariées : la première équipe prend l'adversaire le mieux
 * classé possible, puis la suivante, etc.
 */
function pairByRank(order: string[], isAllowed: (a: string, b: string) => boolean, budget: { left: number }) {
  const ok = new Set<string>();
  for (const a of order) for (const b of order) if (a < b && isAllowed(a, b)) ok.add(pairKey(a, b));
  const allowed = (a: string, b: string) => ok.has(pairKey(a, b));
  const solve = (remaining: string[]): [string, string][] | null => {
    if (remaining.length === 0) return [];
    if (--budget.left < 0) return null;
    // Élagage : une équipe sans adversaire possible rend la branche sans issue.
    for (const id of remaining) if (!remaining.some((o) => o !== id && allowed(id, o))) return null;

    const [first, ...others] = remaining;
    for (const partner of others) {
      if (!allowed(first, partner)) continue;
      const sub = solve(others.filter((id) => id !== partner));
      if (sub) return [[first, partner], ...sub];
      if (budget.left < 0) return null;
    }
    return null;
  };
  return solve(order);
}

/**
 * Équipes de la mieux classée à la moins bien classée d'après les parties précédant `roundNumber`
 * (scores saisis au moment du tirage). Les équipes à égalité parfaite sont mélangées au hasard :
 * avant la première partie, l'ordre est donc entièrement tiré au sort.
 */
export function rankingOrder(tournament: Tournament, roundNumber: number, rng: Rng = Math.random): string[] {
  const rows = computeStandings(tournament, roundNumber - 1);
  const groups = new Map<number, string[]>();
  for (const row of rows) groups.set(row.rank, [...(groups.get(row.rank) ?? []), row.team.id]);
  return [...groups.keys()].sort((a, b) => a - b).flatMap((rank) => shuffle(groups.get(rank)!, rng));
}

/** Niveau de contraintes finalement respecté par un tirage. */
export type DrawLevel =
  | 'strict'
  | 'same-sector-allowed'
  | 'rematch-allowed'
  | 'rematch-and-same-sector-allowed'
  | 'same-club-allowed'
  | 'unconstrained';

export interface DrawResult {
  matches: Match[];
  level: DrawLevel;
}

/**
 * Établit les rencontres de la partie `roundNumber`.
 * `mode` : `'random'` tire les rencontres au sort ; `'ranking'` les établit selon le classement au
 * moment du tirage (1er contre 2e, 3e contre 4e… en sautant les adversaires interdits).
 * Contraintes : pas deux équipes du même club, pas de rencontre déjà jouée, pas deux équipes du même secteur.
 * Si le nombre d'équipes est impair, une équipe (parmi les moins souvent exemptées) est exempte :
 * au hasard, ou la moins bien classée selon le classement.
 * Si aucun tirage strict n'existe, les contraintes sont relâchées progressivement (`level` l'indique) :
 * le secteur d'abord, puis les revanches, puis le club (le secteur n'est plus vérifié une fois le club relâché).
 */
export function drawRound(tournament: Tournament, roundNumber: number, rng: Rng = Math.random, mode: PairingMode = 'random'): DrawResult {
  const teams = new Map(tournament.teams.map((t) => [t.id, t]));
  const met = meetings(tournament, roundNumber);
  const ids = mode === 'ranking' ? rankingOrder(tournament, roundNumber, rng) : tournament.teams.map((t) => t.id);

  let byeCandidates: (string | null)[] = [null];
  if (ids.length % 2 === 1) {
    const counts = byeCounts(tournament, roundNumber);
    const min = Math.min(...ids.map((id) => counts.get(id) ?? 0));
    const eligible = ids.filter((id) => (counts.get(id) ?? 0) === min);
    byeCandidates = mode === 'ranking' ? eligible.reverse() : shuffle(eligible, rng);
  }

  const rematch = (a: string, b: string) => met.has(pairKey(a, b));
  const club = (a: string, b: string) => sameClub(teams.get(a)!, teams.get(b)!);
  const sector = (a: string, b: string) => sameSector(teams.get(a)!, teams.get(b)!);
  const levels: [DrawLevel, (a: string, b: string) => boolean][] = [
    ['strict', (a, b) => !rematch(a, b) && !club(a, b) && !sector(a, b)],
    ['same-sector-allowed', (a, b) => !rematch(a, b) && !club(a, b)],
    ['rematch-allowed', (a, b) => !club(a, b) && !sector(a, b)],
    ['rematch-and-same-sector-allowed', (a, b) => !club(a, b)],
    ['same-club-allowed', (a, b) => !rematch(a, b)],
    ['unconstrained', () => true],
  ];

  for (const [level, allowed] of levels) {
    for (const bye of byeCandidates) {
      const pool = ids.filter((id) => id !== bye);
      const pairs = mode === 'ranking' ? pairByRank(pool, allowed, { left: 20000 }) : pairUp(pool, allowed, rng, { left: 20000 });
      if (!pairs) continue;
      const matches: Match[] = pairs.map(([a, b]) => ({ id: newId(), teamA: a, teamB: b, scoreA: null, scoreB: null, court: null }));
      if (bye !== null) matches.push({ id: newId(), teamA: bye, teamB: null, scoreA: null, scoreB: null, court: null });
      return { matches, level };
    }
  }
  throw new Error('Tirage impossible');
}

export type IssueKind = 'duplicate' | 'missing' | 'same-club' | 'same-sector' | 'rematch' | 'multiple-byes';

export interface RoundIssue {
  kind: IssueKind;
  teamIds: string[];
  matchId?: string;
}

/** Contrôle une partie (tirage modifié à la main) : doublons, absents, même club, même secteur, revanches. */
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
    else if (a && b && sameSector(a, b)) issues.push({ kind: 'same-sector', teamIds: [a.id, b.id], matchId: m.id });
    if (met.has(pairKey(m.teamA, m.teamB))) issues.push({ kind: 'rematch', teamIds: [m.teamA, m.teamB], matchId: m.id });
  }

  const duplicates = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicates.length) issues.push({ kind: 'duplicate', teamIds: duplicates });
  const missing = tournament.teams.filter((t) => !seen.has(t.id)).map((t) => t.id);
  if (missing.length) issues.push({ kind: 'missing', teamIds: missing });
  if (byes > 1) issues.push({ kind: 'multiple-byes', teamIds: round.matches.filter((m) => m.teamB === null).map((m) => m.teamA) });
  return issues;
}

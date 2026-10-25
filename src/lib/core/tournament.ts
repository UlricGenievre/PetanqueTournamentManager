import { migrateCourts } from './courts';
import { newId } from './ids';
import { DEFAULT_SCORING } from './scoring';
import { SCHEMA_VERSION, type Team, type Tournament } from './types';

export function createTournament(name = '12 Heures de Pétanque de Montesquieu', date = today()): Tournament {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name,
    date,
    settings: {
      roundCount: 8,
      courtCount: null,
      scoring: { total: DEFAULT_SCORING.total, table: [...DEFAULT_SCORING.table] },
      bye: { scoreFor: 13, scoreAgainst: 7 },
    },
    teams: [],
    rounds: [],
  };
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Club déduit du nom d'équipe : « MIRANDOL 3 » → « MIRANDOL », « SERVIAC » → « SERVIAC ». */
export function clubFromTeamName(name: string): string {
  return name.replace(/\s+\d+\s*$/, '').trim();
}

/** Équipes collées depuis une liste (une par ligne), numérotées à la suite des équipes existantes. */
export function parseTeamLines(text: string, firstNumber = 1): Team[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((name, i) => ({ id: newId(), number: firstNumber + i, name, club: clubFromTeamName(name) }));
}

export function nextTeamNumber(tournament: Tournament): number {
  return Math.max(0, ...tournament.teams.map((t) => t.number)) + 1;
}

/** Vérifie qu'un JSON chargé ressemble bien à un tournoi de cette appli. */
export function parseTournament(json: string): Tournament {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.teams) || !Array.isArray(data.rounds)) {
    throw new Error("Ce fichier n'est pas une sauvegarde de tournoi valide.");
  }
  migrateCourts(data.rounds);
  return data as Tournament;
}

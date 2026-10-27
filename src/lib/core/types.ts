/** Modèle de données d'un tournoi. Tout est sérialisable en JSON (sauvegarde sur disque). */

export const SCHEMA_VERSION = 1;

export interface Team {
  id: string;
  /** Numéro affiché (N° de l'équipe dans le tournoi). */
  number: number;
  /** Nom affiché, ex. « VALCOMBE 1 ». */
  name: string;
  /** Club d'appartenance : deux équipes du même club ne doivent pas se rencontrer. */
  club: string;
  /** Secteur facultatif (ex. département voisin) : deux équipes du même secteur évitent de se rencontrer. */
  sector?: string;
}

export interface Match {
  id: string;
  teamA: string;
  /** `null` : l'équipe A est exempte et reçoit le score forfaitaire. */
  teamB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Terrain attribué ; `null` (ou absent) : la rencontre attend qu'un terrain se libère. */
  court?: number | null;
  /** Terrain donné à une autre rencontre avant la saisie du score : celle-ci est terminée. */
  courtFreed?: boolean;
}

export interface Round {
  number: number;
  matches: Match[];
}

export interface ScoringSettings {
  /** Points distribués par partie entre les deux équipes (10 pour les 12 Heures). */
  total: number;
  /**
   * `table[écart]` = points du vainqueur (ou de chacune en cas d'égalité pour l'écart 0).
   * Au-delà de la fin du tableau, la dernière valeur s'applique.
   */
  table: number[];
}

export interface ByeSettings {
  /** Score forfaitaire attribué à l'équipe exempte. */
  scoreFor: number;
  scoreAgainst: number;
}

export interface CourtClosure {
  courts: number[];
  /** 1 : neutralisé dès le début du tournoi. */
  fromRound: number;
  /** Dernière partie neutralisée ; `null` (ou absent) : jusqu'à la fin du tournoi. */
  toRound?: number | null;
}

export interface Settings {
  roundCount: number;
  /** Terrains disponibles, numérotés de 1 à n. */
  courtCount: number;
  /**
   * Parties synchronisées : une partie ne démarre que lorsque la précédente est finie. Les
   * terrains sont alors donnés dès le tirage, et ne sont partagés qu'entre les rencontres d'une
   * même partie. Absent : les parties s'enchaînent, terrain par terrain.
   */
  syncRounds?: boolean;
  /** Terrains neutralisés : ils ne sont pas donnés aux rencontres des parties `fromRound` à `toRound`. */
  closedCourts?: CourtClosure[];
  scoring: ScoringSettings;
  bye: ByeSettings;
}

export interface Tournament {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  /** Date au format AAAA-MM-JJ. */
  date: string;
  settings: Settings;
  teams: Team[];
  rounds: Round[];
}

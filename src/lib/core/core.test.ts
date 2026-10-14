import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/montesquieu-2025.json';
import { drawRound, meetings, sameClub, validateRound } from './pairing';
import { DEFAULT_SCORING, matchPoints } from './scoring';
import { computeStandings } from './standings';
import { clubFromTeamName, createTournament, parseTeamLines } from './tournament';
import type { Tournament } from './types';

/** Tournoi 2025 reconstruit à partir de l'Excel (id d'équipe = son numéro). */
function tournament2025(): Tournament {
  const t = createTournament('12 Heures 2025', '2025-08-02');
  t.teams = fixture.teams.map((x) => ({ id: String(x.number), number: x.number, name: x.name, club: clubFromTeamName(x.name) }));
  t.rounds = fixture.rounds.map((r) => ({
    number: r.number,
    matches: r.matches.map((m, i) => ({ id: `${r.number}-${i}`, teamA: String(m.teamA), teamB: String(m.teamB), scoreA: m.scoreA, scoreB: m.scoreB })),
  }));
  return t;
}

/** Fausse source aléatoire reproductible. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

describe('barème', () => {
  it.each([
    [13, 13, 5, 5],
    [7, 6, 6, 4],
    [9, 7, 7, 3],
    [13, 9, 8, 2],
    [13, 7, 8, 2],
    [12, 5, 9, 1],
    [3, 13, 1, 9],
    [13, 2, 10, 0],
    [0, 13, 0, 10],
  ])('%i-%i donne %i/%i', (a, b, pa, pb) => {
    expect(matchPoints(a, b, DEFAULT_SCORING)).toEqual([pa, pb]);
  });

  it('applique la dernière valeur au-delà du tableau', () => {
    expect(matchPoints(15, 0, DEFAULT_SCORING)).toEqual([10, 0]);
  });
});

describe('classement : tournoi 2025', () => {
  const t = tournament2025();
  const standings = computeStandings(t);
  const byNumber = new Map(standings.map((s) => [s.team.number, s]));
  const excel = fixture.excelRanking.filter((r) => byNumber.has(r.team));

  it('les points saisis à la main suivent le barème, sauf deux erreurs connues', () => {
    const mismatches = fixture.rounds.flatMap((r) =>
      r.matches
        .filter((m) => matchPoints(m.scoreA, m.scoreB, DEFAULT_SCORING).join() !== [m.pointsA, m.pointsB].join())
        .map((m) => `P${r.number} ${m.teamA}-${m.teamB}`),
    );
    expect(mismatches).toEqual(['P3 16-18', 'P5 24-26']);
  });

  it('points réalisés identiques à l’Excel, sauf l’équipe 27 (formule erronée dans l’Excel)', () => {
    // Partie 3 : l'Excel lit Matin!X43 (13, autre rencontre) au lieu de Matin!X41 (12).
    for (const row of excel) {
      const expected = row.team === 27 ? 98 : row.pr;
      expect(byNumber.get(row.team)!.pr, `équipe ${row.team}`).toBe(expected);
    }
  });

  it('différences identiques à l’Excel, sauf l’équipe 5 (formule erronée dans l’Excel)', () => {
    for (const row of excel) {
      const expected = row.team === 5 ? -50 : row.diff;
      expect(byNumber.get(row.team)!.diff, `équipe ${row.team}`).toBe(expected);
    }
  });

  it('points gagnés identiques à l’Excel, une fois les deux erreurs de saisie corrigées', () => {
    // P3 équipes 16 / 18 : 8-8 saisi 3/7 au lieu de 5/5.
    // P5 équipes 24 / 26 : 13-9 saisi 9/1 au lieu de 8/2.
    const correction: Record<number, number> = { 16: 2, 18: -2, 24: -1, 26: 1 };
    for (const row of excel) expect(byNumber.get(row.team)!.pg, `équipe ${row.team}`).toBe(row.pg + (correction[row.team] ?? 0));
  });

  it('classe par PG, puis PR, puis différence', () => {
    for (let i = 1; i < standings.length; i++) {
      const [p, c] = [standings[i - 1], standings[i]];
      expect(p.pg > c.pg || (p.pg === c.pg && (p.pr > c.pr || (p.pr === c.pr && p.diff >= c.diff)))).toBe(true);
    }
  });

  it('classement provisoire après la partie 5 : 5 matchs joués', () => {
    expect(computeStandings(t, 5).every((s) => s.played === 5)).toBe(true);
  });

  it('le tirage 2025 respecte les contraintes', () => {
    for (const round of t.rounds) expect(validateRound(t, round)).toEqual([]);
  });
});

describe('tirage', () => {
  function emptyTournament(count: number): Tournament {
    const t = tournament2025();
    t.teams = t.teams.slice(0, count);
    t.rounds = [];
    return t;
  }

  function playAllRounds(t: Tournament, seed: number) {
    const rng = seeded(seed);
    const levels = [];
    for (let n = 1; n <= t.settings.roundCount; n++) {
      const { matches, level } = drawRound(t, n, rng);
      t.rounds.push({ number: n, matches });
      levels.push(level);
    }
    return levels;
  }

  it.each([1, 2, 3, 4, 5])('8 parties à 40 équipes sans même club ni revanche (graine %i)', (seed) => {
    const t = emptyTournament(40);
    expect(playAllRounds(t, seed).every((l) => l === 'strict')).toBe(true);
    for (const round of t.rounds) expect(validateRound(t, round)).toEqual([]);
  });

  it('nombre impair : un exempt par partie, jamais deux fois la même équipe', () => {
    const t = emptyTournament(39);
    playAllRounds(t, 7);
    const byes = t.rounds.map((r) => r.matches.filter((m) => m.teamB === null).map((m) => m.teamA));
    expect(byes.every((b) => b.length === 1)).toBe(true);
    expect(new Set(byes.flat()).size).toBe(8);
    for (const round of t.rounds) expect(validateRound(t, round)).toEqual([]);
  });

  it('l’exempt reçoit le score forfaitaire', () => {
    const t = emptyTournament(3);
    t.settings.roundCount = 1;
    playAllRounds(t, 1);
    const bye = t.rounds[0].matches.find((m) => m.teamB === null)!;
    const row = computeStandings(t).find((s) => s.team.id === bye.teamA)!;
    expect([row.pr, row.pc, row.pg]).toEqual([13, 7, 8]);
  });

  it('relâche les contraintes quand le tirage strict est impossible', () => {
    const t = createTournament();
    t.teams = parseTeamLines('VALCOMBE 1\nVALCOMBE 2');
    const { matches, level } = drawRound(t, 1, seeded(1));
    expect(level).toBe('same-club-allowed');
    expect(matches).toHaveLength(1);
  });

  it('signale les erreurs d’un tirage modifié à la main', () => {
    const t = tournament2025();
    const round = structuredClone(t.rounds[1]);
    // Équipes 1 et 2 (même club) l'une contre l'autre, alors qu'elles jouaient chacun ailleurs : doublons + même club.
    round.matches[0] = { ...round.matches[0], teamA: '1', teamB: '2' };
    const kinds = validateRound(t, round).map((i) => i.kind);
    expect(kinds).toContain('same-club');
    expect(kinds).toContain('duplicate');
    expect(kinds).toContain('missing');
  });

  it('détecte une revanche', () => {
    const t = tournament2025();
    const first = t.rounds[0].matches[0];
    const round = structuredClone(t.rounds[1]);
    round.matches = [{ ...round.matches[0], teamA: first.teamA, teamB: first.teamB }];
    expect(validateRound(t, round).map((i) => i.kind)).toContain('rematch');
    expect(meetings(t).size).toBe(160);
  });
});

describe('équipes', () => {
  it('déduit le club du nom', () => {
    const teams = parseTeamLines('  MIRANDOL   3 \n\nSERVIAC\nSt. ORIEL DU PRÉ 2', 5);
    expect(teams.map((t) => [t.number, t.name, t.club])).toEqual([
      [5, 'MIRANDOL 3', 'MIRANDOL'],
      [6, 'SERVIAC', 'SERVIAC'],
      [7, 'St. ORIEL DU PRÉ 2', 'St. ORIEL DU PRÉ'],
    ]);
  });

  it('compare les clubs sans tenir compte des accents ni de la ponctuation', () => {
    const [a, b] = parseTeamLines('St. ORIEL DU PRÉ 1\nSt.ORIEL DU PRE 2');
    expect(sameClub(a, b)).toBe(true);
  });

  it('ignore le numéro d’équipe saisi par erreur dans le club', () => {
    const [a, b, c] = parseTeamLines('VERDALON 1\nVERDALON 2\nARGENTAL 1');
    a.club = 'VERDALON 1';
    b.club = 'Verdalon 2';
    expect(sameClub(a, b)).toBe(true);
    expect(sameClub(a, c)).toBe(false);
  });
});

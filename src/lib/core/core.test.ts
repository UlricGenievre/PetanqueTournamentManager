import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/montesquieu-2025.json';
import { assignCourts, courtConflicts, freeCourts, migrateCourts, setCourt, teamsReady } from './courts';
import { drawRound, meetings, sameClub, sameSector, validateRound } from './pairing';
import { DEFAULT_SCORING, matchPoints } from './scoring';
import { computeStandings } from './standings';
import { clubFromTeamName, createTournament, parseTeamLines, parseTournament } from './tournament';
import type { Round, Tournament } from './types';

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

  it.each([1, 2, 3, 4, 5])('6 équipes d’un même secteur ne se rencontrent pas (graine %i)', (seed) => {
    const t = emptyTournament(40);
    t.teams.slice(10, 16).forEach((team) => (team.sector = 'Département voisin'));
    expect(playAllRounds(t, seed).every((l) => l === 'strict')).toBe(true);
    for (const round of t.rounds) expect(validateRound(t, round)).toEqual([]);
  });

  it('relâche le secteur avant les revanches', () => {
    const t = createTournament();
    t.teams = parseTeamLines('VALCOMBE\nMIRANDOL\nSERVIAC\nARGENTAL');
    const [a, b, c, d] = t.teams.map((x) => x.id);
    for (const team of [t.teams[0], t.teams[2], t.teams[3]]) team.sector = 'VOISIN';
    t.rounds = [{ number: 1, matches: [{ id: 'm1', teamA: a, teamB: b, scoreA: 13, scoreB: 5 }, { id: 'm2', teamA: c, teamB: d, scoreA: 13, scoreB: 5 }] }];
    const { matches, level } = drawRound(t, 2, seeded(1));
    expect(level).toBe('same-sector-allowed');
    expect(validateRound(t, { number: 2, matches }).map((i) => i.kind)).toEqual(['same-sector']);
  });

  it('relâche le secteur avant le club', () => {
    const t = createTournament();
    t.teams = parseTeamLines('VALCOMBE\nMIRANDOL');
    t.teams.forEach((team) => (team.sector = 'VOISIN'));
    expect(drawRound(t, 1, seeded(1)).level).toBe('same-sector-allowed');
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

  it('compare les secteurs sans tenir compte de la casse ni des accents ; secteur vide = aucun', () => {
    const [a, b, c, d] = parseTeamLines('VERDALON 1\nARGENTAL 1\nSERVIAC\nMIRANDOL');
    a.sector = 'Département 47';
    b.sector = 'DEPARTEMENT 47';
    c.sector = 'Département 32';
    expect(sameSector(a, b)).toBe(true);
    expect(sameSector(a, c)).toBe(false);
    expect(sameSector(d, { ...d, id: 'x' })).toBe(false);
  });
});

describe('terrains', () => {
  /** 9 équipes : 4 rencontres et un exempt par partie, sur 2 terrains. */
  function drawn() {
    const t = createTournament();
    t.teams = parseTeamLines('A\nB\nC\nD\nE\nF\nG\nH\nI');
    t.settings.courtCount = 2;
    const round = drawNext(t);
    return { t, round, playable: round.matches.filter((m) => m.teamB !== null), bye: round.matches.find((m) => m.teamB === null)! };
  }

  function drawNext(t: Tournament) {
    const number = t.rounds.length + 1;
    t.rounds.push({ number, matches: drawRound(t, number, seeded(number)).matches });
    assignCourts(t);
    return t.rounds[number - 1];
  }

  const score = (m: { scoreA: number | null; scoreB: number | null }) => ((m.scoreA = 13), (m.scoreB = 7));
  const courts = (round: Round) => round.matches.filter((m) => m.teamB !== null).map((m) => m.court);

  it('au tirage, les premières rencontres reçoivent les terrains, les autres attendent', () => {
    const { playable, bye } = drawn();
    expect(playable.map((m) => m.court)).toEqual([1, 2, null, null]);
    expect(bye.court).toBeNull();
  });

  it('un score saisi libère le terrain pour la rencontre suivante', () => {
    const { t, playable } = drawn();
    score(playable[1]);
    assignCourts(t);
    expect(playable.map((m) => m.court)).toEqual([1, 2, 2, null]);
    score(playable[0]);
    assignCourts(t);
    expect(playable.map((m) => m.court)).toEqual([1, 2, 2, 1]);
    expect(freeCourts(t)).toEqual([]);
  });

  it('un score incomplet ne libère pas le terrain', () => {
    const { t, playable } = drawn();
    playable[0].scoreA = 13;
    assignCourts(t);
    expect(playable[2].court).toBeNull();
  });

  it('terrain donné à la main : la rencontre qui l’occupait est terminée', () => {
    const { t, round, playable } = drawn();
    setCourt(t, playable[3], 1);
    expect(playable[0].courtFreed).toBe(true);
    // Le score de la première rencontre arrive ensuite : aucun terrain ne se libère.
    score(playable[0]);
    assignCourts(t);
    expect(playable.map((m) => m.court)).toEqual([1, 2, null, 1]);
    expect(courtConflicts(t, round)).toEqual([]);
  });

  it('corriger le terrain d’une rencontre terminée ne libère personne', () => {
    const { t, playable } = drawn();
    score(playable[0]);
    setCourt(t, playable[0], 2);
    expect(playable[1].courtFreed).toBeUndefined();
  });

  it('plus de terrains : les rencontres en attente en profitent', () => {
    const { t, playable } = drawn();
    t.settings.courtCount = 3;
    assignCourts(t);
    expect(playable.map((m) => m.court)).toEqual([1, 2, 3, null]);
  });

  it('sans nombre de terrains, chaque rencontre a le sien', () => {
    const { t, round, playable } = drawn();
    for (const m of round.matches) m.court = null;
    t.settings.courtCount = null;
    assignCourts(t);
    expect(playable.map((m) => m.court)).toEqual([1, 2, 3, 4]);
  });

  it('score effacé après réattribution : conflit signalé', () => {
    const { t, round, playable } = drawn();
    score(playable[0]);
    assignCourts(t);
    playable[0].scoreA = null;
    expect(courtConflicts(t, round)).toEqual([1]);
  });

  describe('parties qui se chevauchent', () => {
    /** Partie 1 sur 4 terrains, deux rencontres terminées, puis tirage de la partie 2. */
    function overlapping() {
      const { t, round: r1, playable } = drawn();
      t.settings.courtCount = 4;
      assignCourts(t);
      score(playable[0]);
      score(playable[1]);
      const r2 = drawNext(t);
      return { t, r1, r2, done: new Set([playable[0], playable[1]].flatMap((m) => [m.teamA, m.teamB])) };
    }

    it('la partie suivante ne prend que les terrains libérés', () => {
      const { t, r1, r2 } = overlapping();
      expect(courts(r1)).toEqual([1, 2, 3, 4]);
      const used = courts(r2).filter((c) => c !== null);
      expect(used.every((c) => c === 1 || c === 2)).toBe(true);
      expect(freeCourts(t).length).toBe(2 - used.length);
    });

    it('une rencontre attend que ses deux équipes aient fini la partie précédente', () => {
      const { t, r1, r2, done } = overlapping();
      done.add(r1.matches.find((m) => m.teamB === null)!.teamA); // l'exempte n'a pas joué
      for (const m of r2.matches.filter((x) => x.teamB !== null)) {
        expect(teamsReady(t, r2, m)).toBe(done.has(m.teamA) && done.has(m.teamB!));
        if (!teamsReady(t, r2, m)) expect(m.court).toBeNull();
      }
    });

    it('un score de la partie 1 libère son terrain et rend prêtes ses équipes', () => {
      const { t, r1, r2 } = overlapping();
      for (const m of r1.matches) if (m.teamB !== null && m.scoreA === null) score(m);
      assignCourts(t);
      expect(r2.matches.filter((m) => m.teamB !== null).every((m) => m.court !== null)).toBe(true);
      expect(new Set(courts(r2)).size).toBe(4);
    });

    it('les rencontres en attente de la partie précédente passent avant la suivante', () => {
      const t = createTournament();
      t.teams = parseTeamLines('A\nB\nC\nD\nE\nF');
      t.settings.courtCount = 1;
      const [a, b, c, d, e, f] = t.teams.map((x) => x.id);
      const match = (teamA: string, teamB: string, court: number | null = null) => ({ id: teamA + teamB, teamA, teamB, scoreA: null, scoreB: null, court });
      t.rounds = [
        { number: 1, matches: [match(a, b, 1), match(c, d), match(e, f)] },
        { number: 2, matches: [match(a, b)] }, // A et B seront prêtes, mais C-D attend depuis la partie 1
      ];
      score(t.rounds[0].matches[0]);
      assignCourts(t);
      expect(t.rounds[0].matches[1].court).toBe(1);
      expect(t.rounds[1].matches[0].court).toBeNull();
    });
  });

  it('anciennes sauvegardes : l’ordre des rencontres donne le terrain', () => {
    const t = tournament2025();
    const json = JSON.stringify(t);
    expect(json).not.toContain('"court"');
    const loaded = parseTournament(json);
    expect(loaded.rounds[0].matches.slice(0, 3).map((m) => m.court)).toEqual([1, 2, 3]);
    migrateCourts(loaded.rounds); // sans effet la deuxième fois
    expect(loaded.rounds[0].matches[2].court).toBe(3);
  });
});

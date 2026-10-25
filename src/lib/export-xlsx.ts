import { utils, write } from 'xlsx';
import { effectiveScores, matchPoints } from './core/scoring';
import { computeStandings } from './core/standings';
import type { Tournament } from './core/types';
import { downloadBlob, suggestedFileName } from './persistence';

type Cell = string | number | null;

function sheet(rows: Cell[][], widths: number[]) {
  const ws = utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

function standingsRows(t: Tournament, upToRound?: number): Cell[][] {
  return [
    ['Rang', 'N°', 'Équipe', 'Club', 'Joués', 'Points gagnés', 'Points réalisés', 'Points encaissés', 'Différence'],
    ...computeStandings(t, upToRound).map((s) => [s.rank, s.team.number, s.team.name, s.team.club, s.played, s.pg, s.pr, s.pc, s.diff]),
  ];
}

const STANDING_WIDTHS = [6, 5, 28, 22, 7, 14, 15, 16, 11];

/** Classeur Excel : classement final, classements après chaque partie, rencontres et équipes. */
export function exportXlsx(t: Tournament): void {
  const wb = utils.book_new();
  const byId = new Map(t.teams.map((team) => [team.id, team]));

  utils.book_append_sheet(wb, sheet(standingsRows(t), STANDING_WIDTHS), 'Classement');

  const matchRows: Cell[][] = [['Partie', 'Terrain', 'N° A', 'Équipe A', 'Score A', 'Score B', 'Équipe B', 'N° B', 'Points A', 'Points B']];
  for (const round of t.rounds) {
    round.matches.forEach((m, i) => {
      const a = byId.get(m.teamA);
      const b = m.teamB === null ? null : byId.get(m.teamB);
      const scores = effectiveScores(m, t.settings);
      const points = scores ? matchPoints(scores[0], scores[1], t.settings.scoring) : null;
      matchRows.push([
        round.number,
        m.teamB === null ? null : i + 1,
        a?.number ?? null,
        a?.name ?? '?',
        scores?.[0] ?? null,
        scores?.[1] ?? null,
        m.teamB === null ? 'Exempt' : (b?.name ?? '?'),
        b?.number ?? null,
        points?.[0] ?? null,
        m.teamB === null ? null : (points?.[1] ?? null),
      ]);
    });
  }
  utils.book_append_sheet(wb, sheet(matchRows, [7, 8, 6, 28, 8, 8, 28, 6, 9, 9]), 'Rencontres');

  for (const round of t.rounds) {
    utils.book_append_sheet(wb, sheet(standingsRows(t, round.number), STANDING_WIDTHS), `Après partie ${round.number}`);
  }

  const teamRows: Cell[][] = [
    ['N°', 'Équipe', 'Club', 'Secteur'],
    ...[...t.teams].sort((a, b) => a.number - b.number).map((x) => [x.number, x.name, x.club, x.sector ?? '']),
  ];
  utils.book_append_sheet(wb, sheet(teamRows, [5, 28, 22, 18]), 'Équipes');

  const data = write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, suggestedFileName(t).replace(/\.json$/, '.xlsx'));
}

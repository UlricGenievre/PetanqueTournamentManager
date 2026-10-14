<script lang="ts">
  import { computeStandings } from '../lib/core/standings';
  import type { Tournament } from '../lib/core/types';

  let { tournament, upToRound }: { tournament: Tournament; upToRound?: number } = $props();

  const rows = $derived(computeStandings(tournament, upToRound));
</script>

<table class="standings">
  <thead>
    <tr>
      <th class="num">Rang</th>
      <th class="num">N°</th>
      <th>Équipe</th>
      <th class="num">Joués</th>
      <th class="num">PG</th>
      <th class="num">PR</th>
      <th class="num">PE</th>
      <th class="num">Diff.</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.team.id)}
      <tr class:podium={row.rank <= 3 && row.played > 0}>
        <td class="num rank">{row.rank}</td>
        <td class="num">{row.team.number}</td>
        <td>{row.team.name}</td>
        <td class="num">{row.played}</td>
        <td class="num pg">{row.pg}</td>
        <td class="num">{row.pr}</td>
        <td class="num">{row.pc}</td>
        <td class="num">{row.diff > 0 ? '+' : ''}{row.diff}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .rank,
  .pg {
    font-weight: 700;
  }

  tr.podium {
    background: color-mix(in srgb, var(--accent-soft) 60%, transparent);
  }

  @media print {
    th,
    td {
      padding: 0.15em 0.5em;
    }

    th {
      background: #eee;
      color: #000;
    }

    tr {
      break-inside: avoid;
    }
  }
</style>

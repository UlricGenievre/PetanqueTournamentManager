<script lang="ts">
  import type { Round, Tournament } from '../lib/core/types';

  let { tournament, round }: { tournament: Tournament; round: Round } = $props();
  const teams = $derived(new Map(tournament.teams.map((t) => [t.id, t])));
</script>

<h1>{tournament.name}</h1>
<h2>Partie {round.number} — rencontres</h2>
<table>
  <thead>
    <tr><th class="num">Terrain</th><th class="num">N°</th><th>Équipe</th><th></th><th class="num">N°</th><th>Équipe</th></tr>
  </thead>
  <tbody>
    {#each round.matches as m, i (m.id)}
      {@const a = teams.get(m.teamA)}
      {@const b = m.teamB === null ? null : teams.get(m.teamB)}
      <tr>
        <td class="num terrain">{m.teamB === null ? '—' : i + 1}</td>
        <td class="num">{a?.number}</td>
        <td>{a?.name}</td>
        {#if m.teamB === null}
          <td colspan="3"><em>exempte</em></td>
        {:else}
          <td class="vs">contre</td>
          <td class="num">{b?.number}</td><td>{b?.name}</td>
        {/if}
      </tr>
    {/each}
  </tbody>
</table>

<style>
  h1 {
    font-size: 16pt;
    margin-bottom: 2mm;
  }

  h2 {
    font-size: 14pt;
    margin-bottom: 4mm;
  }

  table {
    font-size: 13pt;
  }

  td,
  th {
    padding: 1.2mm 2mm;
    border-bottom: 0.3mm solid #999;
  }

  th {
    background: #eee;
    color: #000;
  }

  tr {
    break-inside: avoid;
  }

  .terrain {
    font-weight: 700;
  }

  .vs {
    color: #555;
    font-size: 10pt;
    text-align: center;
  }
</style>

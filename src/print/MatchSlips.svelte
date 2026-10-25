<script lang="ts">
  import type { Round, Tournament } from '../lib/core/types';

  let { tournament, round }: { tournament: Tournament; round: Round } = $props();
  const teams = $derived(new Map(tournament.teams.map((t) => [t.id, t])));
  const matches = $derived(round.matches.filter((m) => m.teamB !== null));
</script>

<div class="slips">
  {#each matches as m (m.id)}
    {@const a = teams.get(m.teamA)}
    {@const b = m.teamB === null ? undefined : teams.get(m.teamB)}
    <div class="slip">
      <div class="head">
        <span>{tournament.name}</span>
        <strong>Partie {round.number} · Terrain {m.court ?? '____'}</strong>
      </div>
      <div class="line">
        <span class="team"><b>{a?.number}</b> {a?.name}</span><span class="box"></span>
      </div>
      <div class="line">
        <span class="team"><b>{b?.number}</b> {b?.name}</span><span class="box"></span>
      </div>
    </div>
  {/each}
</div>

<style>
  .slips {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }

  .slip {
    border: 0.3mm dashed #888;
    padding: 4mm 5mm;
    height: 67mm;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    break-inside: avoid;
  }

  .head {
    display: flex;
    flex-direction: column;
    font-size: 9pt;
    color: #444;
  }

  .head strong {
    font-size: 13pt;
    color: #000;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 4mm;
    font-size: 13pt;
  }

  .team {
    flex: 1;
  }

  .box {
    width: 16mm;
    height: 12mm;
    border: 0.5mm solid #000;
    border-radius: 1mm;
  }
</style>

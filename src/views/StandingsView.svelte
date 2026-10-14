<script lang="ts">
  import { effectiveScores } from '../lib/core/scoring';
  import { app } from '../lib/store.svelte';
  import { printer } from '../print.svelte';
  import StandingsTable from './StandingsTable.svelte';

  const t = $derived(app.tournament);
  const isComplete = (n: number) => !!t.rounds.find((r) => r.number === n)?.matches.every((m) => effectiveScores(m, t.settings));
  const completed = $derived(t.rounds.filter((r) => isComplete(r.number)).map((r) => r.number));
  const isFinal = $derived(completed.length === t.settings.roundCount);

  /** `null` : en direct, avec tous les scores saisis. */
  let upTo = $state<number | null>(null);
</script>

<section class="card">
  <div class="toolbar">
    <h2>{isFinal && upTo === null ? 'Classement final' : 'Classement'}</h2>
    <div class="choices" role="radiogroup" aria-label="Classement après la partie">
      <button class:active={upTo === null} onclick={() => (upTo = null)}>{isFinal ? 'Final' : 'En direct'}</button>
      {#each completed.filter((n) => !isFinal || n < t.settings.roundCount) as n (n)}
        <button class:active={upTo === n} onclick={() => (upTo = n)}>Après partie {n}</button>
      {/each}
    </div>
    <button class="primary" onclick={() => printer.print({ kind: 'standings', upToRound: upTo })}>Imprimer</button>
  </div>
  {#if upTo === null && !isFinal && t.rounds.length}
    <p class="muted">Classement en direct : il tient compte de tous les scores déjà saisis, y compris ceux d'une partie en cours.</p>
  {/if}
  <StandingsTable tournament={t} upToRound={upTo ?? undefined} />
  <p class="muted legend">PG : points gagnés (barème) · PR : points réalisés · PE : points encaissés · Diff. : PR − PE. Départage : PG, puis PR, puis Diff.</p>
</section>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .toolbar h2 {
    margin: 0;
    margin-right: auto;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .choices button.active {
    background: var(--accent-soft);
    border-color: var(--accent);
    font-weight: 600;
  }

  .legend {
    font-size: 0.85rem;
    margin-top: 0.75rem;
  }
</style>

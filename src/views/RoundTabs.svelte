<script lang="ts" module>
  import type { Round } from '../lib/core/types';

  export const scoredCount = (r: Round) => r.matches.filter((m) => m.teamB !== null && m.scoreA !== null && m.scoreB !== null).length;
  export const playableCount = (r: Round) => r.matches.filter((m) => m.teamB !== null).length;
</script>

<script lang="ts">
  import { app } from '../lib/store.svelte';

  /** Onglets « Partie n » avec l'avancement des scores ; seules les parties `selectable` sont cliquables. */
  let { selected, selectable, onselect }: { selected: number; selectable: (n: number) => boolean; onselect: (n: number) => void } = $props();

  const t = $derived(app.tournament);
</script>

<div class="round-tabs" role="tablist">
  {#each Array.from({ length: t.settings.roundCount }, (_, i) => i + 1) as n (n)}
    {@const r = t.rounds.find((x) => x.number === n)}
    <button
      role="tab"
      aria-selected={selected === n}
      class:active={selected === n}
      class:done={r && scoredCount(r) === playableCount(r)}
      disabled={!selectable(n)}
      onclick={() => onselect(n)}
    >
      <span class="label">Partie {n}</span>
      <span class="status">
        {#if !r}à tirer{:else if scoredCount(r) === playableCount(r)}✓ terminée{:else}{scoredCount(r)}/{playableCount(r)} scores{/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .round-tabs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .round-tabs button {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    padding: 0.5em 0.8em;
  }

  .label {
    font-weight: 600;
  }

  .status {
    font-size: 0.8rem;
    color: var(--muted);
  }

  button.done .status {
    color: var(--ok);
  }

  button.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    background: var(--accent-soft);
  }
</style>

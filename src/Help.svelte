<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Petit « ? » qui affiche le texte d'aide en dessous, au clic. À placer en fin de titre ou de libellé. */
  let { children }: { children: Snippet } = $props();
  let open = $state(false);
</script>

<button type="button" class="help" class:open aria-expanded={open} aria-label="Aide" title="Aide" onclick={() => (open = !open)}>?</button>
{#if open}<span class="help-text">{@render children()}</span>{/if}

<style>
  /* Rond centré sur la hauteur du texte voisin, quelle que soit sa taille (titre ou libellé). */
  .help {
    justify-content: center;
    flex-shrink: 0;
    width: 1.3rem;
    height: 1.3rem;
    padding: 0;
    margin: 0 0 0 0.35em;
    border-radius: 50%;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
    vertical-align: middle;
    position: relative;
    top: -0.1em;
    color: var(--muted);
  }

  .help.open {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .help-text {
    display: block;
    margin: 0.35rem 0 0.5rem;
    font-size: 0.85rem;
    font-weight: 400;
    line-height: 1.45;
    color: var(--muted);
  }
</style>

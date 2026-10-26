<script lang="ts">
  import { courtBoard, isWaiting } from '../lib/core/courts';
  import { app } from '../lib/store.svelte';

  const t = $derived(app.tournament);
  const teamsById = $derived(new Map(t.teams.map((team) => [team.id, team])));
  const board = $derived(courtBoard(t));
  const busyCount = $derived(board.filter((c) => c.playing.length).length);
  const freeCount = $derived(board.filter((c) => c.open && !c.playing.length).length);
  const closedCount = $derived(board.filter((c) => !c.open).length);
  const waitingCount = $derived(t.rounds.flatMap((r) => r.matches).filter(isWaiting).length);

  const teamLabel = (id: string | null) => {
    const team = id ? teamsById.get(id) : undefined;
    return team ? `${team.number} · ${team.name}` : '?';
  };

  function closedText(from: number | null): string {
    if (from === null) return 'Au-delà du nombre de terrains';
    return from === 1 ? 'Pour tout le tournoi' : `Dès la partie ${from}`;
  }
</script>

{#if board.length === 0}
  <section class="card empty">
    <h2>Terrains</h2>
    <p class="muted">
      Aucun terrain à afficher : réglez le nombre de terrains dans l'onglet « Tournoi & fichier », ou tirez une partie.
    </p>
  </section>
{:else}
  <section class="card">
    <h2>Terrains</h2>
    <p class="summary">
      <span><strong>{busyCount}</strong> occupé{busyCount > 1 ? 's' : ''}</span>
      {#if t.settings.courtCount != null}<span><strong>{freeCount}</strong> libre{freeCount > 1 ? 's' : ''}</span>{/if}
      {#if closedCount}<span><strong>{closedCount}</strong> neutralisé{closedCount > 1 ? 's' : ''}</span>{/if}
      {#if waitingCount}<span><strong>{waitingCount}</strong> rencontre{waitingCount > 1 ? 's' : ''} en attente d'un terrain</span>{/if}
    </p>

    <div class="board">
      {#each board as c (c.court)}
        <article class="court" class:busy={c.playing.length} class:closed={!c.open} class:conflict={c.playing.length > 1}>
          <header>
            <span class="number">{c.court}</span>
            {#if !c.open}
              <span class="badge closed-badge" title={closedText(c.closedFrom)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" /><rect x="3.5" y="6.5" width="9" height="3" rx="0.5" /></svg>
                Neutralisé
              </span>
            {:else if c.closedFrom !== null}
              <span class="badge later-badge">Neutralisé dès la partie {c.closedFrom}</span>
            {/if}
          </header>
          {#each c.playing as p (p.match.id)}
            <div class="match">
              <span class="round">Partie {p.round}</span>
              <span class="team">{teamLabel(p.match.teamA)}</span>
              <span class="vs">contre</span>
              <span class="team">{teamLabel(p.match.teamB)}</span>
            </div>
          {:else}
            <p class="state">{c.open ? 'Libre' : closedText(c.closedFrom)}</p>
          {/each}
          {#if c.playing.length > 1}
            <p class="note warn-text">Plusieurs rencontres en cours sur ce terrain</p>
          {:else if c.playing.length && !c.open}
            <p class="note">Rencontre en cours : elle peut finir, le terrain ne sera plus attribué</p>
          {/if}
        </article>
      {/each}
    </div>
  </section>
{/if}

<style>
  .empty {
    text-align: center;
    padding: 2.5rem 1rem;
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.5rem;
  }

  .board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 0.75rem;
  }

  .court {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.6rem 0.75rem;
    background: var(--surface);
    min-height: 7.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .court.busy {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  /* Terrain neutralisé : hachures et bordure en tirets, comme un terrain balisé. */
  .court.closed {
    border: 2px dashed var(--danger);
    background: repeating-linear-gradient(-45deg, var(--danger-soft) 0 10px, var(--surface) 10px 20px);
  }

  .court.conflict {
    border-color: var(--warn);
    background: var(--warn-soft);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .number {
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 1;
  }

  .closed .number {
    color: var(--danger);
    text-decoration: line-through;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 999px;
    padding: 0.15em 0.6em;
    white-space: nowrap;
  }

  .closed-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    background: var(--danger);
    color: #fff;
  }

  /* Panneau « sens interdit » dessiné, pour ne pas dépendre des emoji du système. */
  .closed-badge svg {
    width: 1.1em;
    height: 1.1em;
  }

  .closed-badge circle {
    fill: #fff;
  }

  .closed-badge rect {
    fill: var(--danger);
  }

  .later-badge {
    background: var(--warn-soft);
    color: var(--warn);
    border: 1px solid var(--warn);
  }

  .match {
    display: flex;
    flex-direction: column;
    font-size: 0.95rem;
  }

  .round {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .team {
    font-weight: 600;
  }

  .vs {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .state {
    margin: auto 0;
    color: var(--muted);
    font-style: italic;
  }

  .closed .state {
    color: var(--danger);
    font-style: normal;
    font-weight: 600;
  }

  .note {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .warn-text {
    color: var(--warn);
  }
</style>

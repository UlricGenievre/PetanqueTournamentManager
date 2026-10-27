<script lang="ts">
  import { courtBoard, isWaiting } from '../lib/core/courts';
  import type { CourtClosure } from '../lib/core/types';
  import { app } from '../lib/store.svelte';
  import RoundTabs, { playableCount, scoredCount } from './RoundTabs.svelte';

  const t = $derived(app.tournament);
  const teamsById = $derived(new Map(t.teams.map((team) => [team.id, team])));

  /** Parties synchronisées : les terrains se lisent partie par partie, d'abord la première dont des scores manquent. */
  function defaultRound() {
    const open = [...t.rounds].sort((a, b) => a.number - b.number).find((r) => scoredCount(r) < playableCount(r));
    return open?.number ?? Math.max(1, ...t.rounds.map((r) => r.number));
  }

  let selected = $state(defaultRound());
  const sync = $derived(!!t.settings.syncRounds);
  const board = $derived(courtBoard(t, sync ? selected : undefined));
  const busyCount = $derived(board.filter((c) => c.playing.length).length);
  const freeCount = $derived(board.filter((c) => c.open && !c.playing.length).length);
  const closedCount = $derived(board.filter((c) => !c.open).length);
  const waitingCount = $derived(
    t.rounds.filter((r) => !sync || r.number === selected).flatMap((r) => r.matches).filter(isWaiting).length,
  );

  const teamLabel = (id: string | null) => {
    const team = id ? teamsById.get(id) : undefined;
    return team ? `${team.number} · ${team.name}` : '?';
  };

  function roundsText({ fromRound: from, toRound: to }: CourtClosure): string {
    if (to == null) return from === 1 ? 'pour tout le tournoi' : `dès la partie ${from}`;
    return from === to ? `pour la partie ${from}` : `des parties ${from} à ${to}`;
  }

  function closedText(closure: CourtClosure | null): string {
    if (closure === null) return 'Au-delà du nombre de terrains';
    const text = roundsText(closure);
    return text[0].toUpperCase() + text.slice(1);
  }
</script>

{#if sync}
  <RoundTabs {selected} selectable={(n) => t.rounds.some((r) => r.number === n)} onselect={(n) => (selected = n)} />
{/if}

<section class="card">
  <h2>Terrains{sync ? ` · partie ${selected}` : ''}</h2>
  <p class="summary">
    <span><strong>{busyCount}</strong> occupé{busyCount > 1 ? 's' : ''}</span>
    <span><strong>{freeCount}</strong> libre{freeCount > 1 ? 's' : ''}</span>
    {#if closedCount}<span><strong>{closedCount}</strong> neutralisé{closedCount > 1 ? 's' : ''}</span>{/if}
    {#if waitingCount}<span><strong>{waitingCount}</strong> rencontre{waitingCount > 1 ? 's' : ''} en attente d'un terrain</span>{/if}
  </p>

  <div class="board">
    {#each board as c (c.court)}
      <article class="court" class:busy={c.playing.length} class:closed={!c.open} class:conflict={c.conflict}>
        <header>
          <span class="number">{c.court}</span>
          {#if !c.open}
            <span class="badge closed-badge" title={closedText(c.closure)}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" /><rect x="3.5" y="6.5" width="9" height="3" rx="0.5" /></svg>
              Neutralisé
            </span>
          {:else if c.closure !== null}
            <span class="badge later-badge">Neutralisé {roundsText(c.closure)}</span>
          {/if}
        </header>
        {#each c.played as m (m.id)}
          <div class="match played">
            <span class="round">Terminée{m.scoreA !== null && m.scoreB !== null ? ` · ${m.scoreA} – ${m.scoreB}` : ''}</span>
            <span class="team">{teamLabel(m.teamA)}</span>
            <span class="vs">contre</span>
            <span class="team">{teamLabel(m.teamB)}</span>
          </div>
        {/each}
        {#each c.playing as p (p.match.id)}
          <div class="match">
            <span class="round">{sync ? 'En cours' : `Partie ${p.round}`}</span>
            <span class="team">{teamLabel(p.match.teamA)}</span>
            <span class="vs">contre</span>
            <span class="team">{teamLabel(p.match.teamB)}</span>
          </div>
        {:else}
          {#if !c.played.length}<p class="state">{c.open ? 'Libre' : closedText(c.closure)}</p>{/if}
        {/each}
        {#if c.conflict}
          <p class="note warn-text">Plusieurs rencontres en cours sur ce terrain</p>
        {:else if c.playing.length && !c.open}
          <p class="note">Rencontre en cours : elle peut finir, le terrain n'est pas attribué pendant sa neutralisation</p>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
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
    flex-shrink: 0;
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

  /* Texte variable (« des parties 2 à 4 ») : il passe à la ligne plutôt que de déborder du terrain. */
  .later-badge {
    white-space: normal;
    text-align: right;
    border-radius: 0.6em;
    min-width: 0;
    background: var(--warn-soft);
    color: var(--warn);
    border: 1px solid var(--warn);
  }

  .match {
    display: flex;
    flex-direction: column;
    font-size: 0.95rem;
  }

  .match.played {
    opacity: 0.6;
  }

  .match.played + .match {
    border-top: 1px dashed var(--border);
    padding-top: 0.3rem;
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

<script lang="ts">
  import { tick } from 'svelte';
  import { newId } from '../lib/core/ids';
  import { drawRound, validateRound, type DrawLevel, type RoundIssue } from '../lib/core/pairing';
  import { effectiveScores, matchPoints } from '../lib/core/scoring';
  import type { Match, Round } from '../lib/core/types';
  import { app } from '../lib/store.svelte';
  import { printer } from '../print.svelte';

  const t = $derived(app.tournament);
  const teamsById = $derived(new Map(t.teams.map((team) => [team.id, team])));
  const teamOptions = $derived([...t.teams].sort((a, b) => a.number - b.number));

  /** Première partie dont des scores manquent, sinon la dernière tirée. */
  function defaultRound() {
    const open = t.rounds.find((r) => r.matches.some((m) => !effectiveScores(m, t.settings)));
    return open?.number ?? Math.min(t.rounds.length + 1, t.settings.roundCount);
  }

  let selected = $state(defaultRound());
  let filter = $state('');
  let editing = $state(false);
  let drawMessage = $state<{ round: number; level: DrawLevel } | null>(null);

  const round = $derived(t.rounds.find((r) => r.number === selected));
  const canDraw = $derived(selected === t.rounds.length + 1 && t.teams.length >= 2);
  const issues = $derived(round ? validateRound(t, round) : []);
  const scoredCount = (r: Round) => r.matches.filter((m) => m.teamB !== null && m.scoreA !== null && m.scoreB !== null).length;
  const playableCount = (r: Round) => r.matches.filter((m) => m.teamB !== null).length;
  const hasScores = (r: Round) => r.matches.some((m) => m.scoreA !== null || m.scoreB !== null);

  const visibleMatches = $derived.by(() => {
    if (!round) return [];
    const q = filter.trim().toLowerCase();
    return round.matches
      .map((match, i) => ({ match, terrain: i + 1 }))
      .filter(({ match }) => {
        if (!q) return true;
        return [match.teamA, match.teamB].some((id) => {
          const team = id ? teamsById.get(id) : undefined;
          return team && (team.name.toLowerCase().includes(q) || String(team.number) === q);
        });
      });
  });

  const teamLabel = (id: string | null) => {
    const team = id ? teamsById.get(id) : undefined;
    return team ? `${team.number} · ${team.name}` : '?';
  };

  function draw() {
    const result = drawRound(t, selected);
    const existing = t.rounds.find((r) => r.number === selected);
    if (existing) existing.matches = result.matches;
    else t.rounds.push({ number: selected, matches: result.matches });
    drawMessage = result.level === 'strict' ? null : { round: selected, level: result.level };
    editing = false;
  }

  function redraw() {
    if (round && confirm(`Refaire le tirage de la partie ${round.number} ?`)) draw();
  }

  function deleteRound() {
    if (!round) return;
    const msg = hasScores(round)
      ? `Supprimer la partie ${round.number} ET les scores déjà saisis ?`
      : `Supprimer le tirage de la partie ${round.number} ?`;
    if (!confirm(msg)) return;
    t.rounds.splice(t.rounds.indexOf(round), 1);
    editing = false;
  }

  function parseScore(raw: string): number | null {
    const digits = raw.replace(/\D/g, '');
    return digits === '' ? null : Math.min(Number(digits), 99);
  }

  /** Entrée : passe au score suivant (comme Tab). */
  async function nextOnEnter(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input.score')];
    const i = inputs.indexOf(e.currentTarget as HTMLInputElement);
    await tick();
    inputs[i + 1]?.focus();
    inputs[i + 1]?.select();
  }

  // --- Modification manuelle des rencontres ---

  /** Place `teamId` à cet endroit ; si elle jouait ailleurs dans la partie, les deux équipes sont échangées. */
  function assign(match: Match, slot: 'teamA' | 'teamB', teamId: string | null) {
    if (!round) return;
    const previous = match[slot];
    const other = teamId === null ? undefined : round.matches.find((m) => m.teamA === teamId || m.teamB === teamId);
    if (other === match && previous === null) return; // une équipe exempte ne peut pas jouer contre elle-même
    const touched = [match, other].filter((m): m is Match => !!m);
    if (touched.some((m) => m.scoreA !== null || m.scoreB !== null) && !confirm('Les scores déjà saisis pour ces rencontres seront effacés. Continuer ?')) return;
    if (other) {
      if (other.teamB === teamId) other.teamB = previous;
      else if (previous !== null) other.teamA = previous;
      // L'équipe quitte une place d'équipe A sans rien à mettre à la place : son adversaire devient exempt.
      else if (other.teamB !== null) [other.teamA, other.teamB] = [other.teamB, null];
      else round.matches.splice(round.matches.indexOf(other), 1);
    }
    if (slot === 'teamB') match.teamB = teamId;
    else if (teamId !== null) match.teamA = teamId;
    for (const m of touched) m.scoreA = m.scoreB = null;
  }

  const missingTeams = $derived(issues.find((i) => i.kind === 'missing')?.teamIds ?? []);

  function addMatch() {
    if (!round || missingTeams.length === 0) return;
    const [a, b = null] = missingTeams;
    round.matches.push({ id: newId(), teamA: a, teamB: b, scoreA: null, scoreB: null });
  }

  function removeMatch(match: Match) {
    if (!round) return;
    if ((match.scoreA !== null || match.scoreB !== null) && !confirm('Supprimer cette rencontre et son score ?')) return;
    round.matches.splice(round.matches.indexOf(match), 1);
  }

  function issueText(issue: RoundIssue): string {
    const names = issue.teamIds.map((id) => teamsById.get(id)?.name ?? '?').join(' / ');
    switch (issue.kind) {
      case 'same-club':
        return `Même club : ${names}`;
      case 'rematch':
        return `Ces équipes se sont déjà rencontrées : ${names}`;
      case 'duplicate':
        return `Équipe(s) présente(s) dans plusieurs rencontres : ${names}`;
      case 'missing':
        return `Équipe(s) sans rencontre : ${names}`;
      case 'multiple-byes':
        return `Plusieurs équipes exemptes : ${names}`;
    }
  }

  const levelText: Record<DrawLevel, string> = {
    strict: '',
    'rematch-allowed': 'Impossible d’éviter toutes les revanches : certaines équipes se rencontrent une deuxième fois.',
    'same-club-allowed': 'Impossible d’éviter toutes les rencontres entre équipes du même club.',
    unconstrained: 'Impossible d’éviter à la fois les revanches et les rencontres entre équipes du même club.',
  };
</script>

<div class="round-tabs" role="tablist">
  {#each Array.from({ length: t.settings.roundCount }, (_, i) => i + 1) as n (n)}
    {@const r = t.rounds.find((x) => x.number === n)}
    <button
      role="tab"
      aria-selected={selected === n}
      class:active={selected === n}
      class:done={r && scoredCount(r) === playableCount(r)}
      disabled={!r && n !== t.rounds.length + 1}
      onclick={() => {
        selected = n;
        editing = false;
        filter = '';
      }}
    >
      <span class="label">Partie {n}</span>
      <span class="status">
        {#if !r}à tirer{:else if scoredCount(r) === playableCount(r)}✓ terminée{:else}{scoredCount(r)}/{playableCount(r)} scores{/if}
      </span>
    </button>
  {/each}
</div>

{#if !round}
  <section class="card empty">
    <h2>Partie {selected}</h2>
    {#if t.teams.length < 2}
      <p>Ajoutez d'abord les équipes (onglet « Équipes »).</p>
    {:else}
      <p>
        {t.teams.length} équipes : {Math.floor(t.teams.length / 2)} rencontres{#if t.teams.length % 2}
          , et une équipe exempte (score forfaitaire {t.settings.bye.scoreFor}-{t.settings.bye.scoreAgainst}){/if}.
      </p>
      <p class="muted">Le tirage évite les rencontres entre équipes d'un même club et les rencontres déjà jouées.</p>
      <button class="primary big" onclick={draw} disabled={!canDraw}>Tirer au sort la partie {selected}</button>
    {/if}
  </section>
{:else}
  <section class="card">
    <div class="toolbar">
      <h2>Partie {round.number}</h2>
      <input type="search" bind:value={filter} placeholder="Chercher une équipe (nom ou N°)" aria-label="Chercher une équipe" />
      <div class="actions">
        <button onclick={() => printer.print({ kind: 'match-list', round: round.number })}>Imprimer la liste</button>
        <button onclick={() => printer.print({ kind: 'match-slips', round: round.number })}>Imprimer les fiches de match</button>
        <button class:primary={editing} onclick={() => (editing = !editing)}>{editing ? 'Terminer les modifications' : 'Modifier les rencontres'}</button>
      </div>
    </div>

    {#if drawMessage && drawMessage.round === round.number}
      <div class="notice warn">{levelText[drawMessage.level]}</div>
    {/if}
    {#if issues.length}
      <div class="notice warn issues">
        <ul>
          {#each issues as issue, i (i)}<li>{issueText(issue)}</li>{/each}
        </ul>
      </div>
    {/if}

    <table class="matches">
      <thead>
        <tr>
          <th class="num">Terrain</th>
          <th class="team-a">Équipe</th>
          <th class="scores">Score</th>
          <th>Équipe</th>
          <th class="num">Points</th>
          {#if editing}<th></th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each visibleMatches as { match, terrain } (match.id)}
          {@const scores = effectiveScores(match, t.settings)}
          {@const points = scores ? matchPoints(scores[0], scores[1], t.settings.scoring) : null}
          <tr class:complete={!!scores} class:bye={match.teamB === null}>
            <td class="num terrain">{match.teamB === null ? '—' : terrain}</td>
            <td class="team-a" class:winner={scores && scores[0] > scores[1]}>
              {#if editing}
                <select value={match.teamA} onchange={(e) => {
                  assign(match, 'teamA', e.currentTarget.value);
                  e.currentTarget.value = match.teamA; // si l'utilisateur a annulé
                }}>
                  {#each teamOptions as o (o.id)}<option value={o.id}>{o.number} · {o.name}</option>{/each}
                </select>
              {:else}
                {teamLabel(match.teamA)}
              {/if}
            </td>
            <td class="scores">
              {#if match.teamB === null}
                <span class="muted">{t.settings.bye.scoreFor} – {t.settings.bye.scoreAgainst}</span>
              {:else}
                <input
                  class="score"
                  inputmode="numeric"
                  maxlength="2"
                  value={match.scoreA ?? ''}
                  oninput={(e) => (match.scoreA = parseScore(e.currentTarget.value))}
                  onkeydown={nextOnEnter}
                  aria-label={`Score ${teamLabel(match.teamA)}`}
                />
                <span class="dash">–</span>
                <input
                  class="score"
                  inputmode="numeric"
                  maxlength="2"
                  value={match.scoreB ?? ''}
                  oninput={(e) => (match.scoreB = parseScore(e.currentTarget.value))}
                  onkeydown={nextOnEnter}
                  aria-label={`Score ${teamLabel(match.teamB)}`}
                />
              {/if}
            </td>
            <td class:winner={scores && scores[1] > scores[0]}>
              {#if editing}
                <select value={match.teamB ?? ''} onchange={(e) => {
                  assign(match, 'teamB', e.currentTarget.value || null);
                  e.currentTarget.value = match.teamB ?? '';
                }}>
                  <option value="">— Exempte —</option>
                  {#each teamOptions as o (o.id)}<option value={o.id}>{o.number} · {o.name}</option>{/each}
                </select>
              {:else if match.teamB === null}
                <em class="muted">exempte</em>
              {:else}
                {teamLabel(match.teamB)}
              {/if}
            </td>
            <td class="num points">
              {#if points}{points[0]}{#if match.teamB !== null}&nbsp;–&nbsp;{points[1]}{/if}{/if}
              {#if scores && Math.max(...scores) > 13}<span class="warn-text" title="Score supérieur à 13">⚠</span>{/if}
            </td>
            {#if editing}
              <td><button class="link" onclick={() => removeMatch(match)}>Retirer</button></td>
            {/if}
          </tr>
        {:else}
          <tr><td colspan="6" class="muted">Aucune rencontre ne correspond à « {filter} ».</td></tr>
        {/each}
      </tbody>
    </table>

    {#if editing}
      <div class="actions edit-actions">
        <button onclick={addMatch} disabled={missingTeams.length === 0}>Ajouter une rencontre avec les équipes sans adversaire</button>
        <span class="muted small">Choisir une équipe déjà placée l'échange avec celle qu'elle remplace.</span>
      </div>
    {/if}

    <div class="actions footer">
      {#if !hasScores(round)}
        <button onclick={redraw}>Refaire le tirage</button>
      {/if}
      {#if round.number === t.rounds.length}
        <button class="danger" onclick={deleteRound}>Supprimer cette partie</button>
      {/if}
      {#if scoredCount(round) === playableCount(round) && round.number < t.settings.roundCount && round.number === t.rounds.length}
        <button class="primary" onclick={() => ((selected = round.number + 1), (filter = ''))}>Passer à la partie {round.number + 1} →</button>
      {/if}
    </div>
  </section>
{/if}

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

  .round-tabs .label {
    font-weight: 600;
  }

  .round-tabs .status {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .round-tabs button.done .status {
    color: var(--ok);
  }

  .round-tabs button.active {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
    background: var(--accent-soft);
  }

  .empty {
    text-align: center;
    padding: 2.5rem 1rem;
  }

  button.big {
    font-size: 1.1rem;
    padding: 0.7em 1.5em;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .toolbar h2 {
    margin: 0;
  }

  .toolbar input[type='search'] {
    flex: 1;
    min-width: 200px;
  }

  .issues ul {
    margin: 0;
    padding-left: 1.2rem;
  }

  .matches td {
    padding-top: 0.3em;
    padding-bottom: 0.3em;
  }

  .matches .team-a {
    text-align: right;
  }

  .matches .scores {
    text-align: center;
    white-space: nowrap;
    width: 9rem;
  }

  .matches tr.complete {
    background: color-mix(in srgb, var(--accent-soft) 45%, transparent);
  }

  .matches tr.bye {
    background: var(--surface-2);
  }

  .terrain {
    font-weight: 600;
    width: 4.5rem;
  }

  .winner {
    font-weight: 700;
  }

  input.score {
    width: 2.8em;
    text-align: center;
    font-size: 1.1rem;
    font-weight: 600;
    padding: 0.2em 0.2em;
  }

  .dash {
    margin: 0 0.25em;
    color: var(--muted);
  }

  .points {
    color: var(--muted);
    white-space: nowrap;
    width: 5.5rem;
  }

  .warn-text {
    color: var(--warn);
    margin-left: 0.3em;
  }

  select {
    max-width: 100%;
  }

  .edit-actions,
  .footer {
    margin-top: 1rem;
  }

  .footer {
    justify-content: flex-end;
  }

  .small {
    font-size: 0.85rem;
  }
</style>

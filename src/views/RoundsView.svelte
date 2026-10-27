<script lang="ts">
  import { tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { assignCourts, closedCourtsInUse, courtConflicts, displacedBy, freeCourts, isCourtOpen, isWaiting, setCourt, teamsReady } from '../lib/core/courts';
  import { newId } from '../lib/core/ids';
  import { drawRound, validateRound, type DrawLevel, type RoundIssue } from '../lib/core/pairing';
  import { effectiveScores, matchPoints } from '../lib/core/scoring';
  import type { Match, Round } from '../lib/core/types';
  import { app } from '../lib/store.svelte';
  import Help from '../Help.svelte';
  import RoundTabs, { playableCount, scoredCount } from './RoundTabs.svelte';
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
  const conflicts = $derived(round ? courtConflicts(t, round) : []);
  const closedInUse = $derived(round ? closedCourtsInUse(t, round) : []);
  const free = $derived(round ? freeCourts(t, round.number) : []);
  const waiting = $derived(round ? round.matches.filter(isWaiting) : []);
  /** Rencontres en attente dont une équipe joue encore une partie précédente (sans objet si les parties sont synchronisées). */
  const notReady = $derived(round && !t.settings.syncRounds ? new Set(waiting.filter((m) => !teamsReady(t, round, m))) : new Set<Match>());
  const hasScores = (r: Round) => r.matches.some((m) => m.scoreA !== null || m.scoreB !== null);

  const visibleMatches = $derived.by(() => {
    if (!round) return [];
    const q = filter.trim().toLowerCase();
    return round.matches.filter((match) => {
      if (!q) return true;
      return [match.teamA, match.teamB].some((id) => {
        const team = id ? teamsById.get(id) : undefined;
        return team && (team.name.toLowerCase().includes(q) || String(team.number) === q);
      });
    });
  });

  /** Rencontres dont on affiche la prochaine partie des deux équipes. */
  const showNext = new SvelteSet<string>();
  const nextRound = $derived(round ? t.rounds.find((r) => r.number === round.number + 1) : undefined);
  const hasNextRound = $derived(!!round && round.number < t.settings.roundCount);

  /** Rencontre de l'équipe dans la partie suivante, ou `undefined` si elle n'est pas tirée. */
  function nextMatchOf(teamId: string): Match | undefined {
    return nextRound?.matches.find((m) => m.teamA === teamId || m.teamB === teamId);
  }

  const teamName = (id: string | null) => (id ? (teamsById.get(id)?.name ?? '?') : '?');

  const teamLabel = (id: string | null) => {
    const team = id ? teamsById.get(id) : undefined;
    return team ? `${team.number} · ${team.name}` : '?';
  };

  function draw() {
    const result = drawRound(t, selected);
    const existing = t.rounds.find((r) => r.number === selected);
    if (existing) existing.matches = result.matches;
    else t.rounds.push({ number: selected, matches: result.matches });
    assignCourts(t);
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
    assignCourts(t);
    editing = false;
  }

  function parseScore(raw: string): number | null {
    const digits = raw.replace(/\D/g, '');
    return digits === '' ? null : Math.min(Number(digits), 99);
  }

  /** Score saisi : le terrain de la rencontre se libère pour la suivante. */
  function scoreChanged() {
    assignCourts(t);
  }

  /** Terrain saisi à la main, par exemple quand on sait qu'un terrain est libre avant d'avoir le score. */
  function changeCourt(match: Match, input: HTMLInputElement) {
    if (!round) return;
    const digits = input.value.replace(/\D/g, '');
    const court = digits === '' ? null : Number(digits);
    const max = t.settings.courtCount;
    const revert = () => (input.value = String(match.court ?? ''));
    if (court === match.court || (court === null && match.court == null)) return revert();
    if (court !== null && (court < 1 || court > max)) {
      alert(`Les terrains sont numérotés de 1 à ${max}.`);
      return revert();
    }
    if (court !== null && !isCourtOpen(t.settings, court, round.number)) {
      if (!confirm(`Le terrain ${court} est neutralisé pour la partie ${round.number}. L'attribuer quand même à cette rencontre ?`)) return revert();
    }
    const displaced = displacedBy(t, match, court);
    if (displaced.length) {
      const names = displaced.map((m) => `${teamLabel(m.teamA)} contre ${teamLabel(m.teamB)}${partOf(m)}`).join(', ');
      if (!confirm(`Le terrain ${court} est occupé par « ${names} », dont le score n'est pas encore saisi. Considérer cette rencontre comme terminée ?`)) return revert();
    }
    setCourt(t, match, court);
    // Le terrain quitté, et celui des rencontres considérées comme terminées, vont aux rencontres en attente.
    assignCourts(t);
  }

  /** « (partie 1) » pour une rencontre d'une autre partie que celle affichée. */
  function partOf(match: Match): string {
    const r = t.rounds.find((x) => x.matches.includes(match));
    return r && r !== round ? ` (partie ${r.number})` : '';
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
    assignCourts(t);
  }

  const missingTeams = $derived(issues.find((i) => i.kind === 'missing')?.teamIds ?? []);

  function addMatch() {
    if (!round || missingTeams.length === 0) return;
    const [a, b = null] = missingTeams;
    round.matches.push({ id: newId(), teamA: a, teamB: b, scoreA: null, scoreB: null, court: null });
    assignCourts(t);
  }

  function removeMatch(match: Match) {
    if (!round) return;
    if ((match.scoreA !== null || match.scoreB !== null) && !confirm('Supprimer cette rencontre et son score ?')) return;
    round.matches.splice(round.matches.indexOf(match), 1);
    assignCourts(t);
  }

  function issueText(issue: RoundIssue): string {
    const names = issue.teamIds.map((id) => teamsById.get(id)?.name ?? '?').join(' / ');
    switch (issue.kind) {
      case 'same-club':
        return `Même club : ${names}`;
      case 'same-sector':
        return `Même secteur : ${names}`;
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
    'same-sector-allowed': 'Impossible d’éviter toutes les rencontres entre équipes du même secteur.',
    'rematch-allowed': 'Impossible d’éviter toutes les revanches : certaines équipes se rencontrent une deuxième fois.',
    'rematch-and-same-sector-allowed': 'Impossible d’éviter à la fois les revanches et les rencontres entre équipes du même secteur.',
    'same-club-allowed': 'Impossible d’éviter toutes les rencontres entre équipes du même club (le secteur n’est plus pris en compte).',
    unconstrained: 'Impossible d’éviter à la fois les revanches et les rencontres entre équipes du même club (le secteur n’est plus pris en compte).',
  };
</script>

{#snippet nextOf(teamId: string)}
  {@const next = nextMatchOf(teamId)}
  {#if !nextRound}
    <span class="muted">Partie {round!.number + 1} pas encore tirée</span>
  {:else if !next}
    <span class="muted">Pas de rencontre</span>
  {:else if next.teamB === null}
    <span class="name">{teamName(teamId)}</span> <em class="muted">exempte</em>
  {:else}
    <span class="next-match"><span class="name">{teamName(teamId)}</span> – <span class="name">{teamName(next.teamA === teamId ? next.teamB : next.teamA)}</span></span>
    <span class="next-court">{next.court != null ? `Terrain ${next.court}` : 'En attente d’un terrain'}</span>
  {/if}
{/snippet}

<RoundTabs
  {selected}
  selectable={(n) => t.rounds.some((r) => r.number === n) || n === t.rounds.length + 1}
  onselect={(n) => {
    selected = n;
    editing = false;
    filter = '';
  }}
/>

{#if !round}
  <section class="card empty">
    <h2>
      Partie {selected}
      <Help>Le tirage évite les rencontres entre équipes d'un même club ou d'un même secteur, et les rencontres déjà jouées.</Help>
    </h2>
    {#if t.teams.length < 2}
      <p>Ajoutez d'abord les équipes (onglet « Équipes »).</p>
    {:else}
      <p>
        {t.teams.length} équipes : {Math.floor(t.teams.length / 2)} rencontres{#if t.teams.length % 2}
          , et une équipe exempte (score forfaitaire {t.settings.bye.scoreFor}-{t.settings.bye.scoreAgainst}){/if}.
      </p>
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
    {#if issues.length || conflicts.length || closedInUse.length}
      <div class="notice warn issues">
        <ul>
          {#each issues as issue, i (i)}<li>{issueText(issue)}</li>{/each}
          {#each conflicts as court (court)}<li>Plusieurs rencontres en cours sur le terrain {court}</li>{/each}
          {#each closedInUse as court (court)}<li>Rencontre en cours sur le terrain {court}, neutralisé pour cette partie : elle peut finir, ou être déplacée en indiquant un autre terrain</li>{/each}
        </ul>
      </div>
    {/if}
    {#if waiting.length}
      <p class="courts-status">
        <strong>{waiting.length}</strong> rencontre{waiting.length > 1 ? 's' : ''} en attente d'un terrain{#if notReady.size}, dont {notReady.size} où une équipe joue encore une partie précédente{/if}.
        {#if free.length}Terrain{free.length > 1 ? 's' : ''} libre{free.length > 1 ? 's' : ''} : {free.join(', ')}.{:else}<span class="muted">Un terrain se libère à la saisie du score ; on peut aussi indiquer le terrain à la main.</span>{/if}
      </p>
    {/if}

    <div class="table-scroll">
      <table class="matches">
        <!-- Largeurs fixes : elles ne changent ni d'une partie à l'autre, ni en ouvrant la partie suivante. -->
        <colgroup>
          <col class="col-court" />
          <col />
          <col class="col-scores" />
          <col />
          <col class="col-points" />
          {#if hasNextRound}<col class="col-toggle" />{/if}
          {#if editing}<col class="col-edit" />{/if}
        </colgroup>
        <thead>
          <tr>
            <th class="num">Terrain</th>
            <th class="team-a">Équipe</th>
            <th class="scores">Score</th>
            <th>Équipe</th>
            <th class="num">Points</th>
            {#if hasNextRound}<th></th>{/if}
            {#if editing}<th></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each visibleMatches as match (match.id)}
            {@const scores = effectiveScores(match, t.settings)}
            {@const points = scores ? matchPoints(scores[0], scores[1], t.settings.scoring) : null}
            <tr class:complete={!!scores} class:bye={match.teamB === null} class:waiting={isWaiting(match)} class:expanded={hasNextRound && showNext.has(match.id)}>
              <td class="num terrain">
                {#if match.teamB === null}
                  —
                {:else}
                  <input
                    class="court"
                    inputmode="numeric"
                    maxlength="2"
                    placeholder={notReady.has(match) ? 'en jeu' : 'attente'}
                    title={notReady.has(match) ? 'Une équipe joue encore une partie précédente' : undefined}
                    value={match.court ?? ''}
                    onchange={(e) => changeCourt(match, e.currentTarget)}
                    aria-label={`Terrain de ${teamLabel(match.teamA)} contre ${teamLabel(match.teamB)}`}
                  />
                {/if}
              </td>
              <td class="team-a" class:winner={scores && scores[0] > scores[1]}>
                {#if editing}
                  <select value={match.teamA} onchange={(e) => {
                    assign(match, 'teamA', e.currentTarget.value);
                    e.currentTarget.value = match.teamA; // si l'utilisateur a annulé
                  }}>
                    {#each teamOptions as o (o.id)}<option value={o.id}>{o.number} · {o.name}</option>{/each}
                  </select>
                {:else}
                  <span class="name">{teamLabel(match.teamA)}</span>
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
                    onchange={scoreChanged}
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
                    onchange={scoreChanged}
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
                  <span class="name">{teamLabel(match.teamB)}</span>
                {/if}
              </td>
              <td class="num points">
                {#if points}{points[0]}{#if match.teamB !== null}&nbsp;–&nbsp;{points[1]}{/if}{/if}
                {#if scores && Math.max(...scores) > 13}<span class="warn-text" title="Score supérieur à 13">⚠</span>{/if}
              </td>
              {#if hasNextRound}
                <td class="next-toggle">
                  <button
                    class="toggle"
                    class:open={showNext.has(match.id)}
                    aria-expanded={showNext.has(match.id)}
                    title={`Partie ${round.number + 1} de ces équipes`}
                    aria-label={`Partie ${round.number + 1} de ${teamLabel(match.teamA)}${match.teamB ? ` et de ${teamLabel(match.teamB)}` : ''}`}
                    onclick={() => (showNext.has(match.id) ? showNext.delete(match.id) : showNext.add(match.id))}
                  >{showNext.has(match.id) ? '−' : '+'}</button>
                </td>
              {/if}
              {#if editing}
                <td><button class="link" onclick={() => removeMatch(match)}>Retirer</button></td>
              {/if}
            </tr>
            {#if hasNextRound && showNext.has(match.id)}
              <tr class="next-row" class:complete={!!scores} class:bye={match.teamB === null}>
                <td class="num muted next-label">Partie {round.number + 1}</td>
                <td class="team-a">{@render nextOf(match.teamA)}</td>
                <td></td>
                <td>{#if match.teamB}{@render nextOf(match.teamB)}{/if}</td>
                <td colspan={editing ? 3 : 2}></td>
              </tr>
            {/if}
          {:else}
            <tr><td colspan="7" class="muted">Aucune rencontre ne correspond à « {filter} ».</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if editing}
      <div class="actions edit-actions">
        <button onclick={addMatch} disabled={missingTeams.length === 0}>Ajouter une rencontre avec les équipes sans adversaire</button>
        <span><Help>Choisir une équipe déjà placée l'échange avec celle qu'elle remplace.</Help></span>
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

  /* Sur un écran étroit, le tableau défile plutôt que d'écraser les noms d'équipe. */
  .table-scroll {
    overflow-x: auto;
  }

  .matches {
    table-layout: fixed;
    min-width: 46rem;
  }

  .col-court {
    width: 5.5rem;
  }

  .col-scores {
    width: 9rem;
  }

  .col-points {
    width: 5.5rem;
  }

  .col-toggle {
    width: 2.8rem;
  }

  .col-edit {
    width: 6rem;
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
  }

  .matches tr.complete {
    background: color-mix(in srgb, var(--accent-soft) 45%, transparent);
  }

  .matches tr.bye {
    background: var(--surface-2);
  }

  .terrain {
    font-weight: 600;
  }

  input.court {
    width: 3.6em;
    text-align: center;
    font-weight: 600;
    padding: 0.2em;
  }

  input.court::placeholder {
    font-weight: 400;
    font-size: 0.8rem;
    font-style: italic;
  }

  .matches tr.waiting input.court {
    border-style: dashed;
  }

  .courts-status {
    margin: 0 0 0.75rem;
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

  .toggle {
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    justify-content: center;
    font-weight: 700;
    line-height: 1;
  }

  .toggle.open {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  /* La ligne de la partie suivante prolonge celle de la rencontre, sans trait entre les deux. */
  .matches tr.expanded td {
    border-bottom: none;
  }

  .matches tr.next-row td {
    padding-top: 0;
    font-size: 0.82rem;
  }

  .next-label {
    white-space: nowrap;
  }

  /* Un nom d'équipe ne se coupe jamais : le numéro (« VALCOMBE 2 ») resterait seul sur sa ligne. */
  .name {
    white-space: nowrap;
  }

  .next-match,
  .next-court {
    display: block;
  }

  .next-court {
    font-weight: 600;
  }

  .points {
    color: var(--muted);
    white-space: nowrap;
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
</style>

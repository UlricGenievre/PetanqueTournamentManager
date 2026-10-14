<script lang="ts">
  import { normalizeClub } from '../lib/core/pairing';
  import { clubFromTeamName, nextTeamNumber, parseTeamLines } from '../lib/core/tournament';
  import type { Team } from '../lib/core/types';
  import { app } from '../lib/store.svelte';

  let pasted = $state('');
  let newName = $state('');

  const t = $derived(app.tournament);
  const sorted = $derived([...t.teams].sort((a, b) => a.number - b.number));
  const playing = $derived(new Set(t.rounds.flatMap((r) => r.matches.flatMap((m) => [m.teamA, m.teamB]))));
  const duplicateNumbers = $derived(
    new Set(t.teams.map((x) => x.number).filter((n, i, all) => all.indexOf(n) !== i)),
  );
  const clubs = $derived.by(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const team of t.teams) {
      const key = normalizeClub(team.club);
      const entry = counts.get(key) ?? { label: team.club, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  });
  const pastedCount = $derived(pasted.split(/\r?\n/).filter((l) => l.trim()).length);

  function addPasted() {
    t.teams.push(...parseTeamLines(pasted, nextTeamNumber(t)));
    pasted = '';
  }

  function addOne(e: SubmitEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    t.teams.push(...parseTeamLines(newName, nextTeamNumber(t)));
    newName = '';
  }

  function rename(team: Team, name: string) {
    // Le club suit le nom tant qu'il n'a pas été modifié à la main.
    if (team.club === clubFromTeamName(team.name)) team.club = clubFromTeamName(name);
    team.name = name;
  }

  function remove(team: Team) {
    if (confirm(`Supprimer l'équipe « ${team.name} » ?`)) t.teams.splice(t.teams.indexOf(team), 1);
  }

  function renumber() {
    if (!confirm('Renuméroter les équipes de 1 à ' + t.teams.length + ' dans l’ordre alphabétique ?')) return;
    [...t.teams].sort((a, b) => a.name.localeCompare(b.name, 'fr')).forEach((team, i) => (team.number = i + 1));
  }
</script>

<div class="layout">
  <section class="card list">
    <div class="list-header">
      <h2>Équipes inscrites</h2>
      {#if t.teams.length > 1 && t.rounds.length === 0}
        <button onclick={renumber}>Renuméroter par ordre alphabétique</button>
      {/if}
    </div>

    {#if t.teams.length === 0}
      <p class="muted">Aucune équipe pour l'instant. Collez la liste des équipes à droite, ou ajoutez-les une par une.</p>
    {:else}
      {#if duplicateNumbers.size}
        <div class="notice warn">Plusieurs équipes portent le même numéro : {[...duplicateNumbers].join(', ')}.</div>
      {/if}
      <table>
        <thead>
          <tr><th class="num">N°</th><th>Nom de l'équipe</th><th>Club</th><th></th></tr>
        </thead>
        <tbody>
          {#each sorted as team (team.id)}
            <tr>
              <td class="num">
                <input
                  class="number"
                  type="number"
                  min="1"
                  value={team.number}
                  class:invalid={duplicateNumbers.has(team.number)}
                  onchange={(e) => (team.number = Number(e.currentTarget.value) || team.number)}
                  aria-label="Numéro"
                />
              </td>
              <td><input value={team.name} onchange={(e) => rename(team, e.currentTarget.value.trim())} aria-label="Nom" /></td>
              <td><input value={team.club} onchange={(e) => (team.club = e.currentTarget.value.trim())} aria-label="Club" /></td>
              <td>
                {#if playing.has(team.id)}
                  <span class="muted small" title="L'équipe figure dans un tirage : retirez-la d'abord des rencontres.">dans un tirage</span>
                {:else}
                  <button class="link" onclick={() => remove(team)}>Supprimer</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <aside>
    <section class="card">
      <h3>Ajouter une équipe</h3>
      <form class="row" onsubmit={addOne}>
        <input bind:value={newName} placeholder="ex. MIRANDOL 3" aria-label="Nom de la nouvelle équipe" />
        <button class="primary" type="submit" disabled={!newName.trim()}>Ajouter</button>
      </form>
    </section>

    <section class="card">
      <h3>Coller une liste</h3>
      <p class="muted small">Une équipe par ligne. Le club est déduit du nom : « VALCOMBE 2 » → club « VALCOMBE ».</p>
      <textarea rows="8" bind:value={pasted} placeholder={'VALCOMBE 1\nVALCOMBE 2\nMIRANDOL 1\nSERVIAC'}></textarea>
      <button class="primary" onclick={addPasted} disabled={pastedCount === 0}>
        Ajouter {pastedCount || ''} équipe{pastedCount > 1 ? 's' : ''}
      </button>
    </section>

    {#if clubs.length}
      <section class="card">
        <h3>Clubs ({clubs.length})</h3>
        <p class="muted small">Deux équipes d'un même club ne se rencontrent pas au tirage.</p>
        <ul class="clubs">
          {#each clubs as club (club.label)}
            <li><span>{club.label}</span><span class="muted">{club.count}</span></li>
          {/each}
        </ul>
      </section>
    {/if}
  </aside>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 1rem;
    align-items: start;
  }

  @media (max-width: 860px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    flex-wrap: wrap;
  }

  td input {
    width: 100%;
    border-color: transparent;
    background: transparent;
  }

  td input:hover,
  td input:focus {
    border-color: var(--border);
    background: var(--surface);
  }

  input.number {
    width: 4.5em;
    text-align: right;
  }

  input.invalid {
    border-color: var(--warn);
    background: var(--warn-soft);
  }

  textarea {
    width: 100%;
    margin-bottom: 0.6rem;
    resize: vertical;
  }

  form input {
    flex: 1;
  }

  .small {
    font-size: 0.85rem;
  }

  .clubs {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 18rem;
    overflow-y: auto;
  }

  .clubs li {
    display: flex;
    justify-content: space-between;
    padding: 0.2em 0;
    border-bottom: 1px solid var(--surface-2);
  }
</style>

<script lang="ts">
  import { assignCourts, formatCourtList, parseCourtList, setSyncRounds } from '../lib/core/courts';
  import type { CourtClosure } from '../lib/core/types';
  import { app } from '../lib/store.svelte';
  import Help from '../Help.svelte';

  const t = $derived(app.tournament);
  const s = $derived(t.settings);

  /** Les terrains ajoutés vont aux rencontres en attente. */
  function setCourtCount(input: HTMLInputElement) {
    const n = Number(input.value);
    if (input.value.trim() !== '' && Number.isInteger(n) && n >= 1) s.courtCount = Math.min(n, 99);
    input.value = String(s.courtCount);
    assignCourts(t);
  }

  function setRoundCount(input: HTMLInputElement) {
    const n = Number(input.value);
    const min = Math.max(1, t.rounds.length);
    if (Number.isInteger(n) && n >= min) s.roundCount = Math.min(20, n);
    input.value = String(s.roundCount);
  }

  /** Toute neutralisation modifiée redonne les terrains : ceux qui se ferment ne sont plus attribués. */
  function setClosedCourts(closures: CourtClosure[]) {
    s.closedCourts = closures;
    assignCourts(t);
  }

  function updateClosure(i: number, change: Partial<CourtClosure>) {
    setClosedCourts((s.closedCourts ?? []).map((c, j) => (j === i ? { ...c, ...change } : c)));
  }

  function setClosureFrom(i: number, input: HTMLInputElement) {
    const n = Number(input.value);
    const to = s.closedCourts![i].toRound;
    if (Number.isInteger(n) && n >= 1) updateClosure(i, { fromRound: Math.min(n, to ?? s.roundCount) });
    input.value = String(s.closedCourts![i].fromRound);
  }

  /** Champ vide : jusqu'à la fin du tournoi. */
  function setClosureTo(i: number, input: HTMLInputElement) {
    const raw = input.value.trim();
    const n = Number(raw);
    if (raw === '') updateClosure(i, { toRound: null });
    else if (Number.isInteger(n) && n >= s.closedCourts![i].fromRound) updateClosure(i, { toRound: n });
    input.value = String(s.closedCourts![i].toRound ?? '');
  }
</script>

<div class="grid">
  <section class="card">
    <h2>Tournoi</h2>
    <div class="fields">
      <label class="wide">Nom<input bind:value={t.name} /></label>
      <label>Date<input type="date" bind:value={t.date} /></label>
      <label>
        Nombre de parties
        <input type="number" min={Math.max(1, t.rounds.length)} max="20" value={s.roundCount} onchange={(e) => setRoundCount(e.currentTarget)} />
      </label>
    </div>
    <button class="danger" onclick={() => app.confirmLeave() && app.newTournament()}>Nouveau tournoi</button>
  </section>

  <section class="card">
    <h2>
      Terrains
      <Help>Terrains numérotés de 1 à n. Un terrain se libère à la saisie du score de la rencontre qui l'occupe.</Help>
    </h2>
    <div class="fields">
      <label>
        Nombre de terrains
        <input type="number" min="1" max="99" required value={s.courtCount} onchange={(e) => setCourtCount(e.currentTarget)} />
      </label>
    </div>
    <div class="option">
      <label class="check">
        <input type="checkbox" checked={!!s.syncRounds} onchange={(e) => setSyncRounds(t, e.currentTarget.checked)} />
        Synchroniser les parties
      </label>
      <Help>
        Cochée : une partie ne démarre que lorsque toutes les rencontres de la précédente sont terminées. Chaque
        rencontre reçoit son terrain dès le tirage : une équipe qui rapporte son score apprend aussitôt son prochain
        adversaire et son terrain. S'il y a plus de rencontres que de terrains, les rencontres restantes attendent qu'un
        terrain de leur partie se libère.<br />
        Décochée : les parties s'enchaînent terrain par terrain. Une rencontre reçoit un terrain libre dès que ses deux
        équipes ont fini leur partie précédente.
      </Help>
    </div>

    <h3>
      Terrains neutralisés
      <Help>
        Ces terrains ne sont pas attribués aux rencontres des parties indiquées ; sans dernière partie, ils restent
        neutralisés jusqu'à la fin du tournoi. Une rencontre déjà en cours sur l'un d'eux peut finir. Exemple : « 4, 9, 12-14 ».
      </Help>
    </h3>
    {#each s.closedCourts ?? [] as closure, i (i)}
      <div class="row closure">
        <label class="grow">
          Terrains
          <input
            value={formatCourtList(closure.courts)}
            placeholder="4, 9, 12-14"
            onchange={(e) => {
              updateClosure(i, { courts: parseCourtList(e.currentTarget.value) });
              e.currentTarget.value = formatCourtList(s.closedCourts![i].courts);
            }}
          />
        </label>
        <label>
          De la partie
          <input class="tiny" type="number" min="1" max={closure.toRound ?? s.roundCount} value={closure.fromRound} onchange={(e) => setClosureFrom(i, e.currentTarget)} />
        </label>
        <label>
          à
          <input class="tiny" type="number" min={closure.fromRound} placeholder="fin" value={closure.toRound ?? ''} onchange={(e) => setClosureTo(i, e.currentTarget)} />
        </label>
        <button class="link" onclick={() => setClosedCourts((s.closedCourts ?? []).filter((_, j) => j !== i))} title="Retirer cette neutralisation" aria-label="Retirer cette neutralisation">✕</button>
      </div>
    {/each}
    <button class="link" onclick={() => (s.closedCourts = [...(s.closedCourts ?? []), { courts: [], fromRound: 1 }])}>+ Neutraliser des terrains</button>
  </section>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
    align-items: start;
  }

  .grid .card {
    margin: 0;
  }

  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .fields .wide {
    flex: 1 1 100%;
  }

  .option {
    margin-bottom: 1.25rem;
  }

  label.check {
    flex-direction: row;
    align-items: center;
    gap: 0.45em;
    font-size: 1rem;
    color: var(--text);
  }

  input.tiny {
    width: 3.8em;
    text-align: right;
  }

  .closure {
    align-items: flex-end;
    margin-bottom: 0.5rem;
  }

  .closure .grow {
    flex: 1 1 6em;
    min-width: 0;
  }

  .closure .grow input {
    width: 100%;
  }

  .closure .link {
    padding-bottom: 0.5em;
  }
</style>

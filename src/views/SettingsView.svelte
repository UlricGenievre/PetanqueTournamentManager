<script lang="ts">
  import { assignCourts, formatCourtList, parseCourtList } from '../lib/core/courts';
  import type { CourtClosure } from '../lib/core/types';
  import { DEFAULT_SCORING } from '../lib/core/scoring';
  import { exportXlsx } from '../lib/export-xlsx';
  import { canUseFileSystem } from '../lib/persistence';
  import { app } from '../lib/store.svelte';

  const t = $derived(app.tournament);
  const s = $derived(t.settings);
  let fileInput = $state<HTMLInputElement>();
  let error = $state('');

  async function run(action: () => Promise<void> | void) {
    error = '';
    try {
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function confirmLeave(): boolean {
    if (t.teams.length === 0) return true;
    const where = app.fileHandle ? `Il reste enregistré dans « ${app.fileHandle.name} ».` : "Il n'est enregistré dans aucun fichier : téléchargez d'abord une sauvegarde si vous voulez le garder.";
    return confirm(`Fermer le tournoi « ${t.name} » ? ${where}`);
  }

  function setNumber(apply: (n: number) => void, raw: string, min = 0) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= min) apply(n);
  }

  /** Champ vide : un terrain par rencontre. Les terrains ajoutés vont aux rencontres en attente. */
  function setCourtCount(input: HTMLInputElement) {
    const raw = input.value.trim();
    const n = Number(raw);
    if (raw === '') s.courtCount = null;
    else if (Number.isInteger(n) && n >= 1) s.courtCount = Math.min(n, 99);
    input.value = String(s.courtCount ?? '');
    assignCourts(t);
  }

  /** Toute neutralisation modifiée redonne les terrains : ceux qui se ferment ne sont plus attribués. */
  function setClosedCourts(closures: CourtClosure[]) {
    s.closedCourts = closures;
    assignCourts(t);
  }

  function updateClosure(i: number, change: Partial<CourtClosure>) {
    setClosedCourts((s.closedCourts ?? []).map((c, j) => (j === i ? { ...c, ...change } : c)));
  }

  function setClosureRound(i: number, input: HTMLInputElement) {
    const n = Number(input.value);
    if (Number.isInteger(n) && n >= 1) updateClosure(i, { fromRound: Math.min(n, s.roundCount) });
    input.value = String(s.closedCourts![i].fromRound);
  }

  const isDefaultScoring = $derived(s.scoring.total === DEFAULT_SCORING.total && s.scoring.table.join() === DEFAULT_SCORING.table.join());
</script>

{#if error}
  <div class="notice error">{error}</div>
{/if}

<div class="grid">
  <section class="card">
    <h2>Tournoi</h2>
    <div class="fields">
      <label class="wide">Nom<input bind:value={t.name} /></label>
      <label>Date<input type="date" bind:value={t.date} /></label>
      <label>
        Nombre de parties
        <input
          type="number"
          min={Math.max(1, t.rounds.length)}
          max="20"
          value={s.roundCount}
          onchange={(e) => setNumber((n) => (s.roundCount = Math.min(20, n)), e.currentTarget.value, Math.max(1, t.rounds.length))}
        />
      </label>
      <label>
        Nombre de terrains
        <input type="number" min="1" max="99" placeholder="illimité" value={s.courtCount ?? ''} onchange={(e) => setCourtCount(e.currentTarget)} />
      </label>
    </div>
    <p class="muted small">
      Terrains numérotés de 1 à n, partagés entre les parties. Une rencontre reçoit un terrain libre dès que ses deux
      équipes ont fini leur partie précédente ; un terrain se libère à la saisie du score. Sans nombre, chaque rencontre
      a son terrain.
    </p>

    <h3>Terrains neutralisés</h3>
    <p class="muted small">
      Ces terrains ne sont plus attribués aux rencontres de la partie indiquée et des suivantes (partie 1 : pendant tout le
      tournoi). Une rencontre déjà en cours sur l'un d'eux peut finir. Exemple : « 4, 9, 12-14 ».
    </p>
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
          Dès la partie
          <input class="short" type="number" min="1" max={s.roundCount} value={closure.fromRound} onchange={(e) => setClosureRound(i, e.currentTarget)} />
        </label>
        <button class="link" onclick={() => setClosedCourts((s.closedCourts ?? []).filter((_, j) => j !== i))} title="Retirer cette neutralisation" aria-label="Retirer cette neutralisation">✕</button>
      </div>
    {/each}
    <button class="link add-closure" onclick={() => (s.closedCourts = [...(s.closedCourts ?? []), { courts: [], fromRound: 1 }])}>+ Neutraliser des terrains</button>

    <h3>Équipe exempte (nombre impair d'équipes)</h3>
    <p class="muted small">Score forfaitaire attribué à l'équipe qui ne joue pas.</p>
    <div class="row">
      <label>Pour<input class="short" type="number" min="0" value={s.bye.scoreFor} onchange={(e) => setNumber((n) => (s.bye.scoreFor = n), e.currentTarget.value)} /></label>
      <span class="dash">–</span>
      <label>Contre<input class="short" type="number" min="0" value={s.bye.scoreAgainst} onchange={(e) => setNumber((n) => (s.bye.scoreAgainst = n), e.currentTarget.value)} /></label>
    </div>
  </section>

  <section class="card">
    <h2>Barème</h2>
    <p class="muted small">
      Chaque partie distribue
      <input class="short inline" type="number" min="1" value={s.scoring.total} onchange={(e) => setNumber((n) => (s.scoring.total = n), e.currentTarget.value, 1)} />
      points selon l'écart de score.
    </p>
    <table class="scoring">
      <thead><tr><th class="num">Écart</th><th class="num">Gagnant</th><th class="num">Perdant</th></tr></thead>
      <tbody>
        {#each s.scoring.table as points, diff (diff)}
          <tr>
            <td class="num">{diff === 0 ? 'égalité' : diff === s.scoring.table.length - 1 ? `${diff} et +` : diff}</td>
            <td class="num">
              <input
                class="short"
                type="number"
                min="0"
                max={s.scoring.total}
                value={points}
                onchange={(e) => setNumber((n) => (s.scoring.table[diff] = Math.min(n, s.scoring.total)), e.currentTarget.value)}
                aria-label={`Points du gagnant pour un écart de ${diff}`}
              />
            </td>
            <td class="num muted">{s.scoring.total - points}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if !isDefaultScoring}
      <button class="link" onclick={() => (s.scoring = { total: DEFAULT_SCORING.total, table: [...DEFAULT_SCORING.table] })}>Revenir au barème des 12 Heures</button>
    {/if}
  </section>

  <section class="card">
    <h2>Fichier</h2>
    {#if app.fileHandle}
      <p>Le tournoi est enregistré automatiquement dans <strong>« {app.fileHandle.name} »</strong> à chaque modification.</p>
    {:else if canUseFileSystem}
      <p>Le tournoi est enregistré dans ce navigateur. Pour plus de sécurité, enregistrez-le dans un fichier : il sera ensuite tenu à jour automatiquement.</p>
    {:else}
      <p>Ce navigateur ne peut pas tenir un fichier à jour : le tournoi est enregistré dans le navigateur, téléchargez une sauvegarde de temps en temps.</p>
    {/if}

    <div class="stack">
      {#if canUseFileSystem}
        <button onclick={() => run(() => app.saveAs())}>{app.fileHandle ? 'Enregistrer sous un autre nom…' : 'Enregistrer dans un fichier…'}</button>
        <button onclick={() => confirmLeave() && run(() => app.openFile())}>Ouvrir un tournoi…</button>
      {:else}
        <button onclick={() => app.downloadBackup()}>Télécharger une sauvegarde</button>
        <button onclick={() => confirmLeave() && fileInput?.click()}>Ouvrir une sauvegarde…</button>
        <input
          bind:this={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onchange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) run(() => app.importFile(file));
            e.currentTarget.value = '';
          }}
        />
      {/if}
      <button onclick={() => run(() => exportXlsx($state.snapshot(t)))} disabled={t.teams.length === 0}>Exporter vers Excel</button>
      <button class="danger" onclick={() => confirmLeave() && app.newTournament()}>Nouveau tournoi</button>
    </div>
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

  input.short {
    width: 4.5em;
    text-align: right;
  }

  input.inline {
    padding: 0.1em 0.3em;
  }

  .dash {
    padding-bottom: 0.4em;
  }

  .closure {
    align-items: flex-end;
    margin-bottom: 0.5rem;
  }

  .closure .grow {
    flex: 1 1 8em;
  }

  .closure .grow input {
    width: 100%;
  }

  .closure .link {
    padding-bottom: 0.5em;
  }

  .add-closure {
    margin-bottom: 1.25rem;
  }

  .scoring {
    width: auto;
    margin-bottom: 0.5rem;
  }

  .scoring td {
    padding: 0.15em 0.75em;
  }

  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .small {
    font-size: 0.85rem;
  }
</style>

<script lang="ts">
  import { DEFAULT_SCORING } from '../lib/core/scoring';
  import { exportXlsx } from '../lib/export-xlsx';
  import { canUseFileSystem } from '../lib/persistence';
  import { app } from '../lib/store.svelte';
  import Help from '../Help.svelte';

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

  function setNumber(apply: (n: number) => void, raw: string, min = 0) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= min) apply(n);
  }

  const isDefaultScoring = $derived(s.scoring.total === DEFAULT_SCORING.total && s.scoring.table.join() === DEFAULT_SCORING.table.join());
</script>

{#if error}
  <div class="notice error">{error}</div>
{/if}

<div class="grid">
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

    <h3>Équipe exempte <Help>Score forfaitaire attribué à l'équipe qui ne joue pas, quand le nombre d'équipes est impair.</Help></h3>
    <div class="row">
      <label>Pour<input class="short" type="number" min="0" value={s.bye.scoreFor} onchange={(e) => setNumber((n) => (s.bye.scoreFor = n), e.currentTarget.value)} /></label>
      <span class="dash">–</span>
      <label>Contre<input class="short" type="number" min="0" value={s.bye.scoreAgainst} onchange={(e) => setNumber((n) => (s.bye.scoreAgainst = n), e.currentTarget.value)} /></label>
    </div>
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
        <button onclick={() => app.confirmLeave() && run(() => app.openFile())}>Ouvrir un tournoi…</button>
      {:else}
        <button onclick={() => app.downloadBackup()}>Télécharger une sauvegarde</button>
        <button onclick={() => app.confirmLeave() && fileInput?.click()}>Ouvrir une sauvegarde…</button>
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

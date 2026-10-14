<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { canUseFileSystem } from './lib/persistence';
  import { app } from './lib/store.svelte';
  import PrintArea from './print/PrintArea.svelte';
  import RoundsView from './views/RoundsView.svelte';
  import SettingsView from './views/SettingsView.svelte';
  import StandingsView from './views/StandingsView.svelte';
  import TeamsView from './views/TeamsView.svelte';

  type Tab = 'settings' | 'teams' | 'rounds' | 'standings';
  let tab = $state<Tab>(app.tournament.teams.length ? 'rounds' : 'teams');

  onMount(() => void app.init());

  // Toute modification du tournoi déclenche une sauvegarde.
  $effect(() => {
    const json = JSON.stringify(app.tournament);
    untrack(() => app.persist(json));
  });

  const tabs: { id: Tab; label: () => string }[] = [
    { id: 'teams', label: () => `Équipes (${app.tournament.teams.length})` },
    { id: 'rounds', label: () => 'Parties & scores' },
    { id: 'standings', label: () => 'Classement' },
    { id: 'settings', label: () => 'Tournoi & fichier' },
  ];

  const formattedDate = $derived(
    app.tournament.date
      ? new Date(`${app.tournament.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '',
  );
</script>

<div class="app">
  <header>
    <div class="title">
      <h1>{app.tournament.name || 'Tournoi sans nom'}</h1>
      <span class="muted">{formattedDate}</span>
    </div>
    <div class="save-status" title={app.fileHandle?.name ?? ''}>
      {#if app.fileHandle}
        {#if app.fileStatus === 'error'}
          <span class="dot error"></span> Erreur d'enregistrement dans « {app.fileHandle.name} »
        {:else}
          <span class="dot ok"></span> Enregistré dans « {app.fileHandle.name} »
        {/if}
      {:else if app.localOk}
        <span class="dot local"></span> Enregistré dans ce navigateur
      {:else}
        <span class="dot error"></span> Sauvegarde impossible
      {/if}
    </div>
  </header>

  <nav>
    {#each tabs as t (t.id)}
      <button class:active={tab === t.id} onclick={() => (tab = t.id)}>{t.label()}</button>
    {/each}
  </nav>

  <main>
    {#if app.pendingHandle}
      <div class="notice info">
        <span>Reprendre l'enregistrement automatique dans « {app.pendingHandle.name} » ?</span>
        <span class="actions">
          <button class="primary" onclick={() => app.reconnect()}>Reprendre</button>
          <button onclick={() => app.forgetPending()}>Non merci</button>
        </span>
      </div>
    {:else if app.fileStatus === 'error'}
      <div class="notice error">
        <span>Le fichier n'a pas pu être mis à jour ({app.fileError}). Le tournoi reste enregistré dans ce navigateur.</span>
        <button onclick={() => app.saveAs()}>Choisir un autre fichier</button>
      </div>
    {:else if !app.fileHandle && app.tournament.teams.length > 0}
      <div class="notice warn">
        {#if canUseFileSystem}
          <span>Le tournoi n'est enregistré que dans ce navigateur. Enregistrez-le dans un fichier pour ne rien perdre.</span>
          <button class="primary" onclick={() => app.saveAs()}>Enregistrer dans un fichier…</button>
        {:else}
          <span>Ce navigateur ne peut pas tenir un fichier à jour automatiquement : pensez à télécharger une sauvegarde régulièrement.</span>
          <button class="primary" onclick={() => app.downloadBackup()}>Télécharger une sauvegarde</button>
        {/if}
      </div>
    {/if}

    {#if tab === 'teams'}
      <TeamsView />
    {:else if tab === 'rounds'}
      <RoundsView />
    {:else if tab === 'standings'}
      <StandingsView />
    {:else}
      <SettingsView />
    {/if}
  </main>
</div>

<PrintArea />

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem 1.5rem;
    padding: 1rem 1.5rem 0.6rem;
    background: var(--accent);
    color: #fff;
  }

  h1 {
    font-size: 1.4rem;
    margin: 0;
  }

  .title .muted {
    color: rgb(255 255 255 / 0.8);
  }

  .save-status {
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.4em;
  }

  .dot {
    width: 0.65em;
    height: 0.65em;
    border-radius: 50%;
    display: inline-block;
  }

  .dot.ok {
    background: #7be0a8;
  }

  .dot.local {
    background: #ffd27a;
  }

  .dot.error {
    background: #ff8a80;
  }

  nav {
    display: flex;
    gap: 0.25rem;
    padding: 0 1.5rem;
    background: var(--accent);
    overflow-x: auto;
  }

  nav button {
    border: none;
    border-radius: 8px 8px 0 0;
    background: transparent;
    color: rgb(255 255 255 / 0.85);
    padding: 0.6em 1.1em;
    font-size: 1rem;
    white-space: nowrap;
  }

  nav button:hover:not(.active) {
    background: rgb(255 255 255 / 0.12);
  }

  nav button.active {
    background: var(--bg);
    color: var(--text);
    font-weight: 600;
  }

  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
  }
</style>

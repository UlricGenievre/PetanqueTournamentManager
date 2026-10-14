<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { printer } from '../print.svelte';
  import StandingsTable from '../views/StandingsTable.svelte';
  import MatchList from './MatchList.svelte';
  import MatchSlips from './MatchSlips.svelte';

  const t = $derived(app.tournament);
  const job = $derived(printer.job);
  const round = $derived(job && job.kind !== 'standings' ? t.rounds.find((r) => r.number === job.round) : undefined);
</script>

<div class="print-area">
  {#if job?.kind === 'match-list' && round}
    <MatchList tournament={t} {round} />
  {:else if job?.kind === 'match-slips' && round}
    <MatchSlips tournament={t} {round} />
  {:else if job?.kind === 'standings'}
    <h1>{t.name}</h1>
    <h2>
      {#if job.upToRound === null}Classement{:else}Classement après la partie {job.upToRound}{/if}
    </h2>
    <StandingsTable tournament={t} upToRound={job.upToRound ?? undefined} />
  {/if}
</div>

<style>
  h1 {
    font-size: 16pt;
    margin-bottom: 2mm;
  }

  h2 {
    font-size: 13pt;
    margin-bottom: 4mm;
  }
</style>

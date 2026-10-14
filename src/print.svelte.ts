import { tick } from 'svelte';

export type PrintJob =
  | { kind: 'match-list'; round: number }
  | { kind: 'match-slips'; round: number }
  | { kind: 'standings'; upToRound: number | null };

class Printer {
  job = $state<PrintJob | null>(null);

  /** Affiche le document demandé dans la zone d'impression, puis ouvre la boîte d'impression. */
  async print(job: PrintJob) {
    this.job = job;
    await tick();
    // Selon le navigateur, window.print() bloque ou non : on vide la zone une fois l'impression terminée.
    window.addEventListener('afterprint', () => (this.job = null), { once: true });
    window.print();
  }
}

export const printer = new Printer();

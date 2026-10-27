import { createTournament } from './core/tournament';
import type { Tournament } from './core/types';
import * as storage from './persistence';

export type FileStatus = 'none' | 'saving' | 'saved' | 'error';

/** État global de l'appli. Les vues modifient `app.tournament` directement ; la sauvegarde suit. */
class AppStore {
  tournament = $state<Tournament>(storage.loadLocal() ?? createTournament());

  /** Fichier .json lié, réécrit à chaque modification. */
  fileHandle = $state.raw<FileSystemFileHandle | null>(null);
  /** Fichier retrouvé au lancement mais dont le navigateur redemande l'autorisation d'écriture. */
  pendingHandle = $state.raw<FileSystemFileHandle | null>(null);
  fileStatus = $state<FileStatus>('none');
  fileError = $state('');
  localOk = $state(true);

  #writeTimer: ReturnType<typeof setTimeout> | undefined;
  #writing: Promise<void> = Promise.resolve();

  async init() {
    if (!storage.canUseFileSystem) return;
    const handle = await storage.recallHandle();
    if (!handle) return;
    if (await storage.hasWritePermission(handle, false)) this.#link(handle);
    else this.pendingHandle = handle;
  }

  /** Appelé à chaque modification du tournoi (voir l'effet dans App.svelte). */
  persist(json: string) {
    this.localOk = storage.saveLocal(JSON.parse(json));
    if (!this.fileHandle) return;
    this.fileStatus = 'saving';
    clearTimeout(this.#writeTimer);
    this.#writeTimer = setTimeout(() => this.#writeNow(), 300);
  }

  #writeNow() {
    const handle = this.fileHandle;
    if (!handle) return;
    const snapshot = $state.snapshot(this.tournament);
    this.#writing = this.#writing.then(async () => {
      try {
        await storage.writeFile(handle, snapshot);
        if (handle === this.fileHandle) this.fileStatus = 'saved';
      } catch (e) {
        this.fileStatus = 'error';
        this.fileError = e instanceof Error ? e.message : String(e);
      }
    });
  }

  #link(handle: FileSystemFileHandle | null) {
    this.fileHandle = handle;
    this.pendingHandle = null;
    this.fileStatus = handle ? 'saved' : 'none';
    void storage.rememberHandle(handle);
  }

  /** Redonne l'autorisation d'écrire dans le fichier retrouvé au lancement. */
  async reconnect() {
    const handle = this.pendingHandle;
    if (!handle || !(await storage.hasWritePermission(handle, true))) return;
    const onDisk = await storage.readJsonFile(await handle.getFile()).catch(() => null);
    if (onDisk && onDisk.id !== this.tournament.id) {
      // Le fichier contient un autre tournoi : on ne l'écrase pas.
      this.pendingHandle = null;
      void storage.rememberHandle(null);
      return;
    }
    this.#link(handle);
    this.#writeNow();
  }

  forgetPending() {
    this.pendingHandle = null;
    void storage.rememberHandle(null);
  }

  /** Choisit un fichier où enregistrer le tournoi en cours, puis le tient à jour. */
  async saveAs() {
    const handle = await storage.pickSaveFile(this.tournament);
    if (!handle) return;
    this.#link(handle);
    this.#writeNow();
  }

  async openFile() {
    const result = await storage.pickOpenFile();
    if (!result) return;
    this.tournament = result.tournament;
    this.#link(result.handle);
  }

  /** Repli sans File System Access API : ouverture d'un fichier choisi via <input type=file>. */
  async importFile(file: File) {
    this.tournament = await storage.readJsonFile(file);
    this.#link(null);
  }

  downloadBackup() {
    storage.downloadJson($state.snapshot(this.tournament));
  }

  /** Demande confirmation avant de remplacer le tournoi en cours (nouveau tournoi ou ouverture d'un fichier). */
  confirmLeave(): boolean {
    if (this.tournament.teams.length === 0) return true;
    const where = this.fileHandle
      ? `Il reste enregistré dans « ${this.fileHandle.name} ».`
      : "Il n'est enregistré dans aucun fichier : téléchargez d'abord une sauvegarde si vous voulez le garder.";
    return confirm(`Fermer le tournoi « ${this.tournament.name} » ? ${where}`);
  }

  newTournament() {
    this.tournament = createTournament();
    this.#link(null);
  }
}

export const app = new AppStore();

/**
 * Sauvegarde du tournoi :
 * - copie de secours systématique dans le navigateur (localStorage) ;
 * - fichier .json sur le disque, réécrit à chaque modification quand le navigateur
 *   le permet (File System Access API : Edge, Chrome) ;
 * - sinon, téléchargement / ouverture manuels du fichier.
 */
import { parseTournament } from './core/tournament';
import type { Tournament } from './core/types';

const LOCAL_KEY = 'petanque.tournament';

export function loadLocal(): Tournament | null {
  try {
    const json = localStorage.getItem(LOCAL_KEY);
    return json ? parseTournament(json) : null;
  } catch {
    return null;
  }
}

export function saveLocal(tournament: Tournament): boolean {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(tournament));
    return true;
  } catch {
    return false;
  }
}

// --- Fichier sur disque (File System Access API) ---

export const canUseFileSystem = typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

const PICKER_TYPES = [{ description: 'Tournoi de pétanque', accept: { 'application/json': ['.json'] } }];

export function suggestedFileName(tournament: Tournament): string {
  const slug = tournament.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${tournament.date}-${slug || 'tournoi'}.json`;
}

export async function pickSaveFile(tournament: Tournament): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker({ suggestedName: suggestedFileName(tournament), types: PICKER_TYPES });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

export async function pickOpenFile(): Promise<{ handle: FileSystemFileHandle; tournament: Tournament } | null> {
  try {
    const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES });
    const tournament = parseTournament(await (await handle.getFile()).text());
    return { handle, tournament };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

export async function writeFile(handle: FileSystemFileHandle, tournament: Tournament): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(tournament, null, 1));
  await writable.close();
}

export async function hasWritePermission(handle: FileSystemFileHandle, ask: boolean): Promise<boolean> {
  const opts = { mode: 'readwrite' } as const;
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return ask && (await handle.requestPermission(opts)) === 'granted';
}

// Le « lien » vers le fichier est conservé dans IndexedDB pour être retrouvé au prochain lancement.

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('petanque', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('handles');
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const req = run(open.result.transaction('handles', mode).objectStore('handles'));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(undefined);
      };
    } catch {
      resolve(undefined);
    }
  });
}

export const rememberHandle = (handle: FileSystemFileHandle | null) =>
  idb('readwrite', (s) => (handle ? s.put(handle, 'current') : s.delete('current')));

export const recallHandle = () => idb<FileSystemFileHandle>('readonly', (s) => s.get('current'));

// --- Repli manuel (tous navigateurs) ---

export function downloadJson(tournament: Tournament): void {
  const blob = new Blob([JSON.stringify(tournament, null, 1)], { type: 'application/json' });
  downloadBlob(blob, suggestedFileName(tournament));
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readJsonFile(file: File): Promise<Tournament> {
  return parseTournament(await file.text());
}

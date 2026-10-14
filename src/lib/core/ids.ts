/** Identifiant aléatoire court. `crypto.randomUUID` exige un contexte sécurisé, `getRandomValues` non. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

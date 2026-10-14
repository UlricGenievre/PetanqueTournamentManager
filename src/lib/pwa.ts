/**
 * Service worker (mise en cache hors ligne, installation en PWA) : seulement quand l'appli
 * est servie en http(s), par ex. GitHub Pages. Ouvert en double-clic (file://), il est ignoré.
 */
export async function registerPwa(): Promise<void> {
  if (!location.protocol.startsWith('http') || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

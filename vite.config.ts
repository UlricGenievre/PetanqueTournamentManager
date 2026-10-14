/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Chemins relatifs : le même index.html fonctionne en double-clic (file://) et sur GitHub Pages (sous-dossier).
  base: './',
  plugins: [
    svelte(),
    viteSingleFile(),
    VitePWA({
      // Enregistrement manuel dans src/lib/pwa.ts, uniquement en http(s).
      injectRegister: null,
      registerType: 'autoUpdate',
      includeManifestIcons: false, // déjà pris par globPatterns
      manifest: {
        name: 'Tournoi de Pétanque',
        short_name: 'Pétanque',
        description: 'Gestion des tournois de pétanque : équipes, tirages, scores et classements.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f6f3ec',
        theme_color: '#1f5f4a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,png,webmanifest}'],
        // Avec le fichier unique, certains fichiers sont listés deux fois, dont une sans révision :
        // Workbox refuse alors d'installer le cache, et index.html ne serait jamais mis à jour.
        // On dédoublonne et on calcule une empreinte pour les fichiers qui n'en ont pas.
        manifestTransforms: [
          async (entries) => {
            const byUrl = new Map<string, (typeof entries)[number]>();
            for (const entry of entries) {
              const revision = entry.revision ?? createHash('md5').update(readFileSync(`dist/${entry.url}`)).digest('hex');
              byUrl.set(entry.url, { ...entry, revision });
            }
            return { manifest: [...byUrl.values()], warnings: [] };
          },
        ],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
});

# Tournoi de Pétanque

Application de gestion des tournois de pétanque du club, pensée d'abord pour les
**12 Heures de Pétanque de Montesquieu** : 8 parties chronométrées, barème de 10 points
réparti selon l'écart de score.

- **Équipes** : saisie ou liste collée ; le club est déduit du nom (« VALCOMBE 2 » → VALCOMBE).
- **Tirage** de chaque partie : pas deux équipes du même club, pas de rencontre déjà jouée,
  et si possible pas deux équipes du même secteur (champ facultatif, ex. un département voisin) ;
  une équipe exempte (score forfaitaire réglable) si le nombre d'équipes est impair.
  Les rencontres restent modifiables à la main, avec contrôle des contraintes.
- **Terrains** : nombre de terrains réglable (numérotés de 1 à n), partagés entre les parties.
  Les parties s'enchaînent sans attendre la fin de la précédente : une rencontre reçoit un
  terrain libre dès que ses deux équipes ont fini leur partie précédente, et un terrain ne se
  libère que lorsque le score de sa rencontre est saisi. Le terrain peut aussi être indiqué à
  la main, quand on sait qu'il est libre avant d'avoir le score. Des terrains peuvent être
  neutralisés pour tout le tournoi ou à partir d'une partie donnée ; les terrains sont
  redistribués à chaque modification (nombre, neutralisation, terrain indiqué à la main).
  L'onglet « Terrains » montre la rencontre en cours sur chaque terrain et signale les
  terrains neutralisés.
- **Scores** : on ne saisit que les scores ; points gagnés, différence et classement sont calculés.
- **Classement** en direct et après chaque partie (départage : points gagnés, points réalisés, différence).
- **Impressions** : liste des rencontres, fiches de match à découper, classements.
- **Export Excel** et sauvegarde dans un fichier `.json`.

## Utilisation

L'application est un **unique fichier `index.html`**, sans serveur ni connexion internet :

- **En ligne / installée** : depuis le site GitHub Pages, Edge ou Chrome proposent de
  l'installer (icône dans la barre d'adresse). Elle fonctionne ensuite hors ligne.
- **En local** : copier `index.html` sur le PC (ou une clé USB) et l'ouvrir par double-clic.

### Sauvegarde

Le tournoi est toujours conservé dans le navigateur. Sous Edge et Chrome, « Enregistrer dans
un fichier… » lie un fichier `.json` qui est ensuite réécrit à chaque modification. Les autres
navigateurs proposent « Télécharger une sauvegarde » à la place.

## Développement

Svelte 5 + TypeScript + Vite. La logique métier (barème, tirage, classement) est dans
`src/lib/core/`, sans dépendance au framework, et testée avec Vitest, notamment en rejouant
le tournoi 2025 extrait de l'ancien fichier Excel.

```sh
npm install
npm run dev      # serveur de développement
npm test         # tests unitaires
npm run check    # vérification des types
npm run build    # dist/index.html (+ manifest, service worker, icônes pour la PWA)
npm run icons    # régénère les icônes PNG
```

Chaque push sur `main` déploie `dist/` sur GitHub Pages
(Settings → Pages → Source : « GitHub Actions »).

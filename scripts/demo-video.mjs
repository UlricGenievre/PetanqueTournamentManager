// Vidéo de prise en main (docs/demo.webm) : pilote l'appli dans Chromium et filme l'écran,
// avec curseur visible et sous-titres.
// Usage : npm run dev, puis dans un autre terminal : npm run demo
// Prérequis : npx playwright-core install chromium-headless-shell ffmpeg
//   (sous Linux, les bibliothèques système de Chromium : npx playwright-core install-deps chromium-headless-shell)
// Variables : DEMO_URL (défaut http://localhost:5173/), FFMPEG (ffmpeg utilisé pour compresser).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const APP_URL = process.env.DEMO_URL ?? 'http://localhost:5173/';
const OUT = fileURLToPath(new URL('../docs/demo.webm', import.meta.url));
const W = 1280, H = 720;

const TEAMS = ['LACOSTEL 1', 'LACOSTEL 2', 'CAUSSINAC 1', 'CAUSSINAC 2', 'SAINT-JUST-DES-PINS 1', 'SAINT-JUST-DES-PINS 2', 'SAINT-JUST-DES-PINS 3', 'CAMBELOUX', 'CASTELBRUN', 'VALCOMBE', 'ARGENTAL 1', 'ROQUELAIR', 'PEYRAGUE 1', 'PEYRAGUE 2', 'LOUBIGNAC 1', 'LOUBIGNAC 2', 'SAINT-ORIEL 1', 'SAINT-ORIEL 2', 'BOUSQUET-LE-HAUT', 'LAGRAULIE 1', 'LAGRAULIE 2', 'LAGRAULIE 3', 'LAFFITAU 1', 'LAFFITAU 2', 'FONTAUBE 1', 'FONTAUBE 2', 'FONTAUBE 3', 'BELMONTAGNE 1', 'BELMONTAGNE 2', 'BELMONTAGNE 3', 'VERDALON', 'CAZAUBIL 1', 'CAZAUBIL 2', 'CAZAUBIL 3', 'TERRASSOL', 'MIRANDOL 1', 'MIRANDOL 2', 'PRADELOUP 1', 'PRADELOUP 2', 'ESCALDOU', 'GARRIGOU'];

// Curseur visible, effet de clic, sous-titres et cartons de titre, injectés dans la page.
const overlay = () => {
  const css = `
    #demo-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; margin: -3px 0 0 -3px; z-index: 2147483647; pointer-events: none;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 2l7 19 2.5-7.5L20 11z' fill='%23111' stroke='%23fff' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat; }
    .demo-ripple { position: fixed; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 3px solid #f0a020; z-index: 2147483646; pointer-events: none; animation: demo-ripple .5s ease-out forwards; }
    @keyframes demo-ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
    html, body { height: 100%; overflow: hidden; }
    #app { height: calc(100vh - 96px); overflow-y: auto; }
    #demo-band { position: fixed; left: 0; right: 0; bottom: 0; height: 96px; z-index: 2147483645; pointer-events: none;
      background: #16241e; display: flex; align-items: center; justify-content: center; padding: 0 60px; box-sizing: border-box; }
    #demo-caption { color: #fff; font: 600 23px/1.35 system-ui, sans-serif; text-align: center; transition: opacity .3s; opacity: 0; }
    #demo-caption.on { opacity: 1; }
    #demo-card { position: fixed; inset: 0; z-index: 2147483644; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
      background: #1f5e4b; color: #fff; font-family: system-ui, sans-serif; text-align: center; transition: opacity .6s; }
    #demo-card h1 { font-size: 46px; margin: 0; } #demo-card p { font-size: 24px; margin: 0; opacity: .85; }`;
  const install = () => {
    if (document.getElementById('demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const cursor = Object.assign(document.createElement('div'), { id: 'demo-cursor' });
    const band = Object.assign(document.createElement('div'), { id: 'demo-band' });
    band.append(Object.assign(document.createElement('div'), { id: 'demo-caption' }));
    document.body.append(cursor, band);
    addEventListener('mousemove', (e) => (cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`), true);
    addEventListener('mousedown', (e) => {
      const r = Object.assign(document.createElement('div'), { className: 'demo-ripple' });
      Object.assign(r.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
      document.body.append(r);
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  window.__caption = (text) => {
    install();
    const c = document.getElementById('demo-caption');
    c.innerHTML = text ?? '';
    c.classList.toggle('on', !!text);
  };
  window.__card = (title, sub) => {
    install();
    let card = document.getElementById('demo-card');
    if (!title) return card && ((card.style.opacity = '0'), setTimeout(() => card.remove(), 700));
    if (!card) document.body.append((card = Object.assign(document.createElement('div'), { id: 'demo-card' })));
    card.style.opacity = '1';
    card.innerHTML = `<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}`;
  };
  addEventListener('DOMContentLoaded', install);
};

/** ffmpeg pour compresser : $FFMPEG, sinon celui du système, sinon celui installé avec Playwright. */
function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {}
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const dir = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('ffmpeg-')).sort().at(-1) : undefined;
  return dir && join(cache, dir, 'ffmpeg-linux');
}

// Langue française aussi pour les champs natifs (date au format jj/mm/aaaa).
const browser = await chromium.launch({ args: ['--lang=fr-FR'], env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr', LC_ALL: 'fr_FR.UTF-8' } });
const videoDir = mkdtempSync(join(tmpdir(), 'petanque-demo-'));
const context = await browser.newContext({ viewport: { width: W, height: H }, locale: 'fr-FR', recordVideo: { dir: videoDir, size: { width: W, height: H } } });
await context.addInitScript(overlay);
const page = await context.newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.error('pageerror', e.message));

const wait = (ms) => page.waitForTimeout(ms);
let mouse = { x: W / 2, y: H / 2 };
async function moveTo(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + Math.min(box.width / 2, 40), y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: Math.max(8, Math.round(Math.hypot(x - mouse.x, y - mouse.y) / 18)) });
  mouse = { x, y };
}
async function click(locator, pause = 350) {
  await moveTo(locator);
  await wait(250);
  await locator.click();
  await wait(pause);
}
async function typeIn(locator, text, { clear = false, delay = 90 } = {}) {
  await click(locator, 150);
  if (clear) await page.keyboard.press('Control+A');
  await page.keyboard.type(text, { delay });
  await page.keyboard.press('Tab');
  await wait(300);
}
const caption = async (text, ms = 0) => {
  await page.evaluate((t) => window.__caption(t), text);
  if (ms) await wait(ms);
};
const card = (title, sub) => page.evaluate(([a, b]) => window.__card(a, b), [title, sub]);
const nav = (label) => page.locator('nav button', { hasText: label });
const roundTab = (n) => page.locator('.round-tabs button', { hasText: new RegExp(`^Partie ${n}\\b`) });
async function scrollBy(dy, steps = 12) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await wait(40);
  }
  await wait(300);
}

await page.goto(APP_URL);
await page.mouse.move(mouse.x, mouse.y);

// 0. Titre
await card('12 Heures de Pétanque', 'Prise en main de l’application de gestion du tournoi');
await wait(3500);
await card(null);
await wait(700);

// 1. Tournoi
await caption('Onglet <b>Tournoi</b> : on commence par régler le tournoi.', 2800);
await caption('Nom, date et nombre de parties sont déjà remplis : on les modifie si besoin.', 3000);
await caption('Le tournoi se joue sur <b>31 terrains</b>.');
await typeIn(page.getByLabel('Nombre de terrains'), '31', { clear: true, delay: 160 });
await wait(1200);
await caption('« Synchroniser les parties » : chaque partie démarre au top, quand la précédente est finie.');
await click(page.locator('.option button.help'), 4200);
await caption('Chaque rencontre reçoit ainsi son terrain dès le tirage.', 3200);
await click(page.locator('.option button.help'), 500);

await caption('Certains terrains ne servent pas : on les <b>neutralise</b>.');
const addClosure = page.getByRole('button', { name: '+ Neutraliser des terrains' });
const closure = (i) => page.locator('.closure').nth(i);
await click(addClosure);
await typeIn(closure(0).locator('input').first(), '2, 5, 8, 11');
await caption('« De la partie 1 », sans partie de fin : neutralisés pendant tout le tournoi.', 2600);
await click(addClosure);
await typeIn(closure(1).locator('input').first(), '20, 23, 27');
await wait(1000);
await caption('Les terrains 17 et 18 ne sont pas disponibles pour les parties 4 et 5.');
await click(addClosure);
await typeIn(closure(2).locator('input').first(), '17-18');
await typeIn(closure(2).getByLabel('De la partie'), '4', { clear: true, delay: 150 });
await typeIn(closure(2).getByLabel('à', { exact: true }), '5', { delay: 150 });
await wait(2200);

// 2. Équipes
await caption(null);
await click(nav('Équipes'), 600);
await caption('Onglet <b>Équipes</b> : on colle la liste des équipes, une par ligne (copiée depuis Excel, par exemple).');
const textarea = page.locator('textarea');
await click(textarea, 300);
await textarea.fill(TEAMS.join('\n'));
await wait(2200);
await caption('Le club est déduit du nom : deux équipes d’un même club ne se rencontrent pas.');
await click(page.getByRole('button', { name: /^Ajouter \d+ équipes?$/ }), 1500);
await wait(1800);
await caption('Facultatif : un <b>secteur</b> pour éviter aussi les rencontres entre équipes voisines.');
await typeIn(page.getByLabel('Secteur').nth(7), 'Nord');
await typeIn(page.getByLabel('Secteur').nth(8), 'Nord');
await wait(1200);
await page.evaluate(() => document.getElementById('app').scrollTo({ top: 0, behavior: 'smooth' }));
await wait(800);

// 3. Partie 1
await caption(null);
await click(nav('Parties & scores'), 600);
await caption('Onglet <b>Parties & scores</b> : on tire au sort la partie 1.');
await click(page.getByRole('button', { name: /Tirer au sort la partie 1/ }), 1200);
await caption('Chaque rencontre a son terrain ; les terrains neutralisés sont sautés. 41 équipes : une est exempte.', 4200);
await caption('Les équipes rapportent leur score : on le saisit, <b>Entrée</b> passe à la case suivante.');
const scores = page.locator('input.score');
await click(scores.nth(0), 200);
for (const [a, b] of [[13, 7], [9, 13], [13, 11]]) {
  await page.keyboard.type(String(a), { delay: 160 });
  await page.keyboard.press('Enter');
  await page.keyboard.type(String(b), { delay: 160 });
  await page.keyboard.press('Enter');
  await wait(500);
}
await caption('Les points du barème sont calculés automatiquement.', 2800);

// 4. Plusieurs parties d'avance
await caption('On peut tirer les parties suivantes <b>d’avance</b>, sans attendre la fin de la partie 1.');
for (const n of [2, 3, 4]) {
  await click(roundTab(n), 500);
  await click(page.getByRole('button', { name: new RegExp(`Tirer au sort la partie ${n}`) }), 1300);
}
await caption('Retour à la partie 1.');
await click(roundTab(1), 900);
await caption('Le bouton <b>+</b> montre la prochaine rencontre des deux équipes : adversaire et terrain.');
await click(page.locator('button.toggle').nth(0), 1200);
await click(page.locator('button.toggle').nth(1), 2600);
await caption('Quand une équipe rapporte son score, on lui annonce aussitôt où elle jouera ensuite.', 3500);

await caption('… et on saisit les autres scores de la partie 1.');
await click(scores.nth(6), 200);
for (let i = 3; i < 20; i++) {
  const [a, b] = i % 3 === 0 ? [(i * 7) % 13, 13] : [13, (i * 5) % 13];
  await page.keyboard.type(String(a), { delay: 35 });
  await page.keyboard.press('Enter');
  await page.keyboard.type(String(b), { delay: 35 });
  await page.keyboard.press('Enter');
  await wait(90);
}
await wait(600);
await page.evaluate(() => document.getElementById('app').scrollTo({ top: 0, behavior: 'smooth' }));
await caption('Partie 1 terminée ✓', 2400);

// 5. Terrains
await caption(null);
await click(nav('Terrains'), 800);
await caption('Onglet <b>Terrains</b> : qui joue sur quel terrain, partie par partie.', 3200);
await caption('Il s’ouvre sur la première partie pas encore terminée : ici la partie 2.', 3000);
await scrollBy(420);
await caption('Terrains neutralisés : hachurés.', 2800);
await scrollBy(-420);
await caption('Partie 1 : les rencontres terminées, avec leur score.');
await click(roundTab(1), 2800);
await caption('Partie 4 : les terrains 17 et 18 sont neutralisés à leur tour.');
await click(roundTab(4), 800);
await scrollBy(640);
await wait(3200);
await scrollBy(-640);

// 6. Classement
await caption(null);
await click(nav('Classement'), 800);
await caption('Onglet <b>Classement</b> : en direct, il tient compte de tous les scores déjà saisis.', 3600);
await click(page.getByRole('button', { name: 'Après partie 1' }), 3000);

// 7. Fin
await caption('Tout est enregistré automatiquement à chaque saisie.', 3200);
await caption(null);
await card('Bon tournoi !', 'Tournoi · Équipes · Parties & scores · Terrains · Classement');
await wait(3500);

const video = page.video();
await context.close();
await browser.close();
// L'enregistrement brut (VP8) est lourd : VP9 le divise par 6 environ, texte toujours net.
const ffmpeg = findFfmpeg();
if (!ffmpeg) throw new Error('ffmpeg introuvable : installez-le, ou indiquez son chemin dans FFMPEG.');
execFileSync(ffmpeg, ['-loglevel', 'error', '-y', '-i', await video.path(), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', OUT], { stdio: 'inherit' });
rmSync(videoDir, { recursive: true, force: true });
console.log('Vidéo :', OUT);

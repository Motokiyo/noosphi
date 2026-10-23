/* ============================================================
   Noosfeerique — l'accueil, le film et le guide (le « ? »)
   Rien de permanent a l'ecran : l'accueil ne vient qu'au premier
   passage, le film joue par-dessus l'app puis s'efface, le guide
   s'ouvre sur le volet de l'ecran ou l'on est.
   Les trois portent la classe modal-overlay : le panneau MIDI du
   concert s'efface dessous (midi.js) et revient a leur fermeture.
   ============================================================ */

// L'echelle unique, la meme partout (sphere, dashboard, guide, rapport)
export const ECHELLE = [
  { borne: 1.96, nom: 'dans le hasard ordinaire', couleur: 'rgba(255,255,255,0.9)' },
  { borne: 3, nom: 'écart notable', couleur: '#C9A24D' },
  { borne: Infinity, nom: 'écart fort', couleur: '#4EC9C6' },
];
export const niveau = z => ECHELLE.find(e => Math.abs(z) < e.borne);

// Le film (version courte), chapitre par chapitre (minutage du montage)
export const FILM = { src: '/media/noosfeerique-film.mp4', affiche: '/media/noosfeerique-film.jpg', duree: '7 min' };
export const CHAPITRES = [
  { t: 0, nom: 'Pile ou face' },
  { t: 85, nom: 'Le z et la forêt' },
  { t: 141, nom: 'Princeton et les œufs' },
  { t: 303, nom: 'La sphère et les feuilles' },
  { t: 341, nom: 'Le portique, le z de la séance' },
  { t: 372, nom: 'Le témoin' },
  { t: 385, nom: 'La noosphère' },
];
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const ICONE_FERMER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function calque(classe) {
  const o = document.createElement('div');
  o.className = 'modal-overlay ' + classe;
  document.body.appendChild(o);
  return o;
}

// ---------- L'accueil, au premier passage ----------
const CLE_ACCUEIL = 'noosphi_accueil_vu';
export function accueilDejaVu() {
  try { return localStorage.getItem(CLE_ACCUEIL) === '1'; } catch { return true; }
}

export function ouvrirAccueil({ onCode } = {}) {
  if (document.querySelector('.accueil')) return;
  try { localStorage.setItem(CLE_ACCUEIL, '1'); } catch {}
  const o = calque('accueil');
  o.innerHTML = `
    <div class="accueil-corps">
      <h1>La sphère respire avec le hasard.</h1>
      <p>Des générateurs tirent à pile ou face chaque seconde, ici et au loin. Noosféérique écoute si notre attention commune les fait pencher.</p>
      <div class="accueil-choix">
        <button type="button" class="accueil-film"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>Voir le film · ${FILM.duree}</button>
        <button type="button" class="accueil-entrer">Entrer</button>
        <button type="button" class="accueil-code">J'ai un code de séance</button>
      </div>
      <p class="accueil-note">Cet écran ne s'affiche qu'une fois. Le « ? » en haut à droite le rouvre.</p>
    </div>`;
  const fermer = () => { o.classList.add('sortie'); setTimeout(() => o.remove(), 400); };
  o.querySelector('.accueil-entrer').addEventListener('click', fermer);
  o.querySelector('.accueil-film').addEventListener('click', () => { o.remove(); ouvrirFilm(); });
  o.querySelector('.accueil-code').addEventListener('click', () => { o.remove(); onCode?.(); });
}

// ---------- Le film, par-dessus l'app, qui s'efface a la fin ----------
// Aucun decroche entre le film et l'app : la sphere du film a la taille et la
// place exactes de la vraie sphere, et a la fin un fondu devoile l'app dessous.
// Les commandes ne viennent que si l'on descend la souris en bas (ou au toucher).

// Diametre de la vraie sphere a l'ecran (experience.js, onResize : camera 50°,
// sphere de rayon 1 placee pour 75 % de la plus petite dimension ; la
// perspective rend sa silhouette un peu plus grande).
export function diametreSphere(W, H) {
  const t = Math.tan(25 * Math.PI / 180), a = W / H;
  const s = 0.75 * t * Math.min(a, 1);
  const frac = Math.tan(Math.asin(s)) / (t * Math.min(a, 1));
  return frac * (a >= 1 ? H : W);
}
// Dans le film, la sphere finale (6:42 a la fin) fait 80,2 % de la hauteur de
// l'image et sa sphere est centree (mesure sur l'image 1920 × 1080 : 866 px).
const SPHERE_FILM = 866 / 1080;
const T_FINALE = 398;   // le zoom vers la vraie taille commence ici (telephone en hauteur)

export function ouvrirFilm(debut = 0) {
  document.querySelector('.film')?.remove();
  const o = calque('film');
  o.innerHTML = `
    <video playsinline preload="auto" poster="${FILM.affiche}" src="${FILM.src}"></video>
    <button type="button" class="film-passer">Passer et entrer <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
    <div class="film-bas">
      <div class="film-ligne">
        <button type="button" class="film-lecture" aria-label="Pause"></button>
        <div class="film-barre" role="slider" aria-label="Avancement du film" tabindex="0"><div class="film-fait"></div>${CHAPITRES.slice(1).map(c => `<span class="film-repere" data-t="${c.t}"></span>`).join('')}</div>
        <span class="film-temps">0:00</span>
      </div>
      <div class="film-chapitres">${CHAPITRES.map(c => `<button type="button" data-t="${c.t}"><span>${mmss(c.t)}</span>${c.nom}</button>`).join('')}</div>
    </div>`;
  const v = o.querySelector('video');
  const lecture = o.querySelector('.film-lecture');
  const barre = o.querySelector('.film-barre');
  const fait = o.querySelector('.film-fait');
  const temps = o.querySelector('.film-temps');
  const bas = o.querySelector('.film-bas');
  const chapitres = [...o.querySelectorAll('.film-chapitres button')];

  // Cadrage : a l'echelle de la vraie sphere, sauf si cela rognait trop l'image
  // (telephone en hauteur) ; alors l'image entiere, puis le zoom a la fin.
  let finale = false;
  function cadrer() {
    const W = window.innerWidth, H = window.innerHeight;
    const vw = v.videoWidth || 1280, vh = v.videoHeight || 720;
    const juste = diametreSphere(W, H) / (SPHERE_FILM * vh);   // sphere du film = vraie sphere
    const entier = Math.min(W / vw, H / vh);
    const rogne = (vw * juste - W) / (vw * juste);              // part de la largeur perdue
    const echelle = (finale || rogne <= 0.2) ? juste : entier;
    v.style.width = vw * echelle + 'px';
    v.style.height = vh * echelle + 'px';
    v.style.left = (W - vw * echelle) / 2 + 'px';
    v.style.top = (H - vh * echelle) / 2 + 'px';
  }
  window.addEventListener('resize', cadrer);

  // Les commandes : en bas de l'ecran seulement, et elles se retirent seules
  let minuterie = null;
  const montrer = (commandes) => {
    o.classList.add('bouge');
    if (commandes) o.classList.add('commandes');
    clearTimeout(minuterie);
    minuterie = setTimeout(() => o.classList.remove('bouge', 'commandes'), 3000);
  };
  o.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    montrer(e.clientY > window.innerHeight * 0.72);
  });
  bas.addEventListener('pointerenter', () => montrer(true));

  const fermer = () => {
    v.pause();
    o.classList.add('sortie');                // fondu : la vraie sphere apparait a la place de son image
    setTimeout(() => o.remove(), 1500);
    document.removeEventListener('keydown', clavier);
    window.removeEventListener('resize', cadrer);
  };
  const clavier = e => {
    if (e.key === 'Escape') fermer();
    else if (e.key === ' ') { e.preventDefault(); v.paused ? v.play() : v.pause(); montrer(true); }
    else montrer(true);
  };
  document.addEventListener('keydown', clavier);

  const majLecture = () => {
    lecture.classList.toggle('en-pause', v.paused);
    lecture.setAttribute('aria-label', v.paused ? 'Lecture' : 'Pause');
    o.classList.toggle('en-pause', v.paused);   // en pause, les commandes restent visibles
  };
  v.addEventListener('loadedmetadata', () => {
    for (const r of o.querySelectorAll('.film-repere')) r.style.left = (100 * r.dataset.t / v.duration) + '%';
    cadrer();
    if (debut) v.currentTime = debut;
    v.play().catch(majLecture);
  });
  v.addEventListener('timeupdate', () => {
    if (!v.duration) return;
    fait.style.width = (100 * v.currentTime / v.duration) + '%';
    temps.textContent = `${mmss(v.currentTime)} / ${mmss(v.duration)}`;
    const ici = CHAPITRES.filter(c => c.t <= v.currentTime + 0.5).length - 1;
    chapitres.forEach((b, i) => b.classList.toggle('actif', i === ici));
    const f = v.currentTime >= T_FINALE;
    if (f !== finale) { finale = f; cadrer(); }
  });
  v.addEventListener('play', majLecture);
  v.addEventListener('pause', majLecture);
  v.addEventListener('ended', fermer);
  lecture.addEventListener('click', () => (v.paused ? v.play() : v.pause()));
  // Clic sur l'image : pause a la souris ; au toucher, il fait venir les commandes
  v.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') { o.classList.contains('commandes') ? o.classList.remove('bouge', 'commandes') : montrer(true); }
    else v.paused ? v.play() : v.pause();
  });
  barre.addEventListener('click', e => {
    const r = barre.getBoundingClientRect();
    if (v.duration) v.currentTime = v.duration * (e.clientX - r.left) / r.width;
    montrer(true);
  });
  barre.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') v.currentTime += 10;
    if (e.key === 'ArrowLeft') v.currentTime -= 10;
  });
  chapitres.forEach(b => b.addEventListener('click', () => { v.currentTime = +b.dataset.t; v.play(); montrer(true); }));
  o.querySelector('.film-passer').addEventListener('click', fermer);
  majLecture();
  cadrer();
}

// ---------- Le guide ----------
const ONGLETS = [
  ['comprendre', 'Comprendre'],
  ['utiliser', 'Utiliser'],
  ['seances', 'Les séances'],
  ['concert', 'Concert'],
  ['coulisses', 'Coulisses'],
];

// Les pictogrammes, les memes que dans l'app (experience.html)
const P = {
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  gamme: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  aide: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor" stroke="none"/>',
  seances: '<path d="M3 3h18v18H3z"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/>',
  seance: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  historique: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  son: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  points: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="10" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="20" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  oeil: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  sources: '<polyline points="6 9 12 15 18 9"/>',
  copier: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  partager: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  arreter: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  fermer: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
};
const picto = nom => `<span class="guide-picto" aria-hidden="true"><svg viewBox="0 0 24 24">${P[nom]}</svg></span>`;
const ligneBouton = (ico, nom, quoi) => `<div class="guide-bouton">${picto(ico)}<span><b>${nom}</b><br>${quoi}</span></div>`;
const lienFilm = (t, titre, sous) => `<button type="button" class="guide-film" data-t="${t}"><img src="${FILM.affiche}" alt=""><span><b>${titre}</b><br>${sous}</span></button>`;

const VOLETS = {
  comprendre: () => `
    <h2>Le z</h2>
    <p>Chaque générateur lance 200 pièces à pile ou face. On attend 100 piles. Le z dit de combien le tirage s'en écarte, en tailles ordinaires.</p>
    <div class="guide-echelle">
      ${ECHELLE.map((e, i) => `<div style="--c:${e.couleur}"><b>${['sous 1,96', '1,96 à 3', 'au-delà de 3'][i]}</b>${e.nom}${['', ', 1 chance sur 20', ', 1 chance sur 370'][i]}</div>`).join('')}
    </div>
    <h2>La vague et la marée</h2>
    <p>Le chiffre sous la sphère est la vague : le z de l'instant, qui bouge sans cesse. Pendant une séance, il devient la marée : le z cumulé depuis le début. Seule la marée peut révéler une tendance.</p>
    <h2>Ici et le témoin</h2>
    <p>La salle écoute ce qui est ici : vos téléphones, cet appareil et la clé quantique Noosféérique. Le témoin écoute des sources lointaines (QCI aux États-Unis, la balise NIST). Si la salle s'écarte et pas le témoin, la séance devient intéressante.</p>
    <h2>D'où vient le hasard</h2>
    <p>Noosféérique (Cicada) et QCI sont quantiques : chaque bit naît d'un événement imprévisible par nature. Les téléphones et les ordinateurs tirent leurs nombres d'un calcul, nourri par une graine physique. Chaque personne présente compte, et les rapports séparent les deux : la mesure quantique d'abord, la mesure graine ensuite, puis le mélange.</p>
    <h2>Le film, chapitre par chapitre</h2>
    <div class="guide-chapitres">${CHAPITRES.map(c => `<button type="button" data-t="${c.t}"><span>${mmss(c.t)}</span>${c.nom}</button>`).join('')}</div>`,
  utiliser: () => `
    <p>Tout se fait avec quelques boutons discrets. La sphère reste au centre.</p>
    <h2>En haut à droite</h2>
    ${ligneBouton('menu', 'Sources', 'Choisir ce que la sphère écoute, plusieurs à la fois.')}
    ${ligneBouton('gamme', 'Gamme', 'La couleur du son, accordé à 432 Hz.')}
    ${ligneBouton('aide', 'Guide', 'Ce que vous lisez.')}
    <h2>En bas à droite</h2>
    ${ligneBouton('seances', 'Séances enregistrées', 'Retrouver une séance, son rapport, ses données.')}
    ${ligneBouton('seance', 'Séance', 'Enregistrer, seul ou avec un code pour les téléphones.')}
    ${ligneBouton('historique', 'Historique', 'Les dernières 24 heures, source par source.')}
    ${ligneBouton('son', 'Son', 'Allumer, régler le volume. Un clic sur la sphère aussi.')}
    <h2>En bas à gauche</h2>
    ${ligneBouton('points', 'Les quatre points', 'Cet appareil, NIST, QCI, Noosféérique. Plein : la source répond et on l\u2019écoute. Cerclé : elle répond sans être écoutée. Éteint : elle ne répond pas.')}`,
  seances: () => `
    <h2>Seul ou ensemble</h2>
    <p>Une séance solo écoute cet appareil. Une séance collective donne un code et un QR : chaque téléphone qui le scanne rejoint la salle et tire ses propres pièces.</p>
    <h2>Pendant la séance</h2>
    <p>La marée s'affiche sous la sphère. En haut de l'écran de séance :</p>
    ${ligneBouton('oeil', 'Les chiffres', 'Montrer ou cacher le z, pour regarder la sphère plutôt que le compteur.')}
    ${ligneBouton('sources', 'Les sources de la séance', 'Ouvre les cases : à gauche la salle (ce qu\u2019on écoute ici), à droite le témoin. Une source cochée d\u2019un côté quitte l\u2019autre.')}
    ${ligneBouton('copier', 'Copier le code', 'En séance collective, pour l\u2019envoyer.')}
    ${ligneBouton('partager', 'Partager', 'Le code par message (Signal, WhatsApp, Telegram).')}
    <p>En bas :</p>
    ${ligneBouton('pause', 'Pause', 'Les secondes en pause ne comptent pas.')}
    ${ligneBouton('arreter', 'Arrêter', 'Termine la séance et ouvre sa fiche.')}
    ${ligneBouton('fermer', 'La croix', 'Revenir à la sphère : l\u2019enregistrement continue, la pastille rouge en haut y ramène.')}
    ${lienFilm(341, 'Le portique et le témoin · 1 min', 'Ce que fait une séance, dans le film')}
    <h2>Après</h2>
    <p>La fiche de la séance s'ouvre avec ses chiffres. Le bouton Rapport en fait une page à garder ou imprimer, Données donne les secondes. Le navigateur garde 50 séances : téléchargez celles qui comptent.</p>
    <h2>Ce que dit le rapport</h2>
    <p>Trois mesures de la salle, dans un ordre fixé d'avance (la première compte le plus) :</p>
    <p>1. <b>La mesure quantique</b> : Noosféérique, la clé quantique Cicada, ici.<br>
    2. <b>La mesure graine</b> : les téléphones et les ordinateurs, dont les nombres sont calculés.<br>
    3. <b>Le mélange</b> : tout ce qui jouait ici, seconde par seconde.</p>
    <p>Et à part, <b>le témoin</b> : QCI (quantique, aux États-Unis) et la balise NIST. Ils donnent un z <b>hors de la salle</b>, pendant les mêmes secondes, sans personne autour. Si la salle s'écarte et que le témoin reste ordinaire, l'écart vient bien d'ici.</p>
    <p class="guide-note">QCI ne passe dans la salle que pour un événement mondial, où l'on écoute la planète entière.</p>`,
  concert: () => `
    <h2>Le panneau U1 virtuel</h2>
    <p>Il envoie le z joué vers MainStage. Un clic sur son titre le replie en un bandeau, un clic sur le bandeau le rouvre. Replié, le MIDI continue : la pastille du bandeau s'allume quand il joue.</p>
    <h2>La séance du concert</h2>
    <p>Créer une séance collective, puis ouvrir « QR code pour le public » depuis le panneau et le projeter. Les téléphones rejoignent avec la page publique, écran posé.</p>
    <h2>Le rapport</h2>
    <p>À l'arrêt, il se télécharge tout seul dans le dossier Téléchargements, avec les trois mesures, le témoin et chaque générateur. Chrome peut demander une fois l'autorisation de télécharger.</p>`,
  coulisses: () => `
    <p>Pour les curieux et les sceptiques : d'où viennent les chiffres.</p>
    <a class="guide-carte" href="/dashboard" target="_blank" rel="noopener"><b>Dashboard</b><br>Chaque source en direct : son état, son rythme, ses derniers tirages.</a>
    <details class="guide-carte guide-methode"><summary><b>La méthode</b><br>Comment un tirage devient un z, et des z un seul chiffre.</summary>
      <p><b>Un tirage.</b> Une source donne 200 bits, comme 200 pièces lancées. On compte les piles : on en attend 100.</p>
      <p><b>Son z.</b> On retire les 100 attendus et on divise par √50 (environ 7, l'écart ordinaire du hasard). 114 piles donnent z = 2 ; 93 piles, z = −1.</p>
      <p><b>Plusieurs z ensemble (Stouffer).</b> On les additionne et on divise par la racine de leur nombre. Les écarts au hasard s'annulent entre eux, ce qui pousse dans le même sens s'additionne.</p>
      <p><b>Une séance.</b> Chaque seconde compte une fois, chaque valeur nouvelle aussi : une source qui ne change qu'une fois par minute (NIST) n'est pas recomptée chaque seconde.</p>
      <p><b>La lecture.</b> Sous 1,96, le hasard ordinaire. De 1,96 à 3, un écart qui n'arrive qu'une fois sur 20. Au-delà de 3, une fois sur 370.</p>
    </details>
    <a class="guide-carte" href="credits.html" target="_blank" rel="noopener"><b>Crédits</b><br>D'après une idée de Franck Laharrague. App et film : Alexandre Ferran.</a>
    <p class="guide-note">Cette expérience ne prétend rien prouver. Elle propose d'observer et d'interroger.</p>`,
};

export function ouvrirGuide({ onglet = 'comprendre', concert = false, onAccueil } = {}) {
  document.querySelector('.guide')?.remove();
  const onglets = ONGLETS.filter(([id]) => concert || id !== 'concert');
  const o = calque('guide');
  o.innerHTML = `
    <aside class="guide-panneau" role="dialog" aria-label="Guide">
      <div class="guide-tete"><span>GUIDE</span><button type="button" class="guide-fermer" aria-label="Fermer le guide">${ICONE_FERMER}</button></div>
      <div class="guide-onglets" role="tablist">${onglets.map(([id, nom]) => `<button type="button" role="tab" data-o="${id}">${nom}</button>`).join('')}</div>
      <div class="guide-volet"></div>
      <div class="guide-pied">
        <button type="button" class="guide-film-entier">Voir le film · ${FILM.duree}</button>
        <button type="button" class="guide-accueil">Revoir l'accueil</button>
      </div>
    </aside>`;
  const volet = o.querySelector('.guide-volet');
  const montrer = id => {
    o.querySelectorAll('.guide-onglets button').forEach(b => b.setAttribute('aria-selected', b.dataset.o === id ? 'true' : 'false'));
    volet.innerHTML = VOLETS[id]();
    volet.scrollTop = 0;
    volet.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { fermer(); ouvrirFilm(+b.dataset.t); }));
  };
  const fermer = () => { o.remove(); document.removeEventListener('keydown', clavier); };
  const clavier = e => { if (e.key === 'Escape') fermer(); };
  document.addEventListener('keydown', clavier);
  o.addEventListener('click', e => { if (e.target === o) fermer(); });
  o.querySelector('.guide-fermer').addEventListener('click', fermer);
  o.querySelectorAll('.guide-onglets button').forEach(b => b.addEventListener('click', () => montrer(b.dataset.o)));
  o.querySelector('.guide-film-entier').addEventListener('click', () => { fermer(); ouvrirFilm(); });
  o.querySelector('.guide-accueil').addEventListener('click', () => { fermer(); onAccueil ? onAccueil() : ouvrirAccueil(); });
  montrer(onglets.some(([id]) => id === onglet) ? onglet : 'comprendre');
}

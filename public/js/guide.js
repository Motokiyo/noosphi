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
  const chapitres = [...o.querySelectorAll('.film-chapitres button')];

  const fermer = () => {
    v.pause();
    o.classList.add('sortie');                // fondu : la sphere vivante prend la place de son image
    setTimeout(() => o.remove(), 900);
    document.removeEventListener('keydown', clavier);
  };
  const clavier = e => { if (e.key === 'Escape') fermer(); };
  document.addEventListener('keydown', clavier);

  const majLecture = () => {
    lecture.classList.toggle('en-pause', v.paused);
    lecture.setAttribute('aria-label', v.paused ? 'Lecture' : 'Pause');
  };
  v.addEventListener('loadedmetadata', () => {
    for (const r of o.querySelectorAll('.film-repere')) r.style.left = (100 * r.dataset.t / v.duration) + '%';
    if (debut) v.currentTime = debut;
    v.play().catch(majLecture);
  });
  v.addEventListener('timeupdate', () => {
    if (!v.duration) return;
    fait.style.width = (100 * v.currentTime / v.duration) + '%';
    temps.textContent = `${mmss(v.currentTime)} / ${mmss(v.duration)}`;
    const ici = CHAPITRES.filter(c => c.t <= v.currentTime + 0.5).length - 1;
    chapitres.forEach((b, i) => b.classList.toggle('actif', i === ici));
  });
  v.addEventListener('play', majLecture);
  v.addEventListener('pause', majLecture);
  v.addEventListener('ended', fermer);
  lecture.addEventListener('click', () => (v.paused ? v.play() : v.pause()));
  v.addEventListener('click', () => (v.paused ? v.play() : v.pause()));
  barre.addEventListener('click', e => {
    const r = barre.getBoundingClientRect();
    if (v.duration) v.currentTime = v.duration * (e.clientX - r.left) / r.width;
  });
  barre.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') v.currentTime += 10;
    if (e.key === 'ArrowLeft') v.currentTime -= 10;
  });
  chapitres.forEach(b => b.addEventListener('click', () => { v.currentTime = +b.dataset.t; v.play(); }));
  o.querySelector('.film-passer').addEventListener('click', fermer);
  majLecture();
}

// ---------- Le guide ----------
const ONGLETS = [
  ['comprendre', 'Comprendre'],
  ['utiliser', 'Utiliser'],
  ['seances', 'Les séances'],
  ['concert', 'Concert'],
  ['coulisses', 'Coulisses'],
];

const ligneBouton = (ou, nom, quoi) => `<div class="guide-bouton"><span class="guide-ou">${ou}</span><span><b>${nom}</b><br>${quoi}</span></div>`;
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
    ${ligneBouton('en haut', 'Sources', 'Choisir ce que la sphère écoute, plusieurs à la fois.')}
    ${ligneBouton('en haut', 'Gamme', 'La couleur du son, accordé à 432 Hz.')}
    ${ligneBouton('en haut', '?', 'Ce guide.')}
    ${ligneBouton('en bas à droite', 'Séances enregistrées', 'Retrouver une séance, son rapport, ses données.')}
    ${ligneBouton('en bas à droite', 'Séance', 'Enregistrer, seul ou avec un code pour les téléphones.')}
    ${ligneBouton('en bas à droite', 'Historique', 'Les dernières 24 heures, source par source.')}
    ${ligneBouton('en bas à droite', 'Son', 'Allumer, régler le volume. Un clic sur la sphère aussi.')}
    ${ligneBouton('en bas à gauche', 'Les points', 'Une source qui répond : un point allumé.')}`,
  seances: () => `
    <h2>Seul ou ensemble</h2>
    <p>Une séance solo écoute cet appareil. Une séance collective donne un code et un QR : chaque téléphone qui le scanne rejoint la salle et tire ses propres pièces.</p>
    <h2>Pendant la séance</h2>
    <p>La marée s'affiche sous la sphère. L'œil montre ou cache les chiffres, pour qu'on regarde la sphère plutôt que le compteur. Pause et Arrêter sont en bas, et la croix ramène à la sphère sans arrêter l'enregistrement.</p>
    ${lienFilm(341, 'Le portique et le témoin · 1 min', 'Ce que fait une séance, dans le film')}
    <h2>Après</h2>
    <p>La fiche de la séance s'ouvre avec ses chiffres. Le bouton Rapport en fait une page à garder ou imprimer, Données donne les secondes. Le navigateur garde 50 séances : téléchargez celles qui comptent.</p>
    <h2>Les trois mesures du rapport</h2>
    <p>1. La mesure quantique : Noosféérique, et QCI s'il est dans la salle. 2. La mesure graine : les téléphones et les ordinateurs. 3. Le mélange : tout ce qui jouait ici. Le témoin distant sert de contrôle.</p>`,
  concert: () => `
    <h2>Le panneau U1 virtuel</h2>
    <p>Il envoie le z joué vers MainStage. Un clic sur son titre le replie en un bandeau, un clic sur le bandeau le rouvre. Replié, le MIDI continue : la pastille du bandeau s'allume quand il joue.</p>
    <h2>La séance du concert</h2>
    <p>Créer une séance collective, puis ouvrir « QR code pour le public » depuis le panneau et le projeter. Les téléphones rejoignent avec la page publique, écran posé.</p>
    <h2>Le rapport</h2>
    <p>À l'arrêt, il se télécharge tout seul dans le dossier Téléchargements, avec les trois mesures, le témoin et chaque générateur. Chrome peut demander une fois l'autorisation de télécharger.</p>`,
  coulisses: () => `
    <p>Pour les curieux et les sceptiques : d'où viennent les chiffres.</p>
    <a class="guide-carte" href="/" target="_blank" rel="noopener"><b>Dashboard</b><br>Chaque source en direct : son état, son rythme, ses derniers tirages.</a>
    <div class="guide-carte"><b>La méthode</b><br>Celle des œufs de Princeton : 200 bits par tirage, z = (piles − 100) / √50, réunis par la méthode de Stouffer.</div>
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

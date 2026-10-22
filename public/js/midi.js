/* ============================================================
   Noosfeerique — Sortie MIDI (U1 virtuel)
   Envoie les phrases du moteur (midi-engine.js) vers une sortie
   MIDI (Bus IAC -> MainStage). Panneau visible avec ?midi=1.

   Canal melodie : les phrases. Canal harmonie : les accords qui
   apparaissent quand la coherence monte. Un controleur continu (CC 20)
   suit le niveau de coherence : il ne fait rien tant qu'on ne le
   branche pas dans MainStage. Volumes et sons se reglent dans MainStage.

   Voix back (midi-back.js) : nappes sur les piliers I, IV, V, qui suivent
   la tendance lente du z, sur son propre canal.

   L'envie (midi-envie.js) decide des scenes : silence tant que la coherence
   signee de la derniere minute reste entre -bas et +haut ; hors de cette
   zone il s'engage pour une minute, et reprend tant que ca tient. La nappe
   et le jeu (lead + accords) ont chacun leur zone : nappe seule, les deux,
   ou jeu seul, selon les seuils.

   Passages, jamais abrupts : a l'entree, la nappe vient d'abord et la lead
   `entree` s apres ; a la sortie, la lead finit sa phrase jusqu'a sa
   cadence (l'accord avec elle), puis la nappe s'eteint `queue` s plus tard.
   En option, un fondu sur le controleur 11 (expression), un par groupe :
   le canal de la nappe, et les canaux du jeu.

   Changement de patch par le z (midi-patch.js, option) : 0,00 puis une
   poussee dans le temps imparti. Envoie CC 102 (suivant) ou CC 103
   (precedent) sur le canal 16, a relier dans MainStage aux actions
   « Patch suivant » et « Patch precedent ».

   Gamme du patch (midi-gamme-patch.js) : chaque patch MainStage peut
   annoncer son genre de gamme (CC 104, canal 16, par le bus Retour Noos).
   Il remplace le genre du reglage general, la tonique reste.

   Diagnostic : ?midi=debug ecrit chaque seconde dans la console ce que
   le module recoit et decide.
   ============================================================ */

import { SCALES, ENGINE_DEFAULTS, createEngine } from './midi-engine.js';
import { createCoherence } from './midi-coherence.js';
import { ENVIE_DEFAULTS, createEnvie } from './midi-envie.js';
import { BACK_DEFAULTS, createBack } from './midi-back.js';
import { createScene } from './midi-scene.js';
import { FORCE_DEFAULTS, createForce } from './midi-force.js';
import { createPatchChanger } from './midi-patch.js';
import { lireGammePatch } from './midi-gamme-patch.js';

const STORAGE_KEY = 'noosphi_midi';
const CC_COHERENCE = 20;       // numero libre dans la norme MIDI : n'agit que si on l'assigne
const CC_EXPRESSION = 11;      // fondu d'entree et de sortie (option)
const EXPR_PAS = 100;          // une valeur de fondu toutes les 100 ms
const SAMPLE_MS = 1000;        // lecture du z une fois par seconde (le Sample Rate du U1)
const NOTE_NAMES = ['Do','Do#','Ré','Ré#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];

const DEFAULTS = {
  ...ENGINE_DEFAULTS,
  enabled: false,
  outputId: null,
  channel: 1,
  channelHarmony: 2,
  channelBack: 3,
  // Zone de silence de chaque groupe : joue des que la coherence >= +haut
  // ou <= -bas ; 0 et 0 = joue toujours
  nappeHaut: ENVIE_DEFAULTS.haut,
  nappeBas: ENVIE_DEFAULTS.bas,
  jeuHaut: ENVIE_DEFAULTS.haut,
  jeuBas: ENVIE_DEFAULTS.bas,
  engagement: 30,                  // s : duree d'une scene avant de refaire le point
  accord: 2,                       // coherence (+ ou -) a partir de laquelle viennent les accords
  backTenue: BACK_DEFAULTS.tenueMin / 1000,   // s
  entree: 4,         // s : la lead entre apres la nappe
  queue: 4,          // s : la nappe s'eteint apres la fin de la phrase
  fondu: 'non',      // 'oui' : fondu par CC 11, nappe et jeu chacun le sien
  gamme: 'app',      // 'app' : gamme choisie dans l'app ; 'u1' : La majeur ; 'chromatic'
  traits: 'non',     // 'oui' : traits rapides sur les grands mouvements du z (essai)
  patchAuto: 'non',  // 'oui' : le z change de patch dans MainStage
  patchPousse: 0.5,  // poussee du z juste apres le 0,00
  patchFenetre: 5,   // s : temps imparti pour la poussee
  patchMin: 3,       // min : duree minimale d'un patch
  // Force de frappe (velocite) de chaque voix, entre `Min` et `Max` : elle
  // flotte : le z la deplace a partir de la note d'avant (midi-force.js). Min = Max : frappe fixe.
  velLeadMin: 100, velLeadMax: 100,
  velAccordsMin: 100, velAccordsMax: 100,
  velNappeMin: 100, velNappeMax: 100,
  velPas: FORCE_DEFAULTS.pas,       // force gagnee ou perdue par unite de z, a chaque note
  velSens: FORCE_DEFAULTS.sens,     // 'monte' : z haut = fort ; 'ecart' : loin de 0 = fort
};

// Gammes de l'app (meme liste et memes noms que son panneau des gammes)
const APP_SCALES = [
  ['free', 'Libre'], ['pentatonic', 'Pentatonique'], ['major', 'Majeure'],
  ['minor', 'Mineure'], ['dorian', 'Dorienne'], ['chromatic', 'Chromatique'],
];

const settings = loadSettings();
let access = null;
let output = null;
let latestZ = null;
let clock = null;
let lastCc = -1;
let panel = null;
let gammePatch = null;   // { gamme, nom } annonce par le patch MainStage, sinon null

const coherence = createCoherence({ window: 60, accord: settings.accord });
const envieNappe = createEnvie({ haut: settings.nappeHaut, bas: settings.nappeBas, engagement: settings.engagement * 1000 });
const envieJeu = createEnvie({ haut: settings.jeuHaut, bas: settings.jeuBas, engagement: settings.engagement * 1000 });
const DEBUG = new URLSearchParams(location.search).get('midi') === 'debug';
const patchChanger = createPatchChanger();
const CANAL_PATCH = 16;
const CC_PATCH = { suivant: 102, precedent: 103 };

// Chaque message part date : le systeme MIDI du Mac le joue a l'heure dite,
// meme si Chrome arrondit les minuteurs d'une fenetre cachee.
const channelOf = voice => (voice === 'h' ? settings.channelHarmony : voice === 'b' ? settings.channelBack : settings.channel) - 1;

// Force d'une note : chaque voix flotte avec son signal, la lead
// et les accords le z qui fait la note, la nappe sa tendance lente.
const VEL_KEYS = { m: 'velLead', h: 'velAccords', b: 'velNappe' };
const forces = { m: createForce(), h: createForce(), b: createForce() };
const lastVel = { m: null, h: null, b: null };
function configureForces() {
  for (const v in forces) {
    forces[v].configure({ min: settings[VEL_KEYS[v] + 'Min'], max: settings[VEL_KEYS[v] + 'Max'], pas: settings.velPas, sens: settings.velSens });
  }
}
function velocity(voice, x) {
  return (lastVel[voice] = forces[voice].next(x));
}

const engine = createEngine({
  noteOn: (n, voice, at) => send([0x90 | channelOf(voice), n, velocity(voice, latestZ)], at),
  noteOff: (n, voice, at) => send([0x80 | channelOf(voice), n, 0], at),
});
const back = createBack({
  noteOn: (n, at) => send([0x90 | channelOf('b'), n, velocity('b', back.state.trend)], at),
  noteOff: (n, at) => send([0x80 | channelOf('b'), n, 0], at),
});
const conductor = createScene({ engine, back, envieNappe, envieJeu, coherence });
const lastExpr = { nappe: -1, jeu: -1 };   // derniere valeur de fondu CC 11 envoyee, par groupe

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // Reglage d'avant la zone de silence : un seul seuil, pour les deux bords
    if (saved.envie != null && saved.envieHaut == null) { saved.envieHaut = saved.envie; saved.envieBas = saved.envie; }
    delete saved.envie;
    // Reglage d'avant les deux zones : la meme zone pour la nappe et le jeu
    if (saved.envieHaut != null && saved.jeuHaut == null) {
      saved.nappeHaut = saved.jeuHaut = saved.envieHaut;
      saved.nappeBas = saved.jeuBas = saved.envieBas;
    }
    delete saved.envieHaut;
    delete saved.envieBas;
    delete saved.velZ;      // reglages d'essais du 17/10
    delete saved.velPente;
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

let lastAt = 0;   // heure du dernier message date (Chrome ne sait pas les annuler)

function send(bytes, at) {
  if (!output) return;
  if (at != null && at > performance.now()) { output.send(bytes, at); lastAt = Math.max(lastAt, at); }
  else output.send(bytes);
}

// Juste apres le dernier message date : ce qui est envoye la passe apres lui
const afterScheduled = () => Math.max(performance.now(), lastAt + 5);

// Gamme et tonique selon le reglage (le mode « libre » de l'app devient chromatique)
function currentScale() {
  if (settings.gamme === 'u1') return { intervals: SCALES.major, root: 9 };
  if (settings.gamme === 'chromatic') return { intervals: SCALES.chromatic, root: 0 };
  let key = null;
  try { key = localStorage.getItem('noosphi_scale'); } catch {}
  return { intervals: SCALES[key] || SCALES.chromatic, root: 0 };
}

// Le genre annonce par le patch passe devant le reglage general, avec la meme tonique
function scaleDuJeu() {
  const general = currentScale();
  if (!gammePatch || !gammePatch.gamme) return general;
  return { intervals: SCALES[gammePatch.gamme], root: general.root };
}

// Ecoute toutes les entrees : seule l'annonce de gamme d'un patch compte
function ecouterEntrees() {
  if (!access) return;
  access.inputs.forEach(input => {
    input.onmidimessage = e => {
      const annonce = lireGammePatch(e.data);
      if (!annonce) return;
      gammePatch = annonce.gamme ? annonce : null;
      configureEngine();
      if (panel) panel.querySelector('[data-gamme-patch]').textContent = 'Gamme du patch : ' + annonce.nom;
    };
  });
}

function configureEngine() {
  const { intervals, root } = scaleDuJeu();
  engine.configure({
    low: settings.low, high: settings.high, centre: settings.centre, gain: settings.gain,
    seuil: settings.seuil, maison: settings.maison, minDur: settings.minDur,
    traits: settings.traits === 'oui', traitSaut: settings.traitSaut, traitMax: settings.traitMax,
  }, intervals, root);
  back.configure({ tenueMin: settings.backTenue * 1000 }, root, settings.centre, settings.low, settings.high);
  configureForces();
  patchChanger.configure({ pousse: settings.patchPousse, fenetre: settings.patchFenetre * 1000, minimum: settings.patchMin * 60000 });
  envieNappe.configure({ haut: settings.nappeHaut, bas: settings.nappeBas, engagement: settings.engagement * 1000 });
  envieJeu.configure({ haut: settings.jeuHaut, bas: settings.jeuBas, engagement: settings.engagement * 1000 });
  coherence.configure({ accord: settings.accord });
}

const allChannels = () => [settings.channel, settings.channelHarmony, settings.channelBack];
const GROUPS = {
  nappe: { channels: () => [settings.channelBack], at: t => conductor.exprAt(t) },
  jeu: { channels: () => [settings.channel, settings.channelHarmony], at: t => conductor.exprJeuAt(t) },
};

// Boutons MainStage « Patch suivant » et « Patch precedent » : un seul message
// par appui. Les deux boutons du concert SiO2 ne reagissent pas pareil
// (essais du 18/10/2026) : « suivant » saute a chaque 127 et ignore le 0 ;
// « precedent » saute a chaque changement de valeur. D'ou 127 seul pour
// l'un, 127 / 0 alternes pour l'autre.
const patchValeur = { suivant: 0, precedent: 0 };
function sendPatch(sens) {
  patchValeur[sens] = sens === 'suivant' ? 127 : (patchValeur[sens] ? 0 : 127);
  send([0xB0 | (CANAL_PATCH - 1), CC_PATCH[sens], patchValeur[sens]]);
}

function sendExpressionValue(v, at, group) {
  const names = group ? [group] : Object.keys(GROUPS);
  names.forEach(g => {
    lastExpr[g] = v;
    GROUPS[g].channels().forEach(ch => send([0xB0 | (ch - 1), CC_EXPRESSION, v], at));
  });
}

// Fondu CC 11 : envoie, dates a l'avance, les valeurs de la seconde qui vient.
// Fondu coupe en cours de route : on rend le plein volume, une fois.
function sendExpression(now) {
  if (settings.fondu !== 'oui') {
    for (const g in GROUPS) {
      if (lastExpr[g] !== -1 && lastExpr[g] !== 127) sendExpressionValue(127, undefined, g);
      lastExpr[g] = -1;
    }
    return;
  }
  for (const g in GROUPS) {
    for (let t = now; t < now + SAMPLE_MS; t += EXPR_PAS) {
      const v = Math.round(GROUPS[g].at(t));
      if (v !== lastExpr[g]) sendExpressionValue(v, t, g);
    }
  }
}

// Appele par experience.js quand cette fenetre ouvre ou quitte une session
// collective : le panneau propose alors le QR code a projeter pour le public.
export function midiSessionCode(code) {
  if (!panel) return;
  const link = panel.querySelector('[data-qr]');
  link.classList.toggle('hidden', !code);
  if (code) link.href = `qr.html?code=${encodeURIComponent(code)}`;
}

// Appele par experience.js : ce qui fait jouer l'U1 virtuel en ce moment
export function midiZJoue(texte) {
  if (panel) panel.querySelector('[data-z-joue]').textContent = texte;
}

// Appele par experience.js a chaque nouvelle valeur du z destine au MIDI
// (tirages frais seulement : session collective, ou sources rapides)
export function midiZ(z) {
  latestZ = z;
}

// Une fois par seconde : coherence, puis evenement place dans la seconde par
// les decimales du z (1,37 -> 0,37 s apres le tic). Les durees ne tombent pas
// sur une grille, et c'est encore le z qui decide.
function onSample() {
  const now = performance.now();
  const z = latestZ;
  configureEngine();   // suit un changement de gamme dans l'app
  const at = z != null && isFinite(z) ? now + (Math.abs(z) % 1) * SAMPLE_MS : now;
  const { coh, jeu, nappe, note, attend } = conductor.step(z, now, {
    entree: settings.entree * 1000, queue: settings.queue * 1000, at,
  });
  if (coh.cc !== lastCc) {
    lastCc = coh.cc;
    allChannels().forEach(ch => send([0xB0 | (ch - 1), CC_COHERENCE, coh.cc]));
  }
  sendExpression(now);
  if (settings.patchAuto === 'oui') {
    const { phase, draining } = engine.state;
    const sens = patchChanger.step(z, now, { silence: !draining && (phase === 'silence' || phase === 'cadence') });
    if (sens) sendPatch(sens);
  }
  // Relachements prevus avant la prochaine lecture, envoyes dates des maintenant
  engine.tick(now + SAMPLE_MS);
  updateReadout(note, coh, jeu, nappe, attend);
  if (DEBUG) console.log(`[midi] ${Math.round(now)} z=${z} C=${coh.s.toFixed(2)} palier=${coh.level} jeu=${jeu.joue} nappe=${nappe.joue} note=${note} phase=${engine.state.phase} fin=${engine.state.draining} back=${back.state.sounding}`);
}

function startClock() {
  if (!clock) clock = setInterval(onSample, SAMPLE_MS);
}

function stopClock() {
  clearInterval(clock);
  clock = null;
}

export function midiPanic() {
  engine.panic();
  back.panic();
  conductor.panic();   // garde le fondu en cours : une panique ne coupe pas le volume
  if (output && output.clear) output.clear();   // Firefox seulement : annule les messages dates
  // All Notes Off tout de suite, et encore apres le dernier message date :
  // Chrome ne sait pas annuler une note deja datee dans la seconde qui vient
  const after = afterScheduled();
  for (let ch = 0; ch < 16; ch++) {
    send([0xB0 | ch, 123, 0]);
    if (after > performance.now()) send([0xB0 | ch, 123, 0], after);
  }
  lastExpr.nappe = lastExpr.jeu = -1;   // le fondu sera renvoye en entier a la prochaine lecture
}

async function ensureAccess() {
  if (access) return true;
  if (!navigator.requestMIDIAccess) {
    setStatus('Ce navigateur ne sait pas envoyer de MIDI. Ouvrir la page dans Chrome.');
    return false;
  }
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = () => { fillOutputs(); pickOutput(); ecouterEntrees(); };
    ecouterEntrees();
    return true;
  } catch {
    setStatus('Accès MIDI refusé. Autoriser le MIDI pour ce site dans Chrome.');
    return false;
  }
}

function pickOutput() {
  if (!access) return;
  const outs = [...access.outputs.values()];
  const next = outs.find(o => o.id === settings.outputId) || outs[0] || null;
  if (next !== output) {
    midiPanic();
    output = next;
  }
  if (output) {
    settings.outputId = output.id;
    setStatus(settings.enabled ? `Envoi vers « ${output.name} »` : 'MIDI en pause');
  } else {
    setStatus('Aucune sortie MIDI. Activer le Bus IAC dans « Configuration audio et MIDI ».');
  }
}

function setEnabled(on) {
  settings.enabled = on;
  saveSettings();
  if (on) {
    envieNappe.reset();
    envieJeu.reset();
    patchChanger.reset();
    for (const v in forces) forces[v].reset();
    coherence.reset();   // pas de cohérence périmée après une pause
    back.reset();
    conductor.reset();
    lastExpr.nappe = lastExpr.jeu = -1;
    configureEngine();
    startClock();
  }
  else {
    stopClock();
    midiPanic();
  }
  pickOutput();
  // Plein volume rendu a MainStage : a l'arret avec le fondu, et a l'activation
  // sans fondu (une seance precedente a pu le laisser a 0)
  if (!on ? settings.fondu === 'oui' : settings.fondu !== 'oui') restoreExpression();
}

function restoreExpression() {
  sendExpressionValue(127);
  sendExpressionValue(127, afterScheduled());
  lastExpr.nappe = lastExpr.jeu = -1;
}

// ============================================================
// Panneau de reglage (seulement avec ?midi=1)
// ============================================================
function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (text != null) e.textContent = text;
  return e;
}

// Convention Apple (MainStage, Logic) : Do central 60 = Do3
function noteName(n) {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 2}`;
}

function setStatus(msg) {
  if (panel) panel.querySelector('[data-status]').textContent = msg;
}

const enSecondes = ms => `${Math.ceil(ms / 1000)} s`;
const enMinutes = ms => ms >= 60000 ? `${Math.floor(ms / 60000)} min ${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}` : enSecondes(ms);

function patchLigne(now) {
  const e = patchChanger.etat(now);
  if (e.phase === 'repos') return `Patch : changement possible dans ${enMinutes(e.reste)}`;
  if (e.phase === 'attend-poussee') return `Patch : 0,00 vu, attend la poussée (${enSecondes(e.reste)})`;
  if (e.phase === 'attend-silence') return `Patch : ${e.sens} décidé, attend la fin de la phrase`;
  return 'Patch : guette un 0,00';
}

function updateReadout(note, coh, jeu, nappe, attend) {
  if (!panel) return;
  const z = latestZ != null && isFinite(latestZ) ? latestZ.toFixed(2) : '—';
  const { sounding, phase, draining } = engine.state;
  const shown = note ?? sounding;
  const noteBack = back.state.sounding;
  panel.querySelector('[data-readout]').textContent =
    `z ${z}  ·  lead ${shown != null ? noteName(shown) : '—'}  ·  back ${noteBack != null ? noteName(noteBack) : '—'}  ·  ${phase}`;
  panel.querySelector('[data-patch]').textContent = settings.patchAuto !== 'oui' ? '' : patchLigne(performance.now());
  panel.querySelector('[data-forces]').textContent =
    `Force · lead ${lastVel.m ?? '—'}  ·  accords ${lastVel.h ?? '—'}  ·  nappe ${lastVel.b ?? '—'}`;
  panel.querySelector('[data-envie]').textContent = 'Nappe : ' + (!nappe.joue
    ? (back.state.active ? 's’éteint' : 'se tait')
    : nappe.reste == null ? 'joue (sans silence)'
    : `joue · point dans ${enSecondes(nappe.reste)}`);
  panel.querySelector('[data-envie-jeu]').textContent = 'Jeu : ' + (!jeu.joue
    ? (draining ? 'finit sa phrase' : 'se tait')
    : attend ? 'entre après la nappe'
    : jeu.reste == null ? 'joue (sans silence)'
    : `joue · point dans ${enSecondes(jeu.reste)}`);
  panel.querySelector('[data-coherence]').textContent =
    `Cohérence ${coh.s >= 0 ? '+' : '−'}${coh.c.toFixed(2)} · ${coh.name}`;
  panel.querySelector('[data-bar]').style.width = `${Math.round(coh.cc / 1.27)}%`;
}

function fillOutputs() {
  if (!panel || !access) return;
  const select = panel.querySelector('[data-output]');
  select.replaceChildren();
  access.outputs.forEach(o => {
    const opt = el('option', { value: o.id }, o.name);
    opt.selected = o.id === settings.outputId;
    select.append(opt);
  });
}

function row(label, input) {
  const wrap = el('label', { className: 'midi-row' }, label);
  wrap.append(input);
  return wrap;
}

function numberField(label, key, min, max, step = 1, onChange) {
  const input = el('input', { type: 'number', min, max, step, value: settings[key] });
  input.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Number(input.value)));
    if (!isFinite(v)) { input.value = settings[key]; return; }
    input.value = v;
    if (onChange) onChange();   // avant le changement : couper sur l'ancien canal
    settings[key] = v;
    saveSettings();
    configureEngine();
  });
  return row(label, input);
}

function selectField(label, key, options) {
  const select = el('select');
  options.forEach(([value, text]) => {
    const opt = el('option', { value }, text);
    opt.selected = settings[key] === value;
    select.append(opt);
  });
  select.addEventListener('change', () => {
    settings[key] = select.value;
    saveSettings();
    configureEngine();
  });
  return row(label, select);
}

// Gamme : la liste de l'app, plus La majeur du U1 (MIDI seul). Choisir une gamme
// de l'app la change aussi dans l'app (son clic fait le reste : son, sauvegarde).
const appScale = () => { try { return localStorage.getItem('noosphi_scale') || 'free'; } catch { return 'free'; } };
const gammeValue = () => (settings.gamme === 'app' ? appScale() : 'midi:' + settings.gamme);

function gammeField() {
  const select = el('select');
  select.dataset.gamme = '';
  APP_SCALES.forEach(([value, text]) => select.append(el('option', { value }, text)));
  select.append(el('option', { value: 'midi:u1' }, 'La majeur (U1, MIDI seul)'));
  if (settings.gamme === 'chromatic') select.append(el('option', { value: 'midi:chromatic' }, 'Chromatique (MIDI seul)'));
  select.value = gammeValue();
  select.addEventListener('change', () => {
    if (select.value.startsWith('midi:')) settings.gamme = select.value.slice(5);
    else {
      settings.gamme = 'app';
      const option = document.querySelector(`.scale-option[data-scale="${select.value}"]`);
      if (option) option.click();
      else try { localStorage.setItem('noosphi_scale', select.value); } catch {}
    }
    saveSettings();
    configureEngine();
  });
  // Une gamme changee dans le panneau de l'app se voit ici
  document.querySelectorAll('.scale-option').forEach(o =>
    o.addEventListener('click', () => setTimeout(() => { select.value = gammeValue(); })));
  return row('Gamme', select);
}

// Sphere en mode concert : animee a peu d'images par seconde, ou figee si le
// vieux Mac peine. Partage avec experience.js par localStorage et un evenement.
const sphereMode = () => { try { return localStorage.getItem('noosphi_sphere') || 'animee'; } catch { return 'animee'; } };

function sphereField() {
  const select = el('select');
  [['animee', 'Animée'], ['figee', 'Figée (soulage le Mac)']].forEach(([value, text]) => select.append(el('option', { value }, text)));
  select.value = sphereMode();
  select.addEventListener('change', () => {
    try { localStorage.setItem('noosphi_sphere', select.value); } catch {}
    window.dispatchEvent(new CustomEvent('noosphi:sphere', { detail: select.value }));
  });
  return row('Sphère', select);
}

// Reglages d'une page a l'autre (page d'essai du MacBook -> page en ligne) :
// chaque adresse a sa propre memoire. « Copier » met les reglages dans le
// presse-papier ; « Coller » les reprend et recharge la page. La sortie MIDI
// et l'etat actif/pause restent ceux de la page qui colle (les identifiants
// de sortie changent d'un profil Chrome a l'autre).
const CLES_REGLAGES = [STORAGE_KEY, 'noosphi_scale', 'noosphi_jeu_sources', 'noosphi_sphere'];

function reglagesButtons() {
  const wrap = el('div');
  const buttons = el('div', { className: 'midi-buttons' });
  const copier = el('button', { type: 'button' }, 'Copier mes réglages');
  const coller = el('button', { type: 'button' }, 'Coller mes réglages');
  const zone = el('textarea', { className: 'midi-coller hidden', placeholder: 'Cmd+V ici' });
  const note = el('div', { className: 'midi-note' }, '');

  copier.addEventListener('click', async () => {
    saveSettings();
    const data = {};
    CLES_REGLAGES.forEach(k => { try { const v = localStorage.getItem(k); if (v != null) data[k] = v; } catch {} });
    const texte = JSON.stringify({ noosfeerique: 1, reglages: data });
    try { await navigator.clipboard.writeText(texte); }
    catch {
      zone.value = texte; zone.classList.remove('hidden'); zone.select();
      document.execCommand('copy'); zone.classList.add('hidden');
    }
    note.textContent = 'Réglages copiés. Dans l’autre fenêtre : « Coller mes réglages ».';
  });

  coller.addEventListener('click', () => {
    zone.value = '';
    zone.classList.remove('hidden');
    zone.focus();
    note.textContent = 'Appuie sur Cmd+V.';
  });

  zone.addEventListener('paste', e => {
    e.preventDefault();
    let recu;
    try { recu = JSON.parse(e.clipboardData.getData('text')); } catch {}
    if (!recu || recu.noosfeerique !== 1 || !recu.reglages) { note.textContent = 'Ce ne sont pas des réglages Noosfeerique.'; return; }
    const ici = { outputId: settings.outputId, enabled: settings.enabled };
    Object.entries(recu.reglages).forEach(([k, v]) => {
      if (!CLES_REGLAGES.includes(k)) return;
      if (k === STORAGE_KEY) { try { v = JSON.stringify({ ...JSON.parse(v), ...ici }); } catch { return; } }
      try { localStorage.setItem(k, v); } catch {}
    });
    note.textContent = 'Réglages repris, la page se recharge…';
    setTimeout(() => location.reload(), 600);
  });

  buttons.append(copier, coller);
  wrap.append(buttons, zone, note);
  return wrap;
}

// Pour relier les boutons MainStage avec « Apprendre » : envoie le message une fois
function testPatchButtons() {
  const wrap = el('div', { className: 'midi-buttons' });
  [['precedent', '← Tester précédent'], ['suivant', 'Tester suivant →']].forEach(([sens, texte]) => {
    const b = el('button', { type: 'button' }, texte);
    b.addEventListener('click', async () => {
      // Page rechargee en pause : la sortie MIDI n'est pas encore ouverte
      if (!output) {
        if (!(await ensureAccess())) return;
        fillOutputs();
        pickOutput();
      }
      sendPatch(sens);
    });
    wrap.append(b);
  });
  return wrap;
}

function title(text) {
  return el('div', { className: 'midi-title' }, text);
}

function buildPanel() {
  const style = el('style', {}, `
    /* Au-dessus de l'ecran de session (z 60) : les commandes et le QR restent
       accessibles pendant l'enregistrement d'une session collective */
    body.midi-ouvert .session-overlay { padding-left: 284px; }   /* rien de la session sous le panneau */
    body.midi-replie .session-overlay { padding-left: 40px; }    /* replie : seul le bandeau reste */
    .midi-panel.hidden, .midi-bandeau.hidden { display: none; }
    .midi-panel h3 { cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
    .midi-panel h3 .midi-replier { color: rgba(255,255,255,.5); font-size: 15px; line-height: 1; }
    .midi-panel h3:hover .midi-replier { color: #4EC9C6; }
    .midi-bandeau { position: fixed; left: 0; top: 64px; z-index: 90; width: 28px; padding: 12px 0;
      display: flex; flex-direction: column; align-items: center; gap: 10px; cursor: pointer;
      background: rgba(11,14,20,.92); border: 1px solid #4EC9C6; border-left: none; border-radius: 0 10px 10px 0;
      color: #4EC9C6; font: 600 11px/1 Inter, -apple-system, sans-serif; letter-spacing: .08em; backdrop-filter: blur(8px); }
    .midi-bandeau:hover { background: rgba(78,201,198,.12); }
    .midi-bandeau span { writing-mode: vertical-rl; transform: rotate(180deg); }
    .midi-pastille { width: 8px; height: 8px; border-radius: 50%; background: #3a4150; }
    .midi-pastille.on { background: #4EC9C6; box-shadow: 0 0 6px #4EC9C6; }
    .midi-panel { position: fixed; left: 12px; top: 64px; z-index: 90; width: 260px;
      max-height: calc(100vh - 80px); overflow-y: auto;
      background: rgba(11,14,20,.92); border: 1px solid #4EC9C6; border-radius: 10px;
      padding: 10px 12px; color: rgba(255,255,255,.9); font: 12px/1.4 Inter, -apple-system, sans-serif;
      backdrop-filter: blur(8px); }
    .midi-panel h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #4EC9C6; }
    .midi-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 4px 0; }
    .midi-panel input, .midi-panel select { background: #1a1f2a; color: rgba(255,255,255,.9);
      border: 1px solid #333; border-radius: 4px; padding: 2px 4px; width: 80px; font: inherit; }
    .midi-panel select { width: 130px; }
    .midi-buttons { display: flex; gap: 6px; margin-top: 8px; }
    .midi-buttons button { flex: 1; padding: 5px; border-radius: 6px; border: 1px solid #4EC9C6;
      background: transparent; color: #4EC9C6; font: inherit; cursor: pointer; }
    .midi-buttons button.on { background: #4EC9C6; color: #0B0E14; }
    .midi-readout { margin-top: 8px; font-family: ui-monospace, Menlo, monospace; color: #C9A24D; }
    .midi-coherence { margin-top: 4px; color: rgba(255,255,255,.7); }
    .midi-gauge { height: 4px; margin-top: 3px; background: #1a1f2a; border-radius: 2px; overflow: hidden; }
    .midi-gauge div { height: 100%; width: 0; background: #C9A24D; transition: width .8s ease; }
    .midi-status { margin-top: 4px; color: rgba(255,255,255,.5); }
    .midi-qr { display: block; margin-top: 8px; color: #C9A24D; }
    .midi-qr.hidden { display: none; }
    .midi-title { margin: 10px 0 2px; color: #4EC9C6; font-weight: 600; }
    .midi-note { color: rgba(255,255,255,.5); font-size: 11px; }
    .midi-coller { width: 100%; height: 40px; margin-top: 6px; background: transparent; color: #fff;
      border: 1px dashed #4EC9C6; border-radius: 6px; font: 11px Inter, sans-serif; }
    .midi-coller.hidden { display: none; }
  `);
  document.head.append(style);

  panel = el('div', { className: 'midi-panel' });
  const titre = el('h3', {}, 'Sortie MIDI · U1 virtuel');
  titre.title = 'Replier les commandes (le MIDI continue de jouer)';
  titre.append(el('span', { className: 'midi-replier' }, '‹'));
  titre.addEventListener('click', () => replier(true));
  panel.append(titre);

  const output = el('select');
  output.dataset.output = '';
  output.addEventListener('change', () => {
    settings.outputId = output.value;
    saveSettings();
    pickOutput();
  });
  panel.append(row('Sortie', output));

  panel.append(
    gammeField(),
    ...(new URLSearchParams(location.search).has('concert') ? [sphereField()] : []),
    title('Force de frappe (vélocité, 1 à 127)'),
    el('div', { className: 'midi-note' }, 'La force flotte comme la mélodie : chaque z la déplace à partir de la note d’avant (z positif : elle enfle ; négatif : elle s’adoucit). Mini et maxi bornent la voix, mini = maxi : frappe fixe.'),
    numberField('Lead : mini', 'velLeadMin', 1, 127),
    numberField('Lead : maxi', 'velLeadMax', 1, 127),
    numberField('Accords : mini', 'velAccordsMin', 1, 127),
    numberField('Accords : maxi', 'velAccordsMax', 1, 127),
    numberField('Nappe : mini', 'velNappeMin', 1, 127),
    numberField('Nappe : maxi', 'velNappeMax', 1, 127),
    numberField('Pas par unité de z', 'velPas', 1, 30, 1),
    selectField('Sens', 'velSens', [['monte', 'z positif = plus fort'], ['ecart', 'z fort (+ ou −) = plus fort']]),
    title('Quand ça joue'),
    numberField('Nappe : joue au-dessus de +', 'nappeHaut', 0, 4, 0.1),
    numberField('Nappe : joue au-dessous de −', 'nappeBas', 0, 4, 0.1),
    numberField('Jeu : joue au-dessus de +', 'jeuHaut', 0, 4, 0.1),
    numberField('Jeu : joue au-dessous de −', 'jeuBas', 0, 4, 0.1),
    numberField('Engagement avant le point (s)', 'engagement', 5, 120, 5),
    numberField('Accords dès ± (cohérence)', 'accord', 1.6, 4, 0.1),
    numberField('Canal lead', 'channel', 1, 16, 1, midiPanic),
    numberField('Canal accords', 'channelHarmony', 1, 16, 1, midiPanic),
    numberField('Canal back (nappes)', 'channelBack', 1, 16, 1, midiPanic),
    numberField('Note la plus grave', 'low', 0, 127),
    numberField('Note la plus aiguë', 'high', 0, 127),
    numberField('Centre (départ)', 'centre', 0, 127),
    numberField('Degrés par unité de z', 'gain', 0.5, 12, 0.5),
    numberField('Seuil de mouvement', 'seuil', 0.1, 5, 0.1),
    numberField('Maison (± degrés)', 'maison', 0, 6, 1),
    numberField('Durée min. (ms)', 'minDur', 50, 5000, 50),
    selectField('Traits rapides (essai)', 'traits', [['non', 'Non'], ['oui', 'Oui']]),
    numberField('Trait dès un saut de z', 'traitSaut', 1, 4, 0.1),
    numberField('Notes max par trait', 'traitMax', 1, 8, 1),
    title('Changement de patch par le z'),
    el('div', { className: 'midi-note' }, 'Le z tombe sur 0,00, puis pousse dans le temps imparti : + = patch suivant, − = précédent. Envoie CC 102 / 103 sur le canal 16.'),
    selectField('Changer de patch', 'patchAuto', [['non', 'Non'], ['oui', 'Oui']]),
    numberField('Poussée après le 0,00', 'patchPousse', 0.1, 3, 0.1),
    numberField('Temps imparti (s)', 'patchFenetre', 1, 30, 1),
    numberField('Durée min. d’un patch (min)', 'patchMin', 0, 30, 0.5),
    testPatchButtons(),
    title('Voix et passages'),
    numberField('Tenue min. back (s)', 'backTenue', 2, 60, 1),
    numberField('Entrée de la lead (s)', 'entree', 0, 20, 1),
    numberField('Queue de la back (s)', 'queue', 0, 30, 1),
    selectField('Fondu CC 11', 'fondu', [['non', 'Non'], ['oui', 'Oui']]),
    title('Réglages d’une page à l’autre'),
    reglagesButtons(),
  );

  const buttons = el('div', { className: 'midi-buttons' });
  const toggle = el('button', { type: 'button' });
  const refreshToggle = () => {
    toggle.textContent = settings.enabled ? 'MIDI actif' : 'Activer le MIDI';
    toggle.classList.toggle('on', settings.enabled);
    pastille.classList.toggle('on', settings.enabled);
    bandeau.title = (settings.enabled ? 'MIDI actif' : 'MIDI en pause') + ' · ouvrir les commandes';
  };
  toggle.addEventListener('click', async () => {
    if (!settings.enabled && !(await ensureAccess())) return;
    fillOutputs();
    setEnabled(!settings.enabled);
    refreshToggle();
  });
  const panic = el('button', { type: 'button' }, 'Panique');
  panic.title = 'Coupe toutes les notes';
  panic.addEventListener('click', midiPanic);
  buttons.append(toggle, panic);
  panel.append(buttons);

  const readout = el('div', { className: 'midi-readout' }, 'z —');
  readout.dataset.readout = '';
  const envieLine = el('div', { className: 'midi-coherence' }, 'Nappe —');
  envieLine.dataset.envie = '';
  const jeuLine = el('div', { className: 'midi-coherence' }, 'Jeu —');
  jeuLine.dataset.envieJeu = '';
  const coh = el('div', { className: 'midi-coherence' }, 'Cohérence —');
  coh.dataset.coherence = '';
  const gauge = el('div', { className: 'midi-gauge' });
  const bar = el('div');
  bar.dataset.bar = '';
  gauge.append(bar);
  const status = el('div', { className: 'midi-status' }, 'MIDI en pause');
  status.dataset.status = '';
  const qr = el('a', { className: 'midi-qr hidden', target: '_blank', rel: 'noopener' }, 'QR code pour le public ↗');
  qr.dataset.qr = '';
  const forces = el('div', { className: 'midi-coherence' }, 'Force —');
  forces.dataset.forces = '';
  const patchLine = el('div', { className: 'midi-coherence' }, '');
  patchLine.dataset.patch = '';
  const gammeLine = el('div', { className: 'midi-coherence' }, 'Gamme du patch : générale');
  gammeLine.dataset.gammePatch = '';
  const zJoueLine = el('div', { className: 'midi-coherence' }, 'z joué : —');
  zJoueLine.dataset.zJoue = '';
  panel.append(readout, forces, patchLine, gammeLine, zJoueLine, envieLine, jeuLine, coh, gauge, status, qr);

  document.body.append(panel, bandeau);
  appliquerRepli();
  new MutationObserver(appliquerRepli).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  refreshToggle();
  return refreshToggle;
}

// ---- Le panneau se replie en un bandeau, sans jamais arreter le MIDI ----
// Un clic sur le titre le replie, un clic sur le bandeau le rouvre (memorise).
// Il s'efface aussi tout seul, bandeau compris, tant qu'un ecran de l'app
// s'ouvre dessous (sources, sessions enregistrees, fiche, graphiques, aide),
// et revient comme avant a sa fermeture. La pastille du bandeau dit si le MIDI joue.
const pastille = el('i', { className: 'midi-pastille' });
const bandeau = el('button', { type: 'button', className: 'midi-bandeau hidden' });
bandeau.append(pastille, el('span', {}, 'MIDI · U1'));
bandeau.addEventListener('click', () => replier(false));
let replie = (() => { try { return localStorage.getItem('noosphi_midi_replie') === '1'; } catch { return false; } })();
const ECRANS_DESSOUS = '#sidebar.open, #sessions-list-overlay.open, #session-detail-overlay.open, #graph-overlay.open, .modal-overlay';
function replier(oui) {
  replie = oui;
  try { localStorage.setItem('noosphi_midi_replie', oui ? '1' : '0'); } catch {}
  appliquerRepli();
}
function appliquerRepli() {
  const masque = !!document.querySelector(ECRANS_DESSOUS);
  const voirPanneau = !replie && !masque, voirBandeau = replie && !masque;
  // n'ecrire que ce qui change : l'observateur ne doit pas se relancer lui-meme
  if (panel.classList.contains('hidden') === voirPanneau) panel.classList.toggle('hidden', !voirPanneau);
  if (bandeau.classList.contains('hidden') === voirBandeau) bandeau.classList.toggle('hidden', !voirBandeau);
  if (document.body.classList.contains('midi-ouvert') !== voirPanneau) document.body.classList.toggle('midi-ouvert', voirPanneau);
  if (document.body.classList.contains('midi-replie') !== voirBandeau) document.body.classList.toggle('midi-replie', voirBandeau);
}

if (new URLSearchParams(location.search).has('midi')) {
  const refreshToggle = buildPanel();
  // Reprise si le MIDI etait actif a la derniere visite
  if (settings.enabled) {
    ensureAccess().then(ok => {
      if (ok) { fillOutputs(); setEnabled(true); }
      else { settings.enabled = false; }
      refreshToggle();
    });
  }
} else {
  settings.enabled = false;   // jamais de MIDI sans le panneau visible
}

window.addEventListener('pagehide', () => {
  midiPanic();
  if (settings.enabled && settings.fondu === 'oui') restoreExpression();
});

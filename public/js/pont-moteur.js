/* ============================================================
   Pont Thétys, version 4, en JavaScript (08/11/2026)
   Recopie fidèle de VegeOhm/docs/thetys-oui-non/outils/pont-thetys.c,
   le pont qui joue Thétys vers MainStage. Logique pure, sans navigateur :
   la même fonction tourne dans la page « U1 corrigé » et dans le rejeu
   sous Node (test/pont-moteur.test.mjs), qui compare le journal produit
   à celui du pont en C, ligne à ligne.

   Ce que fait le pont (voir le C pour le détail et l'historique) :
   - recoud les recentrages du U1 (pas > 10 crans) en un niveau continu ;
   - zone morte de ±zone crans : le tremblement d'un cran ne déplace pas le niveau ;
   - joue ce niveau sur 88 touches, 1 cran = 1 demi-ton, La 4 = ancre calée
     après `attente` s d'écoute ; au bord du clavier, saut d'une octave ;
   - états ECOUTE, JOUE, CALME (silence voulu), ROUGE (U1 saturé) ;
   - aucune note de 00:00 à 09:30 sauf `nuit` ;
   - couches : arrivées (note tenue `tenue` s), sommets (retournement après
     3 pas), geste (début d'un mouvement grossi, CC 1).
   Sorties : 0 = « Thétys », 1 = arrivées, 2 = sommets, 3 = geste.
   ============================================================ */

const SAUT_RECENTRAGE = 10, LA4 = 69, TOUCHE_MIN = 21, TOUCHE_MAX = 108;
const DELAI_ROUGE = 30.0, DELAI_CALME = 60.0, FENETRE_RECALE = 60.0, HIST = 4096, PAS_SOMMET = 3;
const GESTE_MAX = 3720, GESTE_ECHAUFFE = 120;
export const ETATS = ['ECOUTE', 'JOUE', 'CALME', 'ROUGE'];
const ECOUTE = 0, JOUE = 1, CALME = 2, ROUGE = 3;

// printf("%.Nf") du C : arrondi correct de la valeur binaire, comme toFixed
const f = (x, n) => (Object.is(x, -0) ? '-' : '') + x.toFixed(n);
const deux = n => String(n).padStart(2, '0');

export function creerPont(o = {}) {
  const sortie = o.sortie || (() => {});          // (couche, [statut, d1, d2])
  const journal = o.journal || null;              // (ligne) ; null = pas de journal
  const message = o.message || (() => {});        // (texte) : ce que le pont écrit dans son terminal
  const P = {
    nuit: !!o.nuit, couches: o.couches !== false, tenue: o.tenue ?? 6, attente: o.attente ?? 60,
    geste_actif: o.geste !== false, geste_amp: o.amplification ?? 1, geste_fen: o.fenetre ?? 30,
    geste_plancher: o.plancher ?? 2, geste_cal: o.calibration ?? 10, zone: o.zone ?? 1,
    t0_epoch: o.t0 ?? 0,
  };
  if (!(P.geste_amp >= 0.1 && P.geste_amp <= 50)) P.geste_amp = 1;
  P.geste_fen = (P.geste_fen >= 5 && P.geste_fen <= 300) ? Math.trunc(P.geste_fen) : 30;
  if (!(P.geste_plancher >= 0.1 && P.geste_plancher <= 100)) P.geste_plancher = 2;
  if (!(P.geste_cal >= 3 && P.geste_cal <= 60)) P.geste_cal = 10;
  if (!(P.zone >= 0 && P.zone <= 3)) P.zone = 1;

  let etat = ECOUTE, brut_prec = -1, decalage = 0, ancre_ok = 0, touche = -1;
  let ancre = 0, ancre_depart = 0, t_debut = o.debut ?? -1, t_note = -1, t_cc = -1;
  let u1_absent = 0, saut_octave = 0;
  const S = { recentrages: 0, rouges: 0, octaves: 0, notes_jouees: 0, notes_nuit: 0, cc_bloques: 0, passages: 0, arrivees: 0, sommets: 0, geste_notes: 0, filtre_change: 0, geste_secondes: 0, geste_jeu: 0 };
  const hist_t = new Float64Array(HIST), hist_v = new Int32Array(HIST); let hist_n = 0, hist_i = 0;
  let arrivee = -1, arrivee_prec = -1, sommet = -1, cand = -1, cand_vel = 64, cand_vue = 1, sens = 0, glissade = 0, cand_t = 0;
  let geste_touche = -1, geste_joue = 0, geste_cc = -1, geste_n = 0, geste_i = 0;
  const geste_seuil = 1, geste_dt = 3;
  const geste_buf = new Float64Array(GESTE_MAX); let geste_prochain = -1, geste_val = 0, geste_ag = 0;
  let filtre = 0, filtre_ok = 0, t_filtre = -1;

  const heureDe = t => { const d = new Date(Math.trunc(P.t0_epoch + t) * 1000); return deux(d.getHours()) + ':' + deux(d.getMinutes()) + ':' + deux(d.getSeconds()); };
  const heures_calmes = t => {
    if (P.nuit) return false;
    const d = new Date(Math.trunc(P.t0_epoch + t) * 1000), h = d.getHours();
    return h < 9 || (h === 9 && d.getMinutes() < 30);
  };
  const J = l => { if (journal) journal(l); };
  const envoie_sur = (i, st, d1, d2) => sortie(i, [st, d1, d2]);
  const envoie = (st, d1, d2) => envoie_sur(0, st, d1, d2);

  function lache_couches() {
    if (arrivee >= 0) { envoie_sur(1, 0x80, arrivee, 0); arrivee = -1; }
    if (sommet >= 0) { envoie_sur(2, 0x80, sommet, 0); sommet = -1; }
  }
  function lache_touche() {
    if (touche >= 0) { envoie(0x80, touche, 0); touche = -1; }
    lache_couches(); cand = -1; cand_vue = 1; sens = 0; glissade = 0; arrivee_prec = -1;
  }
  // tenue_ch : 'arrivee' ou 'sommet'
  function joue_couche(i, quoi, k, vel) {
    const cur = quoi === 'arrivee' ? arrivee : sommet;
    if (!P.couches || k === cur) return;
    envoie_sur(i, 0x90, k, vel);
    if (cur >= 0) envoie_sur(i, 0x80, cur, 0);
    if (quoi === 'arrivee') arrivee = k; else sommet = k;
  }
  function contour(t, prec, k, vel) {
    if (prec < 0) { sens = 0; glissade = 0; }
    const s = prec < 0 ? 0 : (k > prec) - (k < prec);
    if (s && sens && s !== sens && glissade >= PAS_SOMMET) {
      S.sommets++;
      J(`#,sommet,${f(P.t0_epoch + t, 3)},${prec},${sens > 0 ? 'haut' : 'bas'}`);
      joue_couche(2, 'sommet', prec, vel);
    }
    if (s) { glissade = (s === sens) ? glissade + 1 : 1; sens = s; }
    if (cand >= 0 && !cand_vue) { S.passages++; J(`#,passage,${f(P.t0_epoch + t, 3)},${cand}`); }
    cand = k; cand_t = t; cand_vel = vel; cand_vue = 0;
  }
  function verifie_arrivee(t) {
    if (cand < 0 || cand_vue || t - cand_t < P.tenue) return;
    cand_vue = 1;
    if (cand === arrivee_prec) return;
    arrivee_prec = cand; S.arrivees++;
    J(`#,arrivee,${f(P.t0_epoch + t, 3)},${cand},${f(P.tenue, 0)}`);
    joue_couche(1, 'arrivee', cand, cand_vel);
  }
  // ---------- geste ----------
  const geste_k = k => geste_buf[(geste_i - geste_n + k + GESTE_MAX) % GESTE_MAX];
  function lache_geste() {
    if (geste_touche >= 0) { envoie_sur(3, 0x80, geste_touche, 0); geste_touche = -1; }
    if (geste_cc > 0) envoie_sur(3, 0xB0, 1, 0);
    geste_cc = geste_joue = 0;
  }
  function geste_repart() { lache_geste(); geste_n = geste_i = 0; geste_val = 0; }
  function geste_seconde(t) {
    if (brut_prec < 0 || !filtre_ok) return;
    geste_buf[geste_i] = filtre; geste_i = (geste_i + 1) % GESTE_MAX;
    let garder = Math.trunc(P.geste_cal * 60) + 1; if (garder > GESTE_MAX) garder = GESTE_MAX;
    geste_n = geste_n < garder ? geste_n + 1 : garder;
    const w = Math.trunc(P.geste_fen), n = geste_n;
    if (n < GESTE_ECHAUFFE || n <= w) { geste_val = 0; lache_geste(); return; }
    const derive = (geste_k(n - 1) - geste_k(0)) / (n - 1); let s = 0, s2 = 0;
    for (let i = w; i < n; i++) { const d = geste_k(i) - geste_k(i - w) - derive * w; s += d; s2 += d * d; }
    const moy = s / (n - w), ag = Math.sqrt(Math.max(0, s2 / (n - w) - moy * moy));
    const plancher = P.geste_plancher * Math.sqrt(w / 60.0);
    geste_val = P.geste_amp * (geste_k(n - 1) - geste_k(n - 1 - w) - derive * w) / Math.max(Math.max(ag, plancher), 0.01);
    if (!isFinite(geste_val)) geste_val = 0;
    geste_ag = ag * Math.sqrt(60.0 / w);
    S.geste_secondes++;
    const a = Math.abs(geste_val);
    if (!P.geste_actif || etat !== JOUE || u1_absent || heures_calmes(t) || a < (geste_joue ? 0.8 * geste_seuil : geste_seuil)) {
      lache_geste();
    } else {
      geste_joue = 1; S.geste_jeu++;
      let k = Math.floor(LA4 + geste_val * geste_dt + 0.5);
      if (k > TOUCHE_MAX) k = TOUCHE_MAX; if (k < TOUCHE_MIN) k = TOUCHE_MIN;
      const vel = 40 + Math.trunc(Math.min(87, (a - geste_seuil) * 25)), cc = Math.trunc(Math.min(127, a / 4 * 127));
      if (cc !== geste_cc) { envoie_sur(3, 0xB0, 1, cc); geste_cc = cc; }
      if (k !== geste_touche) {
        envoie_sur(3, 0x90, k, vel);
        if (geste_touche >= 0) envoie_sur(3, 0x80, geste_touche, 0);
        geste_touche = k; S.geste_notes++;
      }
    }
    J(`#,geste,${f(P.t0_epoch + t, 3)},${f(geste_val, 2)},${f(ag * Math.sqrt(60.0 / w), 2)},${f(P.geste_amp, 2)},${geste_touche}`);
  }
  function note_journal(t, src, ch, type, d1, d2, jouee) {
    if (!journal) return;
    const a = ancre_ok ? f(ancre, 1) : '';
    J(`${f(t * 1000, 0)},${src},${ch},${type},${d1},${d2},${f(P.t0_epoch + t, 3)},${heureDe(t)},${brut_prec >= 0 ? brut_prec + decalage : -1},${decalage},${a},${jouee},${ETATS[etat]},${filtre_ok ? filtre : -1}`);
  }
  function change_etat(nouveau, t) {
    if (nouveau === etat) return;
    if (etat === ROUGE) envoie(0xBF, 20, 0);
    if (nouveau === ROUGE) {
      lache_touche(); geste_repart(); envoie(0xBF, 20, 127); S.rouges++;
      message(`${heureDe(t)}  ROUGE : le U1 ne suit plus (aucune note depuis ${f(t - t_note, 0)} s). Vérifier le contact de la pince sur la feuille.`);
    } else if (nouveau === CALME) {
      lache_touche();
      message(`${heureDe(t)}  CALME : elle ne bouge pas assez pour jouer, silence respecté.`);
    } else if (nouveau === JOUE && etat !== ECOUTE) {
      message(`${heureDe(t)}  JOUE${etat === ROUGE ? ' (fin du rouge)' : ''}`);
    }
    etat = nouveau;
  }
  function mediane(t, fen) {
    const v = [];
    for (let i = 0; i < hist_n; i++) if (t - hist_t[i] <= fen) v.push(hist_v[i]);
    if (!v.length) return null;
    v.sort((a, b) => a - b); const n = v.length;
    return { n, m: n % 2 ? v[n >> 1] : (v[n / 2 - 1] + v[n / 2]) / 2.0 };
  }
  function cale_la(t, fen, bavard) {
    const r = mediane(t, fen);
    if (!r || r.n < 5) { if (bavard) message(`${heureDe(t)}  Pas assez de notes pour caler le La (${r ? r.n : 0}), j'écoute encore.`); return; }
    ancre = ancre_depart = r.m; ancre_ok = 1;
    message(`${heureDe(t)}  La calé : niveau ${f(r.m, 1)} = La 4 (médiane de ${r.n} notes sur ${f(fen, 0)} s). Le pont joue maintenant.`);
    J(`#,ancre,${f(r.m, 1)}`);
  }
  function note_u1(t, brut, vel) {
    if (brut_prec >= 0 && Math.abs(brut - brut_prec) > SAUT_RECENTRAGE) { decalage += brut_prec - brut; S.recentrages++; }
    brut_prec = brut; t_note = t;
    const recousu = brut + decalage;
    let bouge = 1;
    if (!filtre_ok) { filtre = recousu; filtre_ok = 1; }
    else if (recousu > filtre + P.zone) { filtre = recousu - P.zone; S.filtre_change++; }
    else if (recousu < filtre - P.zone) { filtre = recousu + P.zone; S.filtre_change++; }
    else bouge = P.zone === 0 ? 1 : 0;
    if (bouge) t_filtre = t;
    const niveau = filtre;
    hist_t[hist_i] = t; hist_v[hist_i] = niveau; hist_i = (hist_i + 1) % HIST; if (hist_n < HIST) hist_n++;
    if (!ancre_ok) {
      if (t - t_debut >= P.attente) cale_la(t, t - t_debut + 1, 0);
      if (!ancre_ok) return;
    }
    if (etat === CALME && !bouge) return;
    change_etat(JOUE, t);
    let k = Math.floor(LA4 + niveau - ancre + 0.5), saute = 0;
    if (k > TOUCHE_MAX || k < TOUCHE_MIN) {
      const n = Math.trunc((k - LA4 + (k > LA4 ? 6 : -6)) / 12);
      ancre += 12 * n; k -= 12 * n; S.octaves++; saut_octave = 1; saute = 1;
      message(`${heureDe(t)}  OCTAVE ${n <= 0 ? '+' : ''}${-n} : elle a dérivé de ${niveau - ancre_depart >= 0 ? '+' : ''}${f(niveau - ancre_depart, 0)} crans depuis le La de départ.`);
      J(`#,octave,${-n >= 0 ? '+' : ''}${-n}`);
    }
    if (heures_calmes(t)) { S.notes_nuit++; lache_touche(); return; }
    if (k === touche) return;
    envoie(0x90, k, vel || 64);
    if (touche >= 0) envoie(0x80, touche, 0);
    contour(t, saute ? -1 : touche, k, vel || 64);
    touche = k; S.notes_jouees++;
  }

  // ---------- entrées publiques ----------
  // un message du U1 : t en secondes depuis le lancement
  function evenement(t, src, ch, type_st, d1, d2) {
    if (t_debut < 0) t_debut = t;
    let type = 'autre', jouee = -1;
    if (type_st === 0x90 && d2 > 0) { type = 'on'; note_u1(t, d1, d2); jouee = touche; }
    else if (type_st === 0x90 || type_st === 0x80) type = 'off';
    else if (type_st === 0xB0) { type = 'cc'; if (d1 === 123) { t_cc = t; S.cc_bloques++; } }
    note_journal(t, src, ch, type, d1, d2, jouee);
  }
  // chaque quart de seconde
  function tic(t) {
    if (ancre_ok && t_note >= 0) {
      if (t - t_note > DELAI_ROUGE && t_cc > t_note && t - t_cc < 15) change_etat(ROUGE, t);
      else if (t - t_note > DELAI_CALME && etat !== ROUGE && !u1_absent) change_etat(CALME, t);
      else if (P.zone && t_filtre >= 0 && t - t_filtre > DELAI_CALME && etat === JOUE && !u1_absent) change_etat(CALME, t);
    }
    if (touche >= 0 && heures_calmes(t)) lache_touche();
    if (etat === JOUE) verifie_arrivee(t);
    if (geste_prochain < 0) geste_prochain = t;
    if (t - geste_prochain > 5) { geste_repart(); geste_prochain = t; }
    while (t >= geste_prochain) { geste_seconde(geste_prochain); geste_prochain += 1; }
  }
  function recaler(t) { cale_la(t, FENETRE_RECALE, 1); }
  function regler(nom, v) {
    if (nom === 'couches') { P.couches = !!v; if (!P.couches) lache_couches(); }
    else if (nom === 'tenue') P.tenue = Math.max(2, Math.min(30, v));
    else if (nom === 'amplification') P.geste_amp = Math.max(0.1, Math.min(50, v));
    else if (nom === 'fenetre') { if (v >= 5 && v <= 300) P.geste_fen = Math.trunc(v); }
    else if (nom === 'geste') { P.geste_actif = !!v; if (!P.geste_actif) lache_geste(); }
    else if (nom === 'zone') { if (v >= 0 && v <= 3) { P.zone = v; filtre_ok = 0; geste_repart(); } }
    else if (nom === 'nuit') P.nuit = !!v;
  }
  function absent(oui) {
    if (oui && !u1_absent) { lache_touche(); lache_geste(); u1_absent = 1; message(`U1 DÉBRANCHÉ : ce silence n'est pas la plante.`); }
    else if (!oui && u1_absent) { u1_absent = 0; message('U1 rebranché.'); }
  }
  function arret() {
    lache_touche(); lache_geste();
    for (let i = 0; i < 4; i++) envoie_sur(i, 0xB0, 123, 0);
    envoie(0xBF, 20, 0);
  }
  const etatPublic = () => ({
    etat: ETATS[etat], ancre_ok: !!ancre_ok, ancre, touche, niveau: brut_prec >= 0 ? brut_prec + decalage : null,
    filtre: filtre_ok ? filtre : null, decalage, geste: geste_val, agitation: geste_ag, geste_touche,
    reglages: { ...P }, stats: { ...S }, heures_calmes: heures_calmes,
  });
  return { evenement, tic, recaler, regler, absent, arret, etat: etatPublic, get saut_octave() { return saut_octave; }, set saut_octave(v) { saut_octave = v; } };
}

// Rejeu d'un relevé CSV (temps_ms,source,canal,type,d1,d2,...) comme `pont-thetys --rejoue`
export function rejouer(texte, o = {}) {
  const lignes = [], sorties = [];
  const pont = creerPont({ ...o, debut: undefined, journal: o.journal === false ? null : l => lignes.push(l), sortie: (c, b) => sorties.push([c, ...b]) });
  const src = o.source || 'USB';
  let prochain_tic = 0.25;
  const L = texte.split('\n');
  for (let i = 1; i < L.length; i++) {
    const m = /^(-?\d+),([^,]{1,63}),(-?\d+),([^,]{1,15}),(-?\d+),(-?\d+)/.exec(L[i]);
    if (!m || !m[2].includes(src)) continue;
    const t = parseInt(m[1], 10) / 1000;
    while (prochain_tic <= t) { pont.tic(prochain_tic); prochain_tic += 0.25; }
    const ty = m[4], st = ty === 'on' ? 0x90 : ty === 'off' ? 0x80 : ty === 'cc' ? 0xB0 : 0;
    if (!st) continue;
    pont.saut_octave = 0;
    pont.evenement(t, m[2], parseInt(m[3], 10), st, parseInt(m[5], 10), st === 0x80 ? 0 : parseInt(m[6], 10));
  }
  return { lignes, sorties, etat: pont.etat() };
}

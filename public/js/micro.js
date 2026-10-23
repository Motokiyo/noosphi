// Noosféérique · le micro comme générateur (banc d'essai du dashboard)
//
// On n'écoute pas le son : on lit le souffle électronique du micro.
// 1. Les traitements du navigateur sont coupés (anti-écho, réduction de bruit,
//    volume automatique), pour lire le signal tel qu'il sort du convertisseur.
// 2. De chaque échantillon on ne garde qu'un bit : le plus fin qui soit
//    équilibré, à chaque paquet (24 bits sur un Mac, 16 sur bien des téléphones). C'est celui du souffle,
//    presque insensible à la musique qui joue dans la salle. Lire un bit plus
//    gros dans une pièce calme donnait surtout des zéros, donc des secondes vides.
// 3. Toilette de von Neumann : les bits se lisent par paires, 01 donne 0,
//    10 donne 1, 00 et 11 sont écartés. Un penchant régulier s'annule ainsi,
//    et un micro muet (que des zéros) se tait au lieu de mentir.
// 4. Puis l'inversion d'un bit sur deux, comme les œufs de Princeton.
// Les bits forment des tirages de 200 : z = (piles − 100) / √50.
// Rien n'est enregistré ni envoyé : seuls des bits restent en mémoire.
//
// La partie pure (createExtracteur) se teste dans Node : test/micro.test.mjs.

(function (racine) {
  const SQRT_50 = Math.sqrt(50);

  function createExtracteur({ garde = 8000 } = {}) {
    let enAttente = -1;          // premier bit d'une paire, -1 si aucun
    let alterne = 0;
    let utiles = [];             // bits après toilette, pas encore tirés
    let derniers = [];           // les `garde` derniers bits utiles (histogramme)
    let brutUns = 0, brutTotal = 0, silence = 0, utilesSeconde = 0, resolution = null;
    const entiers = new Int32Array(8192);

    // echantillons : nombres entre -1 et 1 (Float32Array du navigateur).
    // Un flottant 32 bits porte exactement un echantillon 24 bits : x × 2^23 est entier.
    function ajouter(echantillons) {
      // par paquets de 8192 au plus (le navigateur en envoie 128 ou 4096)
      for (let debut = 0; debut < echantillons.length; debut += entiers.length) {
        paquet(echantillons.subarray ? echantillons.subarray(debut, debut + entiers.length) : echantillons.slice(debut, debut + entiers.length));
      }
      if (derniers.length > garde * 2) derniers = derniers.slice(-garde);
    }

    function paquet(echantillons) {
      const n = echantillons.length;
      let tous = 0;
      for (let i = 0; i < n; i++) { entiers[i] = Math.round(echantillons[i] * 8388608); tous |= entiers[i]; }
      if (tous === 0) { silence += n; return; }          // silence numerique : rien a tirer
      // Le bit le plus fin ou le souffle domine : le premier, en partant du plus fin,
      // qui soit equilibre (entre 25 et 75 % de 1). Un bit plus fin mais tres penche
      // n'est qu'un residu de calcul (conversion, reechantillonnage). A defaut, le
      // plus fin qui bouge ; la toilette de von Neumann fait le reste.
      let premier = 0;
      while (((tous >> premier) & 1) === 0) premier++;
      let decalage = premier;
      for (let d = premier; d < 16; d++) {
        let uns = 0;
        for (let i = 0; i < n; i++) uns += (entiers[i] >> d) & 1;
        if (uns >= n * 0.25 && uns <= n * 0.75) { decalage = d; break; }
      }
      resolution = 24 - decalage;
      for (let i = 0; i < n; i++) {
        const b = (entiers[i] >> decalage) & 1;
        brutUns += b; brutTotal++;
        if (enAttente < 0) { enAttente = b; continue; }
        if (enAttente !== b) {
          const u = enAttente ^ (alterne++ & 1);
          utiles.push(u); derniers.push(u); utilesSeconde++;
        }
        enAttente = -1;
      }
    }

    // Jusqu'a `max` tirages de 200 bits : leurs z, dans l'ordre
    function tirer(max = 10) {
      const zs = [];
      while (zs.length < max && utiles.length >= 200) {
        let piles = 0;
        for (let i = 0; i < 200; i++) piles += utiles[i];
        utiles = utiles.slice(200);
        zs.push((piles - 100) / SQRT_50);
      }
      if (utiles.length > 4000) utiles = utiles.slice(-4000);   // on ne garde pas de retard : chaque seconde tire du neuf
      return zs;
    }

    // Les 1000 derniers octets formés des bits utiles (pour l'histogramme)
    function octets() {
      const bits = derniers.slice(-garde);
      const o = new Uint8Array(Math.floor(bits.length / 8));
      for (let k = 0; k < o.length; k++) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | bits[k * 8 + j];
        o[k] = v;
      }
      return o;
    }

    // Les chiffres de controle de la seconde ecoulee, puis remise a zero
    function controle() {
      const tout = brutTotal + silence;
      const c = { partUns: brutTotal ? brutUns / brutTotal : null, echantillons: tout, partSilence: tout ? silence / tout : null, bitsUtiles: utilesSeconde, resolution };
      brutUns = 0; brutTotal = 0; silence = 0; utilesSeconde = 0;
      return c;
    }

    return { ajouter, tirer, octets, controle };
  }

  // Ouvre le micro et envoie ses echantillons a l'extracteur. A appeler depuis un clic
  // (le navigateur l'exige). Rend une fonction qui coupe tout.
  // entree : l'identifiant d'un micro precis (sinon celui du systeme)
  async function ouvrirMicro(extracteur, entree = null) {
    const flux = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1,
        ...(entree ? { deviceId: { exact: entree } } : {}) },
    });
    const piste = flux.getAudioTracks()[0];
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(flux);
    const muet = ctx.createGain();
    muet.gain.value = 0;                      // rien ne sort par les haut-parleurs
    muet.connect(ctx.destination);
    let noeud;
    if (ctx.audioWorklet) {
      const code = `class Capte extends AudioWorkletProcessor {
        process(entrees) { const c = entrees[0] && entrees[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
      }
      registerProcessor('noos-capte', Capte);`;
      const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      noeud = new AudioWorkletNode(ctx, 'noos-capte');
      noeud.port.onmessage = e => extracteur.ajouter(e.data);
    } else {
      noeud = ctx.createScriptProcessor(4096, 1, 1);
      noeud.onaudioprocess = e => extracteur.ajouter(e.inputBuffer.getChannelData(0));
    }
    source.connect(noeud);
    noeud.connect(muet);
    if (ctx.state === 'suspended') await ctx.resume();
    const couper = () => {
      flux.getTracks().forEach(t => t.stop());
      try { source.disconnect(); noeud.disconnect(); } catch {}
      ctx.close();
    };
    // Ce qu'on ecoute vraiment : le nom du micro et sa frequence (un casque
    // Bluetooth en mode telephone descend a 16 kHz, son deja traite)
    const reglages = piste.getSettings ? piste.getSettings() : {};
    couper.entree = { id: reglages.deviceId || null, nom: piste.label || 'micro', khz: Math.round((reglages.sampleRate || ctx.sampleRate) / 1000) };
    return couper;
  }

  // Les micros de l'appareil (leurs noms ne sont lisibles qu'une fois l'autorisation donnee)
  async function listerMicros() {
    const tous = await navigator.mediaDevices.enumerateDevices();
    return tous.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map(d => ({ id: d.deviceId, nom: d.label || 'micro' }));
  }

  const api = { createExtracteur, ouvrirMicro, listerMicros };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.NoosMicro = api;
})(typeof window !== 'undefined' ? window : globalThis);

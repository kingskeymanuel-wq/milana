/**
 * Diagnostic capillaire MILANA : calcul des scores, des causes, de la routine et des
 * produits recommandés à partir des réponses du questionnaire (même logique que la
 * plateforme MILANA d'origine). Le calcul se fait toujours côté serveur.
 */
const crypto = require("crypto");
const { prixEffectif } = require("./prix");

const REMISE_ROUTINE = 0.15;       // remise sur les produits recommandés par un diagnostic
const VALIDITE_REMISE_JOURS = 30;  // durée pendant laquelle la remise peut servir (une seule commande)

/* Réponses acceptées (toute autre valeur est ignorée) */
const CHOIX = {
  hairType: ["raides", "ondules", "boucles", "frises", "crepus"],
  texture: ["fine", "moyenne", "epaisse"],
  density: ["faible", "moyenne", "forte"],
  duration: ["semaines", "mois", "an"],
  washFrequency: ["quotidien", "2x_semaine", "1x_semaine", "2_semaines", "1x_mois"],
  heatTools: ["quotidien", "occasionnel", "jamais"],
  diet: ["bonne", "moyenne", "mauvaise"],
  water: ["moins_1L", "1_2L", "plus_2L"],
  stress: ["faible", "moyen", "eleve"],
  sleep: ["oui", "non"],
};
const CHOIX_MULTIPLES = {
  scalp: ["gras", "sec", "pellicules", "demangeaisons", "irritations", "sensible", "normal"],
  problems: ["chute", "cassure", "secs", "fourches", "pousse", "alopecie", "pellicules", "sebum", "ternes", "frisottis", "decoloration", "coloration", "demangeaisons", "abimes", "aucun"],
  chemicals: ["defrisage", "coloration", "decoloration", "lissage", "aucun"],
};

/** Ne garde que les réponses connues ; signale la première question sans réponse. */
function lireReponses(corps = {}) {
  const r = {};
  for (const [k, valeurs] of Object.entries(CHOIX)) {
    if (!valeurs.includes(corps[k])) return { erreur: "Répondez à toutes les questions du diagnostic." };
    r[k] = corps[k];
  }
  for (const [k, valeurs] of Object.entries(CHOIX_MULTIPLES)) {
    const liste = [...new Set((Array.isArray(corps[k]) ? corps[k] : []).filter((x) => valeurs.includes(x)))];
    if (!liste.length) return { erreur: "Répondez à toutes les questions du diagnostic." };
    r[k] = liste;
  }
  return { reponses: r };
}

const borne = (v) => Math.max(5, Math.min(98, Math.round(v)));

/* Type de soin et cheveux visés par un produit : champs du produit, sinon déduits de son nom et de sa description */
function profilProduit(p) {
  const texte = `${p.nom} ${p.categorie || ""} ${p.description || ""}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let type = p.soin_type || null, cible = p.soin_cible || null;
  if (!type) {
    type = /demelant|apres-shampo|conditionneur/.test(texte) ? "conditioner" : /shampo/.test(texte) ? "shampoo" : /masque/.test(texte) ? "mask"
      : /serum/.test(texte) ? "serum" : /huile/.test(texte) ? "oil" : /creme|pommade|beurre|leave-in/.test(texte) ? "pomade" : /peigne|brosse|bonnet|accessoire/.test(texte) ? "accessory" : "other";
  }
  if (!cible) cible = /boucl|crepu|fris/.test(texte) ? "curly" : /pousse|chute|fortifi|densit/.test(texte) ? "thin" : /abim|repar|cass/.test(texte) ? "damaged" : /sec|hydrat|nourri/.test(texte) ? "dry" : null;
  return { type, cible };
}

/**
 * Analyse les réponses. `produits` : lignes de la table packs en vente (actifs, non supprimés).
 * Retourne les scores, le bilan et la liste des produits recommandés (identifiants + conseils d'utilisation).
 */
function analyser(rep, produits) {
  const a = (liste, v) => liste.includes(v);
  const { problems, scalp, chemicals } = rep;
  let sante = 82, hydratation = 75, nutrition = 75, croissance = 78, force = 80;

  if (a(problems, "secs") || a(scalp, "sec")) { hydratation -= 25; sante -= 8; }
  if (a(problems, "cassure") || a(problems, "abimes")) { force -= 25; sante -= 10; }
  if (a(problems, "fourches")) { force -= 12; sante -= 5; }
  if (a(problems, "chute") || a(problems, "alopecie")) { croissance -= 30; sante -= 12; }
  if (a(problems, "pousse")) croissance -= 15;
  if (a(problems, "pellicules") || a(scalp, "pellicules")) { sante -= 10; hydratation -= 5; }
  if (a(problems, "sebum") || a(scalp, "gras")) { nutrition -= 8; sante -= 5; }
  if (a(problems, "ternes")) nutrition -= 10;
  if (a(problems, "frisottis")) hydratation -= 8;
  if (a(problems, "decoloration") || a(chemicals, "decoloration")) { force -= 15; hydratation -= 10; }
  if (a(problems, "coloration") || a(chemicals, "coloration")) { force -= 8; hydratation -= 5; }
  if (a(scalp, "demangeaisons") || a(scalp, "irritations") || a(scalp, "sensible")) sante -= 8;
  if (a(chemicals, "defrisage") || a(chemicals, "lissage")) { force -= 12; hydratation -= 8; }

  if (rep.heatTools === "quotidien") { force -= 15; hydratation -= 10; } else if (rep.heatTools === "occasionnel") force -= 5;
  if (rep.diet === "mauvaise") { nutrition -= 15; croissance -= 8; } else if (rep.diet === "moyenne") nutrition -= 6;
  if (rep.water === "moins_1L") hydratation -= 12; else if (rep.water === "1_2L") hydratation -= 4;
  if (rep.stress === "eleve") { croissance -= 10; sante -= 6; } else if (rep.stress === "moyen") croissance -= 4;
  if (rep.sleep === "non") { croissance -= 6; sante -= 4; }
  if (rep.duration === "an") sante -= 5;
  if (rep.washFrequency === "quotidien") { hydratation -= 6; nutrition -= 4; }

  const scores = { sante: borne(sante), hydratation: borne(hydratation), nutrition: borne(nutrition), croissance: borne(croissance), force: borne(force) };
  const global = Math.round((scores.sante + scores.hydratation + scores.nutrition + scores.croissance + scores.force) / 5);

  const nbProblemes = problems.filter((p) => p !== "aucun").length;
  const gravite = nbProblemes >= 6 || global < 45 ? "Élevée" : nbProblemes >= 3 || global < 65 ? "Modérée" : "Légère";

  const porosite = a(chemicals, "decoloration") || a(chemicals, "defrisage") || a(problems, "abimes") || a(problems, "decoloration") ? "Élevée (cheveux poreux)"
    : a(scalp, "gras") && !a(problems, "secs") ? "Faible (cheveux peu poreux)" : "Moyenne";

  const objectifs = [];
  if (a(problems, "chute") || a(problems, "alopecie") || a(problems, "pousse")) objectifs.push("Stimuler la croissance et limiter la chute");
  if (a(problems, "secs") || a(scalp, "sec") || a(problems, "frisottis")) objectifs.push("Hydrater intensément la fibre capillaire");
  if (a(problems, "cassure") || a(problems, "abimes") || a(problems, "fourches")) objectifs.push("Réparer et renforcer les cheveux abîmés");
  if (a(problems, "pellicules") || a(scalp, "pellicules") || a(scalp, "irritations")) objectifs.push("Rééquilibrer et apaiser le cuir chevelu");
  if (a(problems, "sebum") || a(scalp, "gras")) objectifs.push("Purifier et réguler l'excès de sébum");
  if (a(problems, "ternes")) objectifs.push("Raviver l'éclat et la brillance");

  const causes = [];
  if (rep.heatTools === "quotidien") causes.push("Usage quotidien d'appareils chauffants fragilisant la fibre capillaire.");
  if (a(chemicals, "decoloration") || a(chemicals, "defrisage") || a(chemicals, "lissage")) causes.push("Traitements chimiques répétés altérant la kératine.");
  if (rep.diet === "mauvaise" || rep.diet === "moyenne") causes.push("Alimentation insuffisamment riche en protéines et vitamines essentielles à la pousse.");
  if (rep.water === "moins_1L") causes.push("Hydratation corporelle insuffisante impactant l'hydratation naturelle du cheveu.");
  if (rep.stress === "eleve") causes.push("Niveau de stress élevé pouvant favoriser la chute et ralentir la pousse.");
  if (rep.sleep === "non") causes.push("Sommeil insuffisant limitant la régénération cellulaire nocturne.");
  if (rep.washFrequency === "quotidien") causes.push("Lavages trop fréquents pouvant déséquilibrer le film hydrolipidique du cuir chevelu.");
  if (!causes.length) causes.push("Aucune cause majeure identifiée : poursuivez vos bonnes habitudes actuelles.");

  // Produits recommandés : chaque produit en vente reçoit une note selon les besoins détectés
  const boucles = ["crepus", "frises", "boucles"].includes(rep.hairType);
  const sec = a(problems, "secs") || a(scalp, "sec");
  const reparation = a(problems, "abimes") || a(problems, "cassure") || a(problems, "fourches");
  const pousse = a(problems, "chute") || a(problems, "pousse") || a(problems, "alopecie");
  const eclat = a(problems, "ternes");
  const fiches = produits.map((p) => ({ p, ...profilProduit(p) }));
  const notes = fiches.map((f) => {
    let n = 0;
    if (boucles && f.cible === "curly") n += 3;
    if (sec) { if (f.cible === "dry") n += 3; if (f.type === "oil" || f.type === "pomade") n += 2; }
    if (reparation) { if (f.cible === "damaged") n += 3; if (f.type === "mask" || f.type === "conditioner") n += 2; }
    if (pousse) { if (f.cible === "thin") n += 3; if (f.type === "serum") n += 2; }
    if (eclat && f.type === "oil") n += 1;
    if (f.type === "shampoo") n += 1;
    if (f.type === "accessory") n += 0.5;
    return { ...f, n };
  }).sort((x, y) => y.n - x.n);
  let choisis = notes.filter((f) => f.n > 0).slice(0, 4);
  if (choisis.length < 2) choisis = fiches.slice(0, 3).map((f) => ({ ...f, n: 0 }));
  if (!choisis.some((f) => f.type === "shampoo")) { const sh = fiches.find((f) => f.type === "shampoo"); if (sh) choisis.unshift({ ...sh, n: 0 }); }
  choisis = choisis.slice(0, 4);

  const conseil = (type) => ({
    shampoo: [rep.washFrequency === "quotidien" ? "3 à 4 fois par semaine" : "2 à 3 fois par semaine", "Masser le cuir chevelu 2 à 3 minutes puis rincer abondamment."],
    mask: ["1 à 2 fois par semaine", "Appliquer sur cheveux essorés, laisser poser 10 à 15 minutes puis rincer."],
    conditioner: ["Après chaque shampooing", "Appliquer sur les longueurs essorées, démêler aux doigts, laisser agir 2 à 3 minutes puis rincer."],
    serum: ["Chaque soir", "Appliquer quelques gouttes sur le cuir chevelu sec, masser, ne pas rincer."],
    oil: ["2 à 3 fois par semaine", "Appliquer sur longueurs et pointes avant coiffage."],
    pomade: ["Quotidiennement ou à chaque coiffage", "Répartir une noisette de crème sur cheveux humides ou secs, des longueurs aux pointes."],
  }[type] || ["Quotidiennement", "Utiliser matin et soir, en douceur."]);
  const recommandes = choisis.map((f) => ({ pack_id: f.p.id, type: f.type, usage: conseil(f.type)[0], detail: conseil(f.type)[1] }));

  const avec = (...types) => choisis.some((f) => types.includes(f.type));
  const routine = [
    ["Jour 1", "Shampooing doux" + (avec("mask", "conditioner") ? " + démêlant après-shampooing" : "") + "."],
    ["Jour 3", (avec("oil") ? "Huile de soin" : "Sérum") + " en application légère."],
    ["Jour 5", (avec("serum") ? "Sérum ciblé sur cuir chevelu" : "Shampooing doux") + "."],
    ["Routine du matin", (avec("pomade") ? "Crème capillaire sur les longueurs" : "Brumisation hydratante") + " + démêlage en douceur."],
    ["Routine du soir", "Application du sérum sur cuir chevelu sec, massage 2 minutes."],
    ["Routine hebdomadaire", (avec("pomade") ? "Bain de crème capillaire" : "Soin nourrissant") + " sur cheveux humides, pose 10 à 15 minutes."],
    ["Routine mensuelle", "Bilan des longueurs, coupe des pointes fourchues si nécessaire."],
  ].map(([label, texte]) => ({ label, texte }));

  return {
    scores, global, gravite, porosite,
    objectif_principal: objectifs[0] || "Entretenir la santé générale du cheveu",
    objectif_secondaire: objectifs[1] || "Préserver la brillance et la souplesse",
    causes,
    habitudes: [
      "Espacer les lavages et privilégier un shampooing doux adapté à votre cuir chevelu.",
      "Appliquer un soin protecteur avant toute source de chaleur.",
      "Boire au moins 1,5 à 2 litres d'eau par jour.",
      "Masser le cuir chevelu 2 à 3 minutes par jour pour stimuler la microcirculation.",
    ],
    erreurs: [
      "Frotter énergiquement les cheveux mouillés avec une serviette (préférer une microfibre).",
      "Enchaîner colorations et décolorations sans soin réparateur entre les deux.",
      "Utiliser un appareil chauffant sans protection thermique.",
      "Attacher les cheveux trop serrés quotidiennement.",
    ],
    routine,
    delai: gravite === "Élevée" ? "8 à 12 semaines, avec un suivi régulier recommandé" : gravite === "Modérée" ? "6 à 8 semaines" : "4 à 6 semaines",
    recommandes,
  };
}

/** Référence publique d'un diagnostic : 8 caractères aléatoires, impossible à deviner. */
function nouvelleReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "DX-" + Array.from(crypto.randomBytes(8), (o) => alphabet[o % alphabet.length]).join("");
}

/** Prix d'un produit de la routine : prix en vigueur moins la remise, arrondi à 5 FCFA. */
const prixRoutine = (p) => Math.round((prixEffectif(p) * (1 - REMISE_ROUTINE)) / 5) * 5;

module.exports = { REMISE_ROUTINE, VALIDITE_REMISE_JOURS, CHOIX, CHOIX_MULTIPLES, lireReponses, analyser, nouvelleReference, prixRoutine, profilProduit };

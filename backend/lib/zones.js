/**
 * Zones de livraison : chaque livreur (ou service de livraison) indique les communes ou quartiers qu'il dessert
 * (« Cocody et Bingerville », « Abidjan sud et nord »…). Une commande à livrer est attribuée au livreur de sa zone.
 * Correspondance : mot écrit dans la zone (poids 2), ou commune comprise dans un grand secteur d'Abidjan (poids 1).
 */
const SECTEURS = {
  "abidjan sud": ["treichville", "marcory", "koumassi", "port bouet", "bietry", "zone 4", "vridi", "anoumabo", "gonzagueville"],
  "abidjan nord": ["abobo", "adjame", "attecoube", "cocody", "plateau", "yopougon", "angre", "riviera", "deux plateaux", "2 plateaux", "williamsville", "anyama"],
  "cocody": ["riviera", "angre", "deux plateaux", "2 plateaux", "palmeraie", "faya", "bonoumin", "blockhauss", "danga", "ambassades"],
  "yopougon": ["yop", "niangon", "toits rouges", "sicogi", "selmer"],
  "marcory": ["zone 4", "bietry", "anoumabo", "remblais"],
  "port bouet": ["vridi", "gonzagueville", "aeroport"],
  "abobo": ["pk 18", "n dotre", "avocatier"],
  "plateau": ["centre ville"],
};
SECTEURS["sud"] = SECTEURS["abidjan sud"];
SECTEURS["nord"] = SECTEURS["abidjan nord"];
SECTEURS["abidjan"] = [...new Set([...SECTEURS["abidjan sud"], ...SECTEURS["abidjan nord"], "bingerville", "songon"])];
SECTEURS["grand abidjan"] = SECTEURS["abidjan"];

const simple = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** Mots d'une zone : { mot: poids }. */
function motsZone(zone) {
  const mots = {};
  // Découper d'abord (virgules, « et », « ou »…), simplifier ensuite chaque commune
  const parties = String(zone || "").toLowerCase().split(/[,;/+&\n]|\bet\b|\bou\b/).map((x) => simple(x)).filter((x) => x.length >= 3);
  for (const p of parties) {
    mots[p] = Math.max(mots[p] || 0, 2);
    for (const m of SECTEURS[p] || []) mots[m] = Math.max(mots[m] || 0, 1);
  }
  return mots;
}

/** Livreurs actifs dont la zone couvre l'adresse, du plus précis au moins précis. */
function livreursPour(livreurs, adresse) {
  const texte = " " + simple(adresse) + " ";
  return (livreurs || []).filter((l) => l.actif !== false && l.actif !== 0 && l.zone).map((l) => {
    let score = 0;
    for (const [m, poids] of Object.entries(motsZone(l.zone))) if (texte.includes(" " + m + " ")) score = Math.max(score, poids * 100 + m.length);
    return { livreur: l, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}

/** Le livreur à attribuer : seulement s'il est seul en tête (sinon on laisse choisir). */
function meilleurLivreur(livreurs, adresse) {
  const l = livreursPour(livreurs, adresse);
  if (!l.length || (l[1] && l[1].score === l[0].score)) return null;
  return l[0].livreur;
}

/** Communes reconnues d'une zone, pour l'affichage. */
const communesReconnues = (zone) => Object.keys(motsZone(zone));


/** Commande à livrer sans livreur : on lui attribue le livreur de sa zone (s'il est seul en tête). */
function attribuer(commandeId) {
  const db = require("../db");
  const c = db.prepare("SELECT c.id, c.livraison, c.livreur_id, c.adresse_livraison, cl.ville FROM commandes c LEFT JOIN ventes v ON v.commande_id = c.id LEFT JOIN clients cl ON cl.id = v.client_id WHERE c.id = ? LIMIT 1").get(commandeId);
  if (!c || !c.livraison || c.livreur_id) return null;
  const l = meilleurLivreur(db.prepare("SELECT id, nom, zone, actif FROM livreurs WHERE supprime = 0 AND actif = 1").all(), `${c.adresse_livraison || ""} ${c.ville || ""}`);
  if (!l) return null;
  db.prepare("UPDATE commandes SET livreur_id = ? WHERE id = ?").run(l.id, c.id);
  require("./outils").ajouterEvenement(c.id, { type: "note", texte: `Livreur attribué selon la zone : ${l.nom} (${l.zone})` });
  return l;
}

module.exports = { motsZone, livreursPour, meilleurLivreur, communesReconnues, simple, attribuer };

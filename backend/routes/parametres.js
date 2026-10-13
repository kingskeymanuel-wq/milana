/**
 * Informations de la boutique (affichées sur les tickets de caisse).
 * GET /api/parametres — PUT /api/parametres (administrateurs)
 */
const express = require("express");
const db = require("../db");
const { adminOnly } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const router = express.Router();

/*
 * nom, adresse, telephone, message (bas du ticket), slogan, whatsapp : informations publiques
 * momo_* : numéros marchands affichés aux clients pour les paiements par transfert
 * lien_* : liens de paiement des opérateurs (ex. lien marchand Wave), ouverts par le client pour payer
 * frais_livraison, livraison_gratuite_des, zone_livraison : livraison de la boutique en ligne
 * boutique_ouverte : "1" pour accepter les commandes en ligne
 */
const CLES = [
  "nom", "adresse", "telephone", "message", "slogan", "whatsapp",
  "momo_orange", "momo_mtn", "momo_moov", "momo_wave", "momo_titulaire",
  "lien_orange", "lien_mtn", "lien_moov", "lien_wave",
  "frais_livraison", "livraison_gratuite_des", "zone_livraison", "boutique_ouverte",
];
const DEFAUTS = {
  nom: "Ma Boutique", adresse: "", telephone: "", message: "Merci pour votre achat et à bientôt !",
  slogan: "", whatsapp: "",
  momo_orange: "", momo_mtn: "", momo_moov: "", momo_wave: "", momo_titulaire: "",
  lien_orange: "", lien_mtn: "", lien_moov: "", lien_wave: "",
  frais_livraison: "0", livraison_gratuite_des: "0", zone_livraison: "", boutique_ouverte: "1",
};

function lireBoutique() {
  const b = { ...DEFAUTS };
  let trace = null;
  for (const r of db.prepare("SELECT cle, valeur FROM parametres").all()) {
    if (CLES.includes(r.cle)) b[r.cle] = r.valeur ?? "";
    else if (r.cle === "paiement_modifie") trace = r.valeur;
  }
  // Dernière modification des numéros / liens de paiement (lecture seule) : { le, par }
  try { b.paiement_modifie = trace ? JSON.parse(trace) : null; } catch { b.paiement_modifie = null; }
  return b;
}

function ecrireBoutique(valeurs) {
  const maj = db.prepare("INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur");
  db.transaction(() => {
    for (const k of CLES) if (valeurs[k] !== undefined) maj.run(k, String(valeurs[k] ?? "").slice(0, 300));
  })();
}

router.get("/", (req, res) => res.json(lireBoutique()));

router.put("/", adminOnly, (req, res) => {
  if (req.body.nom !== undefined && !String(req.body.nom).trim()) return res.status(400).json({ erreur: "Le nom de la boutique est requis" });
  // Liens de paiement : adresses https uniquement (elles sont ouvertes par les clients)
  for (const k of CLES.filter((c) => c.startsWith("lien_"))) {
    if (req.body[k] === undefined) continue;
    const v = String(req.body[k] || "").trim();
    let ok = !v;
    try { ok = ok || new URL(v).protocol === "https:"; } catch { /* adresse invalide */ }
    if (!ok) return res.status(400).json({ erreur: "Lien de paiement invalide : collez l'adresse complète, qui commence par https://" });
    req.body[k] = v;
  }
  // Les numéros et liens de paiement décident où va l'argent des clients : pour les modifier,
  // l'administrateur doit redonner son mot de passe, et la modification est tracée.
  const actuel = lireBoutique();
  const sensibles = CLES.filter((c) => (c.startsWith("momo_") || c.startsWith("lien_")) && req.body[c] !== undefined && String(req.body[c] ?? "").trim() !== String(actuel[c] ?? "").trim());
  if (sensibles.length) {
    const u = db.prepare("SELECT mot_de_passe FROM utilisateurs WHERE id = ?").get(req.user.id);
    if (!req.body.mot_de_passe_actuel || !u || !bcrypt.compareSync(String(req.body.mot_de_passe_actuel), u.mot_de_passe)) {
      return res.status(403).json({ erreur: "Confirmez avec votre mot de passe pour modifier les numéros ou liens de paiement", confirmation_requise: true });
    }
  }
  ecrireBoutique(req.body || {});
  if (sensibles.length) {
    db.prepare("INSERT INTO parametres (cle, valeur) VALUES ('paiement_modifie', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
      .run(JSON.stringify({ le: new Date().toISOString(), par: req.user.nom, champs: sensibles }));
    console.log(`Sécurité : coordonnées de paiement modifiées par ${req.user.nom} (${sensibles.join(", ")})`);
  }
  res.json(lireBoutique());
});

module.exports = router;
module.exports.lireBoutique = lireBoutique;
module.exports.ecrireBoutique = ecrireBoutique;

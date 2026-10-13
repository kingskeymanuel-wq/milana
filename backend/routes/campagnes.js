/**
 * Marketing (administrateurs) :
 *   GET  /api/campagnes                     historique, statistiques, réglages hebdo, fournisseurs
 *   POST /api/campagnes/apercu              nombre de destinataires + exemple de message
 *   POST /api/campagnes                     lancer une campagne { titre, type, message, canaux, audience }
 *   GET  /api/campagnes/:id                 détail et envois
 *   PUT  /api/campagnes/hebdo               message hebdomadaire automatique { actif, jour, heure, canaux, message }
 *   POST /api/campagnes/hebdo/maintenant    envoyer le message de la semaine tout de suite
 *   POST /api/campagnes/promotion           lancer une promotion { pack_ids, mode, valeur, fin?, alerter, canaux, audience }
 *   DELETE /api/campagnes/promotion/:packId arrêter une promotion
 */
const express = require("express");
const db = require("../db");
const m = require("../lib/marketing");
const router = express.Router();

const canauxValides = (c) => (Array.isArray(c) ? c : String(c || "").split(",")).filter((x) => ["sms", "email"].includes(x));

router.get("/", (req, res) => {
  const clients = db.prepare("SELECT telephone, email, consentement_marketing FROM clients WHERE supprime = 0").all();
  const abonnes = clients.filter((c) => c.consentement_marketing);
  res.json({
    campagnes: db.prepare("SELECT * FROM campagnes ORDER BY cree_le DESC LIMIT 50").all(),
    stats: {
      clients: clients.length,
      abonnes: abonnes.length,
      joignables_sms: abonnes.filter((c) => String(c.telephone || "").replace(/\D/g, "").length >= 8).length,
      joignables_email: abonnes.filter((c) => /@/.test(c.email || "")).length,
    },
    audiences: m.AUDIENCES,
    modeles: m.MODELES,
    hebdo: m.lireHebdo(),
    fournisseurs: { sms: m.smsConfigure(), email: m.emailConfigure() },
  });
});

router.post("/apercu", (req, res) => {
  res.json(m.apercu({ audience: req.body.audience, canaux: canauxValides(req.body.canaux), type: req.body.type, message: req.body.message }));
});

router.post("/", (req, res) => {
  const canaux = canauxValides(req.body.canaux);
  if (!canaux.length) return res.status(400).json({ erreur: "Choisissez au moins un canal (SMS ou e-mail)" });
  if (!m.AUDIENCES[req.body.audience || "tous"]) return res.status(400).json({ erreur: "Audience inconnue" });
  try {
    const id = m.lancerCampagne({ titre: req.body.titre, type: req.body.type, message: req.body.message, canaux, audience: req.body.audience || "tous", auteurId: req.user?.id });
    res.status(201).json(db.prepare("SELECT * FROM campagnes WHERE id = ?").get(id));
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

router.put("/hebdo", (req, res) => {
  const v = {};
  if (req.body.actif !== undefined) v.actif = req.body.actif ? "1" : "0";
  if (req.body.jour !== undefined) { const j = Number(req.body.jour); if (!(j >= 0 && j <= 6)) return res.status(400).json({ erreur: "Jour invalide" }); v.jour = j; }
  if (req.body.heure !== undefined) { const h = Number(req.body.heure); if (!(h >= 0 && h <= 23)) return res.status(400).json({ erreur: "Heure invalide" }); v.heure = h; }
  if (req.body.canaux !== undefined) { const c = canauxValides(req.body.canaux); if (!c.length) return res.status(400).json({ erreur: "Choisissez au moins un canal" }); v.canaux = c.join(","); }
  if (req.body.message !== undefined) { if (!String(req.body.message).trim()) return res.status(400).json({ erreur: "Le message est vide" }); v.message = String(req.body.message).slice(0, 600); }
  res.json(m.ecrireHebdo(v));
});

router.post("/hebdo/maintenant", (req, res) => {
  try {
    const id = m.envoyerHebdo({ force: true });
    res.status(201).json(db.prepare("SELECT * FROM campagnes WHERE id = ?").get(id));
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

// Promotion : applique le prix réduit sur les produits choisis, puis alerte les clients abonnés
router.post("/promotion", (req, res) => {
  const ids = Array.isArray(req.body.pack_ids) ? req.body.pack_ids.map(String) : [];
  const valeur = Number(req.body.valeur);
  const mode = req.body.mode === "prix" ? "prix" : "pourcentage";
  if (!ids.length) return res.status(400).json({ erreur: "Choisissez au moins un produit" });
  if (mode === "pourcentage" && !(valeur > 0 && valeur < 100)) return res.status(400).json({ erreur: "Réduction entre 1 et 99 %" });
  const fin = req.body.fin && !Number.isNaN(new Date(req.body.fin).getTime()) ? new Date(req.body.fin).toISOString() : null;
  if (fin && new Date(fin) <= new Date()) return res.status(400).json({ erreur: "La date de fin doit être dans le futur" });
  const packs = ids.map((id) => db.prepare("SELECT * FROM packs WHERE id = ? AND supprime = 0").get(id)).filter(Boolean);
  const erreurs = [];
  db.transaction(() => {
    for (const p of packs) {
      const promo = mode === "prix" ? Math.round(valeur) : Math.round((p.prix * (100 - valeur)) / 100 / 5) * 5; // arrondi aux 5 FCFA
      if (!(promo > 0 && promo < p.prix)) { erreurs.push(`${p.nom} : prix promotionnel invalide`); continue; }
      db.prepare("UPDATE packs SET prix_promo = ?, promo_fin = ? WHERE id = ?").run(promo, fin, p.id);
    }
  })();
  if (erreurs.length === packs.length) return res.status(400).json({ erreur: erreurs.join(" ; ") });
  let campagne = null;
  if (req.body.alerter) {
    const canaux = canauxValides(req.body.canaux);
    if (canaux.length) {
      const id = m.lancerCampagne({ titre: req.body.titre || "Promotion", type: "promotion", canaux, audience: req.body.audience || "tous", auteurId: req.user?.id });
      campagne = db.prepare("SELECT * FROM campagnes WHERE id = ?").get(id);
    }
  }
  res.status(201).json({ packs: packs.map((p) => db.prepare("SELECT * FROM packs WHERE id = ?").get(p.id)), campagne, erreurs });
});

router.delete("/promotion/:packId", (req, res) => {
  const info = db.prepare("UPDATE packs SET prix_promo = NULL, promo_fin = NULL WHERE id = ?").run(req.params.packId);
  if (!info.changes) return res.status(404).json({ erreur: "Produit introuvable" });
  res.status(204).send();
});

router.get("/:id", (req, res) => {
  const c = db.prepare("SELECT * FROM campagnes WHERE id = ?").get(req.params.id);
  if (!c) return res.status(404).json({ erreur: "Campagne introuvable" });
  const envois = db.prepare(
    `SELECT e.*, cl.nom AS client_nom FROM campagne_envois e LEFT JOIN clients cl ON cl.id = e.client_id WHERE e.campagne_id = ? ORDER BY e.cree_le`
  ).all(c.id);
  res.json({ ...c, envois });
});

module.exports = router;

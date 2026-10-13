/**
 * Livreurs de la boutique (suivi des livraisons).
 *   GET    /api/livreurs            tous les utilisateurs connectés
 *   POST   /api/livreurs            (admin) { id?, nom, telephone, zone? }
 *   PUT    /api/livreurs/:id        (admin) { nom?, telephone?, zone?, actif? }
 *   DELETE /api/livreurs/:id        (admin) retire le livreur ; ses livraisons passées restent consultables
 */
const express = require("express");
const db = require("../db");
const { adminOnly } = require("../middleware/auth");
const { idOuNouveau, versIso } = require("../lib/outils");
const router = express.Router();

const lire = (id) => db.prepare("SELECT * FROM livreurs WHERE id = ? AND supprime = 0").get(id);
const texte = (v, max) => String(v ?? "").trim().slice(0, max);
const serialiser = (l) => l && { ...l, cree_le: versIso(l.cree_le) };

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM livreurs WHERE supprime = 0 ORDER BY actif DESC, nom").all().map(serialiser));
});

router.post("/", adminOnly, (req, res) => {
  const nom = texte(req.body.nom, 80), telephone = texte(req.body.telephone, 30);
  if (!nom || telephone.replace(/\D/g, "").length < 8) return res.status(400).json({ erreur: "Nom et numéro de téléphone du livreur requis" });
  const id = idOuNouveau(req.body.id);
  if (db.prepare("SELECT id FROM livreurs WHERE id = ?").get(id)) return res.status(409).json({ erreur: "Identifiant déjà utilisé" });
  db.prepare("INSERT INTO livreurs (id, nom, telephone, zone, actif, supprime, cree_le) VALUES (?, ?, ?, ?, 1, 0, ?)")
    .run(id, nom, telephone, texte(req.body.zone, 120) || null, new Date().toISOString());
  res.status(201).json(serialiser(lire(id)));
});

router.put("/:id", adminOnly, (req, res) => {
  const l = lire(req.params.id);
  if (!l) return res.status(404).json({ erreur: "Livreur introuvable" });
  const nom = req.body.nom !== undefined ? texte(req.body.nom, 80) : l.nom;
  const telephone = req.body.telephone !== undefined ? texte(req.body.telephone, 30) : l.telephone;
  if (!nom || telephone.replace(/\D/g, "").length < 8) return res.status(400).json({ erreur: "Nom et numéro de téléphone du livreur requis" });
  db.prepare("UPDATE livreurs SET nom = ?, telephone = ?, zone = ?, actif = ? WHERE id = ?").run(
    nom, telephone, req.body.zone !== undefined ? texte(req.body.zone, 120) || null : l.zone,
    req.body.actif !== undefined ? (req.body.actif ? 1 : 0) : l.actif, l.id
  );
  res.json(serialiser(lire(l.id)));
});

router.delete("/:id", adminOnly, (req, res) => {
  const l = lire(req.params.id);
  if (!l) return res.status(404).json({ erreur: "Livreur introuvable" });
  db.transaction(() => {
    db.prepare("UPDATE livreurs SET supprime = 1, actif = 0 WHERE id = ?").run(l.id);
    // Les colis pas encore livrés redeviennent « sans livreur »
    db.prepare("UPDATE commandes SET livreur_id = NULL WHERE livreur_id = ? AND statut NOT IN ('livree', 'annulee')").run(l.id);
  })();
  res.status(204).send();
});

module.exports = router;

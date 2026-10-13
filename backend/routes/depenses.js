/**
 * Dépenses de la boutique (transport, livraison, emballage…).
 *   GET    /api/depenses        l'administrateur voit tout, un vendeur seulement les siennes
 *   POST   /api/depenses        { libelle, categorie, montant, date?, note? }
 *   DELETE /api/depenses/:id    l'administrateur, ou le vendeur pour sa propre dépense du jour
 */
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../db");
const router = express.Router();

const CATEGORIES = ["Transport", "Livraison", "Emballage", "Communication", "Repas", "Autre"];
const lister = (user) => db.prepare("SELECT d.*, u.nom AS auteur FROM depenses d LEFT JOIN utilisateurs u ON u.id = d.auteur_id ORDER BY d.date_depense DESC, d.cree_le DESC").all()
  .filter((d) => user.role === "admin" || d.auteur_id === user.id);

router.get("/", (req, res) => res.json(lister(req.user)));

router.post("/", (req, res) => {
  const libelle = String(req.body.libelle || "").trim().slice(0, 120);
  const montant = Math.round(Number(req.body.montant) || 0);
  if (libelle.length < 2) return res.status(400).json({ erreur: "Indiquez l'objet de la dépense" });
  if (!(montant > 0)) return res.status(400).json({ erreur: "Indiquez le montant de la dépense" });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date || "")) ? req.body.date : new Date().toISOString().slice(0, 10);
  const id = nanoid();
  db.prepare("INSERT INTO depenses (id, libelle, categorie, montant, date_depense, note, auteur_id, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, libelle, CATEGORIES.includes(req.body.categorie) ? req.body.categorie : "Autre", montant, date, String(req.body.note || "").trim().slice(0, 300) || null, req.user.id, new Date().toISOString());
  res.status(201).json(lister(req.user).find((d) => d.id === id));
});

router.delete("/:id", (req, res) => {
  const d = db.prepare("SELECT * FROM depenses WHERE id = ?").get(req.params.id);
  if (!d || (req.user.role !== "admin" && d.auteur_id !== req.user.id)) return res.status(404).json({ erreur: "Dépense introuvable" });
  if (req.user.role !== "admin" && d.cree_le.slice(0, 10) !== new Date().toISOString().slice(0, 10)) return res.status(403).json({ erreur: "Seul l'administrateur peut supprimer une dépense des jours précédents" });
  db.prepare("DELETE FROM depenses WHERE id = ?").run(d.id);
  res.status(204).send();
});

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;

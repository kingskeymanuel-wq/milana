const express = require("express");
const db = require("../db");
const { idOuNouveau } = require("../lib/outils");
const router = express.Router();

const CATEGORIES = ["Stock", "Marketing", "Logistique", "Équipement", "Autre"];
const lire = (id) => db.prepare("SELECT * FROM investissements WHERE id = ?").get(id);
const dateValide = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10));

// GET /api/investissements?categorie=
router.get("/", (req, res) => {
  const { categorie } = req.query;
  let sql = "SELECT * FROM investissements WHERE 1=1";
  const params = [];
  if (categorie) { sql += " AND categorie = ?"; params.push(categorie); }
  sql += " ORDER BY date_invest DESC";
  res.json(db.prepare(sql).all(...params));
});

// POST /api/investissements — { id?, libelle, categorie, montant, date_invest? (AAAA-MM-JJ) }
router.post("/", (req, res) => {
  const { libelle, categorie, montant, date_invest } = req.body;
  if (!libelle || !(Number(montant) > 0)) return res.status(400).json({ erreur: "libelle et montant (> 0) sont requis" });
  const id = idOuNouveau(req.body.id);
  if (lire(id)) return res.status(409).json({ erreur: "Identifiant déjà utilisé" });
  db.prepare("INSERT INTO investissements (id, libelle, categorie, montant, date_invest) VALUES (?, ?, ?, ?, ?)").run(
    id, libelle, CATEGORIES.includes(categorie) ? categorie : "Autre", Number(montant), dateValide(date_invest)
  );
  res.status(201).json(lire(id));
});

// PUT /api/investissements/:id — mise à jour partielle
router.put("/:id", (req, res) => {
  const i = lire(req.params.id);
  if (!i) return res.status(404).json({ erreur: "Investissement introuvable" });
  const c = { ...i };
  for (const k of ["libelle", "categorie", "montant", "date_invest"]) if (req.body[k] !== undefined) c[k] = req.body[k];
  if (!c.libelle || !(Number(c.montant) > 0)) return res.status(400).json({ erreur: "libelle et montant (> 0) sont requis" });
  db.prepare("UPDATE investissements SET libelle=?, categorie=?, montant=?, date_invest=? WHERE id=?").run(
    c.libelle, CATEGORIES.includes(c.categorie) ? c.categorie : "Autre", Number(c.montant), dateValide(String(c.date_invest).slice(0, 10)), i.id
  );
  res.json(lire(i.id));
});

// DELETE /api/investissements/:id
router.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM investissements WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ erreur: "Investissement introuvable" });
  res.status(204).send();
});

module.exports = router;

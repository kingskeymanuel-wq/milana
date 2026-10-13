/**
 * Gestion des stocks (administrateurs) :
 *   GET  /api/stocks/mouvements?pack_id=&limite=   historique des mouvements
 *   POST /api/stocks/reception                      entrée de marchandise (+ dépense facultative)
 *   POST /api/stocks/inventaire                     comptage physique → correction des écarts
 *   POST /api/stocks/sortie                         casse, perte, usage interne…
 */
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../db");
const { mouvement, MOTIFS } = require("../lib/stock");
const router = express.Router();

const entier = (v) => Math.round(Number(v));

router.get("/mouvements", (req, res) => {
  const limite = Math.min(500, Math.max(1, entier(req.query.limite) || 200));
  const params = [];
  let sql = `SELECT m.*, p.nom AS pack_nom, u.nom AS auteur_nom FROM mouvements_stock m
             LEFT JOIN packs p ON p.id = m.pack_id LEFT JOIN utilisateurs u ON u.id = m.auteur_id`;
  if (req.query.pack_id) { sql += " WHERE m.pack_id = ?"; params.push(String(req.query.pack_id)); }
  sql += " ORDER BY m.cree_le DESC LIMIT ?";
  params.push(limite);
  res.json(db.prepare(sql).all(...params).map((m) => ({ ...m, motif_libelle: MOTIFS[m.motif] || m.motif })));
});

// { pack_id, quantite, cout_unitaire?, fournisseur?, creer_depense? }
router.post("/reception", (req, res) => {
  const p = db.prepare("SELECT * FROM packs WHERE id = ? AND supprime = 0").get(String(req.body.pack_id || ""));
  if (!p) return res.status(404).json({ erreur: "Produit introuvable" });
  const q = entier(req.body.quantite);
  if (!(q > 0) || q > 100000) return res.status(400).json({ erreur: "Quantité reçue invalide" });
  const cout = req.body.cout_unitaire == null || req.body.cout_unitaire === "" ? null : Number(req.body.cout_unitaire);
  if (cout != null && !(cout >= 0)) return res.status(400).json({ erreur: "Coût unitaire invalide" });
  const fournisseur = String(req.body.fournisseur || "").trim().slice(0, 120) || null;
  let depense = null;
  db.transaction(() => {
    mouvement(p.id, q, "reception", { reference: fournisseur, auteurId: req.user?.id, note: cout != null ? `${q} × ${cout} FCFA` : null });
    if (cout != null) db.prepare("UPDATE packs SET cout = ? WHERE id = ?").run(cout, p.id);
    // La réception peut être enregistrée directement comme dépense (catégorie Stock)
    if (req.body.creer_depense && cout > 0) {
      depense = { id: nanoid(), libelle: `Achat de stock — ${p.nom} ×${q}${fournisseur ? " (" + fournisseur + ")" : ""}`, categorie: "Stock", montant: q * cout, date_invest: new Date().toISOString().slice(0, 10) };
      db.prepare("INSERT INTO investissements (id, libelle, categorie, montant, date_invest) VALUES (?, ?, ?, ?, ?)")
        .run(depense.id, depense.libelle, depense.categorie, depense.montant, depense.date_invest);
    }
  })();
  res.status(201).json({ pack: db.prepare("SELECT * FROM packs WHERE id = ?").get(p.id), depense });
});

// { lignes: [{ pack_id, stock_reel }], note? } — met le stock au niveau compté et journalise l'écart
router.post("/inventaire", (req, res) => {
  const lignes = Array.isArray(req.body.lignes) ? req.body.lignes : [];
  if (!lignes.length) return res.status(400).json({ erreur: "Aucune ligne d'inventaire" });
  const ecarts = [];
  db.transaction(() => {
    for (const l of lignes) {
      const p = db.prepare("SELECT * FROM packs WHERE id = ? AND supprime = 0").get(String(l.pack_id || ""));
      const reel = entier(l.stock_reel);
      if (!p || !(reel >= 0)) continue;
      const delta = reel - p.stock;
      if (delta) { mouvement(p.id, delta, "inventaire", { auteurId: req.user?.id, note: String(req.body.note || "").slice(0, 300) || null }); ecarts.push({ pack_id: p.id, nom: p.nom, avant: p.stock, apres: reel, delta }); }
    }
  })();
  res.json({ ecarts });
});

// { pack_id, quantite, motif: casse|retour|ajustement, note? }
router.post("/sortie", (req, res) => {
  const p = db.prepare("SELECT * FROM packs WHERE id = ? AND supprime = 0").get(String(req.body.pack_id || ""));
  if (!p) return res.status(404).json({ erreur: "Produit introuvable" });
  const q = entier(req.body.quantite);
  if (!(q > 0)) return res.status(400).json({ erreur: "Quantité invalide" });
  const motif = ["casse", "ajustement"].includes(req.body.motif) ? req.body.motif : "casse";
  const ok = db.transaction(() => mouvement(p.id, -q, motif, { auteurId: req.user?.id, note: String(req.body.note || "").slice(0, 300) || null, conditionnel: true }))();
  if (!ok) return res.status(409).json({ erreur: `Stock insuffisant (${p.stock} en stock)` });
  res.json({ pack: db.prepare("SELECT * FROM packs WHERE id = ?").get(p.id) });
});

module.exports = router;

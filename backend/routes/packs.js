const express = require("express");
const db = require("../db");
const { adminOnly } = require("../middleware/auth");
const { idOuNouveau, versIso } = require("../lib/outils");
const { resoudreImage, ErreurImage } = require("../lib/images");
const { mouvement } = require("../lib/stock");
const router = express.Router();

const lire = (id) => db.prepare("SELECT * FROM packs WHERE id = ? AND supprime = 0").get(id);
const serialiser = (p) => p && { ...p, cree_le: versIso(p.cree_le) };
const entierPositif = (v) => Math.max(0, Math.round(Number(v) || 0));
const prixOuNull = (v) => (v == null || v === "" || !(Number(v) > 0) ? null : Math.round(Number(v)));
const dateOuNull = (v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null);
const texte = (v, max = 2000) => (v == null ? null : String(v).slice(0, max));

// GET /api/packs?tous=1 — catalogue avec total vendu par pack (brouillons inclus avec tous=1)
router.get("/", (req, res) => {
  const sql = req.query.tous ? "SELECT * FROM packs WHERE supprime = 0" : "SELECT * FROM packs WHERE supprime = 0 AND actif = 1";
  const packs = db.prepare(sql + " ORDER BY cree_le DESC").all();
  const ventesParPack = db
    .prepare(
      `SELECT v.pack_id, SUM(v.quantite) AS total_vendu FROM ventes v
       LEFT JOIN commandes c ON c.id = v.commande_id WHERE COALESCE(c.statut, '') <> 'annulee' GROUP BY v.pack_id`
    )
    .all()
    .reduce((acc, r) => ({ ...acc, [r.pack_id]: r.total_vendu }), {});
  const admin = req.user?.role === "admin";
  // Un vendeur ne reçoit ni coût, ni quantité en stock, ni volumes vendus
  res.json(packs.map((p) => (admin ? { ...serialiser(p), totalVendu: ventesParPack[p.id] || 0 } : { ...serialiser(p), cout: null, stock: p.stock > 0 ? 9999 : 0, seuil_alerte: null })));
});

// GET /api/packs/:id
router.get("/:id", (req, res) => {
  const pack = lire(req.params.id);
  if (!pack) return res.status(404).json({ erreur: "Pack introuvable" });
  res.json(req.user?.role === "admin" ? serialiser(pack) : { ...serialiser(pack), cout: null, stock: pack.stock > 0 ? 9999 : 0, seuil_alerte: null });
});

// Toute modification du catalogue et du stock est réservée aux administrateurs
router.use(adminOnly);

// POST /api/packs — { id?, nom, prix, description?, contenu?, cout?, stock?, seuil_alerte?, sku?, emoji?, teinte?, actif?,
//                     prix_promo?, promo_fin?, image? (data URL) }
router.post("/", (req, res) => {
  const { nom, description, prix, cout, stock, sku, emoji, teinte, actif } = req.body;
  if (!nom || !(Number(prix) > 0)) return res.status(400).json({ erreur: "nom et prix (> 0) sont requis" });
  const id = idOuNouveau(req.body.id);
  if (db.prepare("SELECT id FROM packs WHERE id = ?").get(id)) return res.status(409).json({ erreur: "Identifiant déjà utilisé" });
  let image;
  try { image = resoudreImage(req.body.image, null, id); } catch (e) { if (e instanceof ErreurImage) return res.status(400).json({ erreur: e.message }); throw e; }
  const stockInitial = entierPositif(stock);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO packs (id, nom, description, contenu, prix, cout, stock, seuil_alerte, sku, emoji, teinte, actif, image, prix_promo, promo_fin, cree_le, categorie, pieces_par_lot)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, nom, description || "", texte(req.body.contenu), Number(prix), cout == null || cout === "" ? null : Number(cout),
      req.body.seuil_alerte == null ? 10 : entierPositif(req.body.seuil_alerte),
      sku || null, emoji || "📦", Number(teinte) || 0, actif === false || actif === 0 ? 0 : 1, image,
      prixOuNull(req.body.prix_promo), dateOuNull(req.body.promo_fin), new Date().toISOString(),
      texte(req.body.categorie, 60)?.trim() || null, Math.max(1, entierPositif(req.body.pieces_par_lot) || 1)
    );
    if (stockInitial) mouvement(id, stockInitial, "stock_initial", { auteurId: req.user?.id });
  })();
  res.status(201).json(serialiser(lire(id)));
});

// PUT /api/packs/:id — mise à jour partielle. Un changement de stock est journalisé (« ajustement »).
router.put("/:id", (req, res) => {
  const existant = lire(req.params.id);
  if (!existant) return res.status(404).json({ erreur: "Pack introuvable" });
  const c = { ...existant };
  for (const k of ["nom", "description", "contenu", "prix", "cout", "stock", "seuil_alerte", "sku", "emoji", "teinte", "actif", "prix_promo", "promo_fin", "categorie", "pieces_par_lot"]) {
    if (req.body[k] !== undefined) c[k] = req.body[k];
  }
  if (!c.nom || !(Number(c.prix) > 0)) return res.status(400).json({ erreur: "nom et prix (> 0) sont requis" });
  const promo = prixOuNull(c.prix_promo);
  if (promo != null && promo >= Number(c.prix)) return res.status(400).json({ erreur: "Le prix promotionnel doit être inférieur au prix normal" });
  // image : data URL = nouvelle image, null = retirer, URL existante = inchangée
  let image;
  try { image = resoudreImage(req.body.image, existant.image, existant.id); } catch (e) { if (e instanceof ErreurImage) return res.status(400).json({ erreur: e.message }); throw e; }
  db.transaction(() => {
    db.prepare(
      `UPDATE packs SET nom=?, description=?, contenu=?, prix=?, cout=?, seuil_alerte=?, sku=?, emoji=?, teinte=?, actif=?, image=?, prix_promo=?, promo_fin=?, categorie=?, pieces_par_lot=? WHERE id=?`
    ).run(
      c.nom, c.description, texte(c.contenu), Number(c.prix), c.cout == null || c.cout === "" ? null : Number(c.cout),
      entierPositif(c.seuil_alerte), c.sku, c.emoji, Number(c.teinte) || 0, c.actif === false || c.actif === 0 ? 0 : 1, image,
      promo, promo == null ? null : dateOuNull(c.promo_fin),
      texte(c.categorie, 60)?.trim() || null, Math.max(1, entierPositif(c.pieces_par_lot) || 1), req.params.id
    );
    const delta = entierPositif(c.stock) - existant.stock;
    if (req.body.stock !== undefined && delta) mouvement(existant.id, delta, "ajustement", { auteurId: req.user?.id, note: "Modification de la fiche produit" });
  })();
  res.json(serialiser(lire(req.params.id)));
});

// PATCH /api/packs/:id/stock — { delta, motif?, note? } : ajustement relatif (sûr en cas de clics rapides)
router.patch("/:id/stock", (req, res) => {
  const p = lire(req.params.id);
  if (!p) return res.status(404).json({ erreur: "Pack introuvable" });
  const delta = Math.round(Number(req.body.delta) || 0);
  db.transaction(() => mouvement(p.id, delta, req.body.motif || "ajustement", { note: texte(req.body.note, 300), auteurId: req.user?.id }))();
  res.json(serialiser(lire(req.params.id)));
});

// DELETE /api/packs/:id  (suppression logique pour préserver l'historique des ventes)
router.delete("/:id", (req, res) => {
  const info = db.prepare("UPDATE packs SET supprime = 1 WHERE id = ? AND supprime = 0").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ erreur: "Pack introuvable" });
  res.status(204).send();
});

module.exports = router;

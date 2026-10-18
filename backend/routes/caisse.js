/**
 * Caisse du jour et argent détenu par les vendeurs et les livreurs.
 *   GET    /api/caisse?jour=AAAA-MM-JJ        (administrateur) calcul de la caisse, détenteurs, historique
 *   POST   /api/caisse/ouvrir   { jour, fond_initial }
 *   POST   /api/caisse/fermer   { jour, especes_comptees, note }   note obligatoire s'il y a un écart
 *   POST   /api/caisse/remises  { de_type: vendeur|livreur, de_id, montant, moyen, note }
 *   DELETE /api/caisse/remises/:id
 *   GET    /api/caisse/moi                     (vendeur) ce qu'il a encaissé, remis et détient encore
 */
const express = require("express");
const caisse = require("../lib/caisse");
const { adminOnly } = require("../middleware/auth");
const router = express.Router();
const jourValide = (j) => (/^\d{4}-\d{2}-\d{2}$/.test(String(j || "")) ? String(j) : new Date().toISOString().slice(0, 10));
const reponse = (res, r, code = 200) => (r.erreur ? res.status(400).json(r) : res.status(code).json(r));

router.get("/moi", (req, res) => res.json(caisse.situationVendeur(req.user.id)));
// Retours à régler : l'administrateur voit tout, le vendeur ceux de ses commandes ; chacun règle ce qu'il voit
router.get("/retours", (req, res) => res.json(caisse.aRegler(req.user)));
router.post("/retours/:id/regler", (req, res) => {
  if (!caisse.aRegler(req.user).some((x) => x.id === req.params.id)) return res.status(404).json({ erreur: "Règlement introuvable ou déjà traité" });
  reponse(res, caisse.regler(req.params.id, req.body || {}, req.user));
});
router.post("/retours/:id/abandonner", adminOnly, (req, res) => reponse(res, caisse.abandonner(req.params.id, req.body?.note)));
router.get("/", adminOnly, (req, res) => res.json(caisse.journee(jourValide(req.query.jour))));
router.post("/ouvrir", adminOnly, (req, res) => reponse(res, caisse.ouvrir(jourValide(req.body.jour), req.body.fond_initial, req.user), 201));
router.post("/fermer", adminOnly, (req, res) => reponse(res, caisse.fermer(jourValide(req.body.jour), req.body.especes_comptees, req.body.note, req.user)));
router.post("/remises", adminOnly, (req, res) => reponse(res, caisse.remettre(req.body || {}, req.user), 201));
router.delete("/remises/:id", adminOnly, (req, res) => reponse(res, caisse.annulerRemise(req.params.id)));

module.exports = router;

/**
 * Contrôle Mobile Money (administrateur).
 *   GET    /api/rapprochement?de=&a=          paiements déclarés et leur statut, relevé sans commande, imports
 *   POST   /api/rapprochement/import          { operateur, texte }   texte = contenu du CSV exporté par l'opérateur
 *   DELETE /api/rapprochement/import/:id      retire un relevé importé par erreur
 */
const express = require("express");
const r = require("../lib/rapprochement");
const router = express.Router();
const jour = (j) => (/^\d{4}-\d{2}-\d{2}$/.test(String(j || "")) ? String(j) : null);

router.get("/", (req, res) => res.json(r.rapprocher({ de: jour(req.query.de), a: jour(req.query.a) })));
router.post("/import", (req, res) => {
  const x = r.importer(String(req.body?.operateur || ""), String(req.body?.texte || ""), req.user);
  res.status(x.erreur ? 400 : 201).json(x);
});
router.delete("/import/:id", (req, res) => { const x = r.supprimerImport(req.params.id); res.status(x.erreur ? 404 : 200).json(x); });

module.exports = router;

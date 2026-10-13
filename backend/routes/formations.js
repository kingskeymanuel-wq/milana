/**
 * Formations — administration :
 *   GET    /api/formations                       formations (avec leçons et questions) et inscriptions
 *   POST   /api/formations                       crée une formation { titre, description, …, lecons: [], questions: [] }
 *   PUT    /api/formations/:id                   modifie une formation (leçons et questions remplacées)
 *   DELETE /api/formations/:id                   supprime une formation sans inscription (sinon : la dépublier)
 *   POST   /api/formations/inscriptions          accès offert ou payé en boutique { formation_id, nom, telephone }
 *   POST   /api/formations/inscriptions/:id/paiement { recu: true | false }  confirme ou refuse un paiement déclaré
 */
const express = require("express");
const db = require("../db");
const formations = require("../lib/formations");
const { normTel } = require("../lib/outils");
const router = express.Router();

function tableau() {
  const liste = db.prepare("SELECT * FROM formations ORDER BY cree_le DESC").all();
  const titres = new Map(liste.map((f) => [f.id, f.titre]));
  const totaux = new Map(liste.map((f) => [f.id, db.prepare("SELECT COUNT(*) AS n FROM formations_lecons WHERE formation_id = ?").get(f.id).n]));
  return {
    formations: liste.map((f) => ({
      ...formations.fichePublique(f), publie: Boolean(f.publie), support_lien: f.support_lien || "", support_nom: formations.supportDisponible(f) ? f.support_nom : null,
      minuteur: f.minuteur, score_reussite: formations.scoreReussite(f), tentatives_max: formations.tentativesMax(f),
      lecons: formations.lecons(f.id).map((l) => ({ titre: l.titre, contenu: l.contenu || "", video_url: l.video_url || "" })),
      questions: formations.questions(f.id).map((q) => ({ question: q.question, options: q.options, bonne: q.bonne })),
      inscrits: db.prepare("SELECT COUNT(*) AS n FROM formations_inscriptions WHERE formation_id = ? AND statut IN ('gratuit', 'payee')").get(f.id).n,
    })),
    inscriptions: db.prepare("SELECT * FROM formations_inscriptions ORDER BY cree_le DESC LIMIT 1000").all().map((i) => ({
      id: i.id, formation_id: i.formation_id, formation: titres.get(i.formation_id) || "Formation supprimée", jeton: i.jeton, nom: i.nom, telephone: i.telephone,
      statut: i.statut, montant: i.montant, operateur: i.operateur, telephone_paiement: i.telephone_paiement, reference_paiement: i.reference_paiement,
      lecons_faites: i.lecons_faites, lecons: totaux.get(i.formation_id) || 0, tentatives: i.tentatives, meilleur_score: i.meilleur_score, reussi_le: i.reussi_le, certificat: i.code_certificat, cree_le: i.cree_le,
    })),
  };
}

router.get("/", (req, res) => res.json(tableau()));

router.post("/", (req, res) => {
  const v = formations.nettoyer(req.body);
  if (v.erreur) return res.status(400).json({ erreur: v.erreur });
  formations.enregistrer(null, v);
  res.status(201).json(tableau());
});

router.put("/:id", (req, res) => {
  if (!formations.lire(req.params.id)) return res.status(404).json({ erreur: "Formation introuvable" });
  const v = formations.nettoyer(req.body);
  if (v.erreur) return res.status(400).json({ erreur: v.erreur });
  formations.enregistrer(req.params.id, v);
  res.json(tableau());
});

router.delete("/:id", (req, res) => {
  if (!formations.lire(req.params.id)) return res.status(404).json({ erreur: "Formation introuvable" });
  if (db.prepare("SELECT 1 FROM formations_inscriptions WHERE formation_id = ?").get(req.params.id)) {
    return res.status(409).json({ erreur: "Des personnes sont inscrites à cette formation : dépubliez-la plutôt que de la supprimer." });
  }
  db.transaction(() => {
    db.prepare("DELETE FROM formations_lecons WHERE formation_id = ?").run(req.params.id);
    db.prepare("DELETE FROM formations_questions WHERE formation_id = ?").run(req.params.id);
    db.prepare("DELETE FROM formations WHERE id = ?").run(req.params.id);
  })();
  res.json(tableau());
});

router.post("/inscriptions", (req, res) => {
  const f = formations.lire(req.body.formation_id);
  if (!f) return res.status(404).json({ erreur: "Formation introuvable" });
  const nom = String(req.body.nom || "").trim().replace(/\s+/g, " ").slice(0, 80), telephone = String(req.body.telephone || "").trim().slice(0, 30);
  if (nom.length < 3) return res.status(400).json({ erreur: "Indiquez le nom complet de la personne." });
  if (normTel(telephone).replace(/\D/g, "").length < 8) return res.status(400).json({ erreur: "Indiquez un numéro de téléphone valide." });
  const i = formations.inscrire(f, { nom, telephone, statut: Number(f.prix) > 0 ? "payee" : "gratuit" });
  res.status(201).json({ jeton: i.jeton, ...tableau() });
});

router.post("/inscriptions/:id/paiement", (req, res) => {
  const i = db.prepare("SELECT * FROM formations_inscriptions WHERE id = ?").get(req.params.id);
  if (!i) return res.status(404).json({ erreur: "Inscription introuvable" });
  if (!["a_verifier", "refusee", "payee"].includes(i.statut)) return res.status(409).json({ erreur: "Cette inscription n'attend pas de paiement." });
  db.prepare("UPDATE formations_inscriptions SET statut = ?, maj_le = ? WHERE id = ?").run(req.body.recu === false ? "refusee" : "payee", new Date().toISOString(), i.id);
  res.json(tableau());
});

module.exports = router;

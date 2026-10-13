/**
 * Formations — routes publiques (ajoutées au routeur /api/boutique) :
 *   GET  /formations                               catalogue des formations publiées
 *   POST /formations/:id/inscription               { personne: { nom, telephone }, paiement?: { operateur, telephone, reference } } → lien d'accès
 *   GET  /formations/acces/:jeton                  la formation vue par l'apprenant (contenu seulement si l'accès est ouvert)
 *   POST /formations/acces/:jeton/lecon            { position } → leçon terminée (dans l'ordre)
 *   POST /formations/acces/:jeton/evaluation       démarre une tentative → questions sans les réponses
 *   POST /formations/acces/:jeton/evaluation/reponses { reponses: { idQuestion: indice } } → score
 *   GET  /formations/acces/:jeton/support          fiche PDF de la formation
 *   GET  /certificats/:code                        vérification publique d'un certificat
 */
const rateLimit = require("express-rate-limit");
const db = require("../db");
const formations = require("../lib/formations");
const { normTel } = require("../lib/outils");

module.exports = function ajouterRoutesFormations(router, { espacePublic, espaceParJeton, trouverOuCreerClient, configPublique }) {
  const limite = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { erreur: "Trop de demandes depuis cette connexion, réessayez dans quelques minutes." } });
  const parJeton = espaceParJeton((req) => formations.inscriptionParJeton(req.params.jeton));
  const inscription = (req) => formations.inscriptionParJeton(req.params.jeton);

  router.get("/formations", espacePublic, (req, res) => {
    res.json(db.prepare("SELECT * FROM formations WHERE publie = 1 ORDER BY cree_le DESC").all().map(formations.fichePublique));
  });

  router.post("/formations/:id/inscription", limite, espacePublic, (req, res) => {
    const f = formations.lire(req.params.id);
    if (!f || !f.publie) return res.status(404).json({ erreur: "Formation introuvable" });
    const p = req.body.personne || {};
    const nom = String(p.nom || "").trim().replace(/\s+/g, " ").slice(0, 80), telephone = String(p.telephone || "").trim().slice(0, 30);
    if (nom.length < 3) return res.status(400).json({ erreur: "Indiquez votre nom complet (il figurera sur le certificat)." });
    if (normTel(telephone).replace(/\D/g, "").length < 8) return res.status(400).json({ erreur: "Indiquez un numéro de téléphone valide." });

    let paiement = null;
    if (Number(f.prix) > 0) {
      // Formation payante : le client déclare son transfert Mobile Money, la boutique le confirme
      const modes = configPublique().paiements.transfert;
      const x = req.body.paiement || {};
      const mode = modes.find((m) => m.mode === x.operateur);
      if (!modes.length) return res.status(409).json({ erreur: "Le paiement de cette formation n'est pas encore disponible. Contactez la boutique." });
      if (!mode) return res.status(400).json({ erreur: "Choisissez l'opérateur utilisé pour le paiement." });
      const reference = String(x.reference || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
      if (reference.length < 6) return res.status(400).json({ erreur: "Indiquez la référence de la transaction reçue par SMS." });
      if (db.prepare("SELECT 1 FROM formations_inscriptions WHERE reference_paiement = ? AND statut <> 'refusee'").get(reference) || db.prepare("SELECT 1 FROM ventes WHERE reference_paiement = ?").get(reference)) {
        return res.status(409).json({ erreur: "Cette référence de transaction a déjà été utilisée." });
      }
      paiement = { operateur: mode.mode, telephone: String(x.telephone || telephone).trim().slice(0, 30), reference };
    }
    const i = db.transaction(() => {
      const clientId = trouverOuCreerClient({ nom, telephone, email: "", ville: "", consentement: p.consentement === true });
      return formations.inscrire(f, { clientId, nom, telephone, paiement, statut: paiement ? "a_verifier" : "gratuit" });
    })();
    res.status(201).json({ jeton: i.jeton, statut: i.statut, titre: f.titre });
  });

  router.get("/formations/acces/:jeton", parJeton, (req, res) => res.json(formations.vueApprenant(inscription(req))));

  router.post("/formations/acces/:jeton/lecon", parJeton, (req, res) => {
    const r = formations.terminerLecon(inscription(req), req.body.position);
    if (r.erreur) return res.status(r.statut).json({ erreur: r.erreur });
    res.json(formations.vueApprenant(inscription(req)));
  });

  router.post("/formations/acces/:jeton/evaluation", parJeton, (req, res) => {
    const r = formations.demarrerEvaluation(inscription(req));
    if (r.erreur) return res.status(r.statut).json({ erreur: r.erreur });
    res.json(r);
  });

  router.post("/formations/acces/:jeton/evaluation/reponses", parJeton, (req, res) => {
    const r = formations.corrigerEvaluation(inscription(req), req.body.reponses);
    if (r.erreur) return res.status(r.statut).json({ erreur: r.erreur });
    res.json({ resultat: r, acces: formations.vueApprenant(inscription(req)) });
  });

  router.get("/formations/acces/:jeton/support", parJeton, (req, res) => {
    const i = inscription(req), f = formations.lire(i.formation_id);
    if (!formations.accesOuvert(i)) return res.status(403).json({ erreur: "L'accès à cette formation n'est pas encore ouvert." });
    if (!formations.supportDisponible(f)) return res.status(404).json({ erreur: "Cette formation n'a pas de fiche à télécharger." });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${String(f.support_nom || "support.pdf").replace(/[^\w.-]/g, "-")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(formations.cheminSupport(f));
  });

  router.get("/certificats/:code", espaceParJeton((req) => formations.inscriptionParCertificat(req.params.code)), (req, res) => {
    const i = formations.inscriptionParCertificat(req.params.code), f = formations.lire(i.formation_id);
    res.json({ code: i.code_certificat, nom: i.nom, formation: f?.titre || "Formation", obtenu_le: i.reussi_le, score: i.meilleur_score, boutique: configPublique().boutique.nom });
  });
};

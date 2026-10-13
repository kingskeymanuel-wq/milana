const express = require("express");
const db = require("../db");
const router = express.Router();

// Ventes valides = ventes dont la commande n'est pas annulée
const VENTES_VALIDES = `FROM ventes v LEFT JOIN commandes c ON c.id = v.commande_id WHERE COALESCE(c.statut, '') <> 'annulee'`;

// GET /api/dashboard — indicateurs clés
router.get("/", (req, res) => {
  const ca = db.prepare(`SELECT COALESCE(SUM(v.quantite * v.prix_unitaire),0) AS t ${VENTES_VALIDES}`).get().t;
  const investi = db.prepare("SELECT COALESCE(SUM(montant),0) AS t FROM investissements").get().t;
  const clientsActifs = db.prepare(`SELECT COUNT(DISTINCT v.client_id) AS n ${VENTES_VALIDES}`).get().n;
  const totalClients = db.prepare("SELECT COUNT(*) AS n FROM clients WHERE supprime = 0").get().n;
  const commandesEnCours = db
    .prepare("SELECT COUNT(*) AS n FROM commandes WHERE statut NOT IN ('livree','annulee')")
    .get().n;
  const packsActifs = db.prepare("SELECT COUNT(*) AS n FROM packs WHERE actif = 1 AND supprime = 0").get().n;

  const ventesParJour = db
    .prepare(
      `SELECT date(v.date_vente) AS jour, SUM(v.quantite * v.prix_unitaire) AS total
       ${VENTES_VALIDES} GROUP BY date(v.date_vente) ORDER BY jour DESC LIMIT 7`
    )
    .all()
    .reverse();

  const topPacks = db
    .prepare(
      `SELECT p.id, p.nom, p.emoji, SUM(v.quantite) AS quantite_vendue,
              SUM(v.quantite * v.prix_unitaire) AS chiffre_affaires
       FROM ventes v JOIN packs p ON p.id = v.pack_id LEFT JOIN commandes c ON c.id = v.commande_id
       WHERE COALESCE(c.statut, '') <> 'annulee'
       GROUP BY p.id ORDER BY quantite_vendue DESC LIMIT 5`
    )
    .all();

  const repartitionCommandes = db
    .prepare("SELECT statut, COUNT(*) AS n FROM commandes GROUP BY statut")
    .all();

  res.json({
    chiffreAffaires: ca,
    totalInvesti: investi,
    benefice: ca - investi,
    roi: investi > 0 ? ((ca - investi) / investi) * 100 : 0,
    clientsActifs,
    totalClients,
    commandesEnCours,
    packsActifs,
    ventesParJour,
    topPacks,
    repartitionCommandes,
  });
});

module.exports = router;

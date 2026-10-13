/**
 * Ticket de caisse public : GET /api/recus/:jeton
 * Accessible SANS connexion par le client (lien envoyé ou QR code imprimé sur
 * le ticket). Le jeton de 24 caractères aléatoires rend le lien impossible à
 * deviner ; seules les informations du ticket sont exposées.
 */
const express = require("express");
const db = require("../db");
const { ticketCommande } = require("../lib/commandes");
const { journaliser } = require("../lib/tickets");
const router = express.Router();

router.get("/:jeton", (req, res) => {
  const jeton = String(req.params.jeton);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(jeton)) return res.status(404).json({ erreur: "Ticket introuvable" });
  // Le ticket appartient à l'un des espaces de la plateforme
  const lire = () => db.prepare("SELECT * FROM commandes WHERE jeton_recu = ?").get(jeton);
  const espace = db.trouverEspace(lire);
  if (!espace) return res.status(404).json({ erreur: "Ticket introuvable" });
  db.dansEspace(espace.id, () => {
    journaliser(lire().id, "consulte_client", null, { unique: true });
    res.json(ticketCommande(lire()));
  });
});

module.exports = router;

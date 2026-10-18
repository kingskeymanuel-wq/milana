const express = require("express");
const db = require("../db");
const { idOuNouveau, versIso } = require("../lib/outils");
const { adminOnly } = require("../middleware/auth");
const { clientsVisibles, clientVisible, estAdmin } = require("../lib/clients");
const router = express.Router();

const lire = (id) => db.prepare("SELECT * FROM clients WHERE id = ? AND supprime = 0").get(id);
const serialiser = (c) => c && { ...c, cree_le: versIso(c.cree_le) };

// GET /api/clients?recherche=&statut= — un vendeur ne reçoit que ses propres clients
router.get("/", (req, res) => {
  const { recherche, statut } = req.query;
  res.json(clientsVisibles(req.user, { recherche: recherche ? String(recherche) : "", statut: statut ? String(statut) : "" }).map(serialiser));
});

// GET /api/clients/:id  (avec historique d'achats et total dépensé hors annulations)
router.get("/:id", (req, res) => {
  const client = clientVisible(req.params.id, req.user);
  if (!client) return res.status(404).json({ erreur: "Client introuvable" });

  // Un vendeur ne voit que les achats faits avec lui
  const achats = db
    .prepare(
      `SELECT v.*, p.nom AS pack_nom, p.emoji AS pack_emoji, c.numero, c.statut
       FROM ventes v JOIN packs p ON p.id = v.pack_id LEFT JOIN commandes c ON c.id = v.commande_id
       WHERE v.client_id = ? AND (? = 1 OR v.vendeur_id = ?) ORDER BY v.date_vente DESC`
    )
    .all(req.params.id, estAdmin(req.user) ? 1 : 0, req.user.id)
    .map((a) => ({ ...a, date_vente: versIso(a.date_vente) }));

  const totalDepense = achats.filter((a) => a.statut !== "annulee").reduce((s, a) => s + a.quantite * a.prix_unitaire, 0);
  res.json({ ...serialiser(client), achats, totalDepense, nombreAchats: achats.length });
});

// POST /api/clients — { id?, nom, telephone, email?, ville?, statut?, notes? }
router.post("/", (req, res) => {
  const { nom, telephone, email, ville, statut, notes } = req.body;
  if (!nom || !telephone) return res.status(400).json({ erreur: "nom et telephone sont requis" });
  const id = idOuNouveau(req.body.id);
  if (db.prepare("SELECT id FROM clients WHERE id = ?").get(id)) return res.status(409).json({ erreur: "Identifiant déjà utilisé" });
  db.prepare(
    "INSERT INTO clients (id, nom, telephone, email, ville, statut, notes, consentement_marketing, vendeur_id, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, nom, telephone, email || null, ville || null, statut === "VIP" ? "VIP" : "Standard", notes || null, req.body.consentement_marketing ? 1 : 0,
    estAdmin(req.user) ? null : req.user.id, new Date().toISOString());
  res.status(201).json(serialiser(lire(id)));
});

// PUT /api/clients/:id — mise à jour partielle
router.put("/:id", (req, res) => {
  const existant = clientVisible(req.params.id, req.user);
  if (!existant) return res.status(404).json({ erreur: "Client introuvable" });
  const champs = { ...existant };
  for (const k of ["nom", "telephone", "email", "ville", "statut", "notes", "consentement_marketing"]) if (req.body[k] !== undefined) champs[k] = req.body[k];
  if (!champs.nom || !champs.telephone) return res.status(400).json({ erreur: "nom et telephone sont requis" });
  db.prepare(
    "UPDATE clients SET nom=?, telephone=?, email=?, ville=?, statut=?, notes=?, consentement_marketing=?, desinscrit_le=? WHERE id=?"
  ).run(champs.nom, champs.telephone, champs.email, champs.ville, champs.statut === "VIP" ? "VIP" : "Standard", champs.notes,
    champs.consentement_marketing ? 1 : 0, !champs.consentement_marketing && existant.consentement_marketing ? new Date().toISOString() : existant.desinscrit_le, req.params.id);
  res.json(serialiser(lire(req.params.id)));
});

// DELETE /api/clients/:id — suppression logique : ses commandes restent dans l'historique
router.delete("/:id", adminOnly, (req, res) => {
  const info = db.prepare("UPDATE clients SET supprime = 1 WHERE id = ? AND supprime = 0").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ erreur: "Client introuvable" });
  res.status(204).send();
});

module.exports = router;

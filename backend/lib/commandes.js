/**
 * Commandes à une ou plusieurs lignes (lignes = table ventes, colonne commande_id).
 * Fonctions partagées par l'administration et la boutique en ligne.
 */
const db = require("../db");
const { versIso, ajouterEvenement } = require("./outils");
const { lireBoutique } = require("../routes/parametres");
const { mouvement } = require("./stock");

function lignesCommande(cmd) {
  const lignes = db.prepare("SELECT * FROM ventes WHERE commande_id = ? ORDER BY date_vente, rowid").all(cmd.id);
  if (lignes.length) return lignes;
  const v = db.prepare("SELECT * FROM ventes WHERE id = ?").get(cmd.vente_id); // ancienne commande sans commande_id
  return v ? [v] : [];
}

const sousTotal = (lignes) => lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
const totalCommande = (cmd, lignes = lignesCommande(cmd)) => sousTotal(lignes) + (Number(cmd.frais_livraison) || 0);

/** Remet (sens = +1) ou retire (sens = -1) du stock les articles d'une commande (journalisé). */
function mouvementStock(lignes, sens, motif, reference = null, auteurId = null) {
  for (const l of lignes) mouvement(l.pack_id, sens * l.quantite, motif, { reference, auteurId });
}

/**
 * Change le statut d'une commande en maintenant le stock cohérent :
 * une annulation remet les articles en stock, un rétablissement les retire.
 * Doit être appelée dans une transaction.
 */
function changerStatut(commandeId, statut, auteurId, texte = null) {
  const cmd = db.prepare("SELECT * FROM commandes WHERE id = ?").get(commandeId);
  if (!cmd) return null;
  if (cmd.statut === statut) return cmd;
  const lignes = lignesCommande(cmd);
  if (statut === "annulee") mouvementStock(lignes, +1, "annulation", cmd.numero, auteurId);
  else if (cmd.statut === "annulee") mouvementStock(lignes, -1, "retablissement", cmd.numero, auteurId);
  const maintenant = new Date().toISOString();
  db.prepare("UPDATE commandes SET statut = ?, maj_le = ?, livree_le = ? WHERE id = ?").run(statut, maintenant, statut === "livree" ? maintenant : null, commandeId);
  ajouterEvenement(commandeId, { statut, auteurId, texte });
  return db.prepare("SELECT * FROM commandes WHERE id = ?").get(commandeId);
}

/** Enregistre les informations de paiement sur toutes les lignes de la commande. */
function enregistrerPaiement(cmd, { mode, statut, montantRecu = null, reference = null, telephone = null, payeLe = null }) {
  db.prepare(
    `UPDATE ventes SET mode_paiement = ?, statut_paiement = ?, montant_recu = ?, reference_paiement = ?, telephone_paiement = ?, paye_le = ?
     WHERE commande_id = ? OR id = ?`
  ).run(mode, statut, montantRecu, reference, telephone, payeLe, cmd.id, cmd.vente_id);
}

/** Supprime une commande et ses lignes ; le stock est réintégré sauf si elle était annulée. */
function supprimerCommande(cmd, auteurId = null) {
  const lignes = lignesCommande(cmd);
  if (cmd.statut !== "annulee") mouvementStock(lignes, +1, "suppression", cmd.numero, auteurId);
  db.prepare("DELETE FROM commandes WHERE id = ?").run(cmd.id);
  const del = db.prepare("DELETE FROM ventes WHERE id = ?");
  for (const l of lignes) del.run(l.id);
}

// Prénom + initiale du nom : suffisant sur un ticket, sans exposer l'identité complète
const nomCourt = (nom) => {
  if (/^Client \d/.test(String(nom || ""))) return null; // client enregistré sans nom : le contact suffit
  const parts = String(nom || "").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || null;
};

/** Ticket de caisse (format commun à l'administration, à la boutique et au PDF). */
function ticketCommande(cmd) {
  const lignes = lignesCommande(cmd);
  const v = lignes[0] || {};
  const packs = new Map(db.prepare("SELECT id, nom, sku, image, emoji, teinte, pieces_par_lot FROM packs").all().map((p) => [p.id, p]));
  const client = v.client_id ? db.prepare("SELECT nom, telephone FROM clients WHERE id = ?").get(v.client_id) : null;
  const pieces = (l) => l.quantite * Math.max(1, Number(packs.get(l.pack_id)?.pieces_par_lot) || 1);
  const vendeur = v.vendeur_id ? db.prepare("SELECT nom FROM utilisateurs WHERE id = ?").get(v.vendeur_id) : null;
  const total = totalCommande(cmd, lignes);
  return {
    boutique: lireBoutique(),
    numero: cmd.numero,
    numero_ticket: cmd.numero_ticket || null,
    type_vente: cmd.type_vente || "b2c",
    // Étiquette de livraison : contact et adresse du client
    contact: cmd.contact_telephone || client?.telephone || null,
    adresse_livraison: cmd.adresse_livraison || null,
    date: versIso(v.date_vente),
    statut: cmd.statut,
    canal: cmd.canal,
    vendeur: vendeur ? nomCourt(vendeur.nom) : null,
    client: client ? nomCourt(client.nom) : null,
    lignes: lignes.map((l) => {
      const p = packs.get(l.pack_id);
      return { nom: p?.nom || "Article", sku: p?.sku || null, image: p?.image || null, emoji: p?.emoji || null, teinte: p?.teinte ?? null, quantite: l.quantite, prix_unitaire: l.prix_unitaire,
        // Réduction : prix normal du catalogue le jour de la vente, s'il était plus élevé que le prix payé
        prix_normal: Number(l.prix_catalogue) > l.prix_unitaire ? Number(l.prix_catalogue) : null, total: l.quantite * l.prix_unitaire,
        pieces_par_lot: Math.max(1, Number(p?.pieces_par_lot) || 1), articles: pieces(l) };
    }),
    // Nombre d'articles réellement sortis (2 lots de 3 = 6 articles)
    total_articles: lignes.reduce((s, l) => s + pieces(l), 0),
    sous_total: sousTotal(lignes),
    frais_livraison: Number(cmd.frais_livraison) || 0,
    total,
    paiement: {
      mode: v.mode_paiement,
      statut: v.statut_paiement,
      montant_recu: v.montant_recu,
      monnaie: v.montant_recu != null ? Math.max(0, v.montant_recu - total) : null,
      reference: v.reference_paiement,
      paye_le: versIso(v.paye_le),
    },
  };
}

module.exports = { lignesCommande, sousTotal, totalCommande, mouvementStock, changerStatut, enregistrerPaiement, supprimerCommande, ticketCommande, nomCourt };

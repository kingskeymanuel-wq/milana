/**
 * Mouvements de stock : toute variation passe par ici et est journalisée
 * (table mouvements_stock), pour que l'administrateur sache à tout moment
 * pourquoi le stock d'un produit a bougé.
 */
const { nanoid } = require("nanoid");
const db = require("../db");

const MOTIFS = {
  vente: "Vente en caisse",
  vente_en_ligne: "Vente en ligne",
  annulation: "Commande annulée (remise en stock)",
  retablissement: "Commande rétablie",
  suppression: "Commande supprimée (remise en stock)",
  reception: "Réception de marchandise",
  inventaire: "Inventaire (correction)",
  casse: "Casse / perte",
  retour: "Retour client",
  ajustement: "Ajustement manuel",
  stock_initial: "Stock initial",
};

/**
 * Applique une variation de stock et la journalise. À appeler dans une transaction.
 * conditionnel : refuse (renvoie false) si le stock deviendrait négatif.
 */
function mouvement(packId, delta, motif, { note = null, reference = null, auteurId = null, conditionnel = false } = {}) {
  delta = Math.round(Number(delta) || 0);
  if (!delta) return true;
  const res = conditionnel
    ? db.prepare("UPDATE packs SET stock = stock + ? WHERE id = ? AND stock + ? >= 0").run(delta, packId, delta)
    : db.prepare("UPDATE packs SET stock = MAX(0, stock + ?) WHERE id = ?").run(delta, packId);
  if (res.changes !== 1) return false;
  const apres = db.prepare("SELECT stock FROM packs WHERE id = ?").get(packId)?.stock ?? null;
  db.prepare(
    "INSERT INTO mouvements_stock (id, pack_id, delta, stock_apres, motif, note, reference, auteur_id, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(nanoid(), packId, delta, apres, MOTIFS[motif] ? motif : "ajustement", note, reference, auteurId, new Date().toISOString());
  return true;
}

module.exports = { mouvement, MOTIFS };

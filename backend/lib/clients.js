/**
 * Carnet de clients par vendeur.
 * L'administrateur voit tous les clients de sa boutique. Un vendeur ne voit et ne gère que les siens :
 * ceux qu'il a enregistrés, ceux arrivés par son lien de promotion, et ceux à qui il a déjà vendu.
 */
const db = require("../db");

const estAdmin = (user) => user?.role === "admin";
// Condition SQL sur la table clients (alias c) : deux paramètres, l'identifiant du vendeur deux fois
const CONDITION_VENDEUR = "(c.vendeur_id = ? OR EXISTS (SELECT 1 FROM ventes v WHERE v.client_id = c.id AND v.vendeur_id = ?))";

/** Clients visibles par l'utilisateur (non supprimés), du plus récent au plus ancien sauf ordre précisé. */
function clientsVisibles(user, { recherche, statut, ordre = "DESC" } = {}) {
  let sql = "SELECT c.* FROM clients c WHERE c.supprime = 0";
  const params = [];
  if (!estAdmin(user)) { sql += " AND " + CONDITION_VENDEUR; params.push(user.id, user.id); }
  if (recherche) { sql += " AND (c.nom LIKE ? OR c.telephone LIKE ?)"; params.push(`%${recherche}%`, `%${recherche}%`); }
  if (statut) { sql += " AND c.statut = ?"; params.push(statut); }
  return db.prepare(sql + " ORDER BY c.cree_le " + (ordre === "ASC" ? "ASC" : "DESC")).all(...params);
}

/** Le client, s'il existe et que l'utilisateur a le droit de le voir ; sinon null. */
function clientVisible(id, user) {
  if (estAdmin(user)) return db.prepare("SELECT * FROM clients WHERE id = ? AND supprime = 0").get(id) || null;
  return db.prepare("SELECT c.* FROM clients c WHERE c.id = ? AND c.supprime = 0 AND " + CONDITION_VENDEUR).get(id, user.id, user.id) || null;
}

module.exports = { clientsVisibles, clientVisible, estAdmin };

const { nanoid } = require("nanoid");
const db = require("../db");

/** Horodatage SQLite « AAAA-MM-JJ HH:MM:SS » (UTC) → ISO 8601 ; laisse les ISO intacts. */
function versIso(s) {
  if (!s) return s;
  if (s.includes("T")) return s;
  if (s.length <= 10) return s + "T12:00:00.000Z";
  return s.replace(" ", "T") + "Z";
}

/**
 * Identifiant fourni par le client (permet les mises à jour optimistes côté
 * interface) s'il est bien formé, sinon un nouvel identifiant.
 */
function idOuNouveau(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(id) ? id : nanoid();
}

/** Numéro de téléphone normalisé : sans espaces, points ni tirets. */
function normTel(tel) {
  return String(tel || "").replace(/[\s.\-()]/g, "");
}

/** Numéro de commande suivant (#1001, #1002, …), robuste aux suppressions. */
function prochainNumero() {
  const max = db
    .prepare("SELECT numero FROM commandes")
    .all()
    .reduce((m, r) => Math.max(m, parseInt(String(r.numero).replace(/\D/g, ""), 10) || 0), 1000);
  return "#" + (max + 1);
}

function ajouterEvenement(commandeId, { type = "statut", statut = null, texte = null, auteurId = null, date } = {}) {
  db.prepare(
    "INSERT INTO commande_evenements (id, commande_id, type, statut, texte, auteur_id, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(nanoid(), commandeId, type, statut, texte, auteurId, date || new Date().toISOString());
}

/**
 * Adresse publique du site : PUBLIC_URL, sinon celle fournie par Render
 * (RENDER_EXTERNAL_URL), sinon l'adresse de la requête.
 */
function urlPublique(req) {
  return (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || req.get("origin") || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

module.exports = { versIso, idOuNouveau, normTel, prochainNumero, ajouterEvenement, urlPublique };

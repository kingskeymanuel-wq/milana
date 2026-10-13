/**
 * Tickets de caisse : toute vente (caisse, B2B, boutique en ligne) reçoit un
 * ticket numéroté. Chaque action sur un ticket est journalisée (table
 * tickets_journal) : c'est par les tickets que l'administrateur contrôle les
 * ventes de ses vendeurs et l'écoulement de son stock.
 *
 * Un ticket est « remis » dès qu'il a été imprimé, téléchargé, envoyé au
 * client (WhatsApp, SMS, e-mail) ou consulté par le client via son lien.
 */
const { nanoid } = require("nanoid");
const db = require("../db");
const { ajouterEvenement } = require("./outils");

const ACTIONS = {
  genere: "Ticket généré",
  imprime: "Ticket imprimé",
  pdf: "Ticket téléchargé en PDF",
  whatsapp: "Ticket envoyé par WhatsApp",
  sms: "Ticket envoyé par SMS",
  email: "Ticket envoyé par e-mail",
  lien: "Lien du ticket copié",
  consulte_client: "Ticket consulté par le client",
  historique: "Vente antérieure au suivi des tickets",
};
const REMISE = ["imprime", "pdf", "whatsapp", "sms", "email", "consulte_client", "historique"];
const ACTIONS_VENDEUR = ["imprime", "pdf", "whatsapp", "lien"]; // déclarées par l'interface

const numeroDe = (n) => "T-" + String(n).padStart(6, "0");
const valeur = (s) => parseInt(String(s || "").replace(/\D/g, ""), 10) || 0;

/** Numéro suivant. Le compteur ne recule jamais : un ticket supprimé laisse un trou visible dans la série. */
function prochainNumero() {
  const compteur = valeur(db.prepare("SELECT valeur FROM parametres WHERE cle = 'ticket_compteur'").get()?.valeur);
  const max = db.prepare("SELECT numero_ticket FROM commandes WHERE numero_ticket IS NOT NULL").all().reduce((m, r) => Math.max(m, valeur(r.numero_ticket)), 0);
  const n = Math.max(compteur, max) + 1;
  db.prepare("INSERT INTO parametres (cle, valeur) VALUES ('ticket_compteur', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(String(n));
  return numeroDe(n);
}

const inscrire = (commandeId, action, auteurId, date) =>
  db.prepare("INSERT INTO tickets_journal (id, commande_id, action, auteur_id, cree_le) VALUES (?, ?, ?, ?, ?)").run(nanoid(), commandeId, action, auteurId || null, date || new Date().toISOString());

/** Attribue un numéro de ticket à la commande (sans effet si elle en a déjà un). À appeler dans la transaction de la vente. */
function genererTicket(commandeId, auteurId = null, date = null) {
  const cmd = db.prepare("SELECT numero_ticket FROM commandes WHERE id = ?").get(commandeId);
  if (!cmd) return null;
  if (cmd.numero_ticket) return cmd.numero_ticket;
  const numero = prochainNumero();
  db.prepare("UPDATE commandes SET numero_ticket = ? WHERE id = ?").run(numero, commandeId);
  inscrire(commandeId, "genere", auteurId, date);
  return numero;
}

/**
 * Journalise une action sur le ticket. { evenement: false } n'ajoute pas de ligne
 * à la chronologie de la commande (quand l'appelant en écrit déjà une) ;
 * { unique: true } ignore l'action si elle a déjà été journalisée.
 */
function journaliser(commandeId, action, auteurId = null, { evenement = true, unique = false, date = null } = {}) {
  if (!ACTIONS[action]) return false;
  if (unique && db.prepare("SELECT 1 FROM tickets_journal WHERE commande_id = ? AND action = ?").get(commandeId, action)) return false;
  const quand = date || new Date().toISOString();
  inscrire(commandeId, action, auteurId, quand);
  if (REMISE.includes(action)) db.prepare("UPDATE commandes SET ticket_remis_le = COALESCE(ticket_remis_le, ?) WHERE id = ?").run(quand, commandeId);
  if (evenement) ajouterEvenement(commandeId, { type: "ticket", texte: ACTIONS[action], auteurId, date: quand });
  return true;
}

/** Commandes sans ticket (import d'une sauvegarde ancienne) : numérotées et considérées comme remises. */
function numeroterManquants() {
  const liste = db.prepare("SELECT id, maj_le FROM commandes WHERE numero_ticket IS NULL ORDER BY rowid").all();
  for (const c of liste) {
    genererTicket(c.id, null, c.maj_le);
    journaliser(c.id, "historique", null, { evenement: false, date: c.maj_le });
  }
  return liste.length;
}

module.exports = { ACTIONS, ACTIONS_VENDEUR, REMISE, genererTicket, journaliser, numeroterManquants };

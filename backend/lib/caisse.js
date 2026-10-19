/**
 * Caisse du jour et argent détenu par les vendeurs et les livreurs.
 *
 * Qui détient l'argent d'une commande payée ?
 *  - espèces encaissées à la livraison par un livreur (commande livrée, payée après la vente) → le livreur ;
 *  - espèces encaissées par un vendeur → le vendeur, jusqu'à ce qu'il les remette ;
 *  - Mobile Money versé sur le numéro personnel d'un vendeur (Mes moyens de paiement) → ce vendeur ;
 *  - espèces encaissées par l'administrateur → la caisse de la boutique ;
 *  - Mobile Money, carte ou paiement en ligne sur les comptes de la boutique → le compte (rien à remettre).
 * Montant d'une commande : ses lignes payées + ses frais de livraison.
 *
 * Caisse théorique d'un jour = fond de caisse + espèces encaissées par la boutique + remises reçues en espèces
 *                              − dépenses payées en espèces.
 */
const { nanoid } = require("nanoid");
const db = require("../db");
const moyens = require("./moyensVendeur");

const ESPECES = new Set(["Espèces", "Paiement à la livraison"]);
const OPERATEUR = { "Wave": "momo_wave", "Orange Money": "momo_orange", "MTN MoMo": "momo_mtn", "Moov Money": "momo_moov" };
const LIEN = { "Wave": "lien_wave", "Orange Money": "lien_orange", "MTN MoMo": "lien_mtn", "Moov Money": "lien_moov" };
const jourDe = (iso) => String(iso || "").slice(0, 10);
const entier = (n) => Math.round(Number(n) || 0);

function utilisateurs() { return new Map(db.prepare("SELECT id, nom, role FROM utilisateurs").all().map((u) => [u.id, u])); }
function livreurs() { return new Map(db.prepare("SELECT id, nom FROM livreurs").all().map((l) => [l.id, l])); }

/** Une ligne par commande payée (non annulée), avec la personne qui détient l'argent. */
function encaissements() {
  const users = utilisateurs(), livs = livreurs();
  const lignes = db.prepare(`SELECT v.*, c.id AS cmd_id, c.statut AS cmd_statut, c.livreur_id, c.frais_livraison, c.numero, c.montant_paye
    FROM ventes v JOIN commandes c ON c.id = v.commande_id OR (v.commande_id IS NULL AND c.vente_id = v.id)
    WHERE c.montant_paye IS NOT NULL`).all();
  const parCommande = new Map();
  for (const l of lignes) {
    const k = l.cmd_id || l.id;
    if (!parCommande.has(k)) parCommande.set(k, []);
    parCommande.get(k).push(l);
  }
  const sortie = [];
  for (const [k, ls] of parCommande) {
    const l0 = ls[0];
    // Les frais de livraison reviennent à l'entreprise de livraison : seule la part des produits est à la boutique
    const montant = Math.max(0, entier(l0.montant_paye - (Number(l0.frais_livraison) || 0)));
    const payeLe = ls.map((l) => l.paye_le || l.date_vente).sort().pop();
    const mode = l0.mode_paiement;
    const especes = ESPECES.has(mode);
    const qui = users.get(l0.encaisse_par || l0.vendeur_id);
    // Payée après la vente (paiement confirmé plus tard, à la livraison) : encaisse_par est alors renseigné
    const apresVente = Boolean(l0.encaisse_par) || (l0.paye_le && l0.date_vente && new Date(l0.paye_le) - new Date(l0.date_vente) > 120000);
    let detenteur;
    if (especes && l0.livreur_id && l0.cmd_statut === "livree" && apresVente && livs.has(l0.livreur_id)) detenteur = { type: "livreur", id: l0.livreur_id, nom: livs.get(l0.livreur_id).nom };
    // Argent versé sur le numéro personnel du vendeur : figé au moment du paiement (sur_compte_vendeur)
    else if (l0.sur_compte_vendeur && users.get(l0.vendeur_id)) detenteur = { type: "vendeur", id: l0.vendeur_id, nom: users.get(l0.vendeur_id).nom };
    else if (qui?.role === "vendeur" && especes) detenteur = { type: "vendeur", id: qui.id, nom: qui.nom };
    else if (especes) detenteur = { type: "caisse", id: null, nom: "Caisse de la boutique" };
    else detenteur = { type: "compte", id: null, nom: "Comptes de la boutique" };
    sortie.push({ commande_id: l0.cmd_id, numero: l0.numero || null, montant, mode, especes, jour: jourDe(payeLe), date: payeLe, detenteur });
  }
  return sortie;
}

const remises = (filtre = "", ...p) => db.prepare(`SELECT * FROM caisse_remises ${filtre} ORDER BY cree_le DESC`).all(...p);

/** Argent détenu par chaque vendeur et chaque livreur : encaissé − remis. */
function detenteurs(liste = encaissements()) {
  const users = utilisateurs(), livs = livreurs(), m = new Map();
  const cle = (type, id) => type + ":" + id;
  const obtenir = (type, id, nom) => { const k = cle(type, id); if (!m.has(k)) m.set(k, { type, id, nom, encaisse: 0, especes: 0, mobile: 0, remis: 0, retours: 0, depenses: 0, n: 0, dernier: null }); return m.get(k); };
  for (const e of liste) {
    if (e.detenteur.type !== "vendeur" && e.detenteur.type !== "livreur") continue;
    const o = obtenir(e.detenteur.type, e.detenteur.id, e.detenteur.nom);
    o.encaisse += e.montant; o.n += 1; if (e.especes) o.especes += e.montant; else o.mobile += e.montant;
    if (!o.dernier || e.date > o.dernier) o.dernier = e.date;
  }
  for (const e of effets().filter((x) => x.detenteur.type === "vendeur")) obtenir("vendeur", e.detenteur.id, e.detenteur.nom).retours += e.valeur;
  // Dépenses payées en espèces par un vendeur : prises sur l'argent qu'il détient
  for (const d of db.prepare("SELECT d.montant, d.auteur_id, u.nom FROM depenses d JOIN utilisateurs u ON u.id = d.auteur_id WHERE u.role = 'vendeur' AND COALESCE(d.moyen, 'Espèces') = 'Espèces'").all())
    obtenir("vendeur", d.auteur_id, d.nom).depenses += d.montant;
  for (const r of remises()) {
    const nom = r.de_type === "livreur" ? livs.get(r.de_id)?.nom : users.get(r.de_id)?.nom;
    obtenir(r.de_type, r.de_id, nom || "Inconnu").remis += r.montant;
  }
  return [...m.values()].map((o) => ({ ...o, detenu: o.encaisse + o.retours - o.remis - o.depenses })).sort((a, b) => b.detenu - a.detenu);
}

/* ---------- Retours, échanges, annulations : argent à rembourser ou à encaisser ---------- */
const reglements = (filtre = "", ...p) => db.prepare(`SELECT r.*, c.numero FROM reglements_retour r LEFT JOIN commandes c ON c.id = r.commande_id ${filtre} ORDER BY r.cree_le DESC`).all(...p);

/** Crée un règlement si la commande a déjà été payée (sinon le paiement final tient déjà compte du retour). */
function creerReglement(commandeId, difference, motif, userId) {
  const c = db.prepare("SELECT montant_paye FROM commandes WHERE id = ?").get(commandeId);
  const m = entier(Math.abs(difference));
  if (!c || c.montant_paye == null || !m) return null;
  const id = nanoid();
  db.prepare("INSERT INTO reglements_retour (id, commande_id, sens, montant, motif, statut, cree_le, cree_par) VALUES (?, ?, ?, ?, ?, 'a_regler', ?, ?)")
    .run(id, commandeId, difference > 0 ? "rembourser" : "encaisser", m, String(motif).slice(0, 200), new Date().toISOString(), userId || null);
  return id;
}

/** Effet d'un règlement sur l'argent : signe + (encaissé) ou − (remboursé), et qui le porte. */
function effets() {
  const users = utilisateurs();
  return reglements("WHERE r.statut = 'regle'").map((x) => {
    const u = users.get(x.regle_par);
    const signe = x.sens === "encaisser" ? 1 : -1;
    const detenteur = u?.role === "vendeur" ? { type: "vendeur", id: u.id, nom: u.nom } : x.moyen === "Espèces" ? { type: "caisse" } : { type: "compte" };
    return { ...x, valeur: signe * x.montant, jour: jourDe(x.regle_le), detenteur };
  });
}

function regler(id, { moyen, note }, user) {
  const x = db.prepare("SELECT * FROM reglements_retour WHERE id = ?").get(id);
  if (!x) return { erreur: "Règlement introuvable" };
  if (x.statut !== "a_regler") return { erreur: "Ce règlement est déjà traité" };
  const mo = ["Espèces", "Wave", "Orange Money", "MTN MoMo", "Moov Money"].includes(moyen) ? moyen : null;
  if (!mo) return { erreur: "Choisissez le moyen de paiement utilisé" };
  if (lireSession(jourDe(new Date().toISOString()))?.fermee_le && mo === "Espèces" && user.role === "admin") return { erreur: "La caisse du jour est fermée : réglez en espèces demain" };
  db.prepare("UPDATE reglements_retour SET statut = 'regle', moyen = ?, note = ?, regle_le = ?, regle_par = ? WHERE id = ?")
    .run(mo, String(note || "").trim().slice(0, 200) || null, new Date().toISOString(), user.id, id);
  return { ok: true };
}

/** L'administrateur peut classer un règlement sans mouvement d'argent (avoir, geste commercial…), avec une raison. */
function abandonner(id, note) {
  const x = db.prepare("SELECT * FROM reglements_retour WHERE id = ?").get(id);
  if (!x || x.statut !== "a_regler") return { erreur: "Règlement introuvable ou déjà traité" };
  const n = String(note || "").trim();
  if (n.length < 3) return { erreur: "Indiquez la raison (ex. avoir accordé au client)" };
  db.prepare("UPDATE reglements_retour SET statut = 'abandonne', note = ?, regle_le = ? WHERE id = ?").run(n.slice(0, 200), new Date().toISOString(), id);
  return { ok: true };
}

/** Règlements en attente, visibles par l'administrateur (tous) ou par le vendeur (ses commandes). */
function aRegler(user) {
  const liste = reglements("WHERE r.statut = 'a_regler'");
  if (user.role === "admin") return liste;
  return liste.filter((x) => db.prepare("SELECT 1 FROM ventes WHERE commande_id = ? AND vendeur_id = ? LIMIT 1").get(x.commande_id, user.id));
}

const lireSession = (jour) => db.prepare("SELECT * FROM caisse_sessions WHERE jour = ?").get(jour) || null;

/** Calcul de la caisse d'un jour. */
function journee(jour) {
  const liste = encaissements();
  const session = lireSession(jour);
  const duJour = liste.filter((e) => e.jour === jour);
  const especesCaisse = duJour.filter((e) => e.detenteur.type === "caisse").reduce((s, e) => s + e.montant, 0);
  const remisesJour = remises("WHERE jour = ?", jour);
  const remisesEspeces = remisesJour.filter((r) => r.moyen === "Espèces").reduce((s, r) => s + r.montant, 0);
  // Dépenses sorties de la caisse de la boutique (celles des vendeurs sont prises sur l'argent qu'ils détiennent)
  const depenses = db.prepare("SELECT d.*, u.nom AS auteur FROM depenses d LEFT JOIN utilisateurs u ON u.id = d.auteur_id WHERE d.date_depense = ? AND COALESCE(u.role, 'admin') <> 'vendeur' ORDER BY d.cree_le").all(jour);
  const depensesEspeces = depenses.filter((d) => (d.moyen || "Espèces") === "Espèces").reduce((s, d) => s + d.montant, 0);
  const effetsJour = effets().filter((x) => x.jour === jour);
  const retoursEspeces = effetsJour.filter((x) => x.detenteur.type === "caisse").reduce((s, x) => s + x.valeur, 0);
  const fond = session ? session.fond_initial : 0;
  const theorique = fond + especesCaisse + remisesEspeces - depensesEspeces + retoursEspeces;
  // Comptes de la boutique (Mobile Money, carte, en ligne) : pour information, rien à compter dans le tiroir
  const comptes = {};
  for (const e of duJour.filter((x) => x.detenteur.type === "compte")) comptes[e.mode] = (comptes[e.mode] || 0) + e.montant;
  for (const r of remisesJour.filter((x) => x.moyen !== "Espèces")) comptes[r.moyen] = (comptes[r.moyen] || 0) + r.montant;
  for (const x of effetsJour.filter((e) => e.detenteur.type === "compte")) comptes[x.moyen] = (comptes[x.moyen] || 0) + x.valeur;
  const precedente = db.prepare("SELECT * FROM caisse_sessions WHERE jour < ? AND fermee_le IS NOT NULL ORDER BY jour DESC LIMIT 1").get(jour) || null;
  return {
    jour, session, fond_suggere: precedente ? precedente.especes_comptees : 0,
    calcul: { fond, especes_caisse: especesCaisse, remises_especes: remisesEspeces, depenses_especes: depensesEspeces, retours_especes: retoursEspeces, theorique },
    a_regler: reglements("WHERE r.statut = 'a_regler'"), regles_jour: effetsJour,
    encaissements_caisse: duJour.filter((e) => e.detenteur.type === "caisse"),
    comptes, remises: remisesJour, depenses: depenses.map((d) => ({ id: d.id, libelle: d.libelle, montant: d.montant, moyen: d.moyen || "Espèces", auteur: d.auteur })),
    detenteurs: detenteurs(liste),
    historique: db.prepare("SELECT * FROM caisse_sessions ORDER BY jour DESC LIMIT 30").all(),
  };
}

function ouvrir(jour, fond, user) {
  if (lireSession(jour)) return { erreur: "La caisse de ce jour est déjà ouverte" };
  if (!(entier(fond) >= 0)) return { erreur: "Fond de caisse invalide" };
  db.prepare("INSERT INTO caisse_sessions (id, jour, fond_initial, ouverte_par, ouverte_le) VALUES (?, ?, ?, ?, ?)").run(nanoid(), jour, entier(fond), user.id, new Date().toISOString());
  return { ok: true };
}

function fermer(jour, comptees, note, user) {
  const s = lireSession(jour);
  if (!s) return { erreur: "Ouvrez d'abord la caisse de ce jour" };
  if (s.fermee_le) return { erreur: "La caisse de ce jour est déjà fermée" };
  const c = entier(comptees);
  if (!(c >= 0) || comptees === "" || comptees == null) return { erreur: "Indiquez les espèces comptées dans la caisse" };
  const { calcul } = journee(jour);
  const ecart = c - calcul.theorique;
  const n = String(note || "").trim().slice(0, 300);
  if (ecart !== 0 && n.length < 3) return { erreur: "Il y a un écart : expliquez-le dans la note avant de fermer la caisse", ecart };
  db.prepare("UPDATE caisse_sessions SET especes_comptees = ?, theorique = ?, ecart = ?, note = ?, fermee_par = ?, fermee_le = ? WHERE id = ?")
    .run(c, calcul.theorique, ecart, n || null, user.id, new Date().toISOString(), s.id);
  return { ok: true, ecart };
}

/** Remise d'argent par un vendeur ou un livreur, reçue par l'administrateur. */
function remettre({ de_type, de_id, montant, moyen, note }, user) {
  const type = de_type === "livreur" ? "livreur" : "vendeur";
  const existe = type === "livreur" ? db.prepare("SELECT id FROM livreurs WHERE id = ?").get(String(de_id || "")) : db.prepare("SELECT id FROM utilisateurs WHERE id = ? AND role = 'vendeur'").get(String(de_id || ""));
  if (!existe) return { erreur: type === "livreur" ? "Livreur introuvable" : "Vendeur introuvable" };
  const m = entier(montant);
  if (!(m > 0)) return { erreur: "Indiquez le montant remis" };
  const d = detenteurs().find((o) => o.type === type && o.id === existe.id);
  if (!d || m > d.detenu) return { erreur: `Montant supérieur à l'argent détenu (${Math.max(0, d?.detenu || 0).toLocaleString("fr-FR")} FCFA)` };
  const aujourdhui = jourDe(new Date().toISOString());
  if (lireSession(aujourdhui)?.fermee_le) return { erreur: "La caisse du jour est fermée : la remise sera enregistrée demain" };
  const mo = ["Espèces", "Wave", "Orange Money", "MTN MoMo", "Moov Money", "Virement"].includes(moyen) ? moyen : "Espèces";
  const maintenant = new Date().toISOString(), id = nanoid();
  db.prepare("INSERT INTO caisse_remises (id, jour, de_type, de_id, montant, moyen, note, recu_par, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, jourDe(maintenant), type, existe.id, m, mo, String(note || "").trim().slice(0, 200) || null, user.id, maintenant);
  return { ok: true, id };
}

function annulerRemise(id) {
  const r = db.prepare("SELECT * FROM caisse_remises WHERE id = ?").get(id);
  if (!r) return { erreur: "Remise introuvable" };
  const s = lireSession(r.jour);
  if (s?.fermee_le) return { erreur: "La caisse de ce jour est fermée : cette remise ne peut plus être annulée" };
  db.prepare("DELETE FROM caisse_remises WHERE id = ?").run(id);
  return { ok: true };
}

/** Pour un vendeur : ce qu'il a encaissé, remis, et ce qu'il détient encore. */
function situationVendeur(userId) {
  const d = detenteurs().find((o) => o.type === "vendeur" && o.id === userId);
  return { encaisse: d?.encaisse || 0, especes: d?.especes || 0, mobile: d?.mobile || 0, remis: d?.remis || 0, depenses: d?.depenses || 0, detenu: d?.detenu || 0,
    remises: remises("WHERE de_type = 'vendeur' AND de_id = ?", userId).slice(0, 10).map((r) => ({ montant: r.montant, moyen: r.moyen, cree_le: r.cree_le })) };
}

/**
 * Au moment du paiement : l'argent arrive-t-il sur le numéro personnel du vendeur ?
 * Oui si le vendeur a réglé un numéro ou un lien pour cet opérateur (Mes moyens de paiement).
 */
function marquerCompteVendeur(commandeId, vendeurId, mode) {
  if (!commandeId || !vendeurId || !OPERATEUR[mode]) return false;
  const u = db.prepare("SELECT role FROM utilisateurs WHERE id = ?").get(vendeurId);
  if (u?.role !== "vendeur") return false;
  const v = moyens.lire(vendeurId).valeurs;
  if (!v[OPERATEUR[mode]] && !v[LIEN[mode]]) return false;
  db.prepare("UPDATE ventes SET sur_compte_vendeur = 1 WHERE commande_id = ?").run(commandeId);
  return true;
}

module.exports = { creerReglement, regler, abandonner, aRegler, marquerCompteVendeur, encaissements, detenteurs, journee, ouvrir, fermer, remettre, annulerRemise, situationVendeur, lireSession };

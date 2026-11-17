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

/* ---------- Répertoire et agent Prospection ----------
   Le propriétaire ajoute ses contacts (téléphone ou fichier). Chaque jour, l'agent Prospection prépare quelques
   invitations avec le lien de la boutique ; elles partent d'une touche sur WhatsApp, depuis le téléphone du
   propriétaire (pas d'envoi automatique à des personnes qui n'ont rien demandé). */
const chiffres = (t) => String(t || "").replace(/\D/g, "");
const MESSAGE_INVITATION = "Bonjour {prenom} 👋 C'est {boutique}. Notre boutique est en ligne : vous voyez nos articles et commandez directement depuis votre téléphone : {lien}{promos}\nSi ce n'est pas pour vous, ignorez simplement ce message.";

/** Ajoute des contacts au répertoire (doublons et numéros invalides écartés). user : celui qui importe. */
function importerContacts(liste, user) {
  const contacts = Array.isArray(liste) ? liste.slice(0, 2000) : [];
  const connus = new Set(db.prepare("SELECT telephone FROM clients WHERE supprime = 0").all().map((c) => chiffres(c.telephone).slice(-8)));
  const ins = db.prepare("INSERT INTO clients (id, nom, telephone, email, statut, consentement_marketing, vendeur_id, origine, cree_le) VALUES (?, ?, ?, ?, 'Standard', 0, ?, 'repertoire', ?)");
  let ajoutes = 0, deja = 0, invalides = 0;
  db.transaction(() => {
    for (const c of contacts) {
      const tel = String(c?.telephone || "").trim().slice(0, 30), nom = String(c?.nom || "").trim().replace(/\s+/g, " ").slice(0, 80);
      if (chiffres(tel).length < 8) { invalides++; continue; }
      if (connus.has(chiffres(tel).slice(-8))) { deja++; continue; }
      connus.add(chiffres(tel).slice(-8));
      ins.run(idOuNouveau(), nom || tel, tel, String(c?.email || "").trim().slice(0, 120) || null, estAdmin(user) ? null : user.id, new Date().toISOString());
      ajoutes++;
    }
  })();
  return { ajoutes, deja, invalides };
}

// POST /api/clients/importer — { contacts: [{ nom, telephone }] } (500 au plus par envoi)
router.post("/importer", (req, res) => res.json(importerContacts(Array.isArray(req.body?.contacts) ? req.body.contacts.slice(0, 500) : [], req.user)));

/* ---------- Répertoire : accord facultatif, contacts du compte Google (adresse e-mail), rythme de prospection ---------- */
const contactsGoogle = require("../lib/contacts-google");
const urlSite = () => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");
const REDIRECTION = () => urlSite() + "/api/public/google/retour";
function regle(cle, defaut = null) {
  db.exec("CREATE TABLE IF NOT EXISTS repertoire_reglages (cle TEXT PRIMARY KEY, valeur TEXT)");
  const l = db.prepare("SELECT valeur FROM repertoire_reglages WHERE cle = ?").get(cle);
  try { return l ? JSON.parse(l.valeur) : defaut; } catch { return defaut; }
}
function ecrireRegle(cle, valeur) {
  db.exec("CREATE TABLE IF NOT EXISTS repertoire_reglages (cle TEXT PRIMARY KEY, valeur TEXT)");
  if (valeur == null) db.prepare("DELETE FROM repertoire_reglages WHERE cle = ?").run(cle);
  else db.prepare("INSERT INTO repertoire_reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(cle, JSON.stringify(valeur));
}
// Rythme choisi par le propriétaire de la boutique : jours (1 = lundi … 7 = dimanche), heures, invitations par jour
const RYTHME_DEFAUT = { jours: [1, 2, 3, 4, 5, 6], debut: 9, fin: 18, par_jour: 10 };
const rythme = () => ({ ...RYTHME_DEFAUT, ...(regle("rythme") || {}) });
const jourIso = (d) => new Date(d).toLocaleDateString("fr-CA", { timeZone: "Africa/Abidjan" });
const numeroJour = (iso) => { const d = new Date(iso + "T12:00:00Z").getUTCDay(); return d === 0 ? 7 : d; };
function fenetre(r = rythme()) {
  const aujourd = jourIso(Date.now()), h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Abidjan" }));
  if (r.jours.includes(numeroJour(aujourd)) && h >= r.debut && h < r.fin) return { ouverte: true };
  const NOMS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  for (let n = 0; n < 8; n++) {
    const jour = jourIso(Date.now() + n * 864e5);
    if (r.jours.includes(numeroJour(jour)) && (n > 0 || h < r.debut)) return { ouverte: false, reprise: `${n === 0 ? "aujourd'hui" : n === 1 ? "demain" : NOMS[numeroJour(jour)]} à ${r.debut} h` };
  }
  return { ouverte: false, reprise: "au prochain jour choisi" };
}

router.get("/repertoire", (req, res) => {
  res.json({ google: contactsGoogle.configure(), accord: regle("accord:" + req.user.id), dernier: regle("import:" + req.user.id), rythme: rythme(), fenetre: fenetre() });
});
router.put("/repertoire/rythme", (req, res) => {
  const c = req.body || {};
  const jours = [...new Set((Array.isArray(c.jours) ? c.jours : []).map(Number).filter((j) => j >= 1 && j <= 7))].sort();
  const debut = Math.round(Number(c.debut)), fin = Math.round(Number(c.fin)), parJour = Math.round(Number(c.par_jour));
  if (!jours.length) return res.status(400).json({ erreur: "Choisissez au moins un jour." });
  if (!(debut >= 0 && debut <= 23 && fin >= 1 && fin <= 24 && fin > debut)) return res.status(400).json({ erreur: "Heures : la fin doit être après le début." });
  if (!(parJour >= 1 && parJour <= 50)) return res.status(400).json({ erreur: "Entre 1 et 50 invitations par jour." });
  ecrireRegle("rythme", { jours, debut, fin, par_jour: parJour });
  res.json({ rythme: rythme(), fenetre: fenetre() });
});
// Accord facultatif puis page d'autorisation de Google (l'adresse e-mail choisit le bon compte)
router.post("/repertoire/google", (req, res) => {
  if (req.body?.accord !== true) return res.status(400).json({ erreur: "Cochez d'abord la case d'accord : l'accès au répertoire est facultatif." });
  if (!contactsGoogle.configure()) return res.status(400).json({ erreur: "L'import par Google n'est pas encore disponible sur cette plateforme. Utilisez le téléphone ou un fichier." });
  const email = String(req.body?.email || "").trim().slice(0, 120);
  ecrireRegle("accord:" + req.user.id, { le: new Date().toISOString(), email });
  const etat = contactsGoogle.nouvelleDemande({ boutique: db.espaceCourant().id, user: { id: req.user.id, role: req.user.role }, email });
  res.json({ url: contactsGoogle.urlAutorisation({ redirection: REDIRECTION(), etat, email }) });
});
router.delete("/repertoire/accord", (req, res) => { ecrireRegle("accord:" + req.user.id, null); res.json({ ok: true }); });

/** Retour de Google (route publique) : lecture unique des contacts, import dans le répertoire, accès rendu aussitôt. */
router.retourGoogle = async (req, res) => {
  const demande = contactsGoogle.reprendreDemande(req.query.state);
  if (!demande || !req.query.code) return res.redirect("/admin/#/clients?google=refuse");
  try {
    const contacts = await contactsGoogle.lireContacts({ code: String(req.query.code), redirection: REDIRECTION() });
    const r = await db.dansEspace(demande.boutique, () => {
      const res2 = importerContacts(contacts.filter((c) => c.telephone), demande.user);
      ecrireRegle("import:" + demande.user.id, { le: new Date().toISOString(), lus: contacts.length, ...res2 });
      return res2;
    });
    res.redirect(`/admin/#/clients?google=${r.ajoutes}`);
  } catch (e) { console.error("Contacts Google :", e.message); res.redirect("/admin/#/clients?google=erreur"); }
};

// GET /api/clients/prospection?par_jour=10 — invitations du jour préparées par l'agent Prospection
router.get("/prospection", (req, res) => {
  const r = rythme(), f = fenetre(r);
  const parJour = Math.min(50, Math.max(1, Number(req.query.par_jour) || r.par_jour));
  const visible = estAdmin(req.user) ? "1 = 1" : "vendeur_id = @moi";
  const base = `FROM clients WHERE supprime = 0 AND origine = 'repertoire' AND desinscrit_le IS NULL AND ${visible}`;
  const p = { moi: req.user.id };
  const debutJour = new Date(); debutJour.setHours(0, 0, 0, 0);
  const invitesAujourdhui = db.prepare(`SELECT COUNT(*) AS n ${base} AND invite_le >= @debut`).get({ ...p, debut: debutJour.toISOString() }).n;
  const ctx = require("../lib/marketing").contexte();
  const aInviter = !f.ouverte ? [] : db.prepare(`SELECT id, nom, telephone ${base} AND invite_le IS NULL ORDER BY cree_le LIMIT @n`).all({ ...p, n: Math.max(0, parJour - invitesAujourdhui) });
  res.json({
    par_jour: parJour, invites_aujourdhui: invitesAujourdhui, fenetre: f, rythme: r,
    repertoire: db.prepare(`SELECT COUNT(*) AS n ${base}`).get(p).n,
    restants: db.prepare(`SELECT COUNT(*) AS n ${base} AND invite_le IS NULL`).get(p).n,
    invites: db.prepare(`SELECT COUNT(*) AS n ${base} AND invite_le IS NOT NULL`).get(p).n,
    lien: ctx.lien,
    du_jour: aInviter.map((c) => ({ ...c, message: MESSAGE_INVITATION.replace("{prenom}", /\d/.test(c.nom) ? "" : c.nom.split(/\s+/)[0]).replace("{boutique}", ctx.boutique).replace("{lien}", ctx.lien).replace("{promos}", ctx.promos ? "\n" + ctx.promos.trim() : "").replace("Bonjour  ", "Bonjour ") })),
  });
});

// POST /api/clients/:id/invite — { passer? } : invitation envoyée (ou passée) ; le contact sort de la file du jour
router.post("/:id/invite", (req, res) => {
  const c = clientVisible(req.params.id, req.user);
  if (!c) return res.status(404).json({ erreur: "Client introuvable" });
  db.prepare("UPDATE clients SET invite_le = ? WHERE id = ?").run(new Date().toISOString(), c.id);
  res.json({ ok: true });
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

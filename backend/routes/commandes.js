const express = require("express");
const db = require("../db");
const { versIso, ajouterEvenement, urlPublique } = require("../lib/outils");
const { validerPaiement } = require("../lib/paiements");
const { envoyerSms } = require("../lib/sms");
const { lignesCommande, totalCommande, changerStatut, enregistrerPaiement, supprimerCommande, ticketCommande } = require("../lib/commandes");
const { envoyerEmail } = require("../lib/email");
const { ticketEmail } = require("../lib/ticketEmail");
const { adminOnly } = require("../middleware/auth");
const { journaliser, ACTIONS_VENDEUR } = require("../lib/tickets");
const { nanoid } = require("nanoid");
const { mouvementLots, lotsDisponibles } = require("../lib/stock");
const { prixEffectif } = require("../lib/prix");
const router = express.Router();

const STATUTS_VALIDES = ["en_attente", "confirmee", "expediee", "livree", "annulee"];

function enrichir(cmd) {
  const lignes = lignesCommande(cmd).map((v) => ({
    ...v,
    date_vente: versIso(v.date_vente),
    pack: db.prepare("SELECT id, nom, emoji, image FROM packs WHERE id = ?").get(v.pack_id),
  }));
  const vente = lignes[0] || null;
  const client = vente ? db.prepare("SELECT id, nom, telephone, ville FROM clients WHERE id = ?").get(vente.client_id) : null;
  const historique = db
    .prepare("SELECT type, statut, texte, cree_le FROM commande_evenements WHERE commande_id = ? ORDER BY cree_le")
    .all(cmd.id)
    .map((e) => ({ ...e, cree_le: versIso(e.cree_le) }));
  return {
    ...cmd,
    maj_le: versIso(cmd.maj_le),
    vente, lignes, client, pack: vente?.pack || null,
    total: totalCommande(cmd, lignes),
    historique,
  };
}
const lire = (id) => db.prepare("SELECT * FROM commandes WHERE id = ?").get(id);

// Un vendeur n'accède qu'à ses commandes : ses ventes en caisse et celles arrivées par son lien
const aMoi = (cmd, req) => req.user?.role === "admin" || lignesCommande(cmd).some((v) => v.vendeur_id === req.user?.id);
router.param("id", (req, res, next, id) => {
  const cmd = lire(id);
  if (cmd && !aMoi(cmd, req)) return res.status(403).json({ erreur: "Cette commande est suivie par un autre vendeur" });
  next();
});

// GET /api/commandes?statut=&canal=
router.get("/", (req, res) => {
  const { statut, canal } = req.query;
  let sql = "SELECT * FROM commandes WHERE 1=1";
  const params = [];
  if (statut) { sql += " AND statut = ?"; params.push(statut); }
  if (canal) { sql += " AND canal = ?"; params.push(canal); }
  sql += " ORDER BY maj_le DESC";
  res.json(db.prepare(sql).all(...params).filter((c) => aMoi(c, req)).map(enrichir));
});

// GET /api/commandes/:id
router.get("/:id", (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  res.json(enrichir(cmd));
});

// PATCH /api/commandes/:id/statut — { statut: "expediee" }
// Une annulation remet les articles en stock ; un rétablissement les retire.
/** Annuler ou rétablir une commande fait bouger le stock : seul l'administrateur le peut. */
/* Commande payée annulée : remboursement à régler ; rétablie avant règlement : il disparaît */
function suiviAnnulation(avant, apres, userId) {
  if (!avant || !apres) return;
  if (apres.statut === "annulee" && avant.statut !== "annulee" && apres.montant_paye != null) {
    // Solde : payé − déjà à rembourser/remboursé (ou avoir) + compléments encaissés ou à encaisser
    const deja = db.prepare("SELECT COALESCE(SUM(CASE WHEN sens = 'rembourser' THEN montant ELSE -montant END), 0) AS n FROM reglements_retour WHERE commande_id = ?").get(apres.id).n;
    require("../lib/caisse").creerReglement(apres.id, Number(apres.montant_paye) - (Number(apres.frais_livraison) || 0) - deja, "Commande annulée", userId);
  }
  if (avant.statut === "annulee" && apres.statut !== "annulee") db.prepare("DELETE FROM reglements_retour WHERE commande_id = ? AND motif = 'Commande annulée' AND statut = 'a_regler'").run(apres.id);
}
const dejaRembourse = (cmd, statut) => cmd?.statut === "annulee" && statut !== "annulee"
  && db.prepare("SELECT 1 FROM reglements_retour WHERE commande_id = ? AND sens = 'rembourser' AND statut <> 'a_regler' AND motif IN ('Commande annulée', 'Retour complet') LIMIT 1").get(cmd.id);
const annulationInterdite = (cmd, statut, req) => req.user?.role !== "admin" && (statut === "annulee" || cmd?.statut === "annulee");
router.patch("/:id/statut", (req, res) => {
  const { statut } = req.body;
  if (!STATUTS_VALIDES.includes(statut)) {
    return res.status(400).json({ erreur: `statut doit être l'un de : ${STATUTS_VALIDES.join(", ")}` });
  }
  if (annulationInterdite(lire(req.params.id), statut, req)) return res.status(403).json({ erreur: "Seul l'administrateur peut annuler ou rétablir une commande" });
  if (dejaRembourse(lire(req.params.id), statut)) return res.status(409).json({ erreur: "Le client a déjà été remboursé : enregistrez une nouvelle vente plutôt que de rétablir cette commande" });
  const avant = lire(req.params.id);
  const cmd = db.transaction(() => changerStatut(req.params.id, statut, req.user?.id))();
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  suiviAnnulation(avant, cmd, req.user?.id);
  res.json(enrichir(cmd));
});

// POST /api/commandes/statut — { ids: [...], statut } : action groupée
router.post("/statut", (req, res) => {
  const { ids, statut } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ erreur: "ids doit être une liste non vide" });
  if (!STATUTS_VALIDES.includes(statut)) {
    return res.status(400).json({ erreur: `statut doit être l'un de : ${STATUTS_VALIDES.join(", ")}` });
  }
  if (statut === "annulee" && req.user?.role !== "admin") return res.status(403).json({ erreur: "Seul l'administrateur peut annuler une commande" });
  const autorises = ids.map(String).filter((id) => { const c = lire(id); return c && aMoi(c, req) && !annulationInterdite(c, statut, req) && !dejaRembourse(c, statut); });
  const avants = new Map(autorises.map((id) => [id, lire(id)]));
  const modifiees = db.transaction(() => autorises.map((id) => changerStatut(id, statut, req.user?.id)).filter(Boolean))();
  for (const c of modifiees) suiviAnnulation(avants.get(c.id), c, req.user?.id);
  res.json({ modifiees: modifiees.length });
});

// PATCH /api/commandes/:id — { note?, adresse_livraison? }
router.patch("/:id", (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  const note = req.body.note !== undefined ? String(req.body.note) : cmd.note;
  const adresse = req.body.adresse_livraison !== undefined ? String(req.body.adresse_livraison) : cmd.adresse_livraison;
  db.prepare("UPDATE commandes SET note = ?, adresse_livraison = ?, maj_le = ? WHERE id = ?").run(note, adresse, new Date().toISOString(), cmd.id);
  res.json(enrichir(lire(cmd.id)));
});

// POST /api/commandes/:id/commentaires — { texte }
router.post("/:id/commentaires", (req, res) => {
  const texte = String(req.body.texte || "").trim();
  if (!texte) return res.status(400).json({ erreur: "Le commentaire est vide" });
  if (!lire(req.params.id)) return res.status(404).json({ erreur: "Commande introuvable" });
  ajouterEvenement(req.params.id, { type: "note", texte, auteurId: req.user?.id });
  res.status(201).json(enrichir(lire(req.params.id)));
});

// PATCH /api/commandes/:id/paiement — encaisse ou confirme un paiement non réglé :
// à la livraison, transfert Mobile Money déclaré par le client (à vérifier), paiement en ligne échoué…
// { mode_paiement, montant_recu?, telephone_paiement?, reference_paiement? }
router.patch("/:id/paiement", (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  if (cmd.statut === "annulee") return res.status(409).json({ erreur: "Commande annulée : rien à encaisser" });
  const lignes = lignesCommande(cmd);
  if (lignes[0]?.statut_paiement === "payee") return res.status(409).json({ erreur: "Cette commande est déjà payée" });
  // L'argent d'un transfert arrive sur le compte de la boutique : seul l'administrateur peut constater qu'il est bien reçu
  if (lignes[0]?.statut_paiement === "a_verifier" && req.user?.role !== "admin") return res.status(403).json({ erreur: "Seul l'administrateur confirme la réception d'un transfert Mobile Money" });
  const p = validerPaiement(req.body, totalCommande(cmd, lignes), { encaissement: true });
  if (p.erreur) return res.status(400).json({ erreur: p.erreur });
  const maintenant = new Date().toISOString();
  const verification = lignes[0]?.statut_paiement === "a_verifier";
  db.transaction(() => {
    enregistrerPaiement(cmd, { mode: p.mode, statut: "payee", montantRecu: p.montant_recu, reference: p.reference, telephone: p.telephone, payeLe: maintenant });
    db.prepare("UPDATE ventes SET encaisse_par = ? WHERE commande_id = ? OR id = ?").run(req.user?.id || null, cmd.id, cmd.vente_id || "");
    require("../lib/caisse").marquerCompteVendeur(cmd.id, req.user?.id, p.mode);
    ajouterEvenement(cmd.id, { type: "paiement", texte: verification ? `Paiement vérifié et confirmé (${p.mode})` : `Paiement encaissé (${p.mode})`, auteurId: req.user?.id, date: maintenant });
  })();
  res.json(enrichir(lire(cmd.id)));
});

// POST /api/commandes/:id/envoyer-recu — envoie le lien du ticket par SMS au client.
// Le lien est construit ici : PUBLIC_URL (.env) sinon l'adresse de l'interface.
router.post("/:id/envoyer-recu", async (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  const vente = lignesCommande(cmd)[0];
  const client = vente && db.prepare("SELECT * FROM clients WHERE id = ?").get(vente.client_id);
  const telephone = cmd.contact_telephone || client?.telephone;
  if (!telephone) return res.status(400).json({ erreur: "Ce client n'a pas de numéro de téléphone" });
  const lien = `${urlPublique(req)}/#/recu/${cmd.jeton_recu}`;
  const boutique = db.prepare("SELECT valeur FROM parametres WHERE cle = 'nom'").get()?.valeur || "MILANA";
  try {
    const envoi = await envoyerSms(telephone, `${boutique} : merci pour votre achat (${cmd.numero}). Votre ticket de caisse : ${lien}`);
    ajouterEvenement(cmd.id, { type: "note", texte: `Ticket envoyé par SMS au ${telephone}`, auteurId: req.user?.id });
    journaliser(cmd.id, "sms", req.user?.id, { evenement: false });
    res.json({ message: envoi?.simule ? "SMS simulé (aucun fournisseur configuré)" : "SMS envoyé", simule: !!envoi?.simule });
  } catch (e) {
    res.status(502).json({ erreur: "Envoi du SMS impossible pour le moment" });
  }
});

// POST /api/commandes/:id/envoyer-email — { email? } : ticket de caisse par e-mail au client.
// Une adresse saisie ici est aussi enregistrée sur la fiche client si elle était vide.
router.post("/:id/envoyer-email", async (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  const vente = lignesCommande(cmd)[0];
  const client = vente && db.prepare("SELECT * FROM clients WHERE id = ?").get(vente.client_id);
  const email = String(req.body.email || cmd.contact_email || client?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erreur: "Indiquez une adresse e-mail valide" });
  const { sujet, html, texte } = ticketEmail(ticketCommande(cmd), `${urlPublique(req)}/#/recu/${cmd.jeton_recu}`);
  try {
    const envoi = await envoyerEmail({ a: email, sujet, html, texte });
    if (client && !client.email) db.prepare("UPDATE clients SET email = ? WHERE id = ?").run(email, client.id);
    journaliser(cmd.id, "email", req.user?.id, { evenement: false });
    ajouterEvenement(cmd.id, { type: "note", texte: `Ticket envoyé par e-mail à ${email}${envoi?.simule ? " (simulé : aucun serveur e-mail configuré)" : ""}`, auteurId: req.user?.id });
    res.json({ message: envoi?.simule ? "E-mail simulé (aucun serveur e-mail configuré)" : "E-mail envoyé", simule: !!envoi?.simule, email });
  } catch (e) {
    console.error("E-mail ticket :", e.message);
    res.status(502).json({ erreur: "Envoi de l'e-mail impossible : vérifiez les réglages SMTP du serveur" });
  }
});

/* ------------------------------------------------------------ livraisons */
const dateOuNull = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const livreurValide = (id) => (id ? db.prepare("SELECT id, nom FROM livreurs WHERE id = ? AND supprime = 0").get(String(id)) : null);

// PATCH /api/commandes/:id/livraison — { livraison?, livreur_id?, livraison_prevue?, adresse_livraison? }
router.patch("/:id/livraison", (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  const c = { ...cmd };
  if (req.body.livraison !== undefined) c.livraison = req.body.livraison ? 1 : 0;
  if (req.body.livreur_id !== undefined) {
    const l = livreurValide(req.body.livreur_id);
    if (req.body.livreur_id && !l) return res.status(400).json({ erreur: "Livreur introuvable" });
    c.livreur_id = l?.id || null;
    if (l) c.livraison = 1;
    if ((cmd.livreur_id || null) !== c.livreur_id) ajouterEvenement(cmd.id, { type: "note", texte: l ? `Livraison confiée à ${l.nom}` : "Livreur retiré", auteurId: req.user?.id });
  }
  if (req.body.livraison_prevue !== undefined) c.livraison_prevue = dateOuNull(req.body.livraison_prevue);
  if (req.body.adresse_livraison !== undefined) c.adresse_livraison = String(req.body.adresse_livraison).slice(0, 200);
  db.prepare("UPDATE commandes SET livraison = ?, livreur_id = ?, livraison_prevue = ?, adresse_livraison = ?, maj_le = ? WHERE id = ?")
    .run(c.livraison, c.livreur_id, c.livraison_prevue, c.adresse_livraison, new Date().toISOString(), cmd.id);
  res.json(enrichir(lire(cmd.id)));
});

// POST /api/commandes/livraison/affecter — { ids, livreur_id, livraison_prevue? } : confie plusieurs colis à un livreur
router.post("/livraison/affecter", (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const l = livreurValide(req.body.livreur_id);
  if (!ids.length) return res.status(400).json({ erreur: "ids doit être une liste non vide" });
  if (req.body.livreur_id && !l) return res.status(400).json({ erreur: "Livreur introuvable" });
  const prevue = dateOuNull(req.body.livraison_prevue);
  let n = 0;
  db.transaction(() => {
    for (const id of ids) {
      const cmd = lire(id);
      if (!cmd || !aMoi(cmd, req)) continue;
      db.prepare("UPDATE commandes SET livraison = 1, livreur_id = ?, livraison_prevue = COALESCE(?, livraison_prevue), maj_le = ? WHERE id = ?").run(l?.id || null, prevue, new Date().toISOString(), id);
      if ((cmd.livreur_id || null) !== (l?.id || null)) ajouterEvenement(id, { type: "note", texte: l ? `Livraison confiée à ${l.nom}` : "Livreur retiré", auteurId: req.user?.id });
      n++;
    }
  })();
  res.json({ modifiees: n });
});

// POST /api/commandes/:id/echec-livraison — { motif } : le client était absent, injoignable…
// Le colis revient à la boutique (statut « confirmée ») ; la tentative est comptée.
router.post("/:id/echec-livraison", (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  if (["livree", "annulee"].includes(cmd.statut)) return res.status(409).json({ erreur: "Cette commande n'est plus en cours de livraison" });
  const motif = String(req.body.motif || "").trim().slice(0, 200) || "Livraison non aboutie";
  db.transaction(() => {
    db.prepare("UPDATE commandes SET livraison_tentatives = livraison_tentatives + 1 WHERE id = ?").run(cmd.id);
    changerStatut(cmd.id, "confirmee", req.user?.id, `Échec de livraison : ${motif}`);
    if (cmd.statut === "confirmee") ajouterEvenement(cmd.id, { type: "note", texte: `Échec de livraison : ${motif}`, auteurId: req.user?.id });
  })();
  res.json(enrichir(lire(cmd.id)));
});

// POST /api/commandes/:id/ticket — { action: imprime | pdf | whatsapp | lien } : le vendeur déclare
// ce qu'il a fait du ticket. Une vente dont le ticket n'a jamais été remis reste signalée à l'administrateur.
router.post("/:id/ticket", (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  if (!ACTIONS_VENDEUR.includes(req.body.action)) return res.status(400).json({ erreur: `action doit être l'une de : ${ACTIONS_VENDEUR.join(", ")}` });
  db.transaction(() => journaliser(cmd.id, req.body.action, req.user?.id))();
  res.json(enrichir(lire(cmd.id)));
});

// DELETE /api/commandes/:id — supprime la commande et ses lignes ; le stock est
// réintégré sauf si la commande était déjà annulée.
// GET /api/commandes/:id/retours — articles retournés sur cette commande
router.get("/:id/retours", (req, res) => {
  const noms = new Map(db.prepare("SELECT id, nom FROM packs").all().map((p) => [p.id, p.nom]));
  res.json(db.prepare("SELECT * FROM retours WHERE commande_id = ? ORDER BY cree_le DESC").all(req.params.id)
    .map((r) => ({ ...r, article: noms.get(r.pack_id) || "Article", echange_article: r.echange_pack_id ? noms.get(r.echange_pack_id) || "Article" : null })));
});

/*
 * POST /api/commandes/:id/retour — le client rend un article après la vente.
 * { vente_id, quantite, motif: "retractation" | "echange", echange_pack_id?, remettre_en_stock?, note? }
 *  - rétractation : l'article sort de la commande, le montant est à rembourser ;
 *  - échange : l'article est remplacé par un autre, la différence de prix est à rembourser ou à encaisser.
 * Le total, le ticket de caisse et le stock sont mis à jour ; le retour est tracé dans la chronologie.
 */
router.post("/:id/retour", (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  if (cmd.statut === "annulee") return res.status(400).json({ erreur: "Cette commande est annulée" });
  const lignes = lignesCommande(cmd);
  // Retour complet (tous les articles rendus, par exemple après la livraison) : la commande passe en « annulée »,
  // les articles reviennent en stock et le montant est à rembourser.
  const unique = lignes.length === 1 && lignes[0].id === req.body.vente_id && Math.round(Number(req.body.quantite)) === lignes[0].quantite && req.body.motif !== "echange";
  if (req.body.tout === true || unique) {
    if (!lignes.length) return res.status(400).json({ erreur: "Cette commande n'a plus d'article" });
    const remis = req.body.remettre_en_stock !== false;
    const remarque = String(req.body.note || "").trim().slice(0, 300) || null;
    const total = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
    const nb = lignes.reduce((s, l) => s + l.quantite, 0);
    db.transaction(() => {
      for (const l of lignes) {
        if (remis) mouvementLots(l.pack_id, +l.quantite, "retour", { reference: cmd.numero, auteurId: req.user?.id, note: remarque });
        db.prepare("INSERT INTO retours (id, commande_id, pack_id, quantite, motif, montant, echange_pack_id, echange_montant, difference, remis_en_stock, note, auteur_id, cree_le) VALUES (?, ?, ?, ?, 'retractation', ?, NULL, 0, ?, ?, ?, ?, ?)")
          .run(nanoid(), cmd.id, l.pack_id, l.quantite, l.quantite * l.prix_unitaire, l.quantite * l.prix_unitaire, remis ? 1 : 0, remarque, req.user?.id || null, new Date().toISOString());
      }
      db.prepare("UPDATE commandes SET statut = 'annulee', maj_le = ? WHERE id = ?").run(new Date().toISOString(), cmd.id);
      ajouterEvenement(cmd.id, { type: "statut", statut: "annulee", auteurId: req.user?.id });
      ajouterEvenement(cmd.id, { type: "note", auteurId: req.user?.id, texte: `Retour complet${cmd.statut === "livree" ? " après livraison" : ""} : ${nb} article(s) rendu(s) — ${Math.round(total).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} FCFA à rembourser au client.${remis ? " Articles remis en stock." : " Articles non remis en stock."}${remarque ? " " + remarque : ""}` });
    })();
    require("../lib/caisse").creerReglement(cmd.id, total, "Retour complet", req.user?.id); // les frais de livraison se règlent avec le livreur
    return res.status(201).json({ commande: enrichir(lire(cmd.id)), difference: total, complet: true });
  }
  const ligne = lignes.find((l) => l.id === req.body.vente_id);
  if (!ligne) return res.status(400).json({ erreur: "Choisissez l'article retourné" });
  const q = Math.round(Number(req.body.quantite) || 0);
  if (!(q >= 1 && q <= ligne.quantite)) return res.status(400).json({ erreur: `Quantité retournée invalide (1 à ${ligne.quantite})` });
  const motif = req.body.motif === "echange" ? "echange" : "retractation";
  if (motif === "retractation" && lignes.length === 1 && q === ligne.quantite) return res.status(400).json({ erreur: "Tous les articles sont retournés : annulez plutôt la commande." });
  const nouveau = motif === "echange" ? db.prepare("SELECT * FROM packs WHERE id = ? AND supprime = 0").get(String(req.body.echange_pack_id || "")) : null;
  if (motif === "echange" && !nouveau) return res.status(400).json({ erreur: "Choisissez l'article donné en échange" });
  if (nouveau && lotsDisponibles(nouveau) < q && nouveau.id !== ligne.pack_id) return res.status(400).json({ erreur: `Stock insuffisant pour ${nouveau.nom} (${lotsDisponibles(nouveau)} disponible)` });
  const remettre = req.body.remettre_en_stock !== false;
  const note = String(req.body.note || "").trim().slice(0, 300) || null;
  const nomRendu = db.prepare("SELECT nom FROM packs WHERE id = ?").get(ligne.pack_id)?.nom || "Article";
  const montant = q * ligne.prix_unitaire;
  const prixNouveau = nouveau ? prixEffectif(nouveau) : 0;
  const montantEchange = q * prixNouveau;
  const difference = montant - montantEchange;

  db.transaction(() => {
    // L'article rendu sort de la commande…
    if (q === ligne.quantite && nouveau) {
      db.prepare("UPDATE ventes SET pack_id = ?, prix_unitaire = ?, prix_catalogue = ? WHERE id = ?").run(nouveau.id, prixNouveau, nouveau.prix, ligne.id);
    } else if (q === ligne.quantite) {
      if (cmd.vente_id === ligne.id) db.prepare("UPDATE commandes SET vente_id = ? WHERE id = ?").run(lignes.find((l) => l.id !== ligne.id).id, cmd.id);
      db.prepare("DELETE FROM ventes WHERE id = ?").run(ligne.id);
    } else {
      db.prepare("UPDATE ventes SET quantite = quantite - ? WHERE id = ?").run(q, ligne.id);
      if (nouveau) { // … et l'article d'échange y entre, sur une nouvelle ligne
        const copie = { ...ligne, id: nanoid(), pack_id: nouveau.id, quantite: q, prix_unitaire: prixNouveau, prix_catalogue: nouveau.prix, cout_unitaire: nouveau.cout ?? null };
        const cols = Object.keys(copie);
        db.prepare(`INSERT INTO ventes (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...cols.map((k) => copie[k]));
      }
    }
    if (remettre) mouvementLots(ligne.pack_id, +q, "retour", { reference: cmd.numero, auteurId: req.user?.id, note });
    if (nouveau) mouvementLots(nouveau.id, -q, "vente", { reference: cmd.numero, auteurId: req.user?.id, note: "Échange" });
    db.prepare("INSERT INTO retours (id, commande_id, pack_id, quantite, motif, montant, echange_pack_id, echange_montant, difference, remis_en_stock, note, auteur_id, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(nanoid(), cmd.id, ligne.pack_id, q, motif, montant, nouveau?.id || null, montantEchange, difference, remettre ? 1 : 0, note, req.user?.id || null, new Date().toISOString());
    db.prepare("UPDATE commandes SET maj_le = ? WHERE id = ?").run(new Date().toISOString(), cmd.id);
    const f = (n) => Math.round(Math.abs(n)).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ") + " FCFA";
    const suite = difference > 0 ? `${f(difference)} à rembourser au client` : difference < 0 ? `complément de ${f(difference)} à encaisser` : "sans différence de prix";
    ajouterEvenement(cmd.id, { type: "note", auteurId: req.user?.id, texte: motif === "echange"
      ? `Échange : ${q} × ${nomRendu} rendu contre ${q} × ${nouveau.nom} — ${suite}.${remettre ? "" : " Article rendu non remis en stock."}${note ? " " + note : ""}`
      : `Retour (rétractation) : ${q} × ${nomRendu} — ${suite}.${remettre ? " Remis en stock." : " Non remis en stock."}${note ? " " + note : ""}` });
  })();
  require("../lib/caisse").creerReglement(cmd.id, difference, motif === "echange" ? "Échange" : "Retour d'article", req.user?.id);
  res.status(201).json({ commande: enrichir(lire(cmd.id)), difference });
});

// POST /api/commandes/:id/lien-livreur { nouveau? } — lien du colis à envoyer au livreur
router.post("/:id/lien-livreur", (req, res) => {
  const c = lire(req.params.id);
  if (!c || !aMoi(c, req)) return res.status(404).json({ erreur: "Commande introuvable" });
  const r = require("../lib/suivi").lienColis(c.id, req.body?.nouveau === true);
  res.status(r.erreur ? 400 : 200).json(r);
});

router.delete("/:id", adminOnly, (req, res) => {
  const cmd = lire(req.params.id);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  db.transaction(() => supprimerCommande(cmd, req.user?.id))();
  res.status(204).send();
});

module.exports = router;

/**
 * Boutique en ligne — API publique (sans connexion) utilisée par le site client.
 *
 * La plateforme réunit les boutiques de tous les administrateurs : la page
 * d'accueil présente tous leurs produits, chaque commande concerne UNE boutique.
 *
 *   GET  /api/boutique/boutiques               toutes les boutiques (informations, livraison, paiements)
 *   GET  /api/boutique/config?boutique=        une boutique (identifiant ou adresse courte)
 *   GET  /api/boutique/produits[?boutique=]    catalogue : toutes les boutiques, ou une seule
 *   POST /api/boutique/commandes               passer commande { boutique, vendeur?, … } (prix et stock vérifiés ici)
 *   GET  /api/boutique/commandes/:jeton        suivi de commande + ticket
 *   POST /api/boutique/paiements/cinetpay/notification   webhook CinetPay
 *
 * Paiements proposés :
 *   - livraison : le client paie le livreur ; la commande reste « à encaisser »
 *   - transfert : le client envoie l'argent sur un numéro Mobile Money de la boutique
 *                 et saisit l'ID de transaction ; la boutique vérifie puis confirme
 *   - en_ligne  : CinetPay (si les clés sont configurées), confirmé automatiquement
 */
const express = require("express");
const crypto = require("crypto");
const { nanoid } = require("nanoid");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { normTel, prochainNumero, ajouterEvenement, versIso, urlPublique } = require("../lib/outils");
const { lireBoutique } = require("./parametres");
const { lignesCommande, totalCommande, changerStatut, enregistrerPaiement, ticketCommande, nomCourt } = require("../lib/commandes");
const cinetpay = require("../lib/cinetpay");
const { envoyerEmail } = require("../lib/email");
const { ticketEmail } = require("../lib/ticketEmail");
const { mouvement } = require("../lib/stock");
const { genererTicket, journaliser } = require("../lib/tickets");
const { prixEffectif, promoActive, remisePourcent } = require("../lib/prix");
const diagnostic = require("../lib/diagnostic");
const router = express.Router();

const OPERATEURS = [
  { cle: "momo_orange", lien: "lien_orange", mode: "Orange Money" },
  { cle: "momo_mtn", lien: "lien_mtn", mode: "MTN MoMo" },
  { cle: "momo_moov", lien: "lien_moov", mode: "Moov Money" },
  { cle: "momo_wave", lien: "lien_wave", mode: "Wave" },
];
const MAX_LIGNES = 30;
const MAX_QTE = 50;
const DELAI_ABANDON_MIN = 60; // paiement en ligne non finalisé → commande annulée, stock libéré

/* Espace concerné par une requête publique : paramètre « boutique » (identifiant ou
   adresse courte) ; s'il n'existe qu'une boutique sur la plateforme, c'est elle. */
function espacePublic(req, res, next) {
  const ref = req.query.boutique || req.body?.boutique;
  const toutes = db.listerBoutiques();
  const b = ref ? db.boutiqueParRef(ref) : toutes.length === 1 ? toutes[0] : null;
  if (!b) return res.status(ref ? 404 : 400).json({ erreur: ref ? "Boutique introuvable" : "Précisez la boutique" });
  db.dansEspace(b.id, next);
}
/* Espace auquel appartient un jeton public (commande, désinscription, transaction) */
const espaceParJeton = (chercher) => (req, res, next) => {
  const b = db.trouverEspace(() => chercher(req));
  if (!b) return res.status(404).json({ erreur: "Lien invalide ou expiré" });
  db.dansEspace(b.id, next);
};

function configPublique() {
  const b = lireBoutique();
  const espace = db.espaceCourant();
  const frais = Math.max(0, Math.round(Number(b.frais_livraison) || 0));
  const gratuite = Math.max(0, Math.round(Number(b.livraison_gratuite_des) || 0));
  return {
    id: espace.id, slug: espace.slug,
    boutique: { nom: b.nom, slogan: b.slogan, adresse: b.adresse, telephone: b.telephone, whatsapp: b.whatsapp, message: b.message },
    ouverte: b.boutique_ouverte !== "0",
    livraison: { frais, gratuite_des: gratuite, zone: b.zone_livraison },
    paiements: {
      livraison: true,
      // Un opérateur est proposé dès que la boutique a renseigné son numéro ou son lien de paiement
      transfert: OPERATEURS.filter((o) => String(b[o.cle] || "").trim() || String(b[o.lien] || "").trim()).map((o) => ({ mode: o.mode, numero: String(b[o.cle] || "").trim(), lien: String(b[o.lien] || "").trim(), titulaire: b.momo_titulaire || b.nom })),
      en_ligne: cinetpay.estConfigure(),
      en_ligne_test: cinetpay.estConfigure() && cinetpay.estBacASable(),
    },
  };
}
const fraisPour = (st, cfg) => (cfg.livraison.gratuite_des > 0 && st >= cfg.livraison.gratuite_des ? 0 : cfg.livraison.frais);

function produitsPublics() {
  const vendus = new Map(db.prepare(
    `SELECT v.pack_id, SUM(v.quantite) AS n FROM ventes v LEFT JOIN commandes c ON c.id = v.commande_id
     WHERE COALESCE(c.statut, '') <> 'annulee' GROUP BY v.pack_id`
  ).all().map((r) => [r.pack_id, r.n]));
  const espace = db.espaceCourant();
  const nomBoutique = lireBoutique().nom;
  return db.prepare("SELECT * FROM packs WHERE supprime = 0 AND actif = 1 ORDER BY cree_le DESC").all().map((p) => ({
    // cle : identifiant unique sur toute la plateforme (deux boutiques peuvent avoir le même id de produit)
    cle: espace.id + "." + p.id, boutique_id: espace.id, boutique_slug: espace.slug, boutique_nom: nomBoutique,
    id: p.id, nom: p.nom, description: p.description || "", image: p.image, emoji: p.emoji, teinte: p.teinte,
    // Prix appliqué (promotion comprise) et prix normal barré pendant une promotion
    prix: prixEffectif(p), prix_normal: promoActive(p) ? p.prix : null, remise: remisePourcent(p), promo_fin: promoActive(p) ? p.promo_fin : null,
    contenu: String(p.contenu || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
    categorie: p.categorie || null, pieces_par_lot: Math.max(1, Number(p.pieces_par_lot) || 1),
    stock: Math.max(0, p.stock), disponible: p.stock > 0, ventes: vendus.get(p.id) || 0, cree_le: versIso(p.cree_le),
  }));
}

const lireParJeton = (jeton) => (/^[A-Za-z0-9_-]{16,64}$/.test(String(jeton)) ? db.prepare("SELECT * FROM commandes WHERE jeton_recu = ?").get(String(jeton)) : null);

/* ---------------------------------------------------------------- lecture */

router.get("/boutiques", (req, res) => res.json(db.pourChaqueEspace(() => configPublique())));

router.get("/config", espacePublic, (req, res) => res.json(configPublique()));

// Catalogue de la plateforme : les produits de toutes les boutiques ouvertes, les plus récents d'abord
router.get("/produits", (req, res) => {
  if (req.query.boutique) return espacePublic(req, res, () => res.json(produitsPublics()));
  res.json(db.pourChaqueEspace(() => produitsPublics()).flat().sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le))));
});

/* ---------------------------------------------------------------- commande */

const limiteCommandes = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { erreur: "Trop de commandes depuis cette connexion, réessayez dans quelques minutes." } });

function validerClient(c = {}, exigerEmail) {
  const client = {
    nom: String(c.nom || "").trim().replace(/\s+/g, " ").slice(0, 80),
    telephone: String(c.telephone || "").trim().slice(0, 30),
    email: String(c.email || "").trim().toLowerCase().slice(0, 120),
    adresse: String(c.adresse || "").trim().slice(0, 200),
    ville: String(c.ville || "").trim().slice(0, 80),
    instructions: String(c.instructions || "").trim().slice(0, 300),
    consentement: c.consentement === true, // accord explicite pour recevoir promotions et nouveautés
  };
  if (client.nom.length < 2) return { erreur: "Indiquez votre nom complet." };
  if (normTel(client.telephone).replace(/\D/g, "").length < 8) return { erreur: "Indiquez un numéro de téléphone valide." };
  if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) return { erreur: "Adresse e-mail invalide." };
  if (exigerEmail && !client.email) return { erreur: "L'adresse e-mail est obligatoire pour le paiement en ligne (reçu de l'opérateur)." };
  if (client.adresse.length < 3) return { erreur: "Indiquez l'adresse de livraison (quartier, rue, repère)." };
  return { client };
}

function trouverOuCreerClient(c) {
  const tel = normTel(c.telephone).replace(/\D/g, "");
  const existant = db.prepare("SELECT * FROM clients WHERE supprime = 0").all().find((x) => normTel(x.telephone).replace(/\D/g, "") === tel);
  if (existant) {
    db.prepare("UPDATE clients SET email = COALESCE(NULLIF(email, ''), ?), ville = COALESCE(NULLIF(ville, ''), ?) WHERE id = ?")
      .run(c.email || null, c.ville || null, existant.id);
    // Le dernier choix du client fait foi (il peut accepter ou refuser à chaque commande)
    db.prepare("UPDATE clients SET consentement_marketing = ?, desinscrit_le = CASE WHEN ? = 0 AND consentement_marketing = 1 THEN ? ELSE desinscrit_le END WHERE id = ?")
      .run(c.consentement ? 1 : 0, c.consentement ? 1 : 0, new Date().toISOString(), existant.id);
    return existant.id;
  }
  const id = nanoid();
  db.prepare("INSERT INTO clients (id, nom, telephone, email, ville, statut, notes, consentement_marketing, cree_le) VALUES (?, ?, ?, ?, ?, 'Standard', ?, ?, ?)")
    .run(id, c.nom, c.telephone, c.email || null, c.ville || null, "Client inscrit via la boutique en ligne", c.consentement ? 1 : 0, new Date().toISOString());
  return id;
}

/* ---------------------------------------------------------------- diagnostic capillaire */

const limiteDiagnostics = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { erreur: "Trop de diagnostics depuis cette connexion, réessayez dans quelques minutes." } });
const lireDiagnostic = (ref) => (/^DX-[A-Z0-9]{8}$/.test(String(ref)) ? db.prepare("SELECT * FROM diagnostics WHERE reference = ?").get(String(ref)) : null);
const remiseValable = (d) => Boolean(d) && !d.remise_utilisee_le && Date.now() - new Date(d.cree_le).getTime() < diagnostic.VALIDITE_REMISE_JOURS * 864e5;

/** Ce que le client voit de son diagnostic : bilan, routine et produits recommandés avec leur prix du moment. */
function vueDiagnostic(d) {
  const r = JSON.parse(d.resultat);
  const espace = db.espaceCourant();
  const valable = remiseValable(d);
  const produits = (r.recommandes || []).map((x) => {
    const p = db.prepare("SELECT * FROM packs WHERE id = ? AND supprime = 0 AND actif = 1").get(x.pack_id);
    return p && { cle: espace.id + "." + p.id, id: p.id, nom: p.nom, image: p.image, emoji: p.emoji, teinte: p.teinte, prix: prixEffectif(p), prix_routine: diagnostic.prixRoutine(p), disponible: p.stock > 0, usage: x.usage, detail: x.detail };
  }).filter(Boolean);
  const b = lireBoutique();
  const numero = String(b.whatsapp || b.telephone || "").replace(/\D/g, "");
  const message = `Bonjour ${b.nom}, je viens de faire mon diagnostic capillaire (réf. ${d.reference}, score ${d.score}/100). J'aimerais être accompagné(e).`;
  return {
    reference: d.reference, cree_le: d.cree_le, prenom: d.prenom, boutique_id: espace.id,
    scores: r.scores, global: r.global, gravite: r.gravite, porosite: r.porosite,
    objectif_principal: r.objectif_principal, objectif_secondaire: r.objectif_secondaire,
    causes: r.causes, habitudes: r.habitudes, erreurs: r.erreurs, routine: r.routine, delai: r.delai,
    produits,
    remise: { pourcent: Math.round(diagnostic.REMISE_ROUTINE * 100), valable, jours: diagnostic.VALIDITE_REMISE_JOURS },
    whatsapp: numero.length >= 8 ? `https://wa.me/${numero.length <= 10 ? "225" + numero : numero}?text=${encodeURIComponent(message)}` : null,
  };
}

// POST /api/boutique/diagnostic { boutique?, personne: { prenom, nom, telephone, ville, email?, sexe?, age?, consentement }, reponses }
router.post("/diagnostic", limiteDiagnostics, espacePublic, (req, res) => {
  const p = req.body.personne || {};
  const personne = {
    prenom: String(p.prenom || "").trim().replace(/\s+/g, " ").slice(0, 40), nom: String(p.nom || "").trim().replace(/\s+/g, " ").slice(0, 40),
    telephone: String(p.telephone || "").trim().slice(0, 30), email: String(p.email || "").trim().toLowerCase().slice(0, 120),
    ville: String(p.ville || "").trim().slice(0, 80), sexe: ["femme", "homme"].includes(p.sexe) ? p.sexe : null,
    age: Number(p.age) >= 5 && Number(p.age) <= 110 ? Math.round(Number(p.age)) : null, consentement: p.consentement === true,
  };
  if (personne.prenom.length < 2 || personne.nom.length < 2) return res.status(400).json({ erreur: "Indiquez votre prénom et votre nom." });
  if (normTel(personne.telephone).replace(/\D/g, "").length < 8) return res.status(400).json({ erreur: "Indiquez un numéro de téléphone valide." });
  if (personne.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personne.email)) return res.status(400).json({ erreur: "Adresse e-mail invalide." });
  if (personne.ville.length < 2) return res.status(400).json({ erreur: "Indiquez votre ville." });
  const v = diagnostic.lireReponses(req.body.reponses);
  if (v.erreur) return res.status(400).json({ erreur: v.erreur });

  const produits = db.prepare("SELECT * FROM packs WHERE supprime = 0 AND actif = 1 ORDER BY cree_le DESC").all();
  const resultat = diagnostic.analyser(v.reponses, produits);
  const id = nanoid(), reference = diagnostic.nouvelleReference(), maintenant = new Date().toISOString();
  db.transaction(() => {
    // La fiche client est créée (ou complétée) automatiquement, avec le bilan en note
    const clientId = trouverOuCreerClient({ nom: `${personne.prenom} ${personne.nom}`, telephone: personne.telephone, email: personne.email, ville: personne.ville, consentement: personne.consentement });
    db.prepare("UPDATE clients SET notes = TRIM(COALESCE(notes, '') || char(10) || ?) WHERE id = ?")
      .run(`Diagnostic ${reference} du ${maintenant.slice(0, 10)} : score ${resultat.global}/100, gravité ${resultat.gravite.toLowerCase()}. ${resultat.objectif_principal}.`, clientId);
    db.prepare(
      `INSERT INTO diagnostics (id, reference, client_id, prenom, nom, telephone, email, ville, sexe, age, reponses, resultat, score, gravite, cree_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, reference, clientId, personne.prenom, personne.nom, personne.telephone, personne.email || null, personne.ville, personne.sexe, personne.age,
      JSON.stringify(v.reponses), JSON.stringify(resultat), resultat.global, resultat.gravite, maintenant);
  })();
  res.status(201).json(vueDiagnostic(db.prepare("SELECT * FROM diagnostics WHERE id = ?").get(id)));
});

// GET /api/boutique/diagnostic/:reference — le client retrouve son bilan (la référence fait office de clé)
router.get("/diagnostic/:reference", espaceParJeton((req) => lireDiagnostic(req.params.reference)), (req, res) => {
  res.json(vueDiagnostic(lireDiagnostic(req.params.reference)));
});

/* ---------------------------------------------------------------- commande (suite) */

router.post("/commandes", limiteCommandes, espacePublic, async (req, res) => {
  const cfg = configPublique();
  // Commande arrivée par le lien de promotion d'un vendeur : elle lui est attribuée
  const vendeurId = req.body.vendeur ? db.prepare("SELECT id FROM utilisateurs WHERE id = ? AND actif = 1").get(String(req.body.vendeur))?.id || null : null;
  if (!cfg.ouverte) return res.status(403).json({ erreur: "La boutique n'accepte pas de commandes en ligne pour le moment." });

  // Lignes : regroupées par produit, quantités entières
  const brutes = Array.isArray(req.body.lignes) ? req.body.lignes : [];
  const qtes = new Map();
  for (const l of brutes) {
    const q = Math.round(Number(l?.quantite));
    if (!l?.pack_id || !Number.isFinite(q) || q < 1) continue;
    qtes.set(String(l.pack_id), Math.min(MAX_QTE, (qtes.get(String(l.pack_id)) || 0) + q));
  }
  if (qtes.size === 0) return res.status(400).json({ erreur: "Votre panier est vide." });
  if (qtes.size > MAX_LIGNES) return res.status(400).json({ erreur: `${MAX_LIGNES} produits différents au maximum par commande.` });

  // Prix et stock lus en base : le navigateur n'a jamais le dernier mot
  const lignes = [];
  const indisponibles = [];
  for (const [packId, q] of qtes) {
    const p = db.prepare("SELECT * FROM packs WHERE id = ? AND supprime = 0 AND actif = 1").get(packId);
    if (!p) { indisponibles.push({ pack_id: packId, nom: "Produit retiré", disponible: 0 }); continue; }
    if (p.stock < q) { indisponibles.push({ pack_id: p.id, nom: p.nom, disponible: Math.max(0, p.stock) }); continue; }
    lignes.push({ pack: p, quantite: q });
  }
  if (indisponibles.length) {
    return res.status(409).json({ erreur: "Certains articles ne sont plus disponibles en quantité suffisante.", indisponibles });
  }

  const paiement = req.body.paiement || {};
  const modePaiement = ["livraison", "transfert", "en_ligne"].includes(paiement.mode) ? paiement.mode : null;
  if (!modePaiement) return res.status(400).json({ erreur: "Choisissez un mode de paiement." });

  const v = validerClient(req.body.client, modePaiement === "en_ligne");
  if (v.erreur) return res.status(400).json({ erreur: v.erreur });
  const client = v.client;

  // Remise « routine » : -15 % sur les produits recommandés par le diagnostic du client (une commande, 30 jours)
  const diag = req.body.diagnostic ? lireDiagnostic(req.body.diagnostic) : null;
  const routine = remiseValable(diag) ? new Set((JSON.parse(diag.resultat).recommandes || []).map((x) => x.pack_id)) : new Set();
  for (const l of lignes) l.prix = routine.has(l.pack.id) ? diagnostic.prixRoutine(l.pack) : prixEffectif(l.pack);
  const avecRemise = lignes.some((l) => routine.has(l.pack.id));
  const sousTotal = lignes.reduce((s, l) => s + l.quantite * l.prix, 0);
  const frais = fraisPour(sousTotal, cfg);
  const total = sousTotal + frais;

  let champsPaiement;
  if (modePaiement === "livraison") {
    champsPaiement = { mode: "Paiement à la livraison", statut: "en_attente" };
  } else if (modePaiement === "transfert") {
    const op = cfg.paiements.transfert.find((o) => o.mode === paiement.operateur);
    if (!op) return res.status(400).json({ erreur: "Opérateur Mobile Money non disponible." });
    const ref = String(paiement.reference || "").trim().slice(0, 60);
    const telPayeur = String(paiement.telephone || "").trim().slice(0, 30);
    if (normTel(telPayeur).replace(/\D/g, "").length < 8) return res.status(400).json({ erreur: `Indiquez le numéro ${op.mode} qui a envoyé le paiement.` });
    if (ref.length < 4) return res.status(400).json({ erreur: "Indiquez l'ID de transaction reçu par SMS après votre transfert." });
    if (db.prepare("SELECT 1 FROM ventes WHERE lower(reference_paiement) = lower(?) LIMIT 1").get(ref)) return res.status(409).json({ erreur: "Cet ID de transaction a déjà été utilisé pour une autre commande." });
    champsPaiement = { mode: op.mode, statut: "a_verifier", reference: ref, telephone: telPayeur };
  } else {
    if (!cfg.paiements.en_ligne) return res.status(400).json({ erreur: "Le paiement en ligne n'est pas disponible." });
    if (total < 100 || total > 2500000) return res.status(400).json({ erreur: "Le paiement en ligne accepte les montants de 100 à 2 500 000 FCFA." });
    champsPaiement = { mode: "Paiement en ligne", statut: "en_cours" };
  }

  // Création de la commande (transaction : tout ou rien)
  const commandeId = nanoid();
  const jeton = nanoid(24);
  const maintenant = new Date().toISOString();
  let numero;
  try {
    db.transaction(() => {
      const clientId = trouverOuCreerClient(client);
      numero = prochainNumero();
      const venteIds = [];
      const insVente = db.prepare(
        `INSERT INTO ventes (id, commande_id, client_id, pack_id, vendeur_id, quantite, prix_unitaire, mode_paiement, statut_paiement,
           reference_paiement, telephone_paiement, date_vente) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const l of lignes) {
        // Décrément conditionnel : protège contre deux commandes simultanées sur le dernier article
        if (!mouvement(l.pack.id, -l.quantite, "vente_en_ligne", { reference: numero, conditionnel: true })) throw Object.assign(new Error("stock"), { stock: l.pack });
        const id = nanoid();
        venteIds.push(id);
        insVente.run(id, commandeId, clientId, l.pack.id, vendeurId, l.quantite, l.prix, champsPaiement.mode, champsPaiement.statut,
          champsPaiement.reference || null, champsPaiement.telephone || null, maintenant);
      }
      db.prepare(
        `INSERT INTO commandes (id, vente_id, numero, statut, adresse_livraison, note, jeton_recu, canal, frais_livraison, contact_telephone, contact_email, maj_le, livraison)
         VALUES (?, ?, ?, 'en_attente', ?, ?, ?, 'en_ligne', ?, ?, ?, ?, 1)`
      ).run(commandeId, venteIds[0], numero, [client.adresse, client.ville].filter(Boolean).join(", "), client.instructions || null,
        jeton, frais, client.telephone, client.email || null, maintenant);
      ajouterEvenement(commandeId, { statut: "en_attente", texte: "Commande passée sur la boutique en ligne", date: maintenant });
      genererTicket(commandeId, vendeurId, maintenant);
      if (avecRemise) {
        db.prepare("UPDATE diagnostics SET remise_utilisee_le = ?, commande_id = ? WHERE id = ?").run(maintenant, commandeId, diag.id);
        ajouterEvenement(commandeId, { type: "note", texte: `Remise routine du diagnostic ${diag.reference} appliquée`, date: maintenant });
      }
      if (modePaiement === "transfert") {
        ajouterEvenement(commandeId, { type: "paiement", texte: `Transfert ${champsPaiement.mode} déclaré par le client (réf. ${champsPaiement.reference}) — à vérifier`, date: maintenant });
      }
    })();
  } catch (e) {
    if (e.stock) return res.status(409).json({ erreur: `${e.stock.nom} vient d'être épuisé.`, indisponibles: [{ pack_id: e.stock.id, nom: e.stock.nom, disponible: 0 }] });
    throw e;
  }

  const reponse = { numero, jeton, total, redirection: null };

  if (modePaiement === "en_ligne") {
    const base = urlPublique(req);
    const merchantId = ("MC" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex")).toUpperCase().slice(0, 30);
    const [prenom, ...reste] = client.nom.split(" ");
    const nomFamille = reste.join(" ") || prenom;
    try {
      const init = await cinetpay.initialiserPaiement({
        merchantTransactionId: merchantId,
        montant: total,
        designation: `Commande ${numero} — ${cfg.boutique.nom}`,
        email: client.email,
        prenom: prenom.length >= 2 ? prenom : prenom + ".",
        nom: nomFamille.length >= 2 ? nomFamille : nomFamille + ".",
        telephone: client.telephone,
        successUrl: `${base}/#/commande/${jeton}`,
        failedUrl: `${base}/#/commande/${jeton}`,
        notifyUrl: `${base}/api/boutique/paiements/cinetpay/notification`,
      });
      db.prepare(
        `INSERT INTO paiements_en_ligne (id, commande_id, merchant_transaction_id, transaction_id, notify_token, payment_url, montant, statut, cree_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(nanoid(), commandeId, merchantId, init.transactionId, init.notifyToken, init.paymentUrl, total, init.statut, new Date().toISOString());
      reponse.redirection = init.paymentUrl;
    } catch (e) {
      // Échec d'initialisation : on libère le stock et on l'indique clairement au client
      db.transaction(() => {
        enregistrerPaiement(db.prepare("SELECT * FROM commandes WHERE id = ?").get(commandeId), { mode: "Paiement en ligne", statut: "echoue" });
        changerStatut(commandeId, "annulee", null, "Paiement en ligne impossible à initialiser");
      })();
      console.error("CinetPay :", e.message);
      return res.status(502).json({ erreur: `Le paiement en ligne est indisponible pour le moment (${e.message}). Choisissez un autre mode de paiement.` });
    }
  }

  // Ticket par e-mail au client (si adresse fournie) — sans bloquer la réponse
  if (client.email) {
    const cmd = db.prepare("SELECT * FROM commandes WHERE id = ?").get(commandeId);
    const { sujet, html, texte } = ticketEmail(ticketCommande(cmd), `${urlPublique(req)}/#/commande/${jeton}`);
    envoyerEmail({ a: client.email, sujet, html, texte }).then(() => journaliser(commandeId, "email", null)).catch((e) => console.error("E-mail de commande :", e.message));
  }

  res.status(201).json(reponse);
});

/* ---------------------------------------------------------------- paiement en ligne */

/** Interroge CinetPay et met la commande à jour (payée, ou annulée si le paiement a échoué). */
async function verifierPaiementEnLigne(cmd) {
  const p = db.prepare("SELECT * FROM paiements_en_ligne WHERE commande_id = ? ORDER BY cree_le DESC LIMIT 1").get(cmd.id);
  if (!p || !cinetpay.estConfigure()) return;
  const r = await cinetpay.statutPaiement(p.transaction_id || p.merchant_transaction_id);
  const maintenant = new Date().toISOString();
  db.prepare("UPDATE paiements_en_ligne SET statut = ?, verifie_le = ?, transaction_id = COALESCE(transaction_id, ?) WHERE id = ?").run(r.statut, maintenant, r.transactionId, p.id);
  const actuel = db.prepare("SELECT * FROM commandes WHERE id = ?").get(cmd.id);
  const ligne = lignesCommande(actuel)[0];
  if (!ligne || ligne.statut_paiement === "payee") return;
  if (r.reussi) {
    db.transaction(() => {
      if (actuel.statut === "annulee") changerStatut(actuel.id, "en_attente", null, "Paiement reçu après annulation : commande rétablie");
      enregistrerPaiement(actuel, { mode: "Paiement en ligne", statut: "payee", reference: r.transactionId || p.transaction_id || p.merchant_transaction_id, payeLe: maintenant });
      ajouterEvenement(actuel.id, { type: "paiement", texte: `Paiement en ligne confirmé par CinetPay (${totalCommande(actuel)} FCFA)`, date: maintenant });
    })();
  } else if (r.echoue && actuel.statut !== "annulee") {
    db.transaction(() => {
      enregistrerPaiement(actuel, { mode: "Paiement en ligne", statut: "echoue", reference: p.transaction_id });
      changerStatut(actuel.id, "annulee", null, `Paiement en ligne non abouti (${r.statut})`);
    })();
  }
}

// Webhook CinetPay : on authentifie la notification (notify_token), puis on
// redemande le statut à CinetPay plutôt que de croire le contenu reçu.
const espaceTransaction = espaceParJeton((req) => req.body?.merchant_transaction_id && db.prepare("SELECT 1 FROM paiements_en_ligne WHERE merchant_transaction_id = ?").get(String(req.body.merchant_transaction_id)));
router.post("/paiements/cinetpay/notification", (req, res, next) => (req.body?.merchant_transaction_id ? espaceTransaction(req, res, next) : res.status(404).json({ erreur: "Transaction inconnue" })), async (req, res) => {
  const { notify_token: recu, merchant_transaction_id: mid, transaction_id: tid } = req.body || {};
  const p = mid ? db.prepare("SELECT * FROM paiements_en_ligne WHERE merchant_transaction_id = ?").get(String(mid)) : null;
  if (!p || !recu || !p.notify_token) return res.status(404).json({ erreur: "Transaction inconnue" });
  const a = Buffer.from(String(recu)), b = Buffer.from(String(p.notify_token));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ erreur: "Notification non authentifiée" });
  if (tid && !p.transaction_id) db.prepare("UPDATE paiements_en_ligne SET transaction_id = ? WHERE id = ?").run(String(tid), p.id);
  try {
    await verifierPaiementEnLigne(db.prepare("SELECT * FROM commandes WHERE id = ?").get(p.commande_id));
    res.json({ message: "OK" });
  } catch (e) {
    console.error("Notification CinetPay :", e.message);
    res.status(502).json({ erreur: "Vérification impossible, renvoyez la notification" });
  }
});

/* ---------------------------------------------------------------- suivi */

router.get("/commandes/:jeton", espaceParJeton((req) => lireParJeton(req.params.jeton)), async (req, res) => {
  let cmd = lireParJeton(req.params.jeton);
  if (!cmd) return res.status(404).json({ erreur: "Commande introuvable" });
  let ligne = lignesCommande(cmd)[0];

  // Retour depuis la page de paiement : on vérifie auprès de CinetPay (au plus toutes les 5 s)
  if (ligne?.statut_paiement === "en_cours") {
    const p = db.prepare("SELECT verifie_le FROM paiements_en_ligne WHERE commande_id = ? ORDER BY cree_le DESC LIMIT 1").get(cmd.id);
    if (!p?.verifie_le || Date.now() - new Date(p.verifie_le).getTime() > 5000) {
      try { await verifierPaiementEnLigne(cmd); } catch (e) { console.error("Vérification CinetPay :", e.message); }
      cmd = lireParJeton(req.params.jeton);
      ligne = lignesCommande(cmd)[0];
    }
  }

  // Le client a son ticket sous les yeux : il est considéré comme remis
  journaliser(cmd.id, "consulte_client", null, { unique: true });
  const cfg = configPublique();
  const t = ticketCommande(cmd);
  const etapes = db.prepare("SELECT type, statut, texte, cree_le FROM commande_evenements WHERE commande_id = ? AND type <> 'note' ORDER BY cree_le")
    .all(cmd.id).map((e) => ({ ...e, cree_le: versIso(e.cree_le) }));
  const enLigne = db.prepare("SELECT payment_url, statut FROM paiements_en_ligne WHERE commande_id = ? ORDER BY cree_le DESC LIMIT 1").get(cmd.id);
  const operateur = cfg.paiements.transfert.find((o) => o.mode === ligne?.mode_paiement);
  res.json({
    ...t,
    jeton: cmd.jeton_recu,
    adresse_livraison: cmd.adresse_livraison,
    etapes,
    reprendre_paiement: ligne?.statut_paiement === "en_cours" ? enLigne?.payment_url || null : null,
    transfert: ligne?.statut_paiement === "a_verifier" && operateur ? operateur : null,
    contact: { telephone: cfg.boutique.telephone, whatsapp: cfg.boutique.whatsapp },
    boutique_slug: cfg.slug,
    client: nomCourt(t.client),
  });
});

/* ---------------------------------------------------------------- désinscription */

// Lien « STOP » des SMS et e-mails marketing : le client se désinscrit sans compte
const clientParJeton = (j) => (/^[A-Za-z0-9_-]{8,40}$/.test(String(j)) ? db.prepare("SELECT * FROM clients WHERE jeton_desinscription = ?").get(String(j)) : null);
const espaceStop = espaceParJeton((req) => clientParJeton(req.params.jeton));
router.get("/stop/:jeton", espaceStop, (req, res) => {
  const c = clientParJeton(req.params.jeton);
  if (!c) return res.status(404).json({ erreur: "Lien de désinscription invalide" });
  res.json({ prenom: String(c.nom || "").split(" ")[0], boutique: lireBoutique().nom, abonne: !!c.consentement_marketing });
});
router.post("/stop/:jeton", espaceStop, (req, res) => {
  const c = clientParJeton(req.params.jeton);
  if (!c) return res.status(404).json({ erreur: "Lien de désinscription invalide" });
  const abonner = req.body?.abonner === true;
  db.prepare("UPDATE clients SET consentement_marketing = ?, desinscrit_le = ? WHERE id = ?").run(abonner ? 1 : 0, abonner ? null : new Date().toISOString(), c.id);
  res.json({ abonne: abonner });
});

/* ---------------------------------------------------------------- abandons */

// Paiements en ligne jamais finalisés : vérification puis libération du stock
function nettoyerAbandons() {
  if (!cinetpay.estConfigure()) return;
  const limite = new Date(Date.now() - DELAI_ABANDON_MIN * 60 * 1000).toISOString();
  const cmds = db.prepare(
    `SELECT DISTINCT c.* FROM commandes c JOIN ventes v ON v.commande_id = c.id
     WHERE v.statut_paiement = 'en_cours' AND c.statut <> 'annulee' AND c.maj_le < ?`
  ).all(limite);
  for (const c of cmds) {
    verifierPaiementEnLigne(c).then(() => {
      const l = lignesCommande(c)[0];
      if (l?.statut_paiement === "en_cours") {
        db.transaction(() => {
          enregistrerPaiement(c, { mode: "Paiement en ligne", statut: "echoue" });
          changerStatut(c.id, "annulee", null, `Paiement en ligne non finalisé après ${DELAI_ABANDON_MIN} min`);
        })();
      }
    }).catch((e) => console.error("Nettoyage des paiements :", e.message));
  }
}
setInterval(() => db.pourChaqueEspace(nettoyerAbandons), 10 * 60 * 1000).unref();

module.exports = router;

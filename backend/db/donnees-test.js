/**
 * Données de test — la boutique MILANA Care, avec sa gamme, quelques clients et quelques ventes.
 *
 * Quand la plateforme est vide (aucun espace), cet espace de démonstration est créé au
 * démarrage. L'écran « Mon espace » propose alors ses comptes de test.
 *
 * ⚠️ Ces comptes sont publics. Avant une utilisation réelle, désactivez-les avec
 * DONNEES_TEST=0 (ou changez MOT_DE_PASSE_TEST).
 */
const { nanoid } = require("nanoid");
const db = require("./index");
const { mouvement } = require("../lib/stock");
const { prochainNumero, ajouterEvenement } = require("../lib/outils");
const { genererTicket, journaliser } = require("../lib/tickets");

const ACTIF = process.env.DONNEES_TEST !== "0";
const MOT_DE_PASSE = process.env.MOT_DE_PASSE_TEST || "test-2026";
const jours = (n, heure = 10) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(heure, 15, 0, 0); return d.toISOString(); };
const photo = (id) => `https://images.unsplash.com/photo-${id}?w=800&h=800&fit=crop&q=75&auto=format`;

const ESPACES = [
  {
    boutique: "MILANA Care",
    reglages: { slogan: "Soins capillaires naturels — votre routine sur mesure", adresse: "Cocody, Abidjan", zone_livraison: "Abidjan et environs, 24 à 48 h", frais_livraison: "1500", livraison_gratuite_des: "30000", message: "Merci ! Prenez soin de vos cheveux avec MILANA." },
    admin: { nom: "Administratrice MILANA (test)", telephone: "0100000001" },
    vendeurs: [{ nom: "Vendeuse MILANA (test)", telephone: "0100000011" }],
    clients: [
      { nom: "Christelle Assi", telephone: "0500000301", ville: "Cocody", consentement: 1, statut: "VIP" },
      { nom: "Nadège Koffi", telephone: "0500000302", ville: "Marcory", consentement: 1 },
      { nom: "Salimata Ouattara", telephone: "0500000303", ville: "Yopougon", consentement: 1 },
    ],
    // [il y a n jours, client, produit de la gamme, quantité, vendeur, options]
    ventes: [
      [10, 0, 0, 1, 1, { mode: "Orange Money" }], [8, 1, 1, 2, 1], [6, 2, 2, 1, 0, { mode: "Wave" }], [4, 0, 3, 1, 1],
      [2, 1, 0, 1, 1, { mode: "MTN MoMo" }], [1, 2, 1, 1, 1, { enLigne: true, statut: "confirmee" }], [0, 1, 3, 2, null, { enLigne: true, statut: "en_attente" }],
    ],
  },
];

/* Livreurs de démonstration (les mêmes profils dans chaque boutique, numéros distincts) */
const LIVREURS = [{ nom: "Moussa Traoré (moto)", zone: "Cocody, Riviera, Bingerville" }, { nom: "Serge Kouakou (moto)", zone: "Yopougon, Adjamé, Abobo" }];

function remplir(e, utilisateurs, rang) {
  const livreurs = LIVREURS.map((l, i) => {
    const id = nanoid();
    db.prepare("INSERT INTO livreurs (id, nom, telephone, zone, actif, supprime, cree_le) VALUES (?, ?, ?, ?, 1, 0, ?)").run(id, l.nom, `05000009${rang}${i + 1}`, l.zone, jours(20));
    return id;
  });
  let colis = 0;
  // La gamme MILANA Care a été installée à la création de l'espace (lib/gamme.js)
  const packs = db.prepare("SELECT * FROM packs ORDER BY cree_le DESC").all();
  const clients = e.clients.map((c, i) => {
    const id = nanoid();
    db.prepare("INSERT INTO clients (id, nom, telephone, ville, statut, notes, consentement_marketing, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, c.nom, c.telephone, c.ville, c.statut || "Standard", "Client de démonstration", c.consentement, jours(15 - i));
    return { id, ...c };
  });
  for (const [j, ic, ip, qte, iv, o = {}] of e.ventes) {
    const p = packs[ip], c = clients[ic], vendeur = iv == null ? null : utilisateurs[iv];
    const date = jours(j, 9 + (ip % 8));
    const prix = p.promo && j <= 1 ? p.promo : p.prix;
    const venteId = nanoid(), cmdId = nanoid(), numero = prochainNumero();
    const livraison = o.enLigne && o.statut === "en_attente";
    db.prepare(
      `INSERT INTO ventes (id, commande_id, client_id, pack_id, vendeur_id, quantite, prix_unitaire, mode_paiement, statut_paiement, montant_recu, paye_le, date_vente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(venteId, cmdId, c.id, p.id, vendeur?.id || null, qte, prix, livraison ? "Paiement à la livraison" : o.mode || (o.enLigne ? "Orange Money" : "Espèces"), livraison ? "en_attente" : "payee",
      !o.enLigne && !o.mode ? qte * prix : null, livraison ? null : date, date);
    const statut = o.statut || "livree";
    db.prepare(
      `INSERT INTO commandes (id, vente_id, numero, statut, adresse_livraison, jeton_recu, canal, frais_livraison, contact_telephone, type_vente, maj_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).run(cmdId, venteId, numero, statut, c.ville, nanoid(24), o.enLigne ? "en_ligne" : "boutique", c.telephone, o.b2b ? "b2b" : "b2c", date);
    // Commandes en ligne : colis à livrer. Dès qu'elles sont confirmées, un livreur et une date sont prévus.
    if (o.enLigne) {
      const frais = Number(e.reglages.frais_livraison) || 0;
      const affecte = statut !== "en_attente";
      db.prepare("UPDATE commandes SET livraison = 1, frais_livraison = ?, livreur_id = ?, livraison_prevue = ?, livree_le = ? WHERE id = ?")
        .run(frais, affecte ? livreurs[colis++ % livreurs.length] : null, affecte ? new Date(Date.now() + (statut === "livree" ? -1 : 1) * 864e5).toISOString().slice(0, 10) : null, statut === "livree" ? date : null, cmdId);
    }
    // Chaque vente a son ticket ; « nonRemis » simule un ticket que le vendeur n'a pas encore remis au client
    genererTicket(cmdId, vendeur?.id || null, date);
    if (!o.nonRemis) journaliser(cmdId, o.enLigne ? "consulte_client" : o.mode ? "whatsapp" : "imprime", o.enLigne ? null : vendeur?.id || null, { evenement: false, date });
    mouvement(p.id, -qte, o.enLigne ? "vente_en_ligne" : "vente", { reference: numero, auteurId: vendeur?.id || null });
    ajouterEvenement(cmdId, { statut: "en_attente", texte: o.enLigne ? "Commande passée sur la boutique en ligne" : null, auteurId: vendeur?.id || null, date });
    if (statut !== "en_attente") ajouterEvenement(cmdId, { statut, auteurId: utilisateurs[0].id, date });
  }
}

/** Crée les espaces de test si la plateforme est vide. */
function installer({ creerEspace, creerUtilisateur, ecrireBoutique }) {
  if (!ACTIF || db.listerBoutiques().length > 0) return;
  for (const e of ESPACES) {
    const { boutique, utilisateur } = creerEspace({ ...e.admin, mot_de_passe: MOT_DE_PASSE, boutique: e.boutique });
    db.dansEspace(boutique.id, () => {
      ecrireBoutique(e.reglages);
      const vendeurs = e.vendeurs.map((v) => creerUtilisateur({ ...v, mot_de_passe: MOT_DE_PASSE, role: "vendeur" }));
      db.transaction(() => remplir(e, [utilisateur, ...vendeurs], ESPACES.indexOf(e) + 1))();
    });
  }
  db.reglages.ecrire("donnees_test", "1");
  console.log(`   Données de test installées : ${ESPACES.length} boutiques de test (désactiver : DONNEES_TEST=0)`);
}

/** Comptes de test encore présents — proposés sur l'écran de connexion. */
function comptesTest() {
  if (!ACTIF || db.reglages.lire("donnees_test") !== "1") return [];
  return ESPACES.flatMap((e) => [{ ...e.admin, role: "admin" }, ...e.vendeurs.map((v) => ({ ...v, role: "vendeur" }))].map((c) => ({ ...c, boutique: e.boutique })))
    .filter((c) => db.comptes.boutiqueDe(c.telephone))
    .map((c) => ({ ...c, mot_de_passe: MOT_DE_PASSE }));
}

module.exports = { installer, comptesTest };

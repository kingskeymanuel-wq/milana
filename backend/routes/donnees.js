const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../db");
const { adminOnly } = require("../middleware/auth");
const { versIso, idOuNouveau } = require("../lib/outils");
const { lireBoutique, ecrireBoutique } = require("./parametres");
const { resoudreImage } = require("../lib/images");
const { numeroterManquants } = require("../lib/tickets");
const router = express.Router();

/**
 * GET /api/donnees — l'ensemble des données de la boutique en un seul appel.
 * Utilisé par l'interface d'administration, qui calcule ensuite ses
 * indicateurs localement (volume adapté à un commerce de proximité).
 * Les clients et produits supprimés logiquement sont exclus ; leurs ventes
 * restent visibles (affichées « client supprimé » / « produit supprimé »).
 */
router.get("/", (req, res) => {
  const admin = req.user?.role === "admin";
  const espace = db.espaceCourant();
  // Un vendeur ne voit que SON activité : ses ventes en caisse et les commandes arrivées par son lien
  const moi = req.user.id;
  const ventes = db
    .prepare("SELECT v.*, u.nom AS vendeur_nom FROM ventes v LEFT JOIN utilisateurs u ON u.id = v.vendeur_id ORDER BY v.date_vente")
    .all()
    .filter((v) => admin || v.vendeur_id === moi);
  const mesCommandes = new Set(ventes.map((v) => v.commande_id));
  const mesVentes = new Set(ventes.map((v) => v.id));
  const commandes = db.prepare("SELECT * FROM commandes").all().filter((c) => admin || mesCommandes.has(c.id) || mesVentes.has(c.vente_id));
  const idsCommandes = new Set(commandes.map((c) => c.id));
  res.json({
    role: req.user?.role,
    moi,
    espace: { id: espace.id, slug: espace.slug },
    equipe: db.prepare("SELECT id, nom, telephone, role, actif, cree_le FROM utilisateurs ORDER BY role, cree_le").all()
      .filter((u) => admin || u.id === moi).map((u) => ({ ...u, cree_le: versIso(u.cree_le) })),
    clients: db.prepare("SELECT * FROM clients WHERE supprime = 0 ORDER BY cree_le").all().map((c) => ({ ...c, cree_le: versIso(c.cree_le) })),
    // Les vendeurs ne voient ni les coûts d'achat ni les dépenses de la boutique
    packs: db.prepare("SELECT * FROM packs WHERE supprime = 0 ORDER BY cree_le").all().map((p) => (admin ? { ...p, cree_le: versIso(p.cree_le) }
      // Vendeur : ni coût d'achat, ni quantité en stock (seulement disponible ou en rupture), ni seuil d'alerte
      : { ...p, cout: null, stock: p.stock > 0 ? 9999 : 0, seuil_alerte: null, cree_le: versIso(p.cree_le) })),
    depenses: db.prepare("SELECT d.*, u.nom AS auteur FROM depenses d LEFT JOIN utilisateurs u ON u.id = d.auteur_id ORDER BY d.date_depense DESC, d.cree_le DESC").all().filter((d) => admin || d.auteur_id === moi),
    ventes: ventes.map((v) => ({ ...v, date_vente: versIso(v.date_vente), paye_le: versIso(v.paye_le) })),
    commandes: commandes.map((c) => ({ ...c, maj_le: versIso(c.maj_le) })),
    evenements: db
      .prepare("SELECT id, commande_id, type, statut, texte, cree_le FROM commande_evenements ORDER BY cree_le")
      .all()
      .filter((e) => idsCommandes.has(e.commande_id))
      .map((e) => ({ ...e, cree_le: versIso(e.cree_le) })),
    livreurs: db.prepare("SELECT * FROM livreurs WHERE supprime = 0 ORDER BY nom").all().map((l) => ({ ...l, cree_le: versIso(l.cree_le) })),
    // Journal des tickets de caisse (générés, imprimés, envoyés…) des commandes visibles
    tickets: db.prepare("SELECT id, commande_id, action, auteur_id, cree_le FROM tickets_journal ORDER BY cree_le").all()
      .filter((t) => idsCommandes.has(t.commande_id)).map((t) => ({ ...t, cree_le: versIso(t.cree_le) })),
    investissements: admin ? db.prepare("SELECT * FROM investissements ORDER BY date_invest DESC").all() : [],
    boutique: lireBoutique(),
  });
});

/**
 * POST /api/donnees/import — remplace TOUTES les données métier (pas les
 * comptes utilisateurs) par celles fournies. Réservé aux administrateurs.
 * Corps : { clients, packs, ventes, commandes, evenements, investissements }
 * (mêmes champs que GET /api/donnees).
 */
router.post("/import", adminOnly, (req, res) => {
  const d = req.body || {};
  for (const k of ["clients", "packs", "ventes", "commandes", "investissements"]) {
    if (!Array.isArray(d[k])) return res.status(400).json({ erreur: `Champ « ${k} » manquant ou invalide` });
  }
  const maintenant = new Date().toISOString();

  try {
    db.transaction(() => {
      db.exec("DELETE FROM livreurs; DELETE FROM tickets_journal; DELETE FROM paiements_en_ligne; DELETE FROM commande_evenements; DELETE FROM commandes; DELETE FROM ventes; DELETE FROM packs; DELETE FROM clients; DELETE FROM investissements;");

      const insClient = db.prepare("INSERT INTO clients (id, nom, telephone, email, ville, statut, notes, supprime, cree_le, consentement_marketing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const insPack = db.prepare("INSERT INTO packs (id, nom, description, prix, cout, stock, sku, emoji, teinte, actif, supprime, cree_le, image, contenu, prix_promo, promo_fin, seuil_alerte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const clientIds = new Set();
      const packIds = new Set();

      for (const c of d.clients) {
        const id = idOuNouveau(c.id);
        insClient.run(id, c.nom || "Sans nom", c.telephone || "", c.email || null, c.ville || null, c.statut === "VIP" ? "VIP" : "Standard", c.notes || null, c.supprime ? 1 : 0, c.cree_le || maintenant, c.consentement_marketing ? 1 : 0);
        clientIds.add(id);
      }
      for (const p of d.packs) {
        const id = idOuNouveau(p.id);
        let image = null;
        try { image = resoudreImage(p.image, null, id); } catch { /* image illisible : ignorée */ }
        insPack.run(id, p.nom || "Produit", p.description || "", Number(p.prix) || 0, p.cout == null ? null : Number(p.cout), Math.max(0, Math.round(Number(p.stock) || 0)),
          p.sku || null, p.emoji || "📦", Number(p.teinte) || 0, p.actif === 0 || p.actif === false ? 0 : 1, p.supprime ? 1 : 0, p.cree_le || maintenant, image,
          p.contenu || null, Number(p.prix_promo) > 0 ? Number(p.prix_promo) : null, p.promo_fin || null, p.seuil_alerte == null ? 10 : Math.max(0, Math.round(Number(p.seuil_alerte) || 0)));
        packIds.add(id);
      }

      // Ventes rattachées à un client / produit absent : on crée une fiche
      // « supprimée » pour conserver l'historique sans casser les clés étrangères.
      const insVente = db.prepare(
        `INSERT INTO ventes (id, commande_id, client_id, pack_id, quantite, prix_unitaire, mode_paiement, statut_paiement, montant_recu,
           reference_paiement, telephone_paiement, paye_le, date_vente) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const venteIds = new Set();
      for (const v of d.ventes) {
        if (!clientIds.has(v.client_id)) { const id = idOuNouveau(v.client_id); insClient.run(id, "Client supprimé", "", null, null, "Standard", null, 1, maintenant, 0); clientIds.add(id); v.client_id = id; }
        if (!packIds.has(v.pack_id)) { const id = idOuNouveau(v.pack_id); insPack.run(id, "Produit supprimé", "", Number(v.prix_unitaire) || 0, null, 0, null, "📦", 6, 0, 1, maintenant, null, null, null, null, 10); packIds.add(id); v.pack_id = id; }
        const id = idOuNouveau(v.id);
        const statutPaiement = ["en_attente", "a_verifier", "en_cours", "echoue"].includes(v.statut_paiement) ? v.statut_paiement : "payee";
        insVente.run(id, v.commande_id || null, v.client_id, v.pack_id, Math.max(1, Math.round(Number(v.quantite) || 1)), Number(v.prix_unitaire) || 0, v.mode_paiement || "Espèces",
          statutPaiement, v.montant_recu ?? null, v.reference_paiement || null, v.telephone_paiement || null,
          statutPaiement === "payee" ? v.paye_le || v.date_vente || maintenant : null, v.date_vente || maintenant);
        venteIds.add(id);
      }

      const insCmd = db.prepare(
        `INSERT INTO commandes (id, vente_id, numero, statut, adresse_livraison, note, jeton_recu, maj_le, canal, frais_livraison, contact_telephone, contact_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const cmdIds = new Set();
      const numeros = new Set();
      for (const c of d.commandes) {
        if (!venteIds.has(c.vente_id) || numeros.has(c.numero)) continue;
        const id = idOuNouveau(c.id);
        const jeton = typeof c.jeton_recu === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(c.jeton_recu) ? c.jeton_recu : nanoid(24);
        insCmd.run(id, c.vente_id, c.numero, c.statut || "en_attente", c.adresse_livraison || "", c.note || null, jeton, c.maj_le || maintenant,
          c.canal === "en_ligne" ? "en_ligne" : "boutique", Number(c.frais_livraison) || 0, c.contact_telephone || null, c.contact_email || null);
        cmdIds.add(id);
        numeros.add(c.numero);
      }

      // Lignes sans commande explicite : rattachées à la commande qui les référence (données v1–v3)
      db.exec("UPDATE ventes SET commande_id = (SELECT c.id FROM commandes c WHERE c.vente_id = ventes.id) WHERE commande_id IS NULL");

      const insEvt = db.prepare("INSERT INTO commande_evenements (id, commande_id, type, statut, texte, cree_le) VALUES (?, ?, ?, ?, ?, ?)");
      for (const e of d.evenements || []) {
        if (!cmdIds.has(e.commande_id)) continue;
        insEvt.run(nanoid(), e.commande_id, ["note", "paiement", "ticket"].includes(e.type) ? e.type : "statut", e.statut || null, e.texte || null, e.cree_le || maintenant);
      }

      const insInv = db.prepare("INSERT INTO investissements (id, libelle, categorie, montant, date_invest) VALUES (?, ?, ?, ?, ?)");
      for (const i of d.investissements) {
        insInv.run(idOuNouveau(i.id), i.libelle || "Dépense", i.categorie || "Autre", Number(i.montant) || 0, String(i.date_invest || maintenant).slice(0, 10));
      }
      // Champs apparus en v7 : catégories, lots, tickets
      const majPack = db.prepare("UPDATE packs SET categorie = ?, pieces_par_lot = ? WHERE id = ?");
      for (const p of d.packs) if (packIds.has(p.id)) majPack.run(p.categorie ? String(p.categorie).slice(0, 60) : null, Math.max(1, Math.round(Number(p.pieces_par_lot) || 1)), p.id);
      const majCmd = db.prepare("UPDATE commandes SET numero_ticket = ?, type_vente = ?, ticket_remis_le = ? WHERE id = ?");
      for (const c of d.commandes) if (cmdIds.has(c.id)) majCmd.run(c.numero_ticket || null, c.type_vente === "b2b" ? "b2b" : "b2c", c.ticket_remis_le || null, c.id);
      const insTicket = db.prepare("INSERT INTO tickets_journal (id, commande_id, action, auteur_id, cree_le) VALUES (?, ?, ?, NULL, ?)");
      for (const t of d.tickets || []) if (cmdIds.has(t.commande_id)) insTicket.run(nanoid(), t.commande_id, String(t.action || "genere").slice(0, 30), t.cree_le || maintenant);
      const insLivreur = db.prepare("INSERT INTO livreurs (id, nom, telephone, zone, actif, supprime, cree_le) VALUES (?, ?, ?, ?, ?, 0, ?)");
      const livreurIds = new Set();
      for (const l of d.livreurs || []) { const id = idOuNouveau(l.id); insLivreur.run(id, l.nom || "Livreur", l.telephone || "", l.zone || null, l.actif === 0 || l.actif === false ? 0 : 1, l.cree_le || maintenant); livreurIds.add(id); }
      const majLivraison = db.prepare("UPDATE commandes SET livraison = ?, livreur_id = ?, livraison_prevue = ?, livraison_tentatives = ?, livree_le = ? WHERE id = ?");
      for (const c of d.commandes) if (cmdIds.has(c.id)) majLivraison.run(c.livraison ?? (c.canal === "en_ligne" || Number(c.frais_livraison) > 0) ? 1 : 0, livreurIds.has(c.livreur_id) ? c.livreur_id : null, c.livraison_prevue || null, Math.max(0, Math.round(Number(c.livraison_tentatives) || 0)), c.livree_le || null, c.id);
      numeroterManquants(); // commandes d'une sauvegarde plus ancienne
      if (d.boutique && typeof d.boutique === "object") ecrireBoutique(d.boutique);
    })();
  } catch (e) {
    console.error(e);
    return res.status(400).json({ erreur: "Import impossible : données incohérentes (" + e.message + ")" });
  }

  res.json({ message: "Données importées" });
});

module.exports = router;

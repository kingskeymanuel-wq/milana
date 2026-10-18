/**
 * Bases de données — une plateforme, plusieurs espaces.
 *
 * - « plateforme » : annuaire des boutiques (une par espace administrateur) et
 *   des comptes (téléphone → boutique), pour savoir où connecter chacun.
 * - Un fichier SQLite par espace : produits, stocks, clients, ventes, finances,
 *   marketing et équipe de CET administrateur. Rien n'est partagé entre espaces.
 *
 * Le module exporte un mandataire : `db.prepare(...)` s'adresse à la base de
 * l'espace en cours (défini par `db.dansEspace(id, fn)` — connexion, jeton,
 * page publique d'une boutique…). Hors de tout espace, l'appel échoue : une
 * requête ne peut donc pas lire par erreur les données d'un autre espace.
 */
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");
const { nanoid } = require("nanoid");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "moncommerce.db");
const BASE = DB_PATH.replace(/\.db$/i, "");
const DOSSIER_ESPACES = BASE + "-espaces";
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

/* ------------------------------------------------------------ base d'un espace */
function ouvrirEspace(fichier) {
  const db = new Database(fichier);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(schema);

  // Migrations : ajoute les colonnes apparues après la v1 aux bases existantes
  function ajouterColonne(table, colonne, definition) {
    const colonnes = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (colonnes.includes(colonne)) return false;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${definition}`);
    return true;
  }
  ajouterColonne("clients", "supprime", "INTEGER NOT NULL DEFAULT 0");
  ajouterColonne("packs", "cout", "REAL");
  ajouterColonne("packs", "sku", "TEXT");
  ajouterColonne("packs", "teinte", "INTEGER NOT NULL DEFAULT 0");
  ajouterColonne("packs", "supprime", "INTEGER NOT NULL DEFAULT 0");
  ajouterColonne("commandes", "note", "TEXT");
  // v3 : images produit, paiements détaillés, ticket de caisse public
  ajouterColonne("packs", "image", "TEXT");
  ajouterColonne("ventes", "statut_paiement", "TEXT NOT NULL DEFAULT 'payee'");
  ajouterColonne("ventes", "montant_recu", "REAL");
  ajouterColonne("ventes", "reference_paiement", "TEXT");
  ajouterColonne("ventes", "telephone_paiement", "TEXT");
  ajouterColonne("ventes", "paye_le", "TEXT");
  ajouterColonne("commandes", "jeton_recu", "TEXT");

  // v4 : boutique en ligne — commandes à plusieurs lignes
  ajouterColonne("ventes", "commande_id", "TEXT");
  // Prix du catalogue au moment de la vente : permet d'afficher la remise sur le ticket (promotion, prix barré)
  ajouterColonne("ventes", "prix_catalogue", "REAL");
  db.exec(`CREATE TRIGGER IF NOT EXISTS ventes_prix_catalogue AFTER INSERT ON ventes WHEN NEW.prix_catalogue IS NULL
    BEGIN UPDATE ventes SET prix_catalogue = (SELECT prix FROM packs WHERE id = NEW.pack_id) WHERE id = NEW.id; END`);
  ajouterColonne("commandes", "canal", "TEXT NOT NULL DEFAULT 'boutique'");
  ajouterColonne("commandes", "frais_livraison", "REAL NOT NULL DEFAULT 0");
  ajouterColonne("commandes", "contact_telephone", "TEXT");
  ajouterColonne("commandes", "contact_email", "TEXT");
  // Coût d'achat de la ligne, figé à la vente (la marge des ventes passées ne bouge plus si le coût du produit change)
  if (ajouterColonne("ventes", "cout_unitaire", "REAL")) db.exec("UPDATE ventes SET cout_unitaire = (SELECT p.cout FROM packs p WHERE p.id = ventes.pack_id)");
  db.exec(`CREATE TRIGGER IF NOT EXISTS ventes_cout_insert AFTER INSERT ON ventes WHEN NEW.cout_unitaire IS NULL
    BEGIN UPDATE ventes SET cout_unitaire = (SELECT cout FROM packs WHERE id = NEW.pack_id) WHERE id = NEW.id; END;
  CREATE TRIGGER IF NOT EXISTS ventes_cout_echange AFTER UPDATE OF pack_id ON ventes WHEN NEW.pack_id <> OLD.pack_id
    BEGIN UPDATE ventes SET cout_unitaire = (SELECT cout FROM packs WHERE id = NEW.pack_id) WHERE id = NEW.id; END;`);
  // Caisse du jour et remises d'argent des vendeurs / livreurs
  db.exec(`CREATE TABLE IF NOT EXISTS caisse_sessions (
    id TEXT PRIMARY KEY, jour TEXT NOT NULL UNIQUE, fond_initial INTEGER NOT NULL DEFAULT 0, ouverte_par TEXT, ouverte_le TEXT NOT NULL,
    especes_comptees INTEGER, theorique INTEGER, ecart INTEGER, note TEXT, fermee_par TEXT, fermee_le TEXT);
  CREATE TABLE IF NOT EXISTS caisse_remises (
    id TEXT PRIMARY KEY, jour TEXT NOT NULL, de_type TEXT NOT NULL, de_id TEXT NOT NULL, montant INTEGER NOT NULL,
    moyen TEXT NOT NULL DEFAULT 'Espèces', note TEXT, recu_par TEXT, cree_le TEXT NOT NULL);`);
  ajouterColonne("ventes", "encaisse_par", "TEXT"); // qui a encaissé (paiement à la livraison confirmé plus tard)
  ajouterColonne("ventes", "sur_compte_vendeur", "INTEGER NOT NULL DEFAULT 0"); // 1 = payé sur le Mobile Money personnel du vendeur
  ajouterColonne("utilisateurs", "paiements", "TEXT"); // moyens de paiement personnels du vendeur (JSON)
  ajouterColonne("clients", "vendeur_id", "TEXT"); // vendeur qui a apporté le client (null : client de la boutique)
  db.exec("UPDATE ventes SET commande_id = (SELECT c.id FROM commandes c WHERE c.vente_id = ventes.id) WHERE commande_id IS NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ventes_commande ON ventes(commande_id)");

  // v5 : contenu des packs, promotions, seuils d'alerte, consentement marketing
  ajouterColonne("packs", "contenu", "TEXT");                 // équipements / articles inclus (un par ligne)
  ajouterColonne("packs", "prix_promo", "REAL");              // prix promotionnel
  ajouterColonne("packs", "promo_fin", "TEXT");               // fin de la promotion (ISO), vide = sans limite
  ajouterColonne("packs", "seuil_alerte", "INTEGER NOT NULL DEFAULT 10");
  ajouterColonne("clients", "consentement_marketing", "INTEGER NOT NULL DEFAULT 0");
  ajouterColonne("clients", "jeton_desinscription", "TEXT");
  ajouterColonne("clients", "desinscrit_le", "TEXT");

  // v6 : un vendeur peut être désactivé par son administrateur (son historique est conservé)
  ajouterColonne("utilisateurs", "actif", "INTEGER NOT NULL DEFAULT 1");

  // v7 : catégories et lots, tickets de caisse numérotés et suivis, ventes B2B
  ajouterColonne("packs", "categorie", "TEXT");
  ajouterColonne("packs", "pieces_par_lot", "INTEGER NOT NULL DEFAULT 1"); // un « lot de 3 » sort 3 articles par unité vendue
  ajouterColonne("commandes", "numero_ticket", "TEXT");
  ajouterColonne("commandes", "type_vente", "TEXT NOT NULL DEFAULT 'b2c'"); // b2c | b2b
  ajouterColonne("commandes", "ticket_remis_le", "TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS tickets_journal (
    id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
    action TEXT NOT NULL, auteur_id TEXT, cree_le TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_tickets_commande ON tickets_journal(commande_id);`);

  // v8 : suivi des livraisons — colis à livrer, livreur, date prévue, tentatives
  // Dépenses saisies par les vendeurs et l'administrateur (transport, emballage…)
  db.exec(`CREATE TABLE IF NOT EXISTS depenses (
    id TEXT PRIMARY KEY, libelle TEXT NOT NULL, categorie TEXT NOT NULL DEFAULT 'Autre', montant REAL NOT NULL,
    date_depense TEXT NOT NULL, note TEXT, auteur_id TEXT, cree_le TEXT NOT NULL)`);
  ajouterColonne("depenses", "moyen", "TEXT NOT NULL DEFAULT 'Espèces'"); // dépense payée en espèces (sort de la caisse) ou autrement
  // MILANA : profil de soin des produits (pour le diagnostic) et diagnostics capillaires reçus
  ajouterColonne("packs", "soin_type", "TEXT");   // shampoo | conditioner | mask | serum | oil | pomade | accessory
  ajouterColonne("packs", "soin_cible", "TEXT");  // dry | damaged | curly | thin
  db.exec(`CREATE TABLE IF NOT EXISTS diagnostics (
    id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, client_id TEXT,
    prenom TEXT NOT NULL, nom TEXT NOT NULL, telephone TEXT NOT NULL, email TEXT, ville TEXT, sexe TEXT, age INTEGER,
    reponses TEXT NOT NULL, resultat TEXT NOT NULL, score INTEGER NOT NULL, gravite TEXT NOT NULL,
    remise_utilisee_le TEXT, commande_id TEXT, cree_le TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_diagnostics_date ON diagnostics(cree_le);`);
  // MILANA : formations (leçons, évaluation, inscriptions avec lien d'accès personnel)
  db.exec(`CREATE TABLE IF NOT EXISTS formations (
    id TEXT PRIMARY KEY, titre TEXT NOT NULL, description TEXT, categorie TEXT, duree TEXT, image TEXT,
    prix REAL NOT NULL DEFAULT 0, publie INTEGER NOT NULL DEFAULT 1,
    support_fichier TEXT, support_nom TEXT, support_lien TEXT,
    minuteur INTEGER, score_reussite INTEGER NOT NULL DEFAULT 60, tentatives_max INTEGER NOT NULL DEFAULT 3, cree_le TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS formations_lecons (
      id TEXT PRIMARY KEY, formation_id TEXT NOT NULL, position INTEGER NOT NULL, titre TEXT NOT NULL, contenu TEXT, video_url TEXT);
    CREATE TABLE IF NOT EXISTS formations_questions (
      id TEXT PRIMARY KEY, formation_id TEXT NOT NULL, position INTEGER NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL, bonne INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS formations_inscriptions (
      id TEXT PRIMARY KEY, formation_id TEXT NOT NULL, client_id TEXT, jeton TEXT NOT NULL UNIQUE, nom TEXT NOT NULL, telephone TEXT NOT NULL,
      statut TEXT NOT NULL,              -- gratuit | a_verifier (paiement déclaré) | payee | refusee
      montant REAL NOT NULL DEFAULT 0, operateur TEXT, telephone_paiement TEXT, reference_paiement TEXT,
      lecons_faites INTEGER NOT NULL DEFAULT 0, tentatives INTEGER NOT NULL DEFAULT 0, meilleur_score INTEGER, dernier_score INTEGER,
      quiz_debut TEXT, reussi_le TEXT, code_certificat TEXT, cree_le TEXT NOT NULL, maj_le TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_formations_inscriptions ON formations_inscriptions(formation_id);`);
  // Retours d'articles après la vente (rétractation ou échange)
  db.exec(`CREATE TABLE IF NOT EXISTS retours (
    id TEXT PRIMARY KEY, commande_id TEXT NOT NULL, pack_id TEXT NOT NULL, quantite INTEGER NOT NULL,
    motif TEXT NOT NULL,                 -- retractation | echange
    montant REAL NOT NULL DEFAULT 0,     -- valeur des articles retournés
    echange_pack_id TEXT, echange_montant REAL NOT NULL DEFAULT 0,
    difference REAL NOT NULL DEFAULT 0,  -- > 0 : à rembourser au client ; < 0 : complément à encaisser
    remis_en_stock INTEGER NOT NULL DEFAULT 1, note TEXT, auteur_id TEXT, cree_le TEXT NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS livreurs (
    id TEXT PRIMARY KEY, nom TEXT NOT NULL, telephone TEXT NOT NULL, zone TEXT,
    actif INTEGER NOT NULL DEFAULT 1, supprime INTEGER NOT NULL DEFAULT 0, cree_le TEXT NOT NULL);`);
  const nouvelleColonneLivraison = ajouterColonne("commandes", "livraison", "INTEGER NOT NULL DEFAULT 0"); // 1 = colis à livrer, 0 = retrait sur place
  ajouterColonne("commandes", "livreur_id", "TEXT");
  ajouterColonne("commandes", "livraison_prevue", "TEXT");                    // date prévue (AAAA-MM-JJ)
  ajouterColonne("commandes", "livraison_tentatives", "INTEGER NOT NULL DEFAULT 0"); // échecs de livraison
  ajouterColonne("commandes", "livree_le", "TEXT");
  // Commandes antérieures : en ligne ou avec frais de livraison = colis à livrer
  if (nouvelleColonneLivraison) db.exec("UPDATE commandes SET livraison = 1 WHERE canal = 'en_ligne' OR frais_livraison > 0");

  // Anciens libellés de paiement → libellés actuels
  db.prepare("UPDATE ventes SET mode_paiement = 'Carte bancaire' WHERE mode_paiement = 'Carte'").run();

  // Chaque commande reçoit un jeton public (lien et QR code du ticket de caisse)
  const sansJeton = db.prepare("SELECT id FROM commandes WHERE jeton_recu IS NULL").all();
  const majJeton = db.prepare("UPDATE commandes SET jeton_recu = ? WHERE id = ?");
  for (const c of sansJeton) majJeton.run(nanoid(24), c.id);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_commandes_jeton ON commandes(jeton_recu)");
  return db;
}

/* ------------------------------------------------------------ plateforme */
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const plateforme = new Database(BASE + "-plateforme.db");
plateforme.pragma("journal_mode = WAL");
plateforme.exec(`
  CREATE TABLE IF NOT EXISTS boutiques (
    id       TEXT PRIMARY KEY,
    slug     TEXT UNIQUE NOT NULL,     -- adresse publique : /#/boutique/<slug>
    fichier  TEXT NOT NULL,            -- base SQLite de l'espace
    cree_le  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reglages (cle TEXT PRIMARY KEY, valeur TEXT);
  CREATE TABLE IF NOT EXISTS comptes (
    telephone    TEXT PRIMARY KEY,     -- un numéro = un compte sur toute la plateforme
    boutique_id  TEXT NOT NULL REFERENCES boutiques(id) ON DELETE CASCADE
  );
`);

const ouvertes = new Map(); // id de boutique → connexion
const boutiques = new Map(); // id → { id, slug, fichier, cree_le }
for (const b of plateforme.prepare("SELECT * FROM boutiques ORDER BY cree_le").all()) boutiques.set(b.id, b);

function connexion(id) {
  let c = ouvertes.get(id);
  if (!c) {
    const b = boutiques.get(id);
    if (!b) throw new Error("Espace inconnu");
    c = ouvrirEspace(b.fichier);
    ouvertes.set(id, c);
  }
  return c;
}

const slugifier = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "boutique";
function slugLibre(nom) {
  const base = slugifier(nom);
  const pris = new Set([...boutiques.values()].map((b) => b.slug));
  let slug = base;
  for (let n = 2; pris.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** Crée un nouvel espace (boutique) vide et renvoie sa fiche. */
function creerBoutique(nom, fichier) {
  const id = nanoid(10);
  if (!fichier) {
    fs.mkdirSync(DOSSIER_ESPACES, { recursive: true });
    fichier = path.join(DOSSIER_ESPACES, id + ".db");
  }
  const b = { id, slug: slugLibre(nom), fichier, cree_le: new Date().toISOString() };
  plateforme.prepare("INSERT INTO boutiques (id, slug, fichier, cree_le) VALUES (?, ?, ?, ?)").run(b.id, b.slug, b.fichier, b.cree_le);
  boutiques.set(id, b);
  return b;
}

const als = new AsyncLocalStorage();
/** Exécute fn dans l'espace de la boutique donnée (tout `db.…` s'y adresse). */
function dansEspace(id, fn) {
  const b = boutiques.get(id);
  if (!b) throw new Error("Espace inconnu");
  return als.run({ boutique: b }, fn);
}
const espaceCourant = () => als.getStore()?.boutique || null;
const listerBoutiques = () => [...boutiques.values()];
const boutiqueParRef = (ref) => boutiques.get(String(ref)) || listerBoutiques().find((b) => b.slug === String(ref)) || null;
/** Exécute fn dans chaque espace ; renvoie les résultats (les erreurs d'un espace n'arrêtent pas les autres). */
function pourChaqueEspace(fn) {
  const r = [];
  for (const b of listerBoutiques()) {
    try { r.push(dansEspace(b.id, () => fn(b))); } catch (e) { console.error(`Espace ${b.slug} :`, e.message); }
  }
  return r;
}
/** Premier espace pour lequel fn renvoie une valeur (recherche d'un jeton public, d'une transaction…). */
function trouverEspace(fn) {
  for (const b of listerBoutiques()) {
    try { if (dansEspace(b.id, () => fn(b))) return b; } catch { /* espace illisible : ignoré */ }
  }
  return null;
}

const comptes = {
  boutiqueDe: (telephone) => plateforme.prepare("SELECT boutique_id FROM comptes WHERE telephone = ?").get(String(telephone))?.boutique_id || null,
  ajouter: (telephone, boutiqueId) => plateforme.prepare("INSERT INTO comptes (telephone, boutique_id) VALUES (?, ?)").run(String(telephone), boutiqueId),
  retirer: (telephone) => plateforme.prepare("DELETE FROM comptes WHERE telephone = ?").run(String(telephone)),
};

// Installation antérieure (une seule base) : elle devient le premier espace, sans rien perdre
if (boutiques.size === 0 && fs.existsSync(DB_PATH)) {
  const ancienne = ouvrirEspace(DB_PATH);
  const utilisateurs = ancienne.prepare("SELECT telephone FROM utilisateurs").all();
  if (utilisateurs.length) {
    const nom = ancienne.prepare("SELECT valeur FROM parametres WHERE cle = 'nom'").get()?.valeur || "Ma Boutique";
    const b = creerBoutique(nom, DB_PATH);
    ouvertes.set(b.id, ancienne);
    for (const u of utilisateurs) comptes.ajouter(String(u.telephone).replace(/[\s.\-()]/g, ""), b.id);
    console.log(`   Base existante rattachée à l'espace « ${nom} » (${utilisateurs.length} compte(s))`);
  } else {
    ancienne.close();
  }
}

const reglages = {
  lire: (cle) => plateforme.prepare("SELECT valeur FROM reglages WHERE cle = ?").get(cle)?.valeur ?? null,
  ecrire: (cle, valeur) => plateforme.prepare("INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(cle, String(valeur)),
};

const outils = { reglages, dansEspace, espaceCourant, listerBoutiques, boutiqueParRef, pourChaqueEspace, trouverEspace, creerBoutique, comptes };

module.exports = new Proxy(outils, {
  get(cible, prop) {
    if (prop in cible) return cible[prop];
    const b = espaceCourant();
    if (!b) throw new Error(`Base de données utilisée hors d'un espace (db.${String(prop)})`);
    const c = connexion(b.id);
    const v = c[prop];
    return typeof v === "function" ? v.bind(c) : v;
  },
});

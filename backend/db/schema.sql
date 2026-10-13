-- ============================================================
-- Ivoire Shop — Schéma de base de données (SQLite)
-- Compatible avec un portage direct vers MySQL / PostgreSQL /
-- SQL Server (adapter les types AUTOINCREMENT / SERIAL / IDENTITY)
-- Les colonnes ajoutées après la v1 sont aussi créées par les
-- migrations de db/index.js pour les bases déjà existantes.
-- ============================================================

CREATE TABLE IF NOT EXISTS utilisateurs (
  id            TEXT PRIMARY KEY,
  nom           TEXT NOT NULL,
  email         TEXT UNIQUE,
  telephone     TEXT UNIQUE NOT NULL,
  mot_de_passe  TEXT NOT NULL,       -- haché (bcrypt)
  role          TEXT NOT NULL DEFAULT 'vendeur', -- admin | vendeur
  cree_le       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  nom           TEXT NOT NULL,
  telephone     TEXT NOT NULL,
  email         TEXT,
  ville         TEXT,
  statut        TEXT NOT NULL DEFAULT 'Standard', -- Standard | VIP
  notes         TEXT,
  supprime      INTEGER NOT NULL DEFAULT 0,       -- suppression logique (l'historique des ventes est conservé)
  cree_le       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS packs (
  id            TEXT PRIMARY KEY,
  nom           TEXT NOT NULL,
  description   TEXT,
  prix          REAL NOT NULL,
  cout          REAL,                              -- coût par article (calcul de marge)
  stock         INTEGER NOT NULL DEFAULT 0,
  sku           TEXT,
  emoji         TEXT DEFAULT '📦',           -- vignette de secours si aucune image
  image         TEXT,                              -- URL de l'image téléversée (/uploads/...)
  teinte        INTEGER NOT NULL DEFAULT 0,        -- couleur de la vignette (0 à 7)
  actif         INTEGER NOT NULL DEFAULT 1,        -- 0 = brouillon
  supprime      INTEGER NOT NULL DEFAULT 0,        -- suppression logique
  cree_le       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventes (
  id             TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pack_id        TEXT NOT NULL REFERENCES packs(id),
  vendeur_id     TEXT REFERENCES utilisateurs(id),
  quantite       INTEGER NOT NULL DEFAULT 1,
  prix_unitaire  REAL NOT NULL,
  mode_paiement  TEXT NOT NULL DEFAULT 'Espèces',
    -- Espèces | Orange Money | MTN MoMo | Moov Money | Wave | Carte bancaire | Paiement à la livraison
  statut_paiement    TEXT NOT NULL DEFAULT 'payee',
    -- payee | en_attente (à la livraison) | a_verifier (transfert Mobile Money déclaré) | en_cours (paiement en ligne) | echoue
  montant_recu       REAL,            -- espèces : somme remise par le client (monnaie = reçu - total)
  reference_paiement TEXT,            -- ID de transaction Mobile Money / n° d'autorisation carte
  telephone_paiement TEXT,            -- numéro Mobile Money du payeur
  paye_le            TEXT,
  date_vente     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Une commande regroupe une ou plusieurs lignes (table ventes, colonne commande_id).
-- vente_id désigne la première ligne (compatibilité v1).
CREATE TABLE IF NOT EXISTS commandes (
  id                  TEXT PRIMARY KEY,
  vente_id            TEXT NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  numero              TEXT UNIQUE NOT NULL,
  statut              TEXT NOT NULL DEFAULT 'en_attente',
    -- en_attente | confirmee | expediee | livree | annulee
  adresse_livraison   TEXT,
  note                TEXT,
  jeton_recu          TEXT,            -- jeton public du ticket de caisse (lien / QR code)
  canal               TEXT NOT NULL DEFAULT 'boutique', -- boutique (point de vente) | en_ligne (site client)
  frais_livraison     REAL NOT NULL DEFAULT 0,
  contact_telephone   TEXT,
  contact_email       TEXT,
  maj_le              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chronologie d'une commande : changements de statut et commentaires
CREATE TABLE IF NOT EXISTS commande_evenements (
  id            TEXT PRIMARY KEY,
  commande_id   TEXT NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'statut',   -- statut | note
  statut        TEXT,
  texte         TEXT,
  auteur_id     TEXT,
  cree_le       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investissements (
  id            TEXT PRIMARY KEY,
  libelle       TEXT NOT NULL,
  categorie     TEXT NOT NULL DEFAULT 'Autre', -- Stock | Marketing | Logistique | Équipement | Autre
  montant       REAL NOT NULL,
  date_invest   TEXT NOT NULL DEFAULT (date('now'))
);

-- Paiements en ligne (CinetPay)
CREATE TABLE IF NOT EXISTS paiements_en_ligne (
  id                       TEXT PRIMARY KEY,
  commande_id              TEXT NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  fournisseur              TEXT NOT NULL DEFAULT 'cinetpay',
  merchant_transaction_id  TEXT UNIQUE NOT NULL,
  transaction_id           TEXT,
  notify_token             TEXT,
  payment_url              TEXT,
  montant                  REAL NOT NULL,
  statut                   TEXT NOT NULL DEFAULT 'INITIATED',
  verifie_le               TEXT,
  cree_le                  TEXT NOT NULL
);

-- Informations de la boutique (nom, adresse, téléphone, message du ticket)
CREATE TABLE IF NOT EXISTS parametres (
  cle     TEXT PRIMARY KEY,
  valeur  TEXT
);

CREATE INDEX IF NOT EXISTS idx_ventes_client   ON ventes(client_id);
CREATE INDEX IF NOT EXISTS idx_ventes_pack     ON ventes(pack_id);
CREATE INDEX IF NOT EXISTS idx_commandes_vente ON commandes(vente_id);
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(statut);
CREATE INDEX IF NOT EXISTS idx_evenements_commande ON commande_evenements(commande_id);

-- ============================================================
-- v5 : stocks, promotions, marketing
-- ============================================================

-- Journal de tous les mouvements de stock (ventes, réceptions, inventaires…)
CREATE TABLE IF NOT EXISTS mouvements_stock (
  id           TEXT PRIMARY KEY,
  pack_id      TEXT NOT NULL,
  delta        INTEGER NOT NULL,          -- + entrée / − sortie
  stock_apres  INTEGER,
  motif        TEXT NOT NULL,             -- vente | vente_en_ligne | annulation | retablissement | suppression | reception | inventaire | casse | retour | ajustement | stock_initial
  note         TEXT,
  reference    TEXT,                      -- n° de commande, fournisseur…
  auteur_id    TEXT,
  cree_le      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mouvements_pack ON mouvements_stock(pack_id, cree_le);

-- Campagnes de messages aux clients (SMS / e-mail)
CREATE TABLE IF NOT EXISTS campagnes (
  id                TEXT PRIMARY KEY,
  titre             TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'libre',   -- promotion | nouveautes | bonne_semaine | libre
  message           TEXT NOT NULL,
  canaux            TEXT NOT NULL DEFAULT 'sms',     -- sms,email
  audience          TEXT NOT NULL DEFAULT 'tous',    -- tous | vip | fideles | inactifs
  automatique       INTEGER NOT NULL DEFAULT 0,      -- 1 = envoi hebdomadaire automatique
  statut            TEXT NOT NULL DEFAULT 'en_cours', -- en_cours | envoyee
  nb_destinataires  INTEGER NOT NULL DEFAULT 0,
  nb_envoyes        INTEGER NOT NULL DEFAULT 0,
  nb_echecs         INTEGER NOT NULL DEFAULT 0,
  simule            INTEGER NOT NULL DEFAULT 0,      -- 1 = aucun fournisseur configuré
  auteur_id         TEXT,
  cree_le           TEXT NOT NULL,
  envoyee_le        TEXT
);
CREATE TABLE IF NOT EXISTS campagne_envois (
  id            TEXT PRIMARY KEY,
  campagne_id   TEXT NOT NULL REFERENCES campagnes(id) ON DELETE CASCADE,
  client_id     TEXT,
  canal         TEXT NOT NULL,          -- sms | email
  destinataire  TEXT NOT NULL,
  statut        TEXT NOT NULL,          -- envoye | simule | echec
  erreur        TEXT,
  cree_le       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_envois_campagne ON campagne_envois(campagne_id);

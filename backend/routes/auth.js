/**
 * Comptes et espaces.
 *
 *   GET   /api/auth/etat                 l'inscription est-elle ouverte ? faut-il un code d'invitation ?
 *   POST  /api/auth/inscription          sans connexion : crée un NOUVEL ESPACE (boutique) et son administrateur
 *                                        connecté en administrateur : ajoute un vendeur (ou un administrateur) à SON espace
 *   POST  /api/auth/connexion            { telephone, mot_de_passe } → { utilisateur, boutique, jeton }
 *   GET   /api/auth/moi
 *   GET   /api/auth/equipe               (admin) membres de l'espace
 *   PATCH /api/auth/equipe/:id           (admin) { actif?, mot_de_passe?, nom? }
 *
 * Chaque administrateur qui s'inscrit obtient son propre espace : ses produits,
 * stocks, clients, ventes, finances et vendeurs ne sont visibles que par lui
 * et son équipe.
 */
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const db = require("../db");
const { signToken, authRequired, adminOnly } = require("../middleware/auth");
const { normTel } = require("../lib/outils");
const { lireBoutique, ecrireBoutique } = require("./parametres");

const router = express.Router();

const essais = new Map(); // téléphone → { n : essais ratés, jusqu : fin du verrouillage }
const profil = (u) => ({ id: u.id, nom: u.nom, telephone: u.telephone, email: u.email, role: u.role, actif: u.actif !== 0 });
const ficheBoutique = () => { const b = db.espaceCourant(); return { id: b.id, slug: b.slug, nom: lireBoutique().nom }; };

function creerUtilisateur({ nom, telephone, email, mot_de_passe, role }) {
  const id = nanoid();
  db.prepare("INSERT INTO utilisateurs (id, nom, telephone, email, mot_de_passe, role) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, String(nom).trim().slice(0, 80), telephone, email || null, bcrypt.hashSync(String(mot_de_passe), 10), role === "admin" ? "admin" : "vendeur");
  db.comptes.ajouter(telephone, db.espaceCourant().id);
  return db.prepare("SELECT * FROM utilisateurs WHERE id = ?").get(id);
}

/** Nouvel espace : une boutique vide + son administrateur. */
function creerEspace({ nom, telephone, email, mot_de_passe, boutique }) {
  const nomBoutique = String(boutique || "").trim().slice(0, 60) || `Boutique de ${String(nom).trim().split(/\s+/)[0]}`;
  const b = db.creerBoutique(nomBoutique);
  return db.dansEspace(b.id, () => {
    ecrireBoutique({ nom: nomBoutique });
    const utilisateur = creerUtilisateur({ nom, telephone, email, mot_de_passe, role: "admin" });
    installerGamme(utilisateur.id); // la gamme MILANA Care est prête à vendre dès l'ouverture de l'espace
    require("../lib/formations").installerFormations();
    return { boutique: b, utilisateur };
  });
}

/**
 * Comptes créés au démarrage à partir des variables d'environnement (facultatif) :
 *   COMPTE_ADMIN_NOM / COMPTE_ADMIN_TELEPHONE / COMPTE_ADMIN_MOT_DE_PASSE / COMPTE_ADMIN_BOUTIQUE
 *   COMPTE_VENDEUR_NOM / COMPTE_VENDEUR_TELEPHONE / COMPTE_VENDEUR_MOT_DE_PASSE (vendeur de cet administrateur)
 * Utile sur un hébergement sans disque persistant : les comptes sont recréés à chaque redémarrage.
 * Un compte déjà existant (même téléphone) n'est jamais modifié.
 */
(function comptesInitiaux() {
  const lire = (prefixe) => ({ nom: process.env[`${prefixe}_NOM`], telephone: normTel(process.env[`${prefixe}_TELEPHONE`]), mot_de_passe: process.env[`${prefixe}_MOT_DE_PASSE`] });
  const valide = (c, prefixe) => {
    if (!c.telephone || !c.mot_de_passe) return false;
    if (String(c.mot_de_passe).length < 6) { console.warn(`⚠️  ${prefixe}_MOT_DE_PASSE trop court (6 caractères minimum) : compte non créé`); return false; }
    return true;
  };
  const admin = lire("COMPTE_ADMIN");
  if (!valide(admin, "COMPTE_ADMIN")) return;
  let boutiqueId = db.comptes.boutiqueDe(admin.telephone);
  if (!boutiqueId) {
    boutiqueId = creerEspace({ ...admin, nom: admin.nom || "Administrateur", boutique: process.env.COMPTE_ADMIN_BOUTIQUE }).boutique.id;
    console.log(`   Espace administrateur créé depuis les variables d'environnement (${admin.telephone})`);
  }
  const vendeur = lire("COMPTE_VENDEUR");
  if (valide(vendeur, "COMPTE_VENDEUR") && !db.comptes.boutiqueDe(vendeur.telephone)) {
    db.dansEspace(boutiqueId, () => creerUtilisateur({ ...vendeur, nom: vendeur.nom || "Vendeur", role: "vendeur" }));
    console.log(`   Compte vendeur créé depuis les variables d'environnement (${vendeur.telephone})`);
  }
})();

// Plateforme vide : espaces de démonstration (boutiques de produits de beauté)
const { installerGamme } = require("../lib/gamme");
const donneesTest = require("../db/donnees-test");
donneesTest.installer({ creerEspace, creerUtilisateur, ecrireBoutique });

// Code d'invitation (CODE_INVITATION, facultatif) : s'il est défini, il est exigé pour
// créer un nouvel espace administrateur. Sans lui, l'inscription est ouverte à tous.
const CODE_INVITATION = process.env.CODE_INVITATION || "";
function codeValide(code) {
  if (!CODE_INVITATION) return true;
  const a = Buffer.from(String(code || "")), b = Buffer.from(CODE_INVITATION);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get("/etat", (req, res) => {
  // comptes_test : comptes de démonstration proposés sur l'écran de connexion (vide si DONNEES_TEST=0)
  res.json({ inscription_ouverte: true, code_invitation: Boolean(CODE_INVITATION), espaces: db.listerBoutiques().length, comptes_test: donneesTest.comptesTest() });
});

function validerCompte(corps) {
  const nom = String(corps.nom || "").trim();
  const telephone = normTel(corps.telephone);
  const mdp = corps.mot_de_passe;
  if (!nom || !telephone || !mdp) return { erreur: "nom, telephone et mot_de_passe sont requis" };
  if (telephone.replace(/\D/g, "").length < 8) return { erreur: "Numéro de téléphone invalide" };
  if (String(mdp).length < 8) return { erreur: "Le mot de passe doit contenir au moins 8 caractères" };
  if (db.comptes.boutiqueDe(telephone)) return { erreur: "Un compte existe déjà avec ce numéro", statut: 409 };
  return { compte: { nom, telephone, mot_de_passe: mdp, email: String(corps.email || "").trim().toLowerCase() || null } };
}

router.post("/inscription", (req, res, next) => {
  // Avec une session : l'administrateur ajoute un membre à son espace
  if (req.headers.authorization) return authRequired(req, res, () => adminOnly(req, res, next));
  // Sans session : création d'un nouvel espace administrateur
  if (!codeValide(req.body.code_invitation)) return res.status(403).json({ erreur: "Code d'invitation incorrect." });
  const v = validerCompte(req.body);
  if (v.erreur) return res.status(v.statut || 400).json({ erreur: v.erreur });
  const { boutique, utilisateur } = creerEspace({ ...v.compte, boutique: req.body.boutique });
  db.dansEspace(boutique.id, () => {
    res.status(201).json({ message: "Espace créé", utilisateur: profil(utilisateur), boutique: ficheBoutique(), jeton: signToken(utilisateur, boutique.id) });
  });
}, (req, res) => {
  const v = validerCompte(req.body);
  if (v.erreur) return res.status(v.statut || 400).json({ erreur: v.erreur });
  const utilisateur = creerUtilisateur({ ...v.compte, role: req.body.role });
  res.status(201).json({ message: "Compte créé", utilisateur: profil(utilisateur) });
});

router.post("/connexion", (req, res) => {
  const { mot_de_passe } = req.body;
  const telephone = normTel(req.body.telephone);
  if (!telephone || !mot_de_passe) return res.status(400).json({ erreur: "telephone et mot_de_passe sont requis" });
  const refus = () => res.status(401).json({ erreur: "Numéro ou mot de passe incorrect" });
  // Cinq mots de passe faux de suite : le compte est verrouillé 15 minutes (protège contre les essais en série)
  const verrou = essais.get(telephone);
  if (verrou && verrou.jusqu > Date.now()) return res.status(429).json({ erreur: "Trop d'essais : ce compte est verrouillé pendant 15 minutes." });
  const echec = () => {
    const v = essais.get(telephone) || { n: 0, jusqu: 0 };
    v.n += 1;
    if (v.n >= 5) { v.jusqu = Date.now() + 15 * 60 * 1000; v.n = 0; }
    essais.set(telephone, v);
    return refus();
  };
  const boutiqueId = db.comptes.boutiqueDe(telephone);
  if (!boutiqueId) return echec();
  db.dansEspace(boutiqueId, () => {
    const user = db.prepare("SELECT * FROM utilisateurs WHERE telephone = ?").get(telephone);
    if (!user || !bcrypt.compareSync(String(mot_de_passe), user.mot_de_passe)) return echec();
    essais.delete(telephone);
    if (user.actif === 0) return res.status(403).json({ erreur: "Ce compte a été désactivé par l'administrateur de la boutique." });
    res.json({ utilisateur: profil(user), boutique: ficheBoutique(), jeton: signToken(user, boutiqueId) });
  });
});

router.get("/moi", authRequired, (req, res) => {
  res.json({ utilisateur: profil(req.user), boutique: ficheBoutique() });
});

/* ------------------------------------------------------------ équipe de l'espace */

router.get("/equipe", authRequired, adminOnly, (req, res) => {
  res.json(db.prepare("SELECT id, nom, telephone, email, role, actif, cree_le FROM utilisateurs ORDER BY role, cree_le").all().map((u) => ({ ...profil(u), cree_le: u.cree_le })));
});

router.patch("/equipe/:id", authRequired, adminOnly, (req, res) => {
  const u = db.prepare("SELECT * FROM utilisateurs WHERE id = ?").get(req.params.id);
  if (!u) return res.status(404).json({ erreur: "Compte introuvable" });
  if (req.body.actif !== undefined) {
    if (u.id === req.user.id) return res.status(400).json({ erreur: "Vous ne pouvez pas désactiver votre propre compte" });
    db.prepare("UPDATE utilisateurs SET actif = ? WHERE id = ?").run(req.body.actif ? 1 : 0, u.id);
  }
  if (req.body.nom !== undefined && String(req.body.nom).trim()) db.prepare("UPDATE utilisateurs SET nom = ? WHERE id = ?").run(String(req.body.nom).trim().slice(0, 80), u.id);
  if (req.body.mot_de_passe !== undefined) {
    if (String(req.body.mot_de_passe).length < 8) return res.status(400).json({ erreur: "Le mot de passe doit contenir au moins 8 caractères" });
    db.prepare("UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?").run(bcrypt.hashSync(String(req.body.mot_de_passe), 10), u.id);
  }
  res.json(profil(db.prepare("SELECT * FROM utilisateurs WHERE id = ?").get(u.id)));
});

module.exports = router;

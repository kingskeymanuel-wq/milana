const crypto = require("crypto");
const jwt = require("jsonwebtoken");

let SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.startsWith("remplacez-par")) {
  // Pas de secret configuré : on en génère un aléatoire plutôt que d'utiliser
  // une valeur connue de tous. Les sessions seront perdues au redémarrage.
  SECRET = crypto.randomBytes(48).toString("hex");
  console.warn("⚠️  JWT_SECRET absent de .env : secret temporaire généré (les sessions expirent au redémarrage).");
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ erreur: "Authentification requise" });
  }
  let charge;
  try {
    charge = jwt.verify(token, SECRET);
  } catch (e) {
    return res.status(401).json({ erreur: "Session expirée, reconnectez-vous" });
  }
  // Le jeton désigne l'espace (boutique) du compte : toute la suite de la requête s'y exécute
  const db = require("../db");
  if (!charge.b || !db.boutiqueParRef(charge.b)) return res.status(401).json({ erreur: "Session expirée, reconnectez-vous" });
  db.dansEspace(charge.b, () => {
    // Le compte doit toujours exister ; son rôle actuel prime sur celui du jeton
    const user = db.prepare("SELECT id, nom, telephone, email, role FROM utilisateurs WHERE id = ? AND actif = 1").get(charge.id);
    if (!user) return res.status(401).json({ erreur: "Compte introuvable, reconnectez-vous" });
    req.user = user;
    req.boutique = db.espaceCourant();
    next();
  });
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ erreur: "Accès réservé aux administrateurs" });
  }
  next();
}

function signToken(user, boutiqueId) {
  return jwt.sign({ id: user.id, b: boutiqueId, nom: user.nom, telephone: user.telephone, email: user.email, role: user.role }, SECRET, {
    expiresIn: "7d",
  });
}

module.exports = { authRequired, adminOnly, signToken, SECRET };

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { authRequired, adminOnly } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const clientsRoutes = require("./routes/clients");
const packsRoutes = require("./routes/packs");
const ventesRoutes = require("./routes/ventes");
const commandesRoutes = require("./routes/commandes");
const investissementsRoutes = require("./routes/investissements");
const dashboardRoutes = require("./routes/dashboard");
const donneesRoutes = require("./routes/donnees");
const parametresRoutes = require("./routes/parametres");
const recusRoutes = require("./routes/recus");
const boutiqueRoutes = require("./routes/boutique");
const stocksRoutes = require("./routes/stocks");
const campagnesRoutes = require("./routes/campagnes");
const livreursRoutes = require("./routes/livreurs");
const depensesRoutes = require("./routes/depenses");
const { DOSSIER_UPLOADS } = require("./lib/images");

const app = express();
// Derrière le proxy de l'hébergeur (Render…) : vraie IP du client (limites de débit) et protocole https
app.set("trust proxy", 1);
const PORT = process.env.PORT || 4000;
const RACINE = path.join(__dirname, "..");
const ADMIN_DIR = path.join(RACINE, "admin");       // interface d'administration → /admin
const BOUTIQUE_DIR = path.join(RACINE, "boutique"); // site client → /
const PARTAGE_DIR = path.join(RACINE, "partage");   // modules communs (ticket de caisse…)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // L'interface compile son JSX dans le navigateur (Babel) et charge
        // React / les icônes depuis des CDN : d'où 'unsafe-eval' et ces origines.
        // cdnjs : génération du PDF (jsPDF) et du QR code des tickets de caisse
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        // images.unsplash.com : photos d'illustration des produits de test
        imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com"],
        // Aperçu du ticket PDF généré dans le navigateur (blob:)
        frameSrc: ["'self'", "blob:"],
        connectSrc: ["'self'", "https://esm.sh", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
        // Désactivé : casserait l'accès en http depuis un téléphone du réseau local
        upgradeInsecureRequests: null,
      },
    },
  })
);
// CORS : utile si l'interface est servie depuis une autre adresse (ex. npx serve)
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true }));
app.use(express.json({ limit: "15mb" })); // images produit (base64) et imports complets

// Limites anti-abus
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));
// Plus strict sur la connexion et l'inscription (force brute sur les mots de passe)
app.use(
  ["/api/auth/connexion", "/api/auth/inscription"],
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { erreur: "Trop de tentatives, réessayez dans quelques minutes." } })
);

app.get("/api/sante", (req, res) => res.json({ statut: "ok", service: "MILANA API" }));

// Authentification — publique
app.use("/api/auth", authRoutes);

// Ticket de caisse consultable par le client (lien / QR code) — public
app.use("/api/recus", rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }), recusRoutes);

// Boutique en ligne : catalogue, commandes, suivi, webhook de paiement — public
app.use("/api/boutique", boutiqueRoutes);

// Images des produits
app.use("/uploads", express.static(DOSSIER_UPLOADS, { maxAge: "30d", immutable: true, fallthrough: false }));

// Le reste de l'API nécessite un utilisateur connecté.
app.use("/api", authRequired);

app.use("/api/clients", clientsRoutes);
app.use("/api/packs", packsRoutes);
app.use("/api/ventes", ventesRoutes);
app.use("/api/commandes", commandesRoutes);
app.use("/api/investissements", adminOnly, investissementsRoutes);
app.use("/api/stocks", adminOnly, stocksRoutes);
app.use("/api/campagnes", adminOnly, campagnesRoutes);
app.use("/api/dashboard", adminOnly, dashboardRoutes);
app.use("/api/donnees", donneesRoutes);
app.use("/api/parametres", parametresRoutes);
app.use("/api/livreurs", livreursRoutes);
app.use("/api/depenses", adminOnly, depensesRoutes); // les vendeurs ne gèrent pas l'argent de la boutique
app.use("/api/diagnostics", adminOnly, require("./routes/diagnostics"));
app.use("/api/formations", adminOnly, require("./routes/formations"));

app.use("/api", (req, res) => res.status(404).json({ erreur: "Route introuvable" }));

// Fichiers des interfaces
const statique = (dossier) => express.static(dossier, { setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") });
// « /admin » → « /admin/ » (sinon les chemins relatifs de l'interface seraient faux)
app.use((req, res, next) => (req.path === "/admin" && !req.originalUrl.startsWith("/admin/") ? res.redirect(301, "/admin/") : next()));
app.use("/admin", statique(ADMIN_DIR));
app.use("/partage", statique(PARTAGE_DIR));
app.use("/", statique(BOUTIQUE_DIR));

app.use((req, res) => res.status(404).json({ erreur: "Route introuvable" }));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ erreur: "JSON invalide" });
  if (err.status === 404) return res.status(404).json({ erreur: "Fichier introuvable" });
  if (err.type === "entity.too.large") return res.status(413).json({ erreur: "Données trop volumineuses" });
  console.error(err);
  res.status(500).json({ erreur: "Erreur interne du serveur" });
});

// Formations de départ : installées une fois dans chaque espace (y compris ceux créés avant cette version)
require("./db").pourChaqueEspace(() => require("./lib/formations").installerFormations());

// Ventes enregistrées avant le suivi des tickets : numérotées une fois pour toutes
const { numeroterManquants } = require("./lib/tickets");
require("./db").pourChaqueEspace(() => require("./db").transaction(numeroterManquants)());

app.listen(PORT, () => {
  console.log(`✅ MILANA démarré
   Boutique client : http://localhost:${PORT}/
   Administration  : http://localhost:${PORT}/admin/`);
  if (!require("./lib/cinetpay").estConfigure()) console.log("   Paiement en ligne CinetPay : non configuré (CINETPAY_API_KEY / CINETPAY_API_PASSWORD)");
});

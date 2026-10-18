/* Prépare les interfaces pour le navigateur : le JSX de la boutique et de l'administration est traduit
   et regroupé une fois pour toutes (React et icônes compris), au lieu d'être traduit à chaque visite.
   Lancé automatiquement après « npm install » / « npm ci » ; à la main : npm run construire.
   Avec --surveiller, reconstruit à chaque modification (utilisé par « npm run dev »). */
const path = require("path");
const esbuild = require("esbuild");

const RACINE = path.join(__dirname, "..");
// Les interfaces importent « /partage/ticket.js » par son adresse web : on la ramène au fichier
const partage = {
  name: "partage",
  setup(b) {
    b.onResolve({ filter: /^\/partage\// }, (a) => ({ path: path.join(RACINE, a.path) }));
  },
};

const options = {
  entryPoints: [
    { in: path.join(RACINE, "boutique", "boutique.jsx"), out: "boutique/boutique.min" },
    { in: path.join(RACINE, "admin", "app.jsx"), out: "admin/app.min" },
  ],
  outdir: RACINE,
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2019",
  jsx: "transform",
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: [path.join(__dirname, "node_modules")],
  legalComments: "none",
  logLevel: "info",
  plugins: [partage],
};

(async () => {
  if (process.argv.includes("--surveiller")) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    // Le serveur redémarre de lui-même quand son code change (node --watch)
    require("child_process").spawn(process.execPath, ["--watch", "server.js"], { cwd: __dirname, stdio: "inherit" });
  } else {
    await esbuild.build(options);
  }
})().catch(() => process.exit(1));

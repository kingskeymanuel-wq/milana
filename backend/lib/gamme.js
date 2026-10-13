/**
 * Gamme MILANA Care : installée automatiquement dans un espace qui n'a encore aucun produit.
 * Les prix (en FCFA) et les stocks sont des valeurs de départ, à ajuster dans Administration › Produits.
 * soin_type / soin_cible servent au diagnostic capillaire pour choisir les produits à recommander.
 */
const { nanoid } = require("nanoid");
const db = require("../db");
const { mouvement } = require("./stock");

const GAMME = [
  { nom: "Shampooing Doux & Hydratant", categorie: "Shampooings", soin_type: "shampoo", soin_cible: "dry", emoji: "🧴", teinte: 4, prix: 9500, cout: 5200, stock: 42, sku: "MIL-01", image: "/images/produits/shampooing.png",
    description: "Nettoie en douceur et respecte le cuir chevelu. Aloe vera, karité, protéines." },
  { nom: "Démêlant Après-Shampooing", categorie: "Soins", soin_type: "conditioner", soin_cible: "damaged", emoji: "💧", teinte: 1, prix: 10500, cout: 5800, stock: 34, sku: "MIL-02", image: "/images/produits/demelant.png",
    description: "Adoucit, démêle et fortifie après le shampooing. Aloe vera, karité, protéines." },
  { nom: "Crème Capillaire", categorie: "Soins", soin_type: "pomade", soin_cible: "curly", emoji: "🥥", teinte: 2, prix: 11500, cout: 6400, stock: 20, sku: "MIL-03", image: "/images/produits/creme.png",
    description: "Hydrate, nourrit et assouplit les cheveux au quotidien." },
  { nom: "Huile Sérum", categorie: "Sérums et huiles", soin_type: "serum", soin_cible: "thin", emoji: "✨", teinte: 5, prix: 11000, cout: 6000, stock: 25, sku: "MIL-04", image: "/images/produits/huile.png",
    description: "Fortifie la fibre et accompagne la pousse, en massage sur le cuir chevelu." },
];

/** Installe la gamme dans l'espace courant s'il est vide. Retourne les produits créés. */
function installerGamme(auteurId = null) {
  if (db.prepare("SELECT COUNT(*) AS n FROM packs").get().n > 0) return [];
  return db.transaction(() => GAMME.map((p, i) => {
    const id = nanoid();
    db.prepare(
      `INSERT INTO packs (id, nom, description, prix, cout, stock, seuil_alerte, sku, emoji, image, teinte, actif, cree_le, categorie, pieces_par_lot, soin_type, soin_cible)
       VALUES (?, ?, ?, ?, ?, 0, 5, ?, ?, ?, ?, 1, ?, ?, 1, ?, ?)`
    ).run(id, p.nom, p.description, p.prix, p.cout, p.sku, p.emoji, p.image, p.teinte, new Date(Date.now() - i * 60000).toISOString(), p.categorie, p.soin_type, p.soin_cible);
    mouvement(id, p.stock, "stock_initial", { auteurId });
    return { id, ...p };
  }))();
}

module.exports = { GAMME, installerGamme };

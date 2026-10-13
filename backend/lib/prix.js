/**
 * Prix réellement appliqué à un produit : prix promotionnel tant que la
 * promotion est en cours, sinon prix normal. Utilisé partout où l'on vend
 * (caisse, boutique en ligne) : le prix n'est jamais pris du navigateur.
 */
function promoActive(p, maintenant = new Date()) {
  if (!p || p.prix_promo == null || !(Number(p.prix_promo) > 0) || Number(p.prix_promo) >= Number(p.prix)) return false;
  return !p.promo_fin || new Date(p.promo_fin) > maintenant;
}

const prixEffectif = (p) => (promoActive(p) ? Number(p.prix_promo) : Number(p.prix));

const remisePourcent = (p) => (promoActive(p) ? Math.round((1 - Number(p.prix_promo) / Number(p.prix)) * 100) : 0);

module.exports = { promoActive, prixEffectif, remisePourcent };

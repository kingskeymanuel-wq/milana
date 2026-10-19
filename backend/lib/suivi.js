/**
 * Suivi des livraisons en direct — un lien par colis.
 *
 * Quand le colis est en préparation, la boutique envoie au livreur (ou au service de livraison partenaire)
 * le lien du colis : /livraison.html#<jeton>. En l'ouvrant, le livreur voit les articles, le client, son contact,
 * l'adresse et une carte. Sa position est enregistrée dès l'ouverture (après l'autorisation demandée par le
 * téléphone), puis toutes les 15 secondes tant que la page reste ouverte. Il signale « Parti », « Arrivé »
 * (distance au point du client) et « Remis au client ».
 * Le client peut partager sa position (avec son accord) et confirmer « J'ai bien reçu ma commande ».
 * Le lien expire 24 h après la livraison. Positions conservées 7 jours.
 */
const crypto = require("crypto");
const db = require("../db");
const { ajouterEvenement } = require("./outils");
const { lignesCommande, changerStatut } = require("./commandes");

const DIRECT_MINUTES = 10; // au-delà, la position n'est plus « en direct »
const maintenant = () => new Date().toISOString();

/** Distance en mètres entre deux points GPS. */
function distance(a, b) {
  const r = (x) => (x * Math.PI) / 180, R = 6371000;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const point = (p) => {
  const lat = Number(p?.lat), lng = Number(p?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat, lng, precision: Math.min(100000, Math.max(0, Math.round(Number(p?.precision) || 0))) } : null;
};
const texte = (v, max) => String(v ?? "").trim().slice(0, max);

/** Colis par son jeton de livraison ; null si le lien a expiré (annulé, ou livré depuis plus de 24 h). */
function colisParJeton(j) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(j || ""))) return null;
  const c = db.prepare("SELECT * FROM commandes WHERE jeton_livraison = ? AND livraison = 1").get(String(j));
  if (!c || c.statut === "annulee") return null;
  if (c.statut === "livree" && c.livree_le && Date.now() - new Date(c.livree_le).getTime() > 864e5) return null;
  return c;
}

/** Lien du colis pour le livreur (créé à la première demande ; « nouveau » remplace un lien qui aurait circulé). */
function lienColis(commandeId, nouveau = false) {
  const c = db.prepare("SELECT * FROM commandes WHERE id = ?").get(commandeId);
  if (!c) return { erreur: "Commande introuvable" };
  if (!c.livraison) return { erreur: "Cette commande n'est pas à livrer" };
  if (["livree", "annulee"].includes(c.statut)) return { erreur: "Cette commande est déjà terminée" };
  if (c.jeton_livraison && !nouveau) return { jeton: c.jeton_livraison };
  const j = crypto.randomBytes(18).toString("base64url");
  db.prepare("UPDATE commandes SET jeton_livraison = ?, livraison_ouverte_le = NULL WHERE id = ?").run(j, c.id);
  return { jeton: j };
}

const derniere = (commandeId) => db.prepare("SELECT lat, lng, precision_m, cree_le FROM livraison_positions WHERE commande_id = ? ORDER BY cree_le DESC LIMIT 1").get(commandeId) || null;
const enDirect = (pos) => Boolean(pos && Date.now() - new Date(pos.cree_le).getTime() < DIRECT_MINUTES * 60000);
const nomLivreur = (c) => (c.livreur_id ? db.prepare("SELECT nom FROM livreurs WHERE id = ?").get(c.livreur_id)?.nom : null) || c.livreur_contact || null;

/** Position envoyée par la page du livreur. La première ouverture répertorie le livreur (nom et numéro facultatifs). */
function enregistrerPosition(c, p) {
  if (["livree", "annulee"].includes(c.statut)) return { erreur: "Livraison terminée" };
  const pt = point(p);
  const premiere = !c.livraison_ouverte_le;
  if (premiere) {
    const contact = [texte(p?.nom, 60), texte(p?.telephone, 30)].filter(Boolean).join(" · ") || null;
    db.prepare("UPDATE commandes SET livraison_ouverte_le = ?, livreur_contact = COALESCE(?, livreur_contact) WHERE id = ?").run(maintenant(), contact, c.id);
    ajouterEvenement(c.id, { type: "note", texte: `Lien de livraison ouvert par ${contact || nomLivreur(c) || "le livreur"}${pt ? " (position enregistrée)" : " (position non autorisée)"}.` });
  }
  if (!pt) return { ok: true, sans_position: true };
  const d = derniere(c.id);
  if (d && Date.now() - new Date(d.cree_le).getTime() < 8000) return { ok: true, ignoree: true }; // au plus une position toutes les 8 s
  db.prepare("INSERT INTO livraison_positions (id, commande_id, lat, lng, precision_m, cree_le) VALUES (?, ?, ?, ?, ?, ?)")
    .run(crypto.randomBytes(9).toString("base64url"), c.id, pt.lat, pt.lng, pt.precision, maintenant());
  if (Math.random() < 0.02) db.prepare("DELETE FROM livraison_positions WHERE cree_le < ?").run(new Date(Date.now() - 7 * 864e5).toISOString());
  return { ok: true, distance: c.dest_lat != null ? distance(pt, { lat: c.dest_lat, lng: c.dest_lng }) : null };
}

/** Ce que voit le livreur en ouvrant le lien. */
function detailsColis(c) {
  const lignes = lignesCommande(c);
  const client = lignes[0] ? db.prepare("SELECT nom, telephone, ville FROM clients WHERE id = ?").get(lignes[0].client_id) : null;
  const paye = lignes.length && lignes.every((v) => v.statut_paiement === "payee");
  const boutique = db.prepare("SELECT cle, valeur FROM parametres WHERE cle IN ('nom', 'telephone', 'whatsapp')").all().reduce((o, r) => ({ ...o, [r.cle]: r.valeur }), {});
  return {
    numero: c.numero, statut: c.statut, boutique: { nom: boutique.nom || "La boutique", telephone: boutique.whatsapp || boutique.telephone || "" },
    client: { nom: client?.nom || "", telephone: c.contact_telephone || client?.telephone || "", adresse: c.adresse_livraison || "", ville: client?.ville || "" },
    articles: lignes.map((v) => ({ nom: db.prepare("SELECT nom FROM packs WHERE id = ?").get(v.pack_id)?.nom || "Article", quantite: v.quantite })),
    a_encaisser: paye ? 0 : Math.round(lignes.reduce((s, v) => s + v.quantite * v.prix_unitaire, 0) + (Number(c.frais_livraison) || 0)),
    frais_livraison: Number(c.frais_livraison) || 0,
    destination: c.dest_lat != null ? { lat: c.dest_lat, lng: c.dest_lng } : null,
    livreur: nomLivreur(c), deja_ouvert: Boolean(c.livraison_ouverte_le), arrive_le: c.arrive_le, arrive_distance: c.arrive_distance, recu_client_le: c.recu_client_le,
  };
}

function action(c, quoi, p) {
  if (quoi === "depart") {
    if (!["en_attente", "confirmee"].includes(c.statut)) return { erreur: "Le colis est déjà parti" };
    changerStatut(c.id, "expediee", null, `Parti en livraison${nomLivreur(c) ? " avec " + nomLivreur(c) : ""}`);
    return { ok: true };
  }
  if (["livree", "annulee"].includes(c.statut)) return { erreur: "Livraison déjà terminée" };
  if (quoi === "arrive") {
    const pt = point(p);
    const dist = pt && c.dest_lat != null ? distance(pt, { lat: c.dest_lat, lng: c.dest_lng }) : null;
    db.prepare("UPDATE commandes SET arrive_le = ?, arrive_lat = ?, arrive_lng = ?, arrive_distance = ? WHERE id = ?").run(maintenant(), pt?.lat ?? null, pt?.lng ?? null, dist, c.id);
    ajouterEvenement(c.id, { type: "note", texte: `Livreur arrivé${dist != null ? ` à ${dist} m du point indiqué par le client` : pt ? " (position enregistrée)" : ""}.` });
    return { ok: true, distance: dist };
  }
  if (quoi === "remis") {
    changerStatut(c.id, "livree", null, `Remis au client${nomLivreur(c) ? " par " + nomLivreur(c) : ""}`);
    return { ok: true };
  }
  return { erreur: "Action inconnue" };
}

/** Client : partage de sa position (avec son accord) et confirmation de réception. */
function positionClient(c, p) {
  const pt = point(p);
  if (!pt) return { erreur: "Position invalide" };
  db.prepare("UPDATE commandes SET dest_lat = ?, dest_lng = ? WHERE id = ?").run(pt.lat, pt.lng, c.id);
  ajouterEvenement(c.id, { type: "note", texte: "Le client a partagé sa position pour la livraison." });
  return { ok: true };
}
function recuClient(c) {
  if (c.statut === "annulee") return { erreur: "Commande annulée" };
  if (!c.recu_client_le) {
    db.prepare("UPDATE commandes SET recu_client_le = ? WHERE id = ?").run(maintenant(), c.id);
    ajouterEvenement(c.id, { type: "note", texte: "Le client a confirmé avoir reçu sa commande." });
  }
  return { ok: true };
}
/** Ce que voit le client sur sa page de suivi. */
function pourClient(c) {
  if (!c.livraison) return null;
  const pos = derniere(c.id), direct = c.statut === "expediee" && enDirect(pos);
  const nom = nomLivreur(c);
  return { livreur: nom ? String(nom).split(/[\s(·]/)[0] : null, en_route: direct,
    distance: direct && c.dest_lat != null ? distance(pos, { lat: c.dest_lat, lng: c.dest_lng }) : null,
    position_partagee: c.dest_lat != null, arrive_le: c.arrive_le, recu_client_le: c.recu_client_le };
}

/** Vue de la boutique : chaque colis en cours, la position de son livreur et son état. */
function vue(filtreVendeur = null) {
  return db.prepare(`SELECT * FROM commandes WHERE livraison = 1 AND (statut IN ('en_attente', 'confirmee', 'expediee') OR (statut = 'livree' AND livree_le >= ?)) ORDER BY maj_le DESC LIMIT 200`)
    .all(new Date(Date.now() - 864e5).toISOString())
    .filter((c) => !filtreVendeur || db.prepare("SELECT 1 FROM ventes WHERE commande_id = ? AND vendeur_id = ? LIMIT 1").get(c.id, filtreVendeur))
    .map((c) => {
      const pos = derniere(c.id);
      const trace = c.livraison_ouverte_le ? db.prepare("SELECT lat, lng FROM livraison_positions WHERE commande_id = ? ORDER BY cree_le DESC LIMIT 120").all(c.id).reverse() : [];
      return { id: c.id, numero: c.numero, statut: c.statut, adresse: c.adresse_livraison, livreur: nomLivreur(c), lien_cree: Boolean(c.jeton_livraison), ouvert_le: c.livraison_ouverte_le,
        position: pos ? { lat: pos.lat, lng: pos.lng, precision: pos.precision_m, le: pos.cree_le } : null, en_direct: enDirect(pos) && c.statut !== "livree",
        destination: c.dest_lat != null ? { lat: c.dest_lat, lng: c.dest_lng } : null, trace,
        distance: pos && c.dest_lat != null ? distance(pos, { lat: c.dest_lat, lng: c.dest_lng }) : null,
        arrive_le: c.arrive_le, arrive_distance: c.arrive_distance, recu_client_le: c.recu_client_le, livree_le: c.livree_le };
    });
}

module.exports = { distance, colisParJeton, lienColis, enregistrerPosition, detailsColis, action, positionClient, recuClient, pourClient, vue };

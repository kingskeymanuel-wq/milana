/**
 * Marketing : campagnes SMS / e-mail aux clients ayant donné leur accord
 * (case cochée lors d'un achat ou fiche client). Chaque message contient un
 * lien de désinscription (loi ivoirienne n° 2013-450 sur les données personnelles).
 *
 * - Campagnes manuelles (promotion, nouveautés, message libre)
 * - Message hebdomadaire automatique (jour et heure réglables, lundi 8 h par défaut)
 */
const crypto = require("crypto");
const { nanoid } = require("nanoid");
const db = require("../db");
const { envoyerSms } = require("./sms");
const { envoyerEmail, estConfigure: emailConfigure, echapper } = require("./email");
const { lireBoutique } = require("../routes/parametres");
const { promoActive, prixEffectif, remisePourcent } = require("./prix");

const smsConfigure = () => Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_API_KEY);
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (n) => nf.format(Math.round(n || 0)).replace(/ | /g, " ") + " FCFA";
const urlBase = () => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");

/* ------------------------------------------------------------ modèles de messages */
const MODELES = {
  bonne_semaine: "Bonjour {prenom} ! Toute l'équipe de {boutique} vous souhaite une excellente semaine.{nouveautes}{promos} Découvrez la boutique : {lien}",
  promotion: "PROMO chez {boutique} ! {promos_detail} Profitez-en vite : {lien}",
  nouveautes: "Nouveau chez {boutique} : {nouveautes_detail}. À découvrir dès maintenant : {lien}",
  libre: "",
};

function nouveautes(jours = 7) {
  const depuis = new Date(Date.now() - jours * 864e5).toISOString();
  return db.prepare("SELECT * FROM packs WHERE supprime = 0 AND actif = 1 AND stock > 0 AND cree_le >= ? ORDER BY cree_le DESC LIMIT 5").all(depuis);
}
const promosEnCours = () => db.prepare("SELECT * FROM packs WHERE supprime = 0 AND actif = 1 AND prix_promo IS NOT NULL").all().filter((p) => promoActive(p)).slice(0, 5);

function contexte() {
  const nv = nouveautes();
  const pr = promosEnCours();
  const finPromo = pr.map((p) => p.promo_fin).filter(Boolean).sort()[0];
  return {
    boutique: lireBoutique().nom,
    lien: `${urlBase()}/#/boutique/${db.espaceCourant().slug}`,
    nouveautes: nv.length ? ` Nouveautés : ${nv.map((p) => p.nom).join(", ")}.` : "",
    nouveautes_detail: nv.map((p) => `${p.nom} (${fmt(prixEffectif(p))})`).join(", ") || "de nouveaux articles",
    promos: pr.length ? ` En promotion : ${pr.map((p) => `${p.nom} -${remisePourcent(p)}%`).join(", ")}.` : "",
    promos_detail: (pr.map((p) => `${p.nom} à ${fmt(p.prix_promo)} au lieu de ${fmt(p.prix)} (-${remisePourcent(p)}%)`).join(", ") || "des prix réduits")
      + (finPromo ? `, jusqu'au ${new Date(finPromo).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.` : "."),
  };
}

/** Remplace {variables} — {prenom} est propre à chaque client. */
function rendre(modele, ctx, client) {
  const prenom = String(client?.nom || "").trim().split(/\s+/)[0] || "cher client";
  return String(modele).replace(/\{(\w+)\}/g, (m, k) => (k === "prenom" ? prenom : ctx[k] ?? m)).replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------ destinataires */
const AUDIENCES = {
  tous: "Tous les clients abonnés",
  vip: "Clients VIP",
  fideles: "Clients fidèles (2 achats ou plus)",
  inactifs: "Clients sans achat depuis 30 jours",
};

function destinataires(audience = "tous") {
  const clients = db.prepare("SELECT * FROM clients WHERE supprime = 0 AND consentement_marketing = 1").all();
  const stats = new Map(db.prepare(
    `SELECT v.client_id, COUNT(DISTINCT COALESCE(v.commande_id, v.id)) AS n, MAX(v.date_vente) AS dernier
     FROM ventes v LEFT JOIN commandes c ON c.id = v.commande_id WHERE COALESCE(c.statut, '') <> 'annulee' GROUP BY v.client_id`
  ).all().map((r) => [r.client_id, r]));
  const limite = new Date(Date.now() - 30 * 864e5).toISOString();
  return clients.filter((c) => {
    const s = stats.get(c.id);
    if (audience === "vip") return c.statut === "VIP";
    if (audience === "fideles") return (s?.n || 0) >= 2;
    if (audience === "inactifs") return !s || s.dernier < limite;
    return true;
  });
}

function jetonDesinscription(client) {
  if (client.jeton_desinscription) return client.jeton_desinscription;
  const j = crypto.randomBytes(9).toString("base64url");
  db.prepare("UPDATE clients SET jeton_desinscription = ? WHERE id = ?").run(j, client.id);
  return j;
}

function apercu({ audience = "tous", canaux = ["sms", "email"], type = "libre", message = "" }) {
  const liste = destinataires(audience);
  const ctx = contexte();
  const modele = message || MODELES[type] || "";
  return {
    destinataires: liste.length,
    sms: canaux.includes("sms") ? liste.filter((c) => String(c.telephone || "").replace(/\D/g, "").length >= 8).length : 0,
    email: canaux.includes("email") ? liste.filter((c) => /@/.test(c.email || "")).length : 0,
    exemple: modele ? rendre(modele, ctx, liste[0] || { nom: "Aïcha" }) : "",
    modele,
  };
}

/* ------------------------------------------------------------ envoi */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Crée la campagne puis envoie les messages en arrière-plan (la réponse HTTP
 * n'attend pas la fin). Renvoie l'identifiant de la campagne.
 */
function lancerCampagne({ titre, type = "libre", message, canaux = ["sms"], audience = "tous", automatique = false, auteurId = null }) {
  const ctx = contexte();
  const modele = String(message || MODELES[type] || "").trim();
  if (!modele) throw new Error("Le message est vide");
  const liste = destinataires(audience);
  const id = nanoid();
  const simule = (canaux.includes("sms") && !smsConfigure()) || (canaux.includes("email") && !emailConfigure());
  db.prepare(
    `INSERT INTO campagnes (id, titre, type, message, canaux, audience, automatique, statut, nb_destinataires, simule, auteur_id, cree_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'en_cours', ?, ?, ?, ?)`
  ).run(id, String(titre || "Campagne").slice(0, 120), type, modele, canaux.join(","), audience, automatique ? 1 : 0, liste.length, simule ? 1 : 0, auteurId, new Date().toISOString());

  (async () => {
    const ins = db.prepare("INSERT INTO campagne_envois (id, campagne_id, client_id, canal, destinataire, statut, erreur, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    let envoyes = 0, echecs = 0;
    const boutique = lireBoutique();
    for (const client of liste) {
      const texte = rendre(modele, ctx, client);
      const stop = `${urlBase()}/#/stop/${jetonDesinscription(client)}`;
      if (canaux.includes("sms") && String(client.telephone || "").replace(/\D/g, "").length >= 8) {
        try {
          const r = await envoyerSms(client.telephone, `${texte} STOP: ${stop}`);
          ins.run(nanoid(), id, client.id, "sms", client.telephone, r?.simule ? "simule" : "envoye", null, new Date().toISOString());
          envoyes++;
        } catch (e) {
          ins.run(nanoid(), id, client.id, "sms", client.telephone, "echec", String(e.message).slice(0, 200), new Date().toISOString());
          echecs++;
        }
      }
      if (canaux.includes("email") && /@/.test(client.email || "")) {
        try {
          const r = await envoyerEmail({
            a: client.email,
            sujet: `${boutique.nom} — ${titre || "Des nouvelles de la boutique"}`,
            texte: `${texte}\n\nSe désinscrire : ${stop}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
                     <h2 style="margin:0 0 12px">${echapper(boutique.nom)}</h2>
                     <p style="font-size:15px;line-height:1.6">${echapper(texte).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>
                     <p style="margin-top:28px;font-size:12px;color:#888">Vous recevez ce message car vous avez accepté les communications de ${echapper(boutique.nom)}.
                     <a href="${stop}" style="color:#888">Se désinscrire</a></p></div>`,
          });
          ins.run(nanoid(), id, client.id, "email", client.email, r?.simule ? "simule" : "envoye", null, new Date().toISOString());
          envoyes++;
        } catch (e) {
          ins.run(nanoid(), id, client.id, "email", client.email, "echec", String(e.message).slice(0, 200), new Date().toISOString());
          echecs++;
        }
      }
      db.prepare("UPDATE campagnes SET nb_envoyes = ?, nb_echecs = ? WHERE id = ?").run(envoyes, echecs, id);
      await pause(150); // ménage les fournisseurs (limites de débit)
    }
    db.prepare("UPDATE campagnes SET statut = 'envoyee', envoyee_le = ?, nb_envoyes = ?, nb_echecs = ? WHERE id = ?").run(new Date().toISOString(), envoyes, echecs, id);
  })().catch((e) => {
    console.error("Campagne", id, e);
    db.prepare("UPDATE campagnes SET statut = 'envoyee', envoyee_le = ? WHERE id = ?").run(new Date().toISOString(), id);
  });
  return id;
}

/* ------------------------------------------------------------ message hebdomadaire automatique */
const HEBDO_DEFAUT = { actif: "0", jour: "1", heure: "8", canaux: "sms,email", message: MODELES.bonne_semaine, dernier: "" };

function lireHebdo() {
  const h = { ...HEBDO_DEFAUT };
  for (const r of db.prepare("SELECT cle, valeur FROM parametres WHERE cle LIKE 'hebdo_%'").all()) h[r.cle.slice(6)] = r.valeur ?? "";
  return h;
}
function ecrireHebdo(v) {
  const maj = db.prepare("INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur");
  for (const k of Object.keys(HEBDO_DEFAUT)) if (v[k] !== undefined) maj.run("hebdo_" + k, String(v[k]));
  return lireHebdo();
}

/** Clé de semaine ISO (ex. 2026-W40) : garantit un seul envoi automatique par semaine. */
function semaine(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - jour);
  const debut = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - debut) / 864e5 + 1) / 7)).padStart(2, "0")}`;
}

function envoyerHebdo({ force = false } = {}) {
  const h = lireHebdo();
  const id = lancerCampagne({
    titre: "Message de la semaine", type: "bonne_semaine", message: h.message, canaux: h.canaux.split(",").filter(Boolean), automatique: true,
  });
  if (!force) ecrireHebdo({ dernier: semaine() });
  return id;
}

// Vérifie toutes les 10 minutes s'il est l'heure du message hebdomadaire (heure d'Abidjan = UTC)
function verifierHebdo() {
  try {
    const h = lireHebdo();
    const maintenant = new Date();
    if (h.actif !== "1" || maintenant.getUTCDay() !== Number(h.jour) || maintenant.getUTCHours() < Number(h.heure) || h.dernier === semaine(maintenant)) return;
    envoyerHebdo();
    console.log("Message hebdomadaire envoyé", db.espaceCourant().slug, semaine(maintenant));
  } catch (e) {
    console.error("Message hebdomadaire :", e.message);
  }
}
// Chaque espace a ses propres réglages et ses propres clients
setInterval(() => db.pourChaqueEspace(verifierHebdo), 10 * 60 * 1000).unref();
setTimeout(() => db.pourChaqueEspace(verifierHebdo), 15000).unref();

module.exports = { MODELES, AUDIENCES, apercu, lancerCampagne, lireHebdo, ecrireHebdo, envoyerHebdo, destinataires, smsConfigure, emailConfigure, semaine };

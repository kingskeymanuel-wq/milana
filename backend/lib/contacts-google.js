/**
 * Répertoire par l'adresse e-mail (compte Google) : les téléphones Android enregistrent leurs contacts dans le compte
 * Google de leur propriétaire. Avec SON accord explicite (page d'autorisation de Google), on lit une fois ses contacts
 * (noms, numéros, e-mails) pour les ajouter à son répertoire. Aucun accès n'est conservé : pas de jeton enregistré.
 *
 * Réglages (compte Google Cloud du propriétaire de la plateforme) : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
 * API utilisée : Google People API, autorisation « contacts.readonly ».
 * Même fichier dans MANUX digital et dans les boutiques (GOUABO, VENDRE+, MILANA).
 */
const crypto = require("crypto");

const PORTEE = "https://www.googleapis.com/auth/contacts.readonly";
const configure = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/* Demandes en cours : état → { donnees, expire } (15 minutes, une seule utilisation) */
const demandes = new Map();
function nouvelleDemande(donnees) {
  const etat = crypto.randomBytes(24).toString("base64url");
  demandes.set(etat, { donnees, expire: Date.now() + 15 * 60 * 1000 });
  for (const [k, v] of demandes) if (v.expire < Date.now()) demandes.delete(k);
  return etat;
}
function reprendreDemande(etat) {
  const d = demandes.get(String(etat || ""));
  demandes.delete(String(etat || ""));
  return d && d.expire >= Date.now() ? d.donnees : null;
}

/** Adresse de la page d'autorisation Google (l'adresse e-mail saisie pré-remplit le bon compte). */
function urlAutorisation({ redirection, etat, email }) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirection, response_type: "code", scope: PORTEE,
    state: etat, access_type: "online", prompt: "consent", include_granted_scopes: "false",
  });
  if (email) p.set("login_hint", String(email).trim().slice(0, 120));
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p;
}

/** Échange le code contre un accès temporaire, lit les contacts, puis oublie l'accès. */
async function lireContacts({ code, redirection }) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(20000),
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirection, grant_type: "authorization_code" }),
  });
  const jeton = await r.json().catch(() => ({}));
  if (!r.ok || !jeton.access_token) throw new Error("Google n'a pas donné l'accès : " + (jeton.error_description || jeton.error || r.status));
  const contacts = [];
  let page = "";
  for (let n = 0; n < 10; n++) { // 10 pages de 1000 contacts au plus
    const u = new URL("https://people.googleapis.com/v1/people/me/connections");
    u.searchParams.set("personFields", "names,phoneNumbers,emailAddresses");
    u.searchParams.set("pageSize", "1000");
    if (page) u.searchParams.set("pageToken", page);
    const c = await fetch(u, { headers: { Authorization: "Bearer " + jeton.access_token }, signal: AbortSignal.timeout(20000) });
    const j = await c.json().catch(() => ({}));
    if (!c.ok) throw new Error("Lecture des contacts impossible : " + (j.error?.message || c.status));
    for (const p of j.connections || []) {
      const nom = p.names?.[0]?.displayName || "", telephone = p.phoneNumbers?.[0]?.value || "", email = p.emailAddresses?.[0]?.value || "";
      if (telephone || email) contacts.push({ nom, telephone, email });
    }
    page = j.nextPageToken || "";
    if (!page) break;
  }
  // L'accès est rendu à Google tout de suite : rien n'est conservé
  fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(jeton.access_token), { method: "POST", signal: AbortSignal.timeout(10000) }).catch(() => {});
  return contacts;
}

module.exports = { configure, nouvelleDemande, reprendreDemande, urlAutorisation, lireContacts, PORTEE };

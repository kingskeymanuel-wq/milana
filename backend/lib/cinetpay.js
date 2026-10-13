/**
 * Paiement en ligne CinetPay (Orange Money, MTN MoMo, Moov Money, Wave, cartes).
 *
 * Implémente l'API CinetPay v1 telle qu'utilisée par le SDK officiel
 * github.com/cinetpay/cinetpay-go :
 *   POST /v1/oauth/login        { api_key, api_password } → { access_token }
 *   POST /v1/payment            (Bearer) → { payment_url, payment_token, notify_token, transaction_id, ... }
 *   GET  /v1/payment/{id}       (Bearer) → { status, transaction_id, merchant_transaction_id, ... }
 *   Notification (webhook)      { notify_token, merchant_transaction_id, transaction_id }
 * Bac à sable : https://api.cinetpay.net (clé sk_test_…) ; production : https://api.cinetpay.co (clé sk_live_…).
 *
 * Activé uniquement si CINETPAY_API_KEY et CINETPAY_API_PASSWORD sont définis (.env).
 */
const API_KEY = process.env.CINETPAY_API_KEY || "";
const API_PASSWORD = process.env.CINETPAY_API_PASSWORD || "";
const BASE_URL = (process.env.CINETPAY_BASE_URL || (API_KEY.startsWith("sk_live_") ? "https://api.cinetpay.co" : "https://api.cinetpay.net")).replace(/\/$/, "");
const DUREE_JETON_MS = 23 * 3600 * 1000;

// Codes « normaux » renvoyés par l'API (cf. SDK : 200 OK, 100 SUCCESS, 2001 INITIATED, 2002 PENDING)
const CODES_OK = new Set([200, 100, 2001, 2002]);
// Statuts définitifs d'une transaction
const STATUTS_SUCCES = new Set(["SUCCESS"]);
const STATUTS_ECHEC = new Set(["FAILED", "EXPIRED", "INSUFFICIENT_BALANCE", "USER_NOT_FOUND", "USER_IS_BLOCKED", "NOT_ALLOWED", "OTP_EXPIRED"]);

class ErreurCinetPay extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const estConfigure = () => Boolean(API_KEY && API_PASSWORD);
const estBacASable = () => API_KEY.startsWith("sk_test_");

let jeton = null;
let jetonExpire = 0;

async function requete(methode, chemin, corps, avecJeton = true) {
  const entetes = { Accept: "application/json", "Content-Type": "application/json" };
  if (avecJeton) entetes.Authorization = "Bearer " + (await obtenirJeton());
  let res;
  try {
    res = await fetch(BASE_URL + chemin, {
      method: methode,
      headers: entetes,
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new ErreurCinetPay("Service de paiement injoignable", "RESEAU");
  }
  const data = await res.json().catch(() => ({}));
  const code = Number(data.code);
  if (res.status >= 400 || (Number.isFinite(code) && data.code !== undefined && !CODES_OK.has(code))) {
    throw new ErreurCinetPay(data.description || data.message || data.status || `Erreur CinetPay (${res.status})`, code || res.status);
  }
  return data;
}

async function obtenirJeton(forcer = false) {
  if (!forcer && jeton && Date.now() < jetonExpire) return jeton;
  const data = await requete("POST", "/v1/oauth/login", { api_key: API_KEY, api_password: API_PASSWORD }, false);
  if (!data.access_token) throw new ErreurCinetPay("Authentification CinetPay refusée (vérifiez la clé et le mot de passe API)", "AUTH");
  jeton = data.access_token;
  jetonExpire = Date.now() + DUREE_JETON_MS;
  return jeton;
}

/** Réessaie une fois avec un jeton neuf si le jeton a expiré (code 1003 / 1002). */
async function avecReessai(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.code === 1003 || e.code === 1002) { await obtenirJeton(true); return fn(); }
    throw e;
  }
}

/** Téléphone ivoirien → format international exigé par CinetPay (+225XXXXXXXXXX). */
function telInternational(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 10) return "+225" + d;
  if (d.startsWith("225") && d.length === 13) return "+" + d;
  return d.length >= 8 && d.length <= 15 ? "+" + d : "";
}

/**
 * Initialise un paiement. Contraintes de l'API (validées par le SDK officiel) :
 * merchant_transaction_id 1–30 caractères, montant entier 100–2 500 000,
 * e-mail valide, prénom/nom ≥ 2 caractères, URL ≤ 120 caractères.
 */
async function initialiserPaiement({ merchantTransactionId, montant, designation, email, prenom, nom, telephone, successUrl, failedUrl, notifyUrl }) {
  const corps = {
    currency: "XOF",
    merchant_transaction_id: merchantTransactionId,
    amount: Math.round(montant),
    lang: "fr",
    designation: String(designation).slice(0, 255),
    client_email: email,
    client_first_name: prenom,
    client_last_name: nom,
    success_url: successUrl,
    failed_url: failedUrl,
    notify_url: notifyUrl,
    channel: "PUSH",
  };
  const tel = telInternational(telephone);
  if (tel) corps.client_phone_number = tel;
  const data = await avecReessai(() => requete("POST", "/v1/payment", corps));
  return {
    paymentUrl: data.payment_url || null,
    paymentToken: data.payment_token || null,
    notifyToken: data.notify_token || null,
    transactionId: data.transaction_id || null,
    statut: data.details?.status || data.status || "INITIATED",
  };
}

/** Statut d'une transaction (identifiant CinetPay ou merchant_transaction_id). */
async function statutPaiement(identifiant) {
  const data = await avecReessai(() => requete("GET", "/v1/payment/" + encodeURIComponent(identifiant)));
  const statut = String(data.status || "");
  return {
    statut,
    reussi: STATUTS_SUCCES.has(statut),
    echoue: STATUTS_ECHEC.has(statut),
    transactionId: data.transaction_id || null,
  };
}

module.exports = { estConfigure, estBacASable, initialiserPaiement, statutPaiement, telInternational, ErreurCinetPay };

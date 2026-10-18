/**
 * Moyens de paiement personnels d'un vendeur (numéros Mobile Money et liens de paiement).
 * Rangés dans utilisateurs.paiements (JSON). Vides : ce sont ceux de la boutique qui s'appliquent.
 */
const db = require("../db");

const CLES = ["momo_wave", "momo_orange", "momo_mtn", "momo_moov", "momo_titulaire", "lien_wave", "lien_orange", "lien_mtn", "lien_moov"];
const OPERATEURS = [
  { cle: "momo_orange", lien: "lien_orange", mode: "Orange Money" },
  { cle: "momo_mtn", lien: "lien_mtn", mode: "MTN MoMo" },
  { cle: "momo_moov", lien: "lien_moov", mode: "Moov Money" },
  { cle: "momo_wave", lien: "lien_wave", mode: "Wave" },
];

function lire(utilisateurId) {
  const u = utilisateurId && db.prepare("SELECT nom, paiements FROM utilisateurs WHERE id = ?").get(utilisateurId);
  let v = {};
  try { v = u?.paiements ? JSON.parse(u.paiements) : {}; } catch { v = {}; }
  const valeurs = Object.fromEntries(CLES.map((k) => [k, String(v[k] ?? "").trim()]));
  return { valeurs, modifie: v.modifie || null, nom: u?.nom || "" };
}

/** Liste « transfert » (même forme que celle de la boutique) des opérateurs réglés par le vendeur. */
function transfert(utilisateurId) {
  const { valeurs: v, nom } = lire(utilisateurId);
  return OPERATEURS.filter((o) => v[o.cle] || v[o.lien]).map((o) => ({ mode: o.mode, numero: v[o.cle], lien: v[o.lien], titulaire: v.momo_titulaire || nom }));
}

/** Vérifie et normalise ; renvoie { erreur } ou { valeurs }. Liens : https uniquement. */
function valider(corps) {
  const valeurs = {};
  for (const k of CLES) {
    let s = String(corps?.[k] ?? "").trim().slice(0, 300);
    if (k.startsWith("lien_") && s) {
      let ok = false;
      try { ok = new URL(s).protocol === "https:"; } catch { /* adresse invalide */ }
      if (!ok) return { erreur: "Lien de paiement invalide : collez l'adresse complète, qui commence par https://" };
    }
    if (k.startsWith("momo_") && k !== "momo_titulaire" && s && s.replace(/\D/g, "").length < 8) return { erreur: "Numéro Mobile Money incomplet." };
    valeurs[k] = s;
  }
  return { valeurs };
}

function ecrire(utilisateurId, valeurs, auteur) {
  db.prepare("UPDATE utilisateurs SET paiements = ? WHERE id = ?").run(JSON.stringify({ ...valeurs, modifie: { le: new Date().toISOString(), par: auteur } }), utilisateurId);
}

module.exports = { CLES, lire, transfert, valider, ecrire };

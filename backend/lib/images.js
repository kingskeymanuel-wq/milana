/**
 * Images des produits : reçues en « data URL » (base64, déjà redimensionnées
 * par l'interface), enregistrées dans backend/uploads/packs et servies sous
 * /uploads/packs/<fichier>.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// UPLOADS_DIR : dossier persistant en production (ex. disque Render /var/data/uploads)
const DOSSIER_UPLOADS = process.env.UPLOADS_DIR || path.join(__dirname, "..", "uploads");
const DOSSIER_PACKS = path.join(DOSSIER_UPLOADS, "packs");
fs.mkdirSync(DOSSIER_PACKS, { recursive: true });

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TAILLE_MAX = 3 * 1024 * 1024; // 3 Mo après décodage

class ErreurImage extends Error {}

/** Enregistre une data URL et renvoie son URL publique (/uploads/packs/...). */
function enregistrerImage(dataUrl, prefixe = "pack") {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new ErreurImage("Format d'image non pris en charge (JPEG, PNG ou WebP uniquement)");
  const octets = Buffer.from(m[2], "base64");
  if (octets.length > TAILLE_MAX) throw new ErreurImage("Image trop lourde (3 Mo maximum)");
  // Vérifie la signature réelle du fichier (et pas seulement le type annoncé)
  const sig = octets.subarray(0, 12);
  const valide =
    (m[1] === "image/jpeg" && sig[0] === 0xff && sig[1] === 0xd8) ||
    (m[1] === "image/png" && sig.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (m[1] === "image/webp" && sig.subarray(0, 4).toString() === "RIFF" && sig.subarray(8, 12).toString() === "WEBP");
  if (!valide) throw new ErreurImage("Le fichier n'est pas une image valide");

  const nom = `${String(prefixe).replace(/[^A-Za-z0-9_-]/g, "")}-${crypto.randomBytes(6).toString("hex")}.${TYPES[m[1]]}`;
  fs.writeFileSync(path.join(DOSSIER_PACKS, nom), octets);
  return "/uploads/packs/" + nom;
}

/** Supprime le fichier d'une image précédemment enregistrée (ignore les autres URL). */
function supprimerImage(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/packs/")) return;
  const fichier = path.join(DOSSIER_PACKS, path.basename(url));
  fs.rm(fichier, { force: true }, () => {});
}

/**
 * Détermine la nouvelle valeur de la colonne image à partir de ce qu'envoie
 * l'interface : data URL → nouveau fichier ; null/"" → suppression ;
 * URL déjà enregistrée → inchangée.
 */
function resoudreImage(valeur, ancienne, prefixe) {
  if (valeur === undefined) return ancienne ?? null;
  if (valeur === null || valeur === "") { supprimerImage(ancienne); return null; }
  if (String(valeur).startsWith("data:")) {
    const url = enregistrerImage(valeur, prefixe);
    if (ancienne && ancienne !== url) supprimerImage(ancienne);
    return url;
  }
  if (String(valeur).startsWith("/uploads/packs/")) return valeur;
  return ancienne ?? null;
}

module.exports = { DOSSIER_UPLOADS, enregistrerImage, supprimerImage, resoudreImage, ErreurImage };

/**
 * Diagnostics capillaires reçus (administrateur) :
 *   GET /api/diagnostics            liste, du plus récent au plus ancien (?q= recherche nom / téléphone / référence)
 *   GET /api/diagnostics/export.csv même liste au format tableur
 *   GET /api/diagnostics/:id        détail : réponses, bilan, produits recommandés
 */
const express = require("express");
const db = require("../db");
const router = express.Router();

const LIBELLES = {
  hairType: "Type de cheveux", texture: "Texture", density: "Densité", scalp: "Cuir chevelu", problems: "Problèmes", duration: "Depuis",
  washFrequency: "Lavages", chemicals: "Produits chimiques", heatTools: "Appareils chauffants", diet: "Alimentation", water: "Eau par jour", stress: "Stress", sleep: "Sommeil suffisant",
};
const json = (t, def) => { try { return JSON.parse(t) || def; } catch { return def; } };

function fiche(d, complet) {
  const resultat = json(d.resultat, {});
  const base = {
    id: d.id, reference: d.reference, cree_le: d.cree_le, client_id: d.client_id,
    prenom: d.prenom, nom: d.nom, telephone: d.telephone, email: d.email, ville: d.ville, sexe: d.sexe, age: d.age,
    score: d.score, gravite: d.gravite, objectif: resultat.objectif_principal || "",
    remise_utilisee_le: d.remise_utilisee_le, commande_id: d.commande_id,
  };
  if (!complet) return base;
  const noms = new Map(db.prepare("SELECT id, nom FROM packs").all().map((p) => [p.id, p.nom]));
  return {
    ...base, reponses: json(d.reponses, {}), libelles: LIBELLES,
    resultat: { ...resultat, recommandes: (resultat.recommandes || []).map((r) => ({ ...r, nom: noms.get(r.pack_id) || "Produit retiré" })) },
  };
}

function lister(q) {
  const lignes = db.prepare("SELECT * FROM diagnostics ORDER BY cree_le DESC LIMIT 2000").all();
  const cherche = String(q || "").trim().toLowerCase();
  return cherche ? lignes.filter((d) => `${d.prenom} ${d.nom} ${d.telephone} ${d.reference} ${d.ville || ""}`.toLowerCase().includes(cherche)) : lignes;
}

router.get("/", (req, res) => res.json(lister(req.query.q).map((d) => fiche(d, false))));

router.get("/export.csv", (req, res) => {
  const champ = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const entetes = ["Date", "Référence", "Prénom", "Nom", "Téléphone", "E-mail", "Ville", "Sexe", "Âge", "Score global", "Gravité", "Objectif principal", "Problèmes", "Cuir chevelu", "Type de cheveux", "Remise utilisée"];
  const lignes = lister(req.query.q).map((d) => {
    const rep = json(d.reponses, {}), r = json(d.resultat, {});
    return [d.cree_le, d.reference, d.prenom, d.nom, d.telephone, d.email, d.ville, d.sexe, d.age, d.score, d.gravite, r.objectif_principal, (rep.problems || []).join(" / "), (rep.scalp || []).join(" / "), rep.hairType, d.remise_utilisee_le ? "oui" : "non"].map(champ).join(";");
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="diagnostics-milana.csv"');
  res.send("﻿" + [entetes.map(champ).join(";"), ...lignes].join("\r\n"));
});

router.get("/:id", (req, res) => {
  const d = db.prepare("SELECT * FROM diagnostics WHERE id = ?").get(req.params.id);
  if (!d) return res.status(404).json({ erreur: "Diagnostic introuvable" });
  res.json(fiche(d, true));
});

module.exports = router;

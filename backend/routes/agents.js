/**
 * Agents IA de l'espace (administrateur).
 *   GET    /api/agents                          état, programmes, messages, journal, réglages
 *   POST   /api/agents/rediger                  { type, consigne, canaux } → aperçu du message
 *   POST   /api/agents/programmes               { nom, type, consigne, audience, canaux, frequence, jour, heure }
 *   PUT    /api/agents/programmes/:id           mêmes champs + actif
 *   DELETE /api/agents/programmes/:id
 *   POST   /api/agents/programmes/:id/executer  exécute tout de suite
 *   PUT    /api/agents/reglages                 alertes SMS, réponses aux messages, tâches automatiques
 *   POST   /api/agents/alertes/test             envoie un SMS d'essai
 *   GET    /api/agents/bilan                    aperçu du bilan du jour
 *   POST   /api/agents/bilan                    envoie le bilan du jour tout de suite
 *   POST   /api/agents/messages/:id/rediger     (re)propose une réponse
 *   POST   /api/agents/messages/:id/repondre    { reponse } envoie la réponse au client
 *   POST   /api/agents/messages/:id/ignorer
 */
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../db");
const agents = require("../lib/agents");
const ia = require("../lib/ia");
const { AUDIENCES, smsConfigure, emailConfigure } = require("../lib/marketing");
const { envoyerSms } = require("../lib/sms");
const { lireBoutique } = require("./parametres");
const router = express.Router();

const lireProgramme = (id) => db.prepare("SELECT * FROM agents_programmes WHERE id = ?").get(id);
const canauxValides = (c) => (Array.isArray(c) ? c : String(c || "").split(",")).filter((x) => ["sms", "email"].includes(x));

function validerProgramme(corps, existant = {}) {
  const p = { ...existant };
  if (corps.nom !== undefined) p.nom = String(corps.nom).trim().slice(0, 80);
  if (corps.type !== undefined) p.type = agents.TYPES[corps.type] ? corps.type : "newsletter";
  if (corps.consigne !== undefined) p.consigne = String(corps.consigne).trim().slice(0, 600);
  if (corps.audience !== undefined) p.audience = AUDIENCES[corps.audience] ? corps.audience : "tous";
  if (corps.canaux !== undefined) p.canaux = canauxValides(corps.canaux).join(",");
  if (corps.frequence !== undefined) p.frequence = ["quotidien", "hebdomadaire", "mensuel"].includes(corps.frequence) ? corps.frequence : "hebdomadaire";
  if (corps.jour !== undefined) p.jour = Math.round(Number(corps.jour) || 0);
  if (corps.heure !== undefined) p.heure = Math.round(Number(corps.heure) || 0);
  if (corps.actif !== undefined) p.actif = corps.actif ? 1 : 0;
  if (!p.nom) p.nom = agents.TYPES[p.type]?.nom || ""; // sans nom : celui du type de message
  if (!p.canaux) return { erreur: "Choisissez au moins un canal (SMS ou e-mail)" };
  if (!(p.heure >= 0 && p.heure <= 23)) return { erreur: "Heure invalide" };
  if (p.frequence === "hebdomadaire" && !(p.jour >= 0 && p.jour <= 6)) return { erreur: "Jour de la semaine invalide" };
  if (p.frequence === "mensuel" && !(p.jour >= 1 && p.jour <= 28)) return { erreur: "Jour du mois invalide (1 à 28)" };
  return { p };
}

router.get("/", (req, res) => {
  res.json({
    ia: ia.estConfiguree(),
    fournisseurs: { sms: smsConfigure(), email: emailConfigure() },
    types: agents.TYPES, evenements: agents.EVENEMENTS, audiences: AUDIENCES,
    reglages: agents.lireReglages(),
    stocks_bas: agents.stocksBas().length,
    programmes: db.prepare("SELECT * FROM agents_programmes ORDER BY cree_le").all(),
    messages: db.prepare("SELECT * FROM messages_entrants ORDER BY cree_le DESC LIMIT 60").all(),
    journal: db.prepare("SELECT * FROM agents_journal ORDER BY cree_le DESC LIMIT 60").all(),
  });
});

router.post("/rediger", async (req, res) => {
  res.json(await agents.redigerCampagne({ type: req.body.type, consigne: String(req.body.consigne || ""), canaux: canauxValides(req.body.canaux) }));
});

router.post("/programmes", (req, res) => {
  const v = validerProgramme({ type: "newsletter", audience: "tous", canaux: "sms", frequence: "hebdomadaire", jour: 1, heure: 9, actif: true, ...req.body });
  if (v.erreur) return res.status(400).json({ erreur: v.erreur });
  const id = nanoid(), p = v.p;
  db.prepare("INSERT INTO agents_programmes (id, nom, type, consigne, audience, canaux, frequence, jour, heure, actif, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, p.nom, p.type, p.consigne || "", p.audience, p.canaux, p.frequence, p.jour, p.heure, p.actif, new Date().toISOString());
  agents.journal("campagnes", `Programme « ${p.nom} » créé`);
  res.status(201).json(lireProgramme(id));
});

router.put("/programmes/:id", (req, res) => {
  const existant = lireProgramme(req.params.id);
  if (!existant) return res.status(404).json({ erreur: "Programme introuvable" });
  const v = validerProgramme(req.body, existant);
  if (v.erreur) return res.status(400).json({ erreur: v.erreur });
  const p = v.p;
  db.prepare("UPDATE agents_programmes SET nom = ?, type = ?, consigne = ?, audience = ?, canaux = ?, frequence = ?, jour = ?, heure = ?, actif = ? WHERE id = ?")
    .run(p.nom, p.type, p.consigne || "", p.audience, p.canaux, p.frequence, p.jour, p.heure, p.actif, p.id);
  res.json(lireProgramme(p.id));
});

router.delete("/programmes/:id", (req, res) => {
  if (!db.prepare("DELETE FROM agents_programmes WHERE id = ?").run(req.params.id).changes) return res.status(404).json({ erreur: "Programme introuvable" });
  res.status(204).send();
});

router.post("/programmes/:id/executer", async (req, res) => {
  const p = lireProgramme(req.params.id);
  if (!p) return res.status(404).json({ erreur: "Programme introuvable" });
  try {
    const r = await agents.executerProgramme(p);
    db.prepare("UPDATE agents_programmes SET derniere_execution = ? WHERE id = ?").run(new Date().toISOString(), p.id);
    res.status(201).json(r);
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

router.put("/reglages", (req, res) => {
  const v = {};
  for (const k of ["alertes_actif", "alertes_admin", "alertes_vendeur", "messages_actif", "taches_rapport", "taches_stock"]) if (req.body[k] !== undefined) v[k] = req.body[k] && req.body[k] !== "0" ? "1" : "0";
  if (req.body.alertes_evenements !== undefined) v.alertes_evenements = (Array.isArray(req.body.alertes_evenements) ? req.body.alertes_evenements : String(req.body.alertes_evenements).split(",")).filter((e) => agents.EVENEMENTS[e]).join(",");
  if (req.body.alertes_numeros !== undefined) v.alertes_numeros = String(req.body.alertes_numeros);
  if (req.body.messages_mode !== undefined) v.messages_mode = req.body.messages_mode === "auto" ? "auto" : "validation";
  if (req.body.taches_rapport_heure !== undefined) {
    const h = Math.round(Number(req.body.taches_rapport_heure));
    if (!(h >= 0 && h <= 23)) return res.status(400).json({ erreur: "Heure invalide" });
    v.taches_rapport_heure = String(h);
  }
  res.json(agents.ecrireReglages(v));
});

router.post("/alertes/test", async (req, res) => {
  try {
    const r = await envoyerSms(req.user.telephone, `${lireBoutique().nom} : ceci est un SMS d'essai de votre agent Alertes. Vous serez prévenu à chaque vente.`);
    agents.journal("alertes", "SMS d'essai", `Envoyé au ${req.user.telephone}`);
    res.json({ simule: !!r?.simule, telephone: req.user.telephone });
  } catch (e) {
    res.status(502).json({ erreur: "Envoi du SMS impossible" });
  }
});

const aujourdhui = () => new Date().toISOString().slice(0, 10);
router.get("/bilan", (req, res) => {
  const b = agents.bilanDuJour(aujourdhui());
  res.json({ ...b, texte: agents.texteBilan(b, lireBoutique().nom) });
});
router.post("/bilan", async (req, res) => {
  try { res.json(await agents.envoyerBilan(aujourdhui())); }
  catch (e) { res.status(502).json({ erreur: "Envoi du bilan impossible" }); }
});

const lireMessage = (id) => db.prepare("SELECT * FROM messages_entrants WHERE id = ?").get(id);

router.post("/messages/:id/rediger", async (req, res) => {
  const m = lireMessage(req.params.id);
  if (!m) return res.status(404).json({ erreur: "Message introuvable" });
  const { reponse, ia: parIa } = await agents.redigerReponse(m);
  if (m.statut !== "repondu") db.prepare("UPDATE messages_entrants SET reponse = ?, statut = 'brouillon' WHERE id = ?").run(reponse, m.id);
  res.json({ ...lireMessage(m.id), ia: parIa });
});

router.post("/messages/:id/repondre", async (req, res) => {
  const m = lireMessage(req.params.id);
  if (!m) return res.status(404).json({ erreur: "Message introuvable" });
  if (m.statut === "repondu") return res.status(409).json({ erreur: "Ce message a déjà reçu une réponse" });
  const reponse = String(req.body.reponse || "").trim();
  if (reponse.length < 2) return res.status(400).json({ erreur: "La réponse est vide" });
  try {
    const { simule } = await agents.envoyerReponse(m, reponse.slice(0, 4000));
    agents.journal("messages", `Réponse envoyée à ${m.de_nom || m.de_email || m.de_telephone}`, null);
    res.json({ ...lireMessage(m.id), simule });
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  }
});

router.post("/messages/:id/ignorer", (req, res) => {
  const m = lireMessage(req.params.id);
  if (!m) return res.status(404).json({ erreur: "Message introuvable" });
  db.prepare("UPDATE messages_entrants SET statut = 'ignore' WHERE id = ?").run(m.id);
  res.json(lireMessage(m.id));
});

module.exports = router;

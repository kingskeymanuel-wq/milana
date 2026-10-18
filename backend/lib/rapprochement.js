/**
 * Contrôle Mobile Money : rapprochement des paiements déclarés dans les commandes
 * avec les relevés des opérateurs (Orange Money, MTN MoMo, Moov Money, Wave) importés par l'administrateur.
 *
 * Statuts d'un paiement déclaré :
 *   rapproche      ID trouvé dans le relevé, même montant
 *   ecart          ID trouvé, montant différent
 *   introuvable    période couverte par un relevé de cet opérateur, ID absent
 *   doublon        même ID de transaction déclaré sur plusieurs commandes
 *   non_couvert    aucun relevé de cet opérateur ne couvre la date du paiement
 *   sans_reference paiement Mobile Money enregistré sans ID de transaction
 */
const { nanoid } = require("nanoid");
const db = require("../db");

const OPERATEURS = ["Wave", "Orange Money", "MTN MoMo", "Moov Money"];
const entier = (n) => Math.round(Number(n) || 0);
const normRef = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
const normTel = (s) => { const d = String(s || "").replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };

/* ---------- Lecture d'un relevé (CSV exporté du portail marchand, ou texte collé) ---------- */
function montantDe(v) {
  let s = String(v ?? "").replace(/\s| | |FCFA|XOF|CFA|F\b/gi, "");
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, ""); // 10.000 ou 10,000
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
function dateDe(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
function decouper(ligne, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < ligne.length; i++) {
    const ch = ligne[i];
    if (ch === '"') { if (q && ligne[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Transforme le texte d'un relevé en lignes { reference, montant, telephone, date, sens }. */
function lireReleve(texte) {
  const lignes = String(texte || "").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lignes.length < 2) return { erreur: "Relevé vide : collez le contenu du fichier exporté (avec sa ligne d'en-tête)" };
  if (lignes.length > 20001) return { erreur: "Relevé trop long (20 000 lignes au maximum par import)" };
  const sep = [";", ",", "\t"].map((s) => [s, decouper(lignes[0], s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const tete = decouper(lignes[0], sep).map((h) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const col = (re, exclure) => tete.findIndex((h) => re.test(h) && !(exclure && exclure.test(h)));
  // Mots entiers : « Date validation » ne doit pas passer pour un « ID »
  const iRef = col(/\b(id|ref|reference|transaction|txn|txid)\b/, /\b(client|marchand|merchant|compte|account|wallet)\b/);
  const iMontant = col(/(montant|amount|credit|valeur|somme)/, /(frais|fee|solde|balance|commission)/);
  const iDate = col(/(date|heure|time)/);
  const iTel = col(/\b(tel|telephone|numero|phone|msisdn|expediteur|sender|payeur|from|contrepartie|mobile)\b/, /\b(id|ref|reference|transaction)\b/);
  const iType = col(/(type|sens|nature|operation)/);
  const iStatut = col(/(statut|status|etat|state|resultat)/);
  if (iRef < 0 || iMontant < 0) return { erreur: "Colonnes introuvables : le relevé doit contenir une colonne « ID / référence de transaction » et une colonne « montant »" };
  const sortie = [], vus = new Set();
  for (const l of lignes.slice(1)) {
    const c = decouper(l, sep);
    const reference = normRef(c[iRef]);
    const brut = montantDe(c[iMontant]);
    if (!reference || !Number.isFinite(brut) || brut === 0) continue;
    const sansAccent = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const type = iType >= 0 ? sansAccent(c[iType]) : "";
    // Transactions échouées, annulées ou en attente : ignorées ; sorties d'argent (retrait, envoi) : notées comme sorties
    if (/(echec|echoue|failed|fail|annul|cancel|rejet|reject|expire|pending|en attente)/.test(sansAccent(iStatut >= 0 ? c[iStatut] : "") + " " + type)) continue;
    const sens = brut < 0 || /(debit|retrait|withdraw|envoi|sortant|out)/.test(type) ? "sortie" : "entree";
    if (vus.has(reference)) continue;
    vus.add(reference);
    sortie.push({ reference, montant: Math.abs(entier(brut)), telephone: iTel >= 0 ? normTel(c[iTel]) : "", date: iDate >= 0 ? dateDe(c[iDate]) : null, sens });
  }
  if (!sortie.length) return { erreur: "Aucune transaction lisible dans ce relevé" };
  return { lignes: sortie };
}

function importer(operateur, texte, user) {
  if (!OPERATEURS.includes(operateur)) return { erreur: "Choisissez l'opérateur du relevé" };
  const r = lireReleve(texte);
  if (r.erreur) return r;
  const id = nanoid(), maintenant = new Date().toISOString();
  const ins = db.prepare(`INSERT OR IGNORE INTO releves_mm (id, import_id, operateur, reference, montant, telephone, jour, sens, importe_le)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let ajoutees = 0;
  db.transaction(() => {
    for (const l of r.lignes) ajoutees += ins.run(nanoid(), id, operateur, l.reference, l.montant, l.telephone || null, l.date, l.sens, maintenant).changes;
    // Relevé déjà entièrement connu : rien n'est enregistré (sinon une entrée vide prétendrait couvrir la période)
    if (!ajoutees) return;
    const jours = r.lignes.map((l) => l.date).filter(Boolean).sort();
    db.prepare("INSERT INTO releves_mm_imports (id, operateur, nb_lignes, nb_ajoutees, du, au, importe_par, importe_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, operateur, r.lignes.length, ajoutees, jours[0] || null, jours[jours.length - 1] || null, user.id, maintenant);
  })();
  return { ok: true, id: ajoutees ? id : null, lues: r.lignes.length, ajoutees, deja: r.lignes.length - ajoutees };
}

function supprimerImport(id) {
  const n = db.prepare("DELETE FROM releves_mm WHERE import_id = ?").run(id).changes;
  const m = db.prepare("DELETE FROM releves_mm_imports WHERE id = ?").run(id).changes;
  return m ? { ok: true, lignes: n } : { erreur: "Import introuvable" };
}

/** Paiements Mobile Money déclarés : un par commande (payée ou à vérifier), avec leur statut de rapprochement. */
function rapprocher({ de, a } = {}) {
  const lignes = db.prepare(`SELECT v.commande_id, v.mode_paiement, v.statut_paiement, v.reference_paiement, v.telephone_paiement, v.paye_le, v.date_vente,
      v.quantite, v.prix_unitaire, c.numero, c.statut AS cmd_statut, c.frais_livraison, c.montant_paye
    FROM ventes v JOIN commandes c ON c.id = v.commande_id
    WHERE v.mode_paiement IN ('Wave', 'Orange Money', 'MTN MoMo', 'Moov Money') AND v.statut_paiement IN ('payee', 'a_verifier')`).all();
  const parCmd = new Map();
  for (const l of lignes) { if (!parCmd.has(l.commande_id)) parCmd.set(l.commande_id, []); parCmd.get(l.commande_id).push(l); }
  const declares = [...parCmd.entries()].map(([id, ls]) => {
    const l0 = ls[0];
    const montant = l0.montant_paye != null ? entier(l0.montant_paye) : entier(ls.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0) + (Number(l0.frais_livraison) || 0));
    return { commande_id: id, numero: l0.numero, operateur: l0.mode_paiement, reference: normRef(l0.reference_paiement), telephone: normTel(l0.telephone_paiement),
      montant, jour: String(l0.paye_le || l0.date_vente || "").slice(0, 10), a_verifier: l0.statut_paiement === "a_verifier", annulee: l0.cmd_statut === "annulee" };
  }).filter((d) => (!de || d.jour >= de) && (!a || d.jour <= a));

  const releve = db.prepare("SELECT * FROM releves_mm WHERE sens = 'entree'").all();
  const parRef = new Map(releve.map((x) => [x.operateur + "|" + x.reference, x]));
  const couverture = new Map(db.prepare("SELECT operateur, MIN(jour) AS du, MAX(jour) AS au FROM releves_mm WHERE jour IS NOT NULL GROUP BY operateur").all().map((x) => [x.operateur, x]));
  const compteRef = new Map();
  for (const d of declares) if (d.reference) compteRef.set(d.operateur + "|" + d.reference, (compteRef.get(d.operateur + "|" + d.reference) || 0) + 1);

  // Périodes réellement couvertes : celles de chaque relevé importé (un trou entre deux relevés n'est pas couvert)
  const periodes = db.prepare("SELECT i.operateur, i.du, i.au FROM releves_mm_imports i WHERE i.du IS NOT NULL AND EXISTS (SELECT 1 FROM releves_mm r WHERE r.import_id = i.id)").all();
  const couvert = (op, jour) => periodes.some((p) => p.operateur === op && jour >= p.du && jour <= p.au);
  // Index pour proposer une transaction du relevé (même opérateur, montant et numéro) sans parcourir tout le relevé
  const index = new Map();
  for (const x of releve) { const k = x.operateur + "|" + x.montant + "|" + x.telephone; if (!index.has(k)) index.set(k, []); index.get(k).push(x); }

  const utilises = new Set();
  for (const d of declares) {
    const k = d.operateur + "|" + d.reference;
    const t = d.reference ? parRef.get(k) : null;
    if (!d.reference) d.statut = "sans_reference";
    else if (compteRef.get(k) > 1) d.statut = "doublon";
    else if (t) { d.statut = t.montant === d.montant ? "rapproche" : "ecart"; d.releve = { montant: t.montant, telephone: t.telephone, jour: t.jour }; }
    else if (couvert(d.operateur, d.jour)) d.statut = "introuvable";
    else d.statut = "non_couvert";
    if (t) utilises.add(t.id);
    // Sans ID ou introuvable : une transaction du relevé au même montant, même numéro, même jour, est proposée
    if (["sans_reference", "introuvable"].includes(d.statut) && d.telephone) {
      const s = (index.get(d.operateur + "|" + d.montant + "|" + d.telephone) || []).find((x) => !utilises.has(x.id) && (!x.jour || x.jour === d.jour));
      if (s) d.suggestion = { reference: s.reference, jour: s.jour };
    }
  }
  const sansCommande = releve.filter((x) => !utilises.has(x.id) && (!de || !x.jour || x.jour >= de) && (!a || !x.jour || x.jour <= a))
    .map((x) => ({ id: x.id, operateur: x.operateur, reference: x.reference, montant: x.montant, telephone: x.telephone, jour: x.jour }));
  const resume = {};
  for (const d of declares) resume[d.statut] = (resume[d.statut] || 0) + 1;
  const parOperateur = OPERATEURS.map((op) => ({
    operateur: op,
    declare: declares.filter((d) => d.operateur === op && !d.annulee).reduce((s, d) => s + d.montant, 0),
    confirme: declares.filter((d) => d.operateur === op && d.statut === "rapproche").reduce((s, d) => s + d.montant, 0),
    releve: releve.filter((x) => x.operateur === op && (!de || !x.jour || x.jour >= de) && (!a || !x.jour || x.jour <= a)).reduce((s, x) => s + x.montant, 0),
    couverture: couverture.get(op) || null,
  })).filter((o) => o.declare || o.releve);
  const ordre = { ecart: 0, doublon: 1, introuvable: 2, sans_reference: 3, non_couvert: 4, rapproche: 5 };
  declares.sort((x, y) => (ordre[x.statut] - ordre[y.statut]) || (Number(y.a_verifier) - Number(x.a_verifier)) || y.jour.localeCompare(x.jour));
  return { declares, sans_commande: sansCommande, resume, par_operateur: parOperateur,
    imports: db.prepare("SELECT i.*, u.nom AS par FROM releves_mm_imports i LEFT JOIN utilisateurs u ON u.id = i.importe_par ORDER BY i.importe_le DESC LIMIT 30").all() };
}

module.exports = { lireReleve, importer, supprimerImport, rapprocher, OPERATEURS };

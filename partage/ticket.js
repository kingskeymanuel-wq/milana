/**
 * Ticket de caisse — module commun à l'administration et à la boutique client.
 * JavaScript pur (sans JSX) : importé par /admin/app.jsx et /boutique/boutique.jsx.
 *
 * Format d'un ticket (identique à GET /api/recus/:jeton) :
 * { boutique:{nom,adresse,telephone,message}, numero, date, statut, vendeur, client,
 *   numero_ticket, type_vente (b2c|b2b), contact, adresse_livraison,
 *   lignes:[{nom,quantite,prix_unitaire,total,pieces_par_lot,articles}], total_articles, sous_total, frais_livraison, total,
 *   paiement:{mode,statut,montant_recu,monnaie,reference}, lien }
 */

export const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
export const QRCODE_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
export const fmtNum = (n) => nf.format(Math.round(n || 0));
export const fmt = (n) => fmtNum(n) + " FCFA";

const scriptsCharges = {};
/** Charge un script externe une seule fois. */
export function chargerScript(url) {
  if (!scriptsCharges[url]) {
    scriptsCharges[url] = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = url;
      el.async = true;
      el.onload = resolve;
      el.onerror = () => { delete scriptsCharges[url]; reject(new Error("Chargement impossible (connexion Internet requise).")); };
      document.head.appendChild(el);
    });
  }
  return scriptsCharges[url];
}

/** Lien public du ticket (page de la boutique client). */
export const lienTicket = (jeton) => (jeton ? `${location.origin}/#/recu/${jeton}` : null);

/** Numéro ivoirien → format international pour WhatsApp (225 + 10 chiffres). */
export const telInternational = (tel) => {
  const d = String(tel || "").replace(/\D/g, "");
  return d.length === 10 ? "225" + d : d;
};

const LIBELLES_STATUT_PAIEMENT = {
  en_attente: "PAIEMENT À LA LIVRAISON",
  a_verifier: "PAIEMENT EN COURS DE VÉRIFICATION",
  en_cours: "PAIEMENT EN LIGNE EN COURS",
  echoue: "PAIEMENT NON ABOUTI",
};

/** Contenu du ticket, partagé par l'affichage écran et le PDF. */
export function lignesTicket(t) {
  const n = (x) => fmtNum(x).replace(/ | /g, " ");
  const d = new Date(t.date);
  const L = [];
  L.push({ k: "titre", txt: t.boutique?.nom || "Ma Boutique" });
  if (t.boutique?.adresse) L.push({ k: "centre", txt: t.boutique.adresse });
  if (t.boutique?.telephone) L.push({ k: "centre", txt: "Tél : " + t.boutique.telephone });
  L.push({ k: "sep" });
  L.push({ k: "centre", txt: t.provisoire ? "RÉCAPITULATIF — TICKET PROVISOIRE" : t.canal === "en_ligne" ? "BON DE COMMANDE EN LIGNE" : "TICKET DE CAISSE", gras: true });
  if (t.type_vente === "b2b") L.push({ k: "centre", txt: "VENTE PROFESSIONNELLE (B2B)" });
  if (t.numero_ticket) L.push({ k: "ligne", g: "Ticket", d: t.numero_ticket });
  L.push({ k: "ligne", g: t.numero ? "Commande " + t.numero : "N° à la validation", d: d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) });
  if (t.vendeur) L.push({ k: "ligne", g: "Vendeur", d: t.vendeur });
  if (t.client) L.push({ k: "ligne", g: "Client", d: t.client });
  // Contact et adresse : le ticket sert aussi d'étiquette sur le colis
  if (t.contact) L.push({ k: "ligne", g: "Contact", d: t.contact });
  if (t.adresse_livraison) L.push({ k: "centre", txt: "Livraison : " + t.adresse_livraison });
  L.push({ k: "sep" });
  let articles = 0, remises = 0;
  for (const l of t.lignes || []) {
    const parLot = Math.max(1, Number(l.pieces_par_lot) || 1);
    articles += l.articles ?? l.quantite * parLot;
    L.push({ k: "texte", txt: l.nom });
    L.push({ k: "ligne", g: `  ${l.quantite} x ${n(l.prix_unitaire)}`, d: n(l.total) });
    // Réduction sur cet article : prix normal et montant de la remise
    if (l.prix_normal > l.prix_unitaire) {
      const r = (l.prix_normal - l.prix_unitaire) * l.quantite;
      remises += r;
      L.push({ k: "ligne", g: `  Prix normal ${n(l.prix_normal)} · remise -${Math.round((1 - l.prix_unitaire / l.prix_normal) * 100)} %`, d: "-" + n(r) });
    }
    // Lot : nombre d'articles réellement remis (2 lots de 3 = 6 articles)
    if (parLot > 1) L.push({ k: "ligne", g: `  lot de ${parLot}`, d: `${l.quantite * parLot} articles` });
  }
  L.push({ k: "sep" });
  L.push({ k: "ligne", g: "Nombre d'articles", d: String(t.total_articles ?? articles) });
  if (t.frais_livraison > 0) {
    L.push({ k: "ligne", g: "Sous-total", d: n(t.sous_total) });
    L.push({ k: "ligne", g: "Livraison", d: n(t.frais_livraison) });
  }
  if (remises > 0) L.push({ k: "ligne", g: "Total des remises", d: "-" + n(remises), gras: true });
  L.push({ k: "ligne", g: "TOTAL", d: n(t.total) + " FCFA", grand: true });
  if (remises > 0) L.push({ k: "centre", txt: "Vous avez économisé " + n(remises) + " FCFA" });
  L.push({ k: "sep" });
  const p = t.paiement || {};
  const payee = !p.statut || p.statut === "payee";
  L.push({ k: "ligne", g: "Paiement", d: p.statut === "en_attente" ? "À la livraison" : p.mode });
  // Espèces : seulement s'il y a eu de la monnaie à rendre
  if (payee && p.montant_recu != null && p.monnaie > 0) {
    L.push({ k: "ligne", g: "Reçu", d: n(p.montant_recu) });
    L.push({ k: "ligne", g: "Monnaie rendue", d: n(p.monnaie) });
  }
  if (p.reference) L.push({ k: "ligne", g: "Réf.", d: p.reference });
  if (t.provisoire) L.push({ k: "badge", txt: "NON VALIDÉ — À CONFIRMER" });
  else if (!payee && LIBELLES_STATUT_PAIEMENT[p.statut]) L.push({ k: "badge", txt: LIBELLES_STATUT_PAIEMENT[p.statut] });
  if (!t.provisoire && payee && t.canal === "en_ligne") L.push({ k: "badge", txt: "PAYÉ" });
  if (t.statut === "annulee") L.push({ k: "badge", txt: "COMMANDE ANNULÉE" });
  L.push({ k: "sep" });
  return L;
}

/** QR code (bibliothèque qrcode-generator) : objet avec getModuleCount() / isDark(r, c). */
export async function genererQr(texte) {
  await chargerScript(QRCODE_URL);
  const q = window.qrcode(0, "M");
  q.addData(texte);
  q.make();
  return q;
}

/** Tracé SVG (attribut d) d'un QR code, un module = 1 unité. */
export function cheminQr(qr) {
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return d;
}

/** Construit le document PDF du ticket (format 80 mm, imprimante thermique). */
async function construirePdf(t) {
  await chargerScript(JSPDF_URL);
  const qr = t.lien ? await genererQr(t.lien).catch(() => null) : null;
  const { jsPDF } = window.jspdf;
  // Les polices standard du PDF ne couvrent pas les espaces fines insécables
  const txt = (x) => String(x ?? "").replace(/[  ]/g, " ").replace(/[’]/g, "'");
  const L = 80, M = 5, W = L - 2 * M;
  const lignes = lignesTicket(t);
  const mesure = new jsPDF({ unit: "mm", format: [L, 200] });
  mesure.setFont("courier", "normal");
  mesure.setFontSize(8.5);
  let hauteur = 10;
  for (const l of lignes) {
    hauteur += l.k === "titre" ? 7 : l.k === "sep" ? 3 : l.k === "texte" ? 4.2 * mesure.splitTextToSize(txt(l.txt), W).length : l.k === "badge" ? 6 : l.grand ? 6 : 4.2;
  }
  hauteur += (qr ? 40 : 0) + 14;

  const doc = new jsPDF({ unit: "mm", format: [L, Math.max(hauteur, 100)] });
  let y = 9;
  const centre = (s, taille = 8.5, style = "normal") => {
    doc.setFont("courier", style);
    doc.setFontSize(taille);
    doc.splitTextToSize(txt(s), W).forEach((x) => { doc.text(x, L / 2, y, { align: "center" }); y += taille * 0.45; });
  };
  for (const l of lignes) {
    if (l.k === "titre") { centre(l.txt, 13, "bold"); y += 1.5; }
    else if (l.k === "centre") centre(l.txt, 8.5, l.gras ? "bold" : "normal");
    else if (l.k === "sep") { doc.setLineDashPattern([0.8, 0.8], 0); doc.setDrawColor(150); doc.line(M, y - 1.2, L - M, y - 1.2); y += 3; }
    else if (l.k === "texte") { doc.setFont("courier", "bold"); doc.setFontSize(8.5); doc.splitTextToSize(txt(l.txt), W).forEach((x) => { doc.text(x, M, y); y += 4.2; }); }
    else if (l.k === "badge") { doc.setFont("courier", "bold"); doc.setFontSize(8.5); doc.text(txt(l.txt), L / 2, y + 1, { align: "center" }); y += 6; }
    else {
      const taille = l.grand ? 11 : 8.5;
      doc.setFont("courier", l.grand ? "bold" : "normal");
      doc.setFontSize(taille);
      doc.text(txt(l.g), M, y);
      doc.text(txt(l.d), L - M, y, { align: "right" });
      y += l.grand ? 6 : 4.2;
    }
  }
  if (qr) {
    const n = qr.getModuleCount(), taille = 30, m = taille / n, x0 = (L - taille) / 2;
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(x0 + c * m, y + r * m, m, m, "F");
    y += taille + 5;
    centre("Scannez pour retrouver votre ticket", 7.5);
    y += 1;
  }
  centre(t.boutique?.message || "Merci pour votre achat !", 8.5, "bold");
  return doc;
}

const nomFichier = (t) => `ticket-${String(t.numero_ticket || t.numero || "provisoire").replace(/[^\w-]/g, "")}.pdf`;

/** Génère et télécharge le ticket au format PDF. */
export async function telechargerTicketPdf(t) {
  (await construirePdf(t)).save(nomFichier(t));
}

/** URL (blob:) du ticket PDF, pour l'afficher directement dans la page. */
export async function urlTicketPdf(t) {
  return (await construirePdf(t)).output("bloburl");
}

/** Le navigateur sait-il afficher un PDF dans la page ? (faux sur la plupart des mobiles) */
export const pdfIntegrable = () => navigator.pdfViewerEnabled === true;

/**
 * Ticket de caisse au format e-mail (HTML + texte), à partir du ticket commun
 * (lib/commandes.ticketCommande). Le lien renvoie vers la page publique du
 * ticket, où le client peut télécharger le PDF.
 */
const { echapper } = require("./email");

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const n = (x) => nf.format(Math.round(x || 0)).replace(/ | /g, " ");
const STATUTS_PAIEMENT = { payee: "Payé", en_attente: "À payer à la livraison", a_verifier: "Paiement en cours de vérification", en_cours: "Paiement en ligne en cours", echoue: "Paiement non abouti" };

function ticketEmail(t, lien) {
  const date = new Date(t.date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const p = t.paiement || {};
  const lignes = t.lignes.map((l) => `<tr><td style="padding:4px 0">${echapper(l.nom)}<br><span style="color:#777">${l.quantite} × ${n(l.prix_unitaire)}${l.prix_normal > l.prix_unitaire ? ` · prix normal ${n(l.prix_normal)}, remise −${Math.round((1 - l.prix_unitaire / l.prix_normal) * 100)} %` : ""}</span></td><td style="text-align:right;vertical-align:top">${n(l.total)}</td></tr>`).join("");
  const html = `
  <div style="font-family:'Courier New',monospace;max-width:380px;margin:auto;padding:20px;border:1px dashed #bbb;color:#111;font-size:13px">
    <div style="text-align:center;font-family:Arial,sans-serif"><b style="font-size:18px">${echapper(t.boutique.nom)}</b>
      ${t.boutique.adresse ? `<br><span style="color:#666">${echapper(t.boutique.adresse)}</span>` : ""}
      ${t.boutique.telephone ? `<br><span style="color:#666">Tél : ${echapper(t.boutique.telephone)}</span>` : ""}</div>
    <hr style="border:0;border-top:1px dashed #bbb">
    <div style="text-align:center"><b>${t.canal === "en_ligne" ? "BON DE COMMANDE EN LIGNE" : "TICKET DE CAISSE"}</b></div>
    <table style="width:100%;font-size:13px"><tr><td>N° ${echapper(t.numero)}</td><td style="text-align:right">${date}</td></tr>
      ${t.client ? `<tr><td>Client</td><td style="text-align:right">${echapper(t.client)}</td></tr>` : ""}</table>
    <hr style="border:0;border-top:1px dashed #bbb">
    <table style="width:100%;font-size:13px">${lignes}</table>
    <hr style="border:0;border-top:1px dashed #bbb">
    <table style="width:100%;font-size:13px">
      ${t.frais_livraison > 0 ? `<tr><td>Sous-total</td><td style="text-align:right">${n(t.sous_total)}</td></tr><tr><td>Livraison</td><td style="text-align:right">${n(t.frais_livraison)}</td></tr>` : ""}
      <tr><td><b style="font-size:15px">TOTAL</b></td><td style="text-align:right"><b style="font-size:15px">${n(t.total)} FCFA</b></td></tr>
      <tr><td>Paiement</td><td style="text-align:right">${echapper(p.statut === "en_attente" ? "À la livraison" : p.mode || "")}</td></tr>
      ${p.reference ? `<tr><td>Réf.</td><td style="text-align:right">${echapper(p.reference)}</td></tr>` : ""}
      <tr><td>Statut</td><td style="text-align:right">${STATUTS_PAIEMENT[p.statut] || "Payé"}</td></tr>
    </table>
    <hr style="border:0;border-top:1px dashed #bbb">
    <p style="text-align:center;font-family:Arial,sans-serif"><a href="${lien}" style="display:inline-block;background:#008060;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Voir et télécharger le ticket (PDF)</a></p>
    <p style="text-align:center;color:#555">${echapper(t.boutique.message || "Merci pour votre achat !")}</p>
  </div>`;
  const texte = [
    t.boutique.nom, `${t.canal === "en_ligne" ? "Bon de commande" : "Ticket de caisse"} ${t.numero} — ${date}`, "",
    ...t.lignes.map((l) => `${l.nom} : ${l.quantite} × ${n(l.prix_unitaire)} = ${n(l.total)}${l.prix_normal > l.prix_unitaire ? ` (prix normal ${n(l.prix_normal)}, remise de ${n((l.prix_normal - l.prix_unitaire) * l.quantite)})` : ""}`),
    t.frais_livraison > 0 ? `Livraison : ${n(t.frais_livraison)}` : null,
    `TOTAL : ${n(t.total)} FCFA`, `Paiement : ${p.statut === "en_attente" ? "à la livraison" : p.mode} (${STATUTS_PAIEMENT[p.statut] || "Payé"})`, "",
    `Votre ticket (PDF) : ${lien}`, t.boutique.message || "Merci pour votre achat !",
  ].filter((x) => x != null).join("\n");
  return { sujet: `${t.boutique.nom} — ${t.canal === "en_ligne" ? "Votre commande" : "Votre ticket de caisse"} ${t.numero}`, html, texte };
}

module.exports = { ticketEmail };

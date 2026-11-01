/**
 * Envoi d'e-mails (tickets de caisse, campagnes) par SMTP via Nodemailer.
 * Compatible avec tout fournisseur : Gmail (mot de passe d'application),
 * Brevo, Outlook, la messagerie de votre nom de domaine…
 *
 * Variables (.env) : SMTP_HOST, SMTP_PORT (587 par défaut), SMTP_USER, SMTP_PASS,
 * SMTP_FROM (ex. « Ma Boutique <contact@maboutique.ci> »).
 * Sans configuration, l'envoi est simulé (journalisé dans la console).
 */
const nodemailer = require("nodemailer");

const estConfigure = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport = null;
function obtenirTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

/** Envoie un e-mail. Renvoie { simule: true } si aucun serveur SMTP n'est configuré. */
// pieces : fichiers joints [{ nom, contenu (Buffer), type }] — par exemple le ticket de caisse en PDF
async function envoyerEmail({ a, sujet, texte, html, pieces = [] }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(a || ""))) throw new Error("Adresse e-mail invalide");
  if (!estConfigure()) {
    console.log(`[E-MAIL SIMULÉ] À ${a} — ${sujet}`);
    return { simule: true };
  }
  const info = await obtenirTransport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: a,
    subject: sujet,
    text: texte,
    html,
    attachments: pieces.map((p) => ({ filename: p.nom, content: p.contenu, contentType: p.type })),
  });
  return { id: info.messageId };
}

const echapper = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = { estConfigure, envoyerEmail, echapper };

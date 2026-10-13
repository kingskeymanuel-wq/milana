/**
 * Envoi de SMS — module enfichable.
 *
 * Aucun fournisseur SMS n'est imposé : branchez celui utilisé en
 * Côte d'Ivoire / dans votre pays (Africa's Talking, Orange SMS API,
 * MTN, Twilio, Vonage...). Il suffit d'implémenter `envoyerSms` avec
 * l'appel HTTP du fournisseur choisi.
 *
 * Variables d'environnement attendues (exemple générique) :
 *   SMS_PROVIDER_URL, SMS_PROVIDER_API_KEY, SMS_SENDER_ID
 */
async function envoyerSms(telephone, message) {
  const url = process.env.SMS_PROVIDER_URL;
  const apiKey = process.env.SMS_PROVIDER_API_KEY;
  const expediteur = process.env.SMS_SENDER_ID || "IvoireShop";

  if (!url || !apiKey) {
    // Aucun fournisseur configuré : on journalise le message au lieu de
    // l'envoyer, pour que le développement reste possible sans compte SMS.
    console.log(`[SMS SIMULÉ] Vers ${telephone} : ${message}`);
    return { simule: true };
  }

  const reponse = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ to: telephone, from: expediteur, text: message }),
  });

  if (!reponse.ok) {
    throw new Error(`Échec de l'envoi du SMS (statut ${reponse.status})`);
  }
  return reponse.json();
}

module.exports = { envoyerSms };

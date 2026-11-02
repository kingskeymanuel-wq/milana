/**
 * Rédaction par IA locale (Ollama installé sur le serveur) : gratuite, privée, sans compte.
 *
 * Réglage par variables d'environnement (jamais dans l'interface des vendeurs) :
 *   IA_FOURNISSEUR=local     active l'IA locale (vide = agents avec leurs modèles de messages)
 *   OLLAMA_URL               adresse d'Ollama (défaut http://127.0.0.1:11434)
 *   IA_MODELE                modèle (défaut llama3.2:3b)
 * Sans IA réglée, ou si elle ne répond pas, les agents utilisent des modèles de messages fixes.
 */
const MODELE = "llama3.2:3b";

const estConfiguree = () => String(process.env.IA_FOURNISSEUR || "").trim() === "local";
const modele = () => String(process.env.IA_MODELE || "").trim() || MODELE;
const urlLocale = () => String(process.env.OLLAMA_URL || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
let derniereErreur = null;

/** État pour les journaux du serveur : aucun détail technique n'est montré aux vendeurs. */
const etat = () => ({ configuree: estConfiguree(), modele: estConfiguree() ? modele() : null, derniere_erreur: derniereErreur });

/** Demande un texte court. Renvoie le texte, ou null si aucune IA n'est réglée ; lève une erreur lisible sinon. */
async function rediger({ systeme, demande, maxTokens = 800 }) {
  if (!estConfiguree()) return null;
  try {
    let r;
    try {
      r = await fetch(`${urlLocale()}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({ model: modele(), stream: false, messages: [{ role: "system", content: systeme }, { role: "user", content: demande }], options: { num_predict: Math.min(maxTokens, 800), temperature: 0.7 } }),
      });
    } catch { throw new Error("IA locale injoignable (est-elle installée et démarrée sur le serveur ?)"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ? "IA locale : " + j.error : `IA locale : erreur ${r.status}`);
    const texte = String(j.message?.content || "").trim();
    if (!texte) throw new Error("Réponse vide de l'IA");
    derniereErreur = null;
    return texte;
  } catch (e) {
    derniereErreur = { message: e.message, le: new Date().toISOString() };
    throw e;
  }
}

module.exports = { rediger, estConfiguree, etat, MODELE };

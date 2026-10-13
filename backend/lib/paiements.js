/**
 * Moyens de paiement réellement utilisés en boutique en Côte d'Ivoire.
 * Le paiement est saisi par le vendeur au moment de l'encaissement :
 *  - Espèces : montant reçu → monnaie à rendre
 *  - Mobile Money (Orange, MTN, Moov, Wave) : numéro du payeur + ID de transaction
 *    reçu par SMS de l'opérateur
 *  - Carte bancaire (TPE) : numéro d'autorisation
 *  - Paiement à la livraison : la vente reste « en attente de paiement »
 *    jusqu'à l'encaissement (PATCH /api/commandes/:id/paiement)
 */
const MOBILE_MONEY = ["Orange Money", "MTN MoMo", "Moov Money", "Wave"];
const MODES = ["Espèces", ...MOBILE_MONEY, "Carte bancaire", "Paiement à la livraison"];
const MODES_ENCAISSEMENT = MODES.filter((m) => m !== "Paiement à la livraison");

/**
 * Valide et normalise les informations de paiement.
 * Renvoie { erreur } ou { mode, statut, montant_recu, reference, telephone }.
 */
function validerPaiement(corps, total, { encaissement = false } = {}) {
  const mode = corps.mode_paiement;
  const autorises = encaissement ? MODES_ENCAISSEMENT : MODES;
  if (!autorises.includes(mode)) return { erreur: `mode_paiement doit être l'un de : ${autorises.join(", ")}` };

  const reference = corps.reference_paiement ? String(corps.reference_paiement).trim().slice(0, 60) : null;
  const telephone = corps.telephone_paiement ? String(corps.telephone_paiement).trim().slice(0, 30) : null;
  let montantRecu = null;

  if (mode === "Espèces") {
    montantRecu = corps.montant_recu == null || corps.montant_recu === "" ? total : Number(corps.montant_recu);
    if (!Number.isFinite(montantRecu) || montantRecu < total) {
      return { erreur: `Montant reçu insuffisant : ${total} FCFA sont dus` };
    }
  }
  if (MOBILE_MONEY.includes(mode) && !telephone) {
    return { erreur: `Indiquez le numéro ${mode} du payeur` };
  }

  return {
    mode,
    statut: mode === "Paiement à la livraison" ? "en_attente" : "payee",
    montant_recu: montantRecu,
    reference,
    telephone,
  };
}

module.exports = { MODES, MOBILE_MONEY, validerPaiement };

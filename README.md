# MILANA — boutique de soins capillaires, diagnostic et gestion

MILANA réunit deux projets :

- le **moteur d'Ivoire Shop** (Node.js, Express, SQLite, React) : boutique en ligne, commandes, stocks, tickets de caisse,
  livraisons, clients, vendeurs, dépenses, paiement à la livraison et Mobile Money ;
- la **logique de la plateforme MILANA** d'origine : diagnostic capillaire, routine sur mesure, gamme MILANA Care, identité visuelle.

## Démarrer

```bash
cd backend
npm ci
npm start
```

Boutique : http://localhost:4000/ — Administration : http://localhost:4000/admin/

Au premier démarrage, une boutique de démonstration « MILANA Care » est créée avec ses comptes de test
(désactiver : `DONNEES_TEST=0`). Tout nouvel espace reçoit la gamme MILANA Care (4 produits), à ajuster dans Administration › Produits.

## Diagnostic capillaire

1. Le client ouvre `/#/diagnostic` et répond au questionnaire (profil, cheveux, cuir chevelu, besoins, habitudes, mode de vie).
2. Le serveur calcule 5 scores (santé, hydratation, nutrition, croissance, force), la gravité, la porosité, les causes,
   le calendrier de soins et les produits recommandés (`backend/lib/diagnostic.js`, mêmes règles que la plateforme d'origine).
3. La **fiche client est créée automatiquement** (ou complétée), avec le bilan en note.
4. Le client reçoit **−15 % sur les produits recommandés**, pour une commande, pendant 30 jours. La remise est calculée
   par le serveur à partir de la référence du diagnostic ; elle apparaît sur le ticket.
5. L'administrateur retrouve tous les bilans dans Administration › Diagnostics (recherche, détail, export tableur).

Pour qu'un nouveau produit soit bien recommandé, son type de soin est déduit de son nom et de sa description
(shampooing, démêlant, masque, sérum, huile, crème) ; les colonnes `soin_type` et `soin_cible` de la table `packs` priment si elles sont remplies.

## Pas encore repris de la plateforme MILANA d'origine

Formations payantes, annuaire des spécialistes, assistant de suivi, calendrier des fêtes pour les newsletters, paiement Chariow.

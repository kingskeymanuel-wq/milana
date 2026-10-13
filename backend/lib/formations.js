/**
 * Formations MILANA : parcours de leçons, évaluation chronométrée et certificat.
 *
 * Le catalogue est public. Une formation gratuite s'ouvre dès l'inscription ; une formation
 * payante s'ouvre quand la boutique confirme le paiement Mobile Money déclaré par le client.
 * Il n'y a pas de compte client : chaque inscription a un lien d'accès personnel (jeton).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { nanoid } = require("nanoid");
const db = require("../db");

const DOSSIER_SUPPORTS = path.join(__dirname, "..", "formations-supports"); // fiches PDF fournies avec la plateforme
const MARGE_MINUTEUR = 15;     // secondes de tolérance après la fin du minuteur (réseau lent)
const json = (t, def) => { try { return JSON.parse(t) ?? def; } catch { return def; } };

/* ------------------------------------------------------------ lecture */
const lire = (id) => db.prepare("SELECT * FROM formations WHERE id = ?").get(id);
const lecons = (id) => db.prepare("SELECT * FROM formations_lecons WHERE formation_id = ? ORDER BY position").all(id);
const questions = (id) => db.prepare("SELECT * FROM formations_questions WHERE formation_id = ? ORDER BY position").all(id).map((q) => ({ ...q, options: json(q.options, []) }));
const minuteur = (f, nbQuestions) => (Number(f.minuteur) > 0 ? Number(f.minuteur) : 60 * nbQuestions);
const scoreReussite = (f) => Math.min(100, Math.max(1, Number(f.score_reussite) || 60));
const tentativesMax = (f) => Math.min(20, Math.max(1, Number(f.tentatives_max) || 3));
const supportDisponible = (f) => Boolean(f.support_fichier) && fs.existsSync(path.join(DOSSIER_SUPPORTS, path.basename(f.support_fichier)));
const cheminSupport = (f) => path.join(DOSSIER_SUPPORTS, path.basename(f.support_fichier));

/** Fiche du catalogue public (jamais le contenu). */
function fichePublique(f) {
  const nl = db.prepare("SELECT COUNT(*) AS n FROM formations_lecons WHERE formation_id = ?").get(f.id).n;
  const nq = db.prepare("SELECT COUNT(*) AS n FROM formations_questions WHERE formation_id = ?").get(f.id).n;
  return {
    id: f.id, titre: f.titre, description: f.description || "", categorie: f.categorie || "", duree: f.duree || "", image: f.image || null,
    prix: Math.max(0, Number(f.prix) || 0), lecons: nl, questions: nq, support: supportDisponible(f) || Boolean(f.support_lien), certificat: nq > 0,
  };
}

/* ------------------------------------------------------------ écriture (administrateur) */
function nettoyer(corps = {}) {
  const texte = (v, max) => String(v ?? "").trim().slice(0, max);
  const titre = texte(corps.titre, 120);
  if (titre.length < 3) return { erreur: "Donnez un titre à la formation." };
  const lien = texte(corps.support_lien, 300);
  if (lien && !/^https:\/\//i.test(lien)) return { erreur: "Le lien du support doit commencer par https://" };
  const listeLecons = (Array.isArray(corps.lecons) ? corps.lecons : []).slice(0, 40).map((l) => ({ titre: texte(l?.titre, 120), contenu: texte(l?.contenu, 12000), video_url: texte(l?.video_url, 300) })).filter((l) => l.titre || l.contenu);
  for (const l of listeLecons) {
    if (l.titre.length < 2) return { erreur: "Chaque leçon doit avoir un titre." };
    if (l.video_url && !/^https:\/\//i.test(l.video_url)) return { erreur: `Leçon « ${l.titre} » : le lien de la vidéo doit commencer par https://` };
  }
  const listeQuestions = (Array.isArray(corps.questions) ? corps.questions : []).slice(0, 40).map((q) => ({
    question: texte(q?.question, 300), options: (Array.isArray(q?.options) ? q.options : []).map((o) => texte(o, 200)).filter(Boolean).slice(0, 4), bonne: Math.round(Number(q?.bonne)),
  })).filter((q) => q.question || q.options.length);
  for (const q of listeQuestions) {
    if (q.question.length < 3) return { erreur: "Chaque question de l'évaluation doit avoir un énoncé." };
    if (q.options.length < 2) return { erreur: `Question « ${q.question} » : proposez au moins deux réponses.` };
    if (!(q.bonne >= 0 && q.bonne < q.options.length)) return { erreur: `Question « ${q.question} » : indiquez la bonne réponse.` };
  }
  const entier = (v, min, max, def) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Math.min(max, Math.max(min, Math.round(Number(v)))) : def);
  return {
    formation: {
      titre, description: texte(corps.description, 600), categorie: texte(corps.categorie, 40), duree: texte(corps.duree, 40),
      image: /^(\/images\/|\/uploads\/|https:\/\/)/.test(String(corps.image || "")) ? texte(corps.image, 300) : null,
      prix: Math.max(0, Math.round(Number(corps.prix) || 0)), publie: corps.publie === false ? 0 : 1, support_lien: lien || null,
      minuteur: entier(corps.minuteur, 30, 7200, null), score_reussite: entier(corps.score_reussite, 1, 100, 60), tentatives_max: entier(corps.tentatives_max, 1, 20, 3),
    },
    lecons: listeLecons, questions: listeQuestions,
  };
}

function ecrireContenu(id, listeLecons, listeQuestions) {
  db.prepare("DELETE FROM formations_lecons WHERE formation_id = ?").run(id);
  db.prepare("DELETE FROM formations_questions WHERE formation_id = ?").run(id);
  listeLecons.forEach((l, i) => db.prepare("INSERT INTO formations_lecons (id, formation_id, position, titre, contenu, video_url) VALUES (?, ?, ?, ?, ?, ?)").run(nanoid(), id, i, l.titre, l.contenu || "", l.video_url || null));
  listeQuestions.forEach((q, i) => db.prepare("INSERT INTO formations_questions (id, formation_id, position, question, options, bonne) VALUES (?, ?, ?, ?, ?, ?)").run(nanoid(), id, i, q.question, JSON.stringify(q.options), q.bonne));
}

function enregistrer(id, donnees) {
  const { formation: f, lecons: ll, questions: lq } = donnees;
  return db.transaction(() => {
    if (id) {
      db.prepare(`UPDATE formations SET titre = ?, description = ?, categorie = ?, duree = ?, image = COALESCE(?, image), prix = ?, publie = ?, support_lien = ?, minuteur = ?, score_reussite = ?, tentatives_max = ? WHERE id = ?`)
        .run(f.titre, f.description, f.categorie, f.duree, f.image, f.prix, f.publie, f.support_lien, f.minuteur, f.score_reussite, f.tentatives_max, id);
    } else {
      id = nanoid();
      db.prepare(`INSERT INTO formations (id, titre, description, categorie, duree, image, prix, publie, support_lien, minuteur, score_reussite, tentatives_max, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, f.titre, f.description, f.categorie, f.duree, f.image, f.prix, f.publie, f.support_lien, f.minuteur, f.score_reussite, f.tentatives_max, new Date().toISOString());
    }
    ecrireContenu(id, ll, lq);
    return id;
  })();
}

/* ------------------------------------------------------------ inscriptions et progression */
const inscriptionParJeton = (jeton) => (/^[A-Za-z0-9_-]{20,64}$/.test(String(jeton)) ? db.prepare("SELECT * FROM formations_inscriptions WHERE jeton = ?").get(String(jeton)) : null);
const inscriptionParCertificat = (code) => (/^MIL-[A-Z0-9]{10}$/.test(String(code)) ? db.prepare("SELECT * FROM formations_inscriptions WHERE code_certificat = ?").get(String(code)) : null);
const accesOuvert = (i) => i.statut === "gratuit" || i.statut === "payee";

function inscrire(f, { clientId, nom, telephone, paiement, statut }) {
  const id = nanoid(), maintenant = new Date().toISOString();
  db.prepare(
    `INSERT INTO formations_inscriptions (id, formation_id, client_id, jeton, nom, telephone, statut, montant, operateur, telephone_paiement, reference_paiement, cree_le, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, f.id, clientId || null, nanoid(32), nom, telephone, statut, statut === "gratuit" ? 0 : Math.max(0, Number(f.prix) || 0), paiement?.operateur || null, paiement?.telephone || null, paiement?.reference || null, maintenant, maintenant);
  return db.prepare("SELECT * FROM formations_inscriptions WHERE id = ?").get(id);
}

/** Ce que l'apprenant voit de sa formation : rien du contenu tant que l'accès n'est pas ouvert. */
function vueApprenant(i) {
  const f = lire(i.formation_id);
  const ll = lecons(f.id), nq = db.prepare("SELECT COUNT(*) AS n FROM formations_questions WHERE formation_id = ?").get(f.id).n;
  const ouvert = accesOuvert(i);
  const faites = Math.min(i.lecons_faites, ll.length);
  const restantes = Math.max(0, tentativesMax(f) - i.tentatives);
  return {
    jeton: i.jeton, nom: i.nom, statut: i.statut, acces: ouvert, montant: i.montant, operateur: i.operateur, reference_paiement: i.reference_paiement,
    formation: { ...fichePublique(f) },
    lecons_faites: faites,
    // Les leçons se suivent dans l'ordre : seul le contenu des leçons déjà ouvertes est envoyé
    lecons: ll.map((l, n) => ({ position: n, titre: l.titre, faite: n < faites, ouverte: ouvert && n <= faites, contenu: ouvert && n <= faites ? l.contenu : null, video_url: ouvert && n <= faites ? l.video_url : null })),
    support: ouvert ? { fichier: supportDisponible(f), nom: f.support_nom || "support.pdf", lien: f.support_lien || null } : null,
    evaluation: nq > 0 ? {
      questions: nq, minuteur: minuteur(f, nq), score_reussite: scoreReussite(f), tentatives_max: tentativesMax(f), tentatives: i.tentatives, tentatives_restantes: restantes,
      meilleur_score: i.meilleur_score, dernier_score: i.dernier_score, disponible: ouvert && faites >= ll.length && !i.reussi_le && restantes > 0,
    } : null,
    reussi_le: i.reussi_le, certificat: i.code_certificat || null,
  };
}

function terminerLecon(i, position) {
  const total = lecons(i.formation_id).length;
  if (!accesOuvert(i)) return { erreur: "L'accès à cette formation n'est pas encore ouvert.", statut: 403 };
  if (Math.round(Number(position)) !== i.lecons_faites || i.lecons_faites >= total) return { erreur: "Les leçons se suivent dans l'ordre.", statut: 409 };
  const maintenant = new Date().toISOString();
  db.prepare("UPDATE formations_inscriptions SET lecons_faites = lecons_faites + 1, maj_le = ? WHERE id = ?").run(maintenant, i.id);
  // Formation sans évaluation : terminée à la dernière leçon (pas de certificat)
  const nq = db.prepare("SELECT COUNT(*) AS n FROM formations_questions WHERE formation_id = ?").get(i.formation_id).n;
  if (nq === 0 && i.lecons_faites + 1 >= total) db.prepare("UPDATE formations_inscriptions SET reussi_le = ? WHERE id = ?").run(maintenant, i.id);
  return {};
}

function demarrerEvaluation(i) {
  const f = lire(i.formation_id), lq = questions(f.id);
  if (!accesOuvert(i)) return { erreur: "L'accès à cette formation n'est pas encore ouvert.", statut: 403 };
  if (!lq.length) return { erreur: "Cette formation n'a pas d'évaluation.", statut: 404 };
  if (i.lecons_faites < lecons(f.id).length) return { erreur: "Terminez toutes les leçons avant l'évaluation.", statut: 409 };
  if (i.reussi_le) return { erreur: "Vous avez déjà réussi cette évaluation.", statut: 409 };
  if (i.tentatives >= tentativesMax(f)) return { erreur: "Vous avez utilisé toutes vos tentatives.", statut: 409 };
  db.prepare("UPDATE formations_inscriptions SET tentatives = tentatives + 1, quiz_debut = ?, maj_le = ? WHERE id = ?").run(new Date().toISOString(), new Date().toISOString(), i.id);
  // La bonne réponse n'est jamais envoyée à l'apprenant
  return { minuteur: minuteur(f, lq.length), questions: lq.map((q) => ({ id: q.id, question: q.question, options: q.options })) };
}

function corrigerEvaluation(i, reponses) {
  const f = lire(i.formation_id), lq = questions(f.id);
  if (!i.quiz_debut) return { erreur: "Démarrez d'abord l'évaluation.", statut: 409 };
  const ecoule = (Date.now() - new Date(i.quiz_debut).getTime()) / 1000;
  const horsDelai = ecoule > minuteur(f, lq.length) + MARGE_MINUTEUR;
  const donnees = reponses && typeof reponses === "object" ? reponses : {};
  const bonnes = horsDelai ? 0 : lq.filter((q) => Math.round(Number(donnees[q.id])) === q.bonne && donnees[q.id] !== null && donnees[q.id] !== "").length;
  const score = Math.round((bonnes / lq.length) * 100);
  const reussi = !horsDelai && score >= scoreReussite(f);
  const maintenant = new Date().toISOString();
  const code = reussi ? "MIL-" + Array.from(crypto.randomBytes(10), (o) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[o % 32]).join("") : null;
  db.prepare(`UPDATE formations_inscriptions SET quiz_debut = NULL, dernier_score = ?, meilleur_score = MAX(COALESCE(meilleur_score, 0), ?),
    reussi_le = COALESCE(reussi_le, ?), code_certificat = COALESCE(code_certificat, ?), maj_le = ? WHERE id = ?`).run(score, score, reussi ? maintenant : null, code, maintenant, i.id);
  return { score, bonnes, total: lq.length, reussi, hors_delai: horsDelai, score_reussite: scoreReussite(f) };
}

/* ------------------------------------------------------------ formations fournies au départ */
const DEPART = [
  { titre: "Les bases du soin capillaire naturel", categorie: "Bases", duree: "20 min", prix: 0, image: "/images/formations/bases.png", fichier: "bases.pdf", nom: "Les-fondamentaux-du-soin-capillaire.pdf",
    description: "Comprendre son type de cheveux et construire une routine simple et efficace.", minuteur: 300, score: 60,
    lecons: [
      ["Connaître son type de cheveux", "Avant de choisir des soins, il faut comprendre sa chevelure.\n\n**La forme** : raides, ondulés, bouclés, frisés ou crépus. Plus la boucle est serrée, plus le sébum descend difficilement le long de la fibre : les cheveux frisés et crépus sont donc naturellement plus secs.\n\n**L'épaisseur** du cheveu (fine, moyenne, épaisse) et **la densité** (nombre de cheveux) guident la quantité de produit à utiliser.\n\n**La porosité** indique la capacité du cheveu à absorber et retenir l'eau :\n- faible : l'eau perle sur le cheveu, les soins pénètrent lentement ;\n- moyenne : le cheveu absorbe et retient bien l'hydratation ;\n- forte : le cheveu absorbe vite mais sèche vite (souvent après colorations ou chaleur)."],
      ["Le lavage en douceur", "Le lavage nettoie **le cuir chevelu** : c'est lui qu'on masse, pas les longueurs qu'on frotte.\n\n- Mouillez abondamment à l'eau tiède (l'eau très chaude dessèche).\n- Appliquez le **Shampooing Doux & Hydratant** sur le cuir chevelu, massez 2 à 3 minutes du bout des doigts.\n- Laissez la mousse glisser sur les longueurs en rinçant : cela suffit à les nettoyer.\n\n**Fréquence** : 1 à 2 fois par semaine pour les cheveux secs, bouclés ou crépus ; davantage si le cuir chevelu graisse vite."],
      ["Démêler sans casser", "La casse vient surtout d'un démêlage brutal.\n\n- Démêlez toujours sur cheveux **mouillés et enduits de soin**, jamais à sec.\n- Appliquez le **Démêlant Après-Shampooing** sur les longueurs, laissez agir 2 à 3 minutes.\n- Travaillez par sections, **des pointes vers les racines**, aux doigts puis au peigne à dents larges.\n- Rincez à l'eau tiède ou fraîche pour lisser la fibre."],
      ["Hydrater et protéger au quotidien", "Entre deux lavages, l'objectif est de garder l'eau dans la fibre.\n\n- Humidifiez légèrement les longueurs, puis appliquez une noisette de **Crème Capillaire** : elle hydrate, nourrit et assouplit.\n- Scellez si besoin avec quelques gouttes d'**Huile Sérum**, surtout sur les pointes.\n- La nuit, protégez vos cheveux avec un bonnet ou une taie en satin pour limiter les frottements.\n\n**À retenir** : régularité avant quantité. Une petite dose chaque jour vaut mieux qu'un soin massif une fois par mois."],
    ],
    questions: [
      ["Pourquoi les cheveux crépus sont-ils naturellement plus secs ?", ["Ils produisent moins de kératine", "Le sébum descend difficilement le long de la boucle", "Ils sont plus fins que les cheveux raides"], 1],
      ["Sur quelle zone faut-il masser le shampooing ?", ["Sur les pointes", "Sur les longueurs", "Sur le cuir chevelu"], 2],
      ["Comment démêler pour limiter la casse ?", ["À sec, des racines vers les pointes", "Sur cheveux mouillés avec un soin, des pointes vers les racines", "Avec une brosse fine sur cheveux secs"], 1],
      ["Un cheveu à forte porosité…", ["absorbe vite l'eau mais la perd vite", "repousse l'eau qui perle en surface", "ne peut pas être hydraté"], 0],
      ["Quelle habitude protège les cheveux la nuit ?", ["Dormir cheveux mouillés", "Un bonnet ou une taie en satin", "Attacher les cheveux très serrés"], 1],
    ] },
  { titre: "Coloration maison : les précautions essentielles", categorie: "Coloration", duree: "5 pages", prix: 5000, image: "/images/formations/coloration.png", fichier: "coloration.pdf", nom: "Coloration-bonnes-pratiques.pdf",
    description: "Les bons gestes avant, pendant et après une coloration pour préserver la fibre capillaire." },
  { titre: "Routine hydratation pour cheveux secs", categorie: "Cheveux secs", duree: "5 pages", prix: 5000, image: "/images/formations/soins-secs.png", fichier: "soins-secs.pdf", nom: "Routine-cheveux-secs.pdf",
    description: "Méthode d'hydratation et fréquence idéale pour des cheveux secs et déshydratés." },
  { titre: "Comprendre et apaiser un cuir chevelu sensible", categorie: "Cuir chevelu", duree: "5 pages", prix: 5000, image: "/images/formations/cuir-chevelu.png", fichier: "cuir-chevelu.pdf", nom: "Sante-du-cuir-chevelu.pdf",
    description: "Identifier les causes d'irritation et adopter les bons réflexes au quotidien." },
  { titre: "Quand consulter un spécialiste capillaire", categorie: "Spécialiste", duree: "5 pages", prix: 5000, image: "/images/formations/specialiste.png", fichier: "specialiste.pdf", nom: "Quand-consulter-un-specialiste.pdf",
    description: "Repérer les signes qui justifient l'avis d'un dermatologue ou d'un trichologue." },
];

/** Installe les formations de départ dans l'espace courant, une seule fois (elles restent modifiables et supprimables). */
function installerFormations() {
  if (db.prepare("SELECT valeur FROM parametres WHERE cle = 'formations_installees'").get()) return false;
  db.transaction(() => {
    DEPART.forEach((d, n) => {
      const id = nanoid();
      db.prepare(`INSERT INTO formations (id, titre, description, categorie, duree, image, prix, publie, support_fichier, support_nom, minuteur, score_reussite, tentatives_max, cree_le)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 3, ?)`).run(id, d.titre, d.description, d.categorie, d.duree, d.image, d.prix, d.fichier, d.nom, d.minuteur || null, d.score || 60, new Date(Date.now() - n * 60000).toISOString());
      ecrireContenu(id, (d.lecons || []).map(([titre, contenu]) => ({ titre, contenu })), (d.questions || []).map(([question, options, bonne]) => ({ question, options, bonne })));
    });
    db.prepare("INSERT INTO parametres (cle, valeur) VALUES ('formations_installees', '1')").run();
  })();
  return true;
}

module.exports = {
  lire, lecons, questions, fichePublique, nettoyer, enregistrer, inscrire, inscriptionParJeton, inscriptionParCertificat, accesOuvert, vueApprenant,
  terminerLecon, demarrerEvaluation, corrigerEvaluation, installerFormations, supportDisponible, cheminSupport, scoreReussite, tentativesMax,
};

import React, { useState, useEffect, useMemo, useCallback, useRef, useContext, createContext } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  ShoppingBag, ShoppingCart, Search, X, Plus, Minus, Trash2, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock,
  Truck, PackageCheck, XCircle, Phone, MapPin, Mail, MessageSquare, ShieldCheck, Smartphone, CreditCard, Banknote,
  Droplets, Leaf, HeartPulse, TrendingUp, Shield, RotateCcw, ListChecks, CalendarDays,
  Copy, Download, Printer, AlertCircle, AlertTriangle, Info, Receipt, Store, User, ChevronRight, Loader2, Sparkles, Package, Tag, FileText, BellOff, Bell, LayoutDashboard, ChevronDown, UserPlus,
} from "lucide-react";
import { fmt, fmtNum, lignesTicket, telechargerTicketPdf, urlTicketPdf, pdfIntegrable, genererQr, cheminQr, lienTicket, telInternational } from "/partage/ticket.js";

/* =====================================================================
   MILANA — page d'accueil de la plateforme et boutiques en ligne
   La page d'accueil présente les produits de TOUS les administrateurs ; chaque
   boutique a aussi sa propre page (#/boutique/<adresse>). Une commande concerne
   une seule boutique. « Mon espace » mène au tableau de bord (administrateur ou vendeur).
   ===================================================================== */

const API = (window.MONCOMMERCE_API_URL || "").replace(/\/$/, "");
const PANIER_KEY = "boutique-panier";
const COMMANDES_KEY = "boutique-mes-commandes";
const CLIENT_KEY = "boutique-client";
const DIAG_KEY = "milana-diagnostic"; // référence du dernier diagnostic capillaire fait sur cet appareil
const REF_KEY = "boutique-vendeurs"; // lien de promotion suivi : { idBoutique: idVendeur }
const PLATEFORME = "MILANA";
/* Réglages neutres quand aucune boutique n'est concernée (page d'accueil de la plateforme) */
const CONFIG_PLATEFORME = {
  id: null, slug: null, plateforme: true, ouverte: true,
  boutique: { nom: PLATEFORME, slogan: "", adresse: "", telephone: "", whatsapp: "", message: "" },
  livraison: { frais: 0, gratuite_des: 0, zone: "" },
  paiements: { livraison: true, transfert: [], en_ligne: false, en_ligne_test: false },
};

const cx = (...a) => a.filter(Boolean).join(" ");
const norm = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lire = (k, def) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : def; } catch { return def; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
const urlImage = (img) => (img && img.startsWith("/uploads/") ? API + img : img);
const fmtDate = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

async function api(methode, chemin, corps) {
  let res;
  try {
    res = await fetch(API + chemin, { method: methode, headers: { "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
  } catch {
    throw Object.assign(new Error("Connexion impossible. Vérifiez votre accès Internet et réessayez."), { statut: 0 });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.erreur || `Erreur ${res.status}`), { statut: res.status, details: json });
  return json;
}

/* Moyens de paiement : apparence (couleurs des opérateurs) */
const OPERATEURS = {
  "Orange Money": { couleur: "#ff7900", sigle: "OM" },
  "MTN MoMo": { couleur: "#ffcb05", sigle: "MTN", texte: "#1a1a1a" },
  "Moov Money": { couleur: "#0066b3", sigle: "MV" },
  "Wave": { couleur: "#1dc8ff", sigle: "W" },
};
const LogoOperateur = ({ mode, taille = 28 }) => {
  const o = OPERATEURS[mode] || { couleur: "#8a8a8a", sigle: "?" };
  return <span className="pay-logo" style={{ background: o.couleur, color: o.texte || "#fff", width: taille, height: taille, fontSize: taille * 0.36 }}>{o.sigle}</span>;
};

/* =====================================================================
   État global : configuration, catalogue, panier, navigation, toasts
   ===================================================================== */
const Ctx = createContext(null);
const useBoutique = () => useContext(Ctx);

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [chemin, requete = ""] = h.split("?");
  const [page = "", id = null] = chemin.split("/").filter(Boolean);
  return { page, id: id ? decodeURIComponent(id) : null, vendeur: new URLSearchParams(requete).get("v") };
}
function useRoute() {
  const [r, setR] = useState(parseHash);
  useEffect(() => { const f = () => { setR(parseHash()); window.scrollTo({ top: 0 }); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  const go = useCallback((page, id) => { location.hash = "/" + (page || "") + (id ? "/" + encodeURIComponent(id) : ""); }, []);
  return [r, go];
}

/* =====================================================================
   Composants de base
   ===================================================================== */
function Btn({ children, variant = "secondary", size, icon: Icon, iconRight: IconR, loading, full, className, ...rest }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading}
      className={cx("btn", `btn-${variant}`, size && `btn-${size}`, full && "btn-full", !children && "btn-icon", loading && "is-loading", className)}>
      {loading && <span className="spinner" />}
      {Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2.2} />}
      {children && <span>{children}</span>}
      {IconR && <IconR size={16} strokeWidth={2.2} />}
    </button>
  );
}
const Badge = ({ tone = "neutral", children, dot }) => <span className={cx("badge", `badge-${tone}`)}>{dot && <span className="badge-dot" />}{children}</span>;
function Field({ label, error, help, children, optional, className }) {
  return (
    <div className={cx("field", error && "has-error", className)}>
      <label className="label">{label}{optional && <span className="optional"> (facultatif)</span>}</label>
      {children}
      {error ? <div className="field-error"><AlertCircle size={14} />{error}</div> : help ? <div className="help">{help}</div> : null}
    </div>
  );
}
function Input({ icon: Icon, suffix, size, className, ...rest }) {
  return (
    <div className={cx("input-wrap", size === "lg" && "input-lg", className)}>
      {Icon && <Icon size={16} className="input-icon" />}
      <input className="input" {...rest} />
      {suffix && <span className="input-affix">{suffix}</span>}
    </div>
  );
}
function Stepper({ value, onChange, min = 1, max = 99 }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuer"><Minus size={14} /></button>
      <input value={value} inputMode="numeric" aria-label="Quantité" onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); onChange(Math.min(max, Math.max(min, isNaN(n) ? min : n))); }} />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Augmenter"><Plus size={14} /></button>
    </div>
  );
}
const ImageProduit = ({ p, className }) => (p?.image
  ? <img className={cx("img-produit", className)} src={urlImage(p.image)} alt={p.nom} loading="lazy" />
  : <div className={cx("img-produit img-vide", `tint-${p?.teinte ?? 6}`, className)}><span>{p?.emoji || "📦"}</span></div>);

function Toasts({ items, fermer }) {
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx("toast", t.ton && `toast-${t.ton}`)}>
          {t.ton === "critical" ? <AlertCircle size={18} className="toast-icon" /> : <CheckCircle2 size={18} className="toast-icon" />}
          <div className="toast-text"><strong>{t.titre}</strong>{t.desc && <span>{t.desc}</span>}</div>
          {t.action && <button className="toast-action" onClick={() => { t.action.onClick(); fermer(t.id); }}>{t.action.label}</button>}
          <button className="toast-close" onClick={() => fermer(t.id)} aria-label="Fermer"><X size={15} /></button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* =====================================================================
   En-tête, pied de page
   ===================================================================== */
function BandeauInfo() {
  const { config } = useBoutique();
  const l = config.livraison;
  const msg = config.plateforme ? "Diagnostic capillaire gratuit · −15 % sur votre routine · paiement à la livraison ou par Mobile Money"
    : !config.ouverte ? "Cette boutique ne prend pas de commandes pour le moment."
    : l.gratuite_des > 0 ? `Livraison offerte dès ${fmt(l.gratuite_des)} d'achat${l.zone ? " · " + l.zone : ""}`
    : l.zone ? `Livraison : ${l.zone}` : "Paiement à la livraison ou par Mobile Money";
  return <div className={cx("annonce", !config.ouverte && "fermee")}>{msg}</div>;
}

/* « Mon espace » : accès au tableau de bord de l'administrateur ou du vendeur */
function MonEspace() {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!ouvert) return;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOuvert(false); };
    const k = (e) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("mousedown", h); addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); removeEventListener("keydown", k); };
  }, [ouvert]);
  return (
    <div className="v-espace" ref={ref}>
      <button className="btn btn-primary v-espace-btn" onClick={() => setOuvert((o) => !o)} aria-haspopup="menu" aria-expanded={ouvert}>
        <LayoutDashboard size={16} /><span>Mon espace</span><ChevronDown size={14} />
      </button>
      {ouvert && (
        <div className="v-espace-menu" role="menu">
          <a role="menuitem" href="/admin/?espace=admin"><ShieldCheck size={17} /><span><b>Mon espace administrateur</b><small>Produits, stocks, vendeurs, finances</small></span></a>
          <a role="menuitem" href="/admin/?espace=vendeur"><User size={17} /><span><b>Mon espace vendeur</b><small>Mes ventes et mon lien de promotion</small></span></a>
          <div className="pop-sep" />
          <a role="menuitem" href="/admin/?creer=1"><UserPlus size={17} /><span><b>Créer mon espace</b><small>Ouvrir ma boutique sur la plateforme</small></span></a>
        </div>
      )}
    </div>
  );
}

function EnTete() {
  const { config, nbArticles, ouvrirPanier, recherche, setRecherche, go, route, bump } = useBoutique();
  const [chercher, setChercher] = useState(false);
  return (
    <header className="v-header">
      <div className="v-header-in">
        <a href="#/" className="v-logo" onClick={() => setRecherche("")}>
          <span className="brand-mark"><ShoppingBag size={16} strokeWidth={2.4} /></span>
          <span className="truncate">{PLATEFORME}</span>
        </a>
        <div className={cx("v-search", chercher && "ouvert")}>
          <Search size={16} className="input-icon" />
          <input value={recherche} onChange={(e) => { setRecherche(e.target.value); if (route.page) go(""); }} placeholder="Rechercher un produit…" aria-label="Rechercher" />
          {recherche && <button className="input-clear" onClick={() => setRecherche("")} aria-label="Effacer"><X size={13} /></button>}
        </div>
        <nav className="v-actions">
          <button className="v-icon only-mobile" onClick={() => setChercher((c) => !c)} aria-label="Rechercher"><Search size={20} /></button>
          <a href="#/diagnostic" className="v-lien v-lien-diag"><Sparkles size={16} /><span>Diagnostic</span></a>
          <a href="#/formations" className="v-lien hide-sm"><FileText size={17} />Formations</a>
          <a href="#/mes-commandes" className="v-lien hide-sm"><Receipt size={17} />Mes commandes</a>
          <MonEspace />
          <button className={cx("v-icon v-panier", bump && "bump")} onClick={ouvrirPanier} aria-label={`Panier, ${nbArticles} article(s)`}>
            <ShoppingCart size={21} />
            {nbArticles > 0 && <span className="v-compteur">{nbArticles}</span>}
          </button>
        </nav>
      </div>
    </header>
  );
}

function PiedDePage() {
  const { config } = useBoutique();
  const b = config.boutique;
  const modes = [...config.paiements.transfert.map((t) => t.mode)];
  return (
    <footer className="v-footer">
      <div className="v-footer-in">
        <div>
          <div className="v-logo"><span className="brand-mark"><ShoppingBag size={16} strokeWidth={2.4} /></span>{b.nom}</div>
          {b.slogan && <p className="muted" style={{ marginTop: 8 }}>{b.slogan}</p>}
        </div>
        <div className="stack-sm" hidden={!b.adresse && !b.telephone && !b.whatsapp}>
          <div className="strong">Nous contacter</div>
          {b.adresse && <div className="row muted"><MapPin size={14} />{b.adresse}</div>}
          {b.telephone && <a className="row" href={`tel:${b.telephone.replace(/\s/g, "")}`}><Phone size={14} />{b.telephone}</a>}
          {b.whatsapp && <a className="row" href={`https://wa.me/${telInternational(b.whatsapp)}`} target="_blank" rel="noopener"><MessageSquare size={14} />WhatsApp</a>}
        </div>
        <div className="stack-sm">
          <div className="strong">Paiements acceptés</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="chip-pay"><Banknote size={14} />À la livraison</span>
            {modes.map((m) => <span key={m} className="chip-pay"><LogoOperateur mode={m} taille={18} />{m}</span>)}
            {config.paiements.en_ligne && <span className="chip-pay"><CreditCard size={14} />Paiement en ligne</span>}
          </div>
        </div>
      </div>
      <div className="v-footer-bas">
        <span>© {new Date().getFullYear()} {PLATEFORME}{config.plateforme ? "" : " · " + b.nom}</span>
        <span className="row" style={{ gap: 14, flexWrap: "wrap" }}><a href="#/diagnostic">Diagnostic</a><a href="#/formations">Formations</a><a href="/admin/?espace=admin">Mon espace administrateur</a><a href="/admin/?espace=vendeur">Mon espace vendeur</a><a href="/admin/?creer=1">Créer mon espace</a></span>
      </div>
    </footer>
  );
}

/* =====================================================================
   Accueil : bannière + catalogue
   ===================================================================== */
function CarteProduit({ p, i }) {
  const { ajouter, go, quantiteDans } = useBoutique();
  const dansPanier = quantiteDans(p.id);
  return (
    <article className="v-carte" style={{ "--i": i }}>
      <a href={`#/produit/${encodeURIComponent(p.id)}`} className="v-carte-media">
        <ImageProduit p={p} />
        {!p.disponible && <span className="v-etiquette epuise">Épuisé</span>}
        {p.disponible && p.stock <= 5 && <span className="v-etiquette">Plus que {p.stock}</span>}
        {p.remise > 0 && <span className="v-etiquette promo">{p.routine ? "Ma routine " : ""}−{p.remise} %</span>}
      </a>
      <div className="v-carte-corps">
        <a href={`#/produit/${encodeURIComponent(p.id)}`} className="v-carte-nom">{p.nom}</a>
        <a href={`#/boutique/${p.boutique_slug}`} className="v-carte-boutique"><Store size={12} />{p.boutique_nom}</a>
        {p.description && <p className="v-carte-desc">{p.description}</p>}
        {p.pieces_par_lot > 1 && <span className="v-lot">Lot de {p.pieces_par_lot} articles</span>}
        <div className="v-carte-bas">
          <span className="v-prix">{fmt(p.prix)}{p.remise > 0 && <s className="v-prix-barre">{fmt(p.prix_normal)}</s>}</span>
          <Btn size="sm" variant={dansPanier ? "secondary" : "primary"} icon={dansPanier ? Check : Plus} disabled={!p.disponible || dansPanier >= p.stock}
            onClick={() => ajouter(p, 1)}>{dansPanier ? `${dansPanier} au panier` : "Ajouter"}</Btn>
        </div>
      </div>
    </article>
  );
}

/* =====================================================================
   Diagnostic capillaire : questionnaire, puis bilan et routine sur mesure.
   Le calcul est fait par le serveur ; la fiche client est créée automatiquement.
   ===================================================================== */
const REMISE_DIAG = 15; // % de remise sur les produits recommandés (appliquée par le serveur)
const ETAPES_DIAG = [
  { id: "personne", type: "personne", categorie: "Profil", titre: "Faisons connaissance", sous: "Ces informations nous permettent de vous recontacter avec des conseils personnalisés." },
  { id: "hairType", type: "simple", categorie: "Cheveux", titre: "Quel est votre type de cheveux ?",
    options: [["raides", "Raides", "💇"], ["ondules", "Ondulés", "🌊"], ["boucles", "Bouclés", "🌀"], ["frises", "Frisés", "💫"], ["crepus", "Crépus", "✨"]] },
  { id: "texture", type: "simple", categorie: "Cheveux", titre: "Quelle est votre texture de cheveux ?", options: [["fine", "Fine", "🧵"], ["moyenne", "Moyenne", "➰"], ["epaisse", "Épaisse", "🪢"]] },
  { id: "density", type: "simple", categorie: "Cheveux", titre: "Quelle est la densité de votre chevelure ?", options: [["faible", "Faible", "🌾"], ["moyenne", "Moyenne", "🌿"], ["forte", "Forte", "🌳"]] },
  { id: "scalp", type: "multi", categorie: "Cuir chevelu", titre: "Comment décririez-vous votre cuir chevelu ?", sous: "Plusieurs réponses possibles.", exclusif: "normal",
    options: [["gras", "Gras", "💧"], ["sec", "Sec", "🏜️"], ["pellicules", "Pellicules", "❄️"], ["demangeaisons", "Démangeaisons", "😣"], ["irritations", "Irritations", "🔥"], ["sensible", "Sensible", "🌸"], ["normal", "Normal", "✅"]] },
  { id: "problems", type: "multi", categorie: "Besoins", titre: "Quels sont vos principaux problèmes capillaires ?", sous: "Sélectionnez toutes les réponses qui s'appliquent.", exclusif: "aucun",
    options: [["chute", "Chute de cheveux", "🍂"], ["cassure", "Cassure", "⚡"], ["secs", "Cheveux secs", "🌵"], ["fourches", "Pointes fourchues", "✂️"], ["pousse", "Manque de pousse", "🌱"], ["alopecie", "Alopécie", "⭕"], ["pellicules", "Pellicules", "❄️"], ["sebum", "Excès de sébum", "💧"], ["ternes", "Cheveux ternes", "🌫️"], ["frisottis", "Frisottis", "🌀"], ["decoloration", "Décoloration", "🎨"], ["coloration", "Coloration", "🖌️"], ["demangeaisons", "Démangeaisons", "😣"], ["abimes", "Cheveux abîmés", "💔"], ["aucun", "Aucun problème particulier", "✅"]] },
  { id: "duration", type: "simple", categorie: "Besoins", titre: "Depuis combien de temps rencontrez-vous ces problèmes ?", options: [["semaines", "Quelques semaines", "🗓️"], ["mois", "Quelques mois", "📅"], ["an", "Plus d'un an", "⏳"]] },
  { id: "washFrequency", type: "simple", categorie: "Habitudes", titre: "À quelle fréquence lavez-vous vos cheveux ?",
    options: [["quotidien", "Tous les jours", "🚿"], ["2x_semaine", "2 fois par semaine", "🚿"], ["1x_semaine", "1 fois par semaine", "🚿"], ["2_semaines", "Toutes les deux semaines", "🚿"], ["1x_mois", "Une fois par mois", "🚿"]] },
  { id: "chemicals", type: "multi", categorie: "Habitudes", titre: "Utilisez-vous des produits chimiques sur vos cheveux ?", sous: "Plusieurs réponses possibles.", exclusif: "aucun",
    options: [["defrisage", "Défrisage", "🧴"], ["coloration", "Coloration", "🎨"], ["decoloration", "Décoloration", "🧪"], ["lissage", "Lissage", "🧴"], ["aucun", "Aucun", "✅"]] },
  { id: "heatTools", type: "simple", categorie: "Habitudes", titre: "Utilisez-vous des appareils chauffants ?", options: [["quotidien", "Quotidiennement", "🔥"], ["occasionnel", "Occasionnellement", "🔥"], ["jamais", "Jamais", "🚫"]] },
  { id: "diet", type: "simple", categorie: "Mode de vie", titre: "Comment qualifieriez-vous votre alimentation ?", options: [["bonne", "Bonne, équilibrée", "🥗"], ["moyenne", "Moyenne", "🍽️"], ["mauvaise", "Mauvaise, déséquilibrée", "🍔"]] },
  { id: "water", type: "simple", categorie: "Mode de vie", titre: "Quelle est votre consommation d'eau quotidienne ?", options: [["moins_1L", "Moins de 1 litre", "🥤"], ["1_2L", "1 à 2 litres", "💧"], ["plus_2L", "Plus de 2 litres", "🚰"]] },
  { id: "stress", type: "simple", categorie: "Mode de vie", titre: "Quel est votre niveau de stress au quotidien ?", options: [["faible", "Faible", "😌"], ["moyen", "Moyen", "😐"], ["eleve", "Élevé", "😫"]] },
  { id: "sleep", type: "simple", categorie: "Mode de vie", titre: "Dormez-vous suffisamment (7 à 8 h par nuit) ?", options: [["oui", "Oui", "😴"], ["non", "Non", "🥱"]] },
];
const SCORES_DIAG = [["sante", "Santé générale", HeartPulse], ["hydratation", "Hydratation", Droplets], ["nutrition", "Nutrition", Leaf], ["croissance", "Croissance", TrendingUp], ["force", "Force", Shield]];

function BilanDiagnostic({ d, refaire }) {
  const { produits, ajouter, ouvrirPanier, toast } = useBoutique();
  const ton = d.global >= 65 ? "bon" : d.global >= 45 ? "moyen" : "faible";
  // Produits recommandés encore en vente (prix du moment, remise comprise si elle est valable)
  const recommandes = d.produits.map((x) => ({ x, p: produits.find((p) => p.id === x.cle) })).filter((r) => r.p);
  const dispo = recommandes.filter((r) => r.p.disponible);
  const total = dispo.reduce((s, r) => s + r.p.prix, 0), normal = dispo.reduce((s, r) => s + (r.p.prix_normal || r.p.prix), 0);
  const toutAjouter = () => {
    dispo.forEach((r) => ajouter(r.p, 1, true));
    toast({ titre: "Routine ajoutée au panier", desc: `${dispo.length} produit${dispo.length > 1 ? "s" : ""}${d.remise.valable ? ` · −${d.remise.pourcent} %` : ""}` });
    ouvrirPanier();
  };
  return (
    <div className="dx-bilan">
      <div className="dx-tete">
        <span className="dx-sur">Votre bilan capillaire · réf. {d.reference}</span>
        <h1>{d.prenom}, voici votre <em>diagnostic</em>.</h1>
      </div>

      <div className="dx-grille">
        <section className="dx-carte dx-score">
          <div className={cx("dx-anneau", ton)} style={{ "--p": d.global }}><div><strong className="num">{d.global}</strong><span>/ 100</span></div></div>
          <div className="dx-score-infos">
            <div><span>Niveau de gravité</span><b>{d.gravite}</b></div>
            <div><span>Porosité estimée</span><b>{d.porosite}</b></div>
            <div><span>Résultats visibles en</span><b>{d.delai}</b></div>
          </div>
        </section>
        <section className="dx-carte">
          <h3>Vos 5 indicateurs</h3>
          {SCORES_DIAG.map(([k, label, Icone]) => (
            <div className="dx-barre" key={k}>
              <span><Icone size={15} />{label}</span>
              <i><b style={{ width: d.scores[k] + "%" }} className={d.scores[k] >= 65 ? "bon" : d.scores[k] >= 45 ? "moyen" : "faible"} /></i>
              <em className="num">{d.scores[k]}</em>
            </div>
          ))}
        </section>
      </div>

      <section className="dx-carte dx-objectifs">
        <div><span>Objectif principal</span><b>{d.objectif_principal}</b></div>
        <div><span>Objectif secondaire</span><b>{d.objectif_secondaire}</b></div>
      </section>

      <section className="dx-carte">
        <div className="dx-carte-tete">
          <div><h3>Votre routine MILANA</h3><p>{d.remise.valable ? `−${d.remise.pourcent} % sur ces produits, sur votre prochaine commande (valable ${d.remise.jours} jours).` : "Les produits choisis pour vos cheveux."}</p></div>
          {dispo.length > 0 && <Btn variant="brand" icon={ShoppingCart} onClick={toutAjouter}>Ajouter ma routine — {fmt(total)}{normal > total && <s className="dx-barre-prix">{fmt(normal)}</s>}</Btn>}
        </div>
        <div className="dx-produits">
          {recommandes.map(({ x, p }) => (
            <article key={x.cle} className="dx-produit">
              <a href={`#/produit/${encodeURIComponent(p.id)}`} className="dx-produit-img"><ImageProduit p={p} /></a>
              <div className="dx-produit-corps">
                <a href={`#/produit/${encodeURIComponent(p.id)}`}><b>{p.nom}</b></a>
                <span className="dx-usage"><Clock size={13} />{x.usage}</span>
                <p>{x.detail}</p>
                <div className="dx-produit-bas">
                  <span className="v-prix">{fmt(p.prix)}{p.prix_normal > p.prix && <s className="v-prix-barre">{fmt(p.prix_normal)}</s>}</span>
                  <Btn size="sm" icon={Plus} disabled={!p.disponible} onClick={() => ajouter(p, 1)}>{p.disponible ? "Ajouter" : "Épuisé"}</Btn>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="dx-carte">
        <h3><CalendarDays size={17} />Votre calendrier de soins</h3>
        <div className="dx-routine">{d.routine.map((j) => <div key={j.label}><b>{j.label}</b><span>{j.texte}</span></div>)}</div>
      </section>

      <div className="dx-grille">
        <section className="dx-carte"><h3><AlertCircle size={17} />Causes probables</h3><ul className="dx-liste">{d.causes.map((c) => <li key={c}>{c}</li>)}</ul></section>
        <section className="dx-carte"><h3><ListChecks size={17} />Habitudes à adopter</h3><ul className="dx-liste ok">{d.habitudes.map((c) => <li key={c}>{c}</li>)}</ul></section>
      </div>
      <section className="dx-carte"><h3><XCircle size={17} />Erreurs à éviter</h3><ul className="dx-liste non">{d.erreurs.map((c) => <li key={c}>{c}</li>)}</ul></section>

      <div className="dx-actions">
        {d.whatsapp && <a className="btn btn-brand btn-lg" href={d.whatsapp} target="_blank" rel="noopener"><MessageSquare size={16} /><span>Être accompagné(e) sur WhatsApp</span></a>}
        <a className="btn btn-secondary btn-lg" href="#/"><ShoppingBag size={16} /><span>Voir toute la gamme</span></a>
        <Btn size="lg" icon={RotateCcw} onClick={refaire}>Refaire le diagnostic</Btn>
      </div>
      <p className="dx-note">Ce diagnostic est un conseil cosmétique : il ne remplace pas l'avis d'un médecin ou d'un dermatologue en cas de chute importante ou d'irritation persistante.</p>
    </div>
  );
}

function PageDiagnostic() {
  const { diag, enregistrerDiagnostic, boutiques } = useBoutique();
  const [etape, setEtape] = useState(-1); // -1 : présentation
  const [rep, setRep] = useState({});
  const [pers, setPers] = useState(() => { const c = lire(CLIENT_KEY, {}); return { prenom: "", nom: "", telephone: c.telephone || "", ville: c.ville || "", email: c.email || "", sexe: "", age: "", consentement: true }; });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [refaire, setRefaire] = useState(false);
  const haut = useRef(null);
  useEffect(() => { if (etape >= 0) haut.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [etape]);

  if (diag && !refaire) return <div className="v-section dx"><BilanDiagnostic d={diag} refaire={() => { setRefaire(true); setRep({}); setEtape(0); }} /></div>;

  if (etape < 0) {
    return (
      <div className="v-section dx">
        <div className="dx-intro">
          <div className="dx-intro-texte">
            <span className="dx-sur">Diagnostic capillaire gratuit</span>
            <h1>Votre routine, <em>sur mesure</em>.</h1>
            <p>En 3 minutes, MILANA analyse vos cheveux, votre cuir chevelu et vos habitudes. Vous recevez un bilan complet, votre calendrier de soins et les produits qu'il vous faut.</p>
            <ul className="dx-atouts">
              <li><Check size={16} />5 indicateurs : santé, hydratation, nutrition, croissance, force</li>
              <li><Check size={16} />Votre routine jour par jour</li>
              <li><Check size={16} />−{REMISE_DIAG} % sur les produits recommandés</li>
            </ul>
            <Btn variant="brand" size="lg" iconRight={ArrowRight} onClick={() => setEtape(0)}>Commencer mon diagnostic</Btn>
          </div>
          <div className="dx-intro-image"><img src="/images/modeles/model-1.jpg" alt="" loading="lazy" /></div>
        </div>
      </div>
    );
  }

  const e = ETAPES_DIAG[etape], derniere = etape === ETAPES_DIAG.length - 1;
  const valide = e.type === "personne"
    ? pers.prenom.trim().length >= 2 && pers.nom.trim().length >= 2 && pers.telephone.replace(/\D/g, "").length >= 8 && pers.ville.trim().length >= 2 && Boolean(pers.sexe)
    : e.type === "simple" ? Boolean(rep[e.id]) : (rep[e.id] || []).length > 0;
  const choisir = (v) => {
    if (e.type === "simple") return setRep((s) => ({ ...s, [e.id]: v }));
    setRep((s) => {
      let l = s[e.id] || [];
      if (v === e.exclusif) l = l.includes(v) ? [] : [v];
      else { l = l.filter((x) => x !== e.exclusif); l = l.includes(v) ? l.filter((x) => x !== v) : [...l, v]; }
      return { ...s, [e.id]: l };
    });
  };
  const champ = (k) => ({ value: pers[k], onChange: (ev) => setPers((s) => ({ ...s, [k]: ev.target.value })) });
  const envoyer = async () => {
    setEnvoi(true); setErreur("");
    try {
      const d = await api("POST", "/api/boutique/diagnostic", { boutique: boutiques.length === 1 ? undefined : boutiques[0]?.id, personne: { ...pers, age: pers.age ? Number(pers.age) : undefined }, reponses: rep });
      ecrire(CLIENT_KEY, { ...lire(CLIENT_KEY, {}), nom: `${pers.prenom.trim()} ${pers.nom.trim()}`, telephone: pers.telephone, email: pers.email, ville: pers.ville });
      enregistrerDiagnostic(d);
      setRefaire(false);
      window.scrollTo({ top: 0 });
    } catch (x) { setErreur(x.message); setEnvoi(false); }
  };

  return (
    <div className="v-section dx" ref={haut}>
      <div className="dx-quiz">
        <div className="dx-progres"><i style={{ width: `${((etape + 1) / ETAPES_DIAG.length) * 100}%` }} /></div>
        <div className="dx-quiz-tete"><span className="dx-sur">{e.categorie}</span><span className="subtle">Étape {etape + 1} / {ETAPES_DIAG.length}</span></div>
        <h2>{e.titre}</h2>
        {e.sous && <p className="dx-sous">{e.sous}</p>}

        {e.type === "personne" ? (
          <div className="dx-form">
            <label>Prénom *<input className="input" autoComplete="given-name" placeholder="Votre prénom" {...champ("prenom")} /></label>
            <label>Nom *<input className="input" autoComplete="family-name" placeholder="Votre nom" {...champ("nom")} /></label>
            <div className="dx-plein"><span className="dx-label">Vous êtes *</span>
              <div className="dx-sexe">{[["femme", "Une femme"], ["homme", "Un homme"]].map(([v, l]) => <button type="button" key={v} className={cx(pers.sexe === v && "choisi")} onClick={() => setPers((s) => ({ ...s, sexe: v }))}>{l}</button>)}</div>
            </div>
            <label>Téléphone (WhatsApp) *<input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" {...champ("telephone")} /></label>
            <label>Ville *<input className="input" autoComplete="address-level2" placeholder="Abidjan" {...champ("ville")} /></label>
            <label>Âge<input className="input" inputMode="numeric" placeholder="Facultatif" {...champ("age")} /></label>
            <label>E-mail<input className="input" type="email" autoComplete="email" placeholder="Facultatif" {...champ("email")} /></label>
            <label className="dx-plein dx-consent"><input type="checkbox" checked={pers.consentement} onChange={(ev) => setPers((s) => ({ ...s, consentement: ev.target.checked }))} /><span>J'accepte de recevoir les conseils, nouveautés et promotions MILANA par SMS, WhatsApp ou e-mail. Je peux me désinscrire à tout moment.</span></label>
          </div>
        ) : (
          <div className="dx-options">
            {e.options.map(([v, label, icone]) => {
              const choisi = e.type === "simple" ? rep[e.id] === v : (rep[e.id] || []).includes(v);
              return <button type="button" key={v} className={cx("dx-option", choisi && "choisi")} aria-pressed={choisi} onClick={() => choisir(v)}><span>{icone}</span>{label}{choisi && <Check size={16} className="dx-coche" />}</button>;
            })}
          </div>
        )}

        {erreur && <div className="banner banner-critical" style={{ marginTop: 16 }}><AlertTriangle size={16} /><div>{erreur}</div></div>}
        <div className="dx-nav">
          <Btn icon={ArrowLeft} onClick={() => (etape === 0 ? (setRefaire(false), setEtape(-1)) : setEtape(etape - 1))}>Retour</Btn>
          <Btn variant="brand" size="lg" iconRight={derniere ? Sparkles : ArrowRight} disabled={!valide} loading={envoi} onClick={() => (derniere ? envoyer() : setEtape(etape + 1))}>{derniere ? "Obtenir mon diagnostic" : "Suivant"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   Formations : catalogue, inscription, parcours (leçons, évaluation), certificat.
   Pas de compte client : chaque inscription a un lien d'accès, gardé sur l'appareil.
   ===================================================================== */
const FORMATIONS_KEY = "milana-formations"; // [{ jeton, titre }] : formations suivies depuis cet appareil

/* Texte d'une leçon : paragraphes, **gras** et listes « - » (aucun HTML n'est interprété) */
function TexteLecon({ texte }) {
  const gras = (s) => String(s).split(/(\*\*[^*]+\*\*)/g).map((m, i) => (m.startsWith("**") && m.endsWith("**") ? <b key={i}>{m.slice(2, -2)}</b> : m));
  return String(texte || "").split(/\n{2,}/).map((bloc, i) => {
    const lignes = bloc.split("\n"), puces = lignes.filter((l) => /^\s*-\s+/.test(l)), intro = lignes.filter((l) => !/^\s*-\s+/.test(l));
    return (
      <div key={i} className="fo-bloc">
        {intro.length > 0 && <p>{intro.map((l, k) => <React.Fragment key={k}>{k > 0 && <br />}{gras(l)}</React.Fragment>)}</p>}
        {puces.length > 0 && <ul>{puces.map((l, k) => <li key={k}>{gras(l.replace(/^\s*-\s+/, ""))}</li>)}</ul>}
      </div>
    );
  });
}

function InscriptionFormation({ f, fermer }) {
  const { boutiques, go, toast } = useBoutique();
  const modes = boutiques[0]?.paiements?.transfert || [];
  const connu = lire(CLIENT_KEY, {});
  const [nom, setNom] = useState(connu.nom || "");
  const [tel, setTel] = useState(connu.telephone || "");
  const [op, setOp] = useState(modes[0]?.mode || "");
  const [ref, setRef] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const payante = f.prix > 0, mode = modes.find((m) => m.mode === op);
  const envoyer = async () => {
    setEnvoi(true); setErreur("");
    try {
      const r = await api("POST", `/api/boutique/formations/${f.id}/inscription`, { personne: { nom, telephone: tel }, paiement: payante ? { operateur: op, telephone: tel, reference: ref } : undefined });
      ecrire(FORMATIONS_KEY, [{ jeton: r.jeton, titre: r.titre }, ...lire(FORMATIONS_KEY, []).filter((x) => x.jeton !== r.jeton)].slice(0, 30));
      toast({ titre: payante ? "Inscription enregistrée" : "Formation ouverte", desc: payante ? "Votre accès s'ouvre dès que la boutique confirme votre paiement." : f.titre });
      go("formation", r.jeton);
    } catch (e) { setErreur(e.message); setEnvoi(false); }
  };
  return (
    <section className="fo-inscription">
      <div className="fo-inscription-tete"><div><span className="dx-sur">Inscription</span><h2>{f.titre}</h2></div><button className="v-icon" onClick={fermer} aria-label="Fermer"><X size={20} /></button></div>
      <div className="dx-form">
        <Field label="Nom complet" help="Il figurera sur votre certificat."><input className="input" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" placeholder="Prénom et nom" /></Field>
        <Field label="Téléphone (WhatsApp)"><input className="input" type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" placeholder="07 00 00 00 00" /></Field>
      </div>
      {payante && (modes.length === 0
        ? <div className="banner banner-warning" style={{ marginTop: 14 }}><AlertTriangle size={16} /><div>Le paiement de cette formation n'est pas encore disponible en ligne. Contactez la boutique.</div></div>
        : (
          <div className="fo-paiement">
            <h3>Paiement : {fmt(f.prix)}</h3>
            <div className="fo-ops">{modes.map((m) => <button type="button" key={m.mode} className={cx(op === m.mode && "choisi")} onClick={() => setOp(m.mode)}><LogoOperateur mode={m.mode} taille={24} />{m.mode}</button>)}</div>
            {mode && (
              <ol className="fo-etapes">
                <li>Envoyez <b>{fmt(f.prix)}</b> par {mode.mode}{mode.numero ? <> au <b className="num">{mode.numero}</b> ({mode.titulaire})</> : null}{mode.lien ? <> — <a className="link" href={mode.lien} target="_blank" rel="noopener">ouvrir le lien de paiement</a></> : null}.</li>
                <li>Copiez la référence de la transaction reçue par SMS.</li>
                <li>Collez-la ci-dessous : la boutique vérifie et ouvre votre accès.</li>
              </ol>
            )}
            <Field label="Référence de la transaction"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ex : MP240101.1234.A12345" /></Field>
          </div>
        ))}
      {erreur && <div className="banner banner-critical" style={{ marginTop: 14 }}><AlertTriangle size={16} /><div>{erreur}</div></div>}
      <div className="dx-nav">
        <Btn onClick={fermer}>Annuler</Btn>
        <Btn variant="brand" size="lg" iconRight={ArrowRight} loading={envoi} disabled={nom.trim().length < 3 || tel.replace(/\D/g, "").length < 8 || (payante && (!mode || ref.trim().length < 6))} onClick={envoyer}>{payante ? "J'ai payé, m'inscrire" : "Commencer gratuitement"}</Btn>
      </div>
    </section>
  );
}

function PageFormations() {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState("");
  const [choisie, setChoisie] = useState(null);
  const panneau = useRef(null);
  const miennes = lire(FORMATIONS_KEY, []);
  useEffect(() => { api("GET", "/api/boutique/formations").then(setListe).catch((e) => setErreur(e.message)); }, []);
  useEffect(() => { if (choisie) panneau.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [choisie]);
  return (
    <div className="v-section dx">
      <div className="dx-tete"><span className="dx-sur">Formations MILANA</span><h1>Apprenez à prendre soin de vos cheveux, <em>pas à pas</em>.</h1>
        <p className="fo-chapo">Des leçons courtes, une évaluation et un certificat. Suivez-les sur votre téléphone, à votre rythme.</p></div>

      {miennes.length > 0 && (
        <section className="dx-carte fo-miennes">
          <h3><ListChecks size={17} />Mes formations</h3>
          {miennes.map((m) => <a key={m.jeton} href={`#/formation/${m.jeton}`}><span>{m.titre}</span><ChevronRight size={16} /></a>)}
        </section>
      )}

      <div ref={panneau} style={{ scrollMarginTop: 90 }}>{choisie && <InscriptionFormation f={choisie} fermer={() => setChoisie(null)} key={choisie.id} />}</div>

      {erreur ? <div className="empty"><div className="empty-icon"><AlertTriangle size={26} /></div><h3>Formations indisponibles</h3><p>{erreur}</p></div>
        : !liste ? <div className="splash" style={{ minHeight: 200 }}><span className="spinner" /></div>
        : liste.length === 0 ? <div className="empty"><div className="empty-icon"><FileText size={26} /></div><h3>Aucune formation pour le moment</h3><p>Revenez bientôt.</p></div>
        : (
          <div className="fo-grille">
            {liste.map((f) => (
              <article key={f.id} className="fo-carte">
                <div className="fo-carte-img">{f.image ? <img src={urlImage(f.image)} alt="" loading="lazy" /> : <span><FileText size={34} /></span>}{f.categorie && <em>{f.categorie}</em>}</div>
                <div className="fo-carte-corps">
                  <h3>{f.titre}</h3>
                  <p>{f.description}</p>
                  <div className="fo-meta">
                    {f.lecons > 0 && <span><ListChecks size={14} />{f.lecons} leçon{f.lecons > 1 ? "s" : ""}</span>}
                    {f.duree && <span><Clock size={14} />{f.duree}</span>}
                    {f.support && <span><FileText size={14} />Fiche à lire</span>}
                    {f.certificat && <span><ShieldCheck size={14} />Certificat</span>}
                  </div>
                  <div className="fo-carte-bas"><b className="v-prix">{f.prix > 0 ? fmt(f.prix) : "Gratuite"}</b><Btn variant="primary" iconRight={ArrowRight} onClick={() => setChoisie(f)}>{f.prix > 0 ? "S'inscrire" : "Commencer"}</Btn></div>
                </div>
              </article>
            ))}
          </div>
        )}
    </div>
  );
}

function Evaluation({ jeton, infos, termine }) {
  const [q, setQ] = useState(null); // { questions, minuteur }
  const [rep, setRep] = useState({});
  const [reste, setReste] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const repRef = useRef({}); repRef.current = rep;
  const envoyer = useCallback(async () => {
    setEnvoi(true);
    try { termine(await api("POST", `/api/boutique/formations/acces/${jeton}/evaluation/reponses`, { reponses: repRef.current })); }
    catch (e) { setErreur(e.message); setEnvoi(false); }
  }, [jeton]);
  // Compte à rebours ; à zéro, les réponses déjà données sont envoyées
  useEffect(() => {
    if (!q) return;
    const fin = Date.now() + q.minuteur * 1000;
    const t = setInterval(() => { const r = Math.max(0, Math.round((fin - Date.now()) / 1000)); setReste(r); if (r === 0) { clearInterval(t); envoyer(); } }, 500);
    return () => clearInterval(t);
  }, [q]);
  const demarrer = async () => {
    setErreur("");
    try { const r = await api("POST", `/api/boutique/formations/acces/${jeton}/evaluation`); setRep({}); setReste(r.minuteur); setQ(r); }
    catch (e) { setErreur(e.message); }
  };
  if (!q) {
    return (
      <section className="dx-carte fo-eval">
        <h3><ShieldCheck size={17} />Évaluation</h3>
        <p>{infos.questions} questions · {Math.round(infos.minuteur / 60)} minute{infos.minuteur >= 120 ? "s" : ""} · {infos.score_reussite} % pour réussir · {infos.tentatives_restantes} tentative{infos.tentatives_restantes > 1 ? "s" : ""} restante{infos.tentatives_restantes > 1 ? "s" : ""}.</p>
        {infos.dernier_score != null && <p className="subtle">Dernier score : {infos.dernier_score} %. Relisez les leçons avant de réessayer.</p>}
        {erreur && <div className="banner banner-critical" style={{ margin: "10px 0" }}><AlertTriangle size={16} /><div>{erreur}</div></div>}
        <Btn variant="brand" size="lg" iconRight={ArrowRight} onClick={demarrer}>Démarrer l'évaluation</Btn>
        <p className="dx-note">Le minuteur démarre tout de suite et chaque démarrage compte pour une tentative.</p>
      </section>
    );
  }
  const repondues = q.questions.filter((x) => rep[x.id] != null).length;
  return (
    <section className="dx-carte fo-eval">
      <div className="fo-minuteur"><h3><ShieldCheck size={17} />Évaluation</h3><b className={cx("num", reste <= 30 && "presse")}><Clock size={15} />{Math.floor(reste / 60)}:{String(reste % 60).padStart(2, "0")}</b></div>
      {q.questions.map((x, n) => (
        <div key={x.id} className="fo-question">
          <b>{n + 1}. {x.question}</b>
          {x.options.map((o, k) => <button type="button" key={k} className={cx("dx-option", rep[x.id] === k && "choisi")} aria-pressed={rep[x.id] === k} onClick={() => setRep((s) => ({ ...s, [x.id]: k }))}>{o}{rep[x.id] === k && <Check size={16} className="dx-coche" />}</button>)}
        </div>
      ))}
      {erreur && <div className="banner banner-critical" style={{ margin: "10px 0" }}><AlertTriangle size={16} /><div>{erreur}</div></div>}
      <Btn variant="brand" size="lg" full loading={envoi} disabled={repondues < q.questions.length} onClick={envoyer}>{repondues < q.questions.length ? `${repondues} / ${q.questions.length} réponses` : "Valider mes réponses"}</Btn>
    </section>
  );
}

function PageFormation({ jeton }) {
  const [a, setA] = useState(null);
  const [erreur, setErreur] = useState("");
  const [n, setN] = useState(0);       // leçon affichée
  const [resultat, setResultat] = useState(null);
  const [busy, setBusy] = useState(false);
  const haut = useRef(null);
  const charger = useCallback(() => api("GET", `/api/boutique/formations/acces/${encodeURIComponent(jeton)}`).then((r) => { setA(r); return r; }), [jeton]);
  useEffect(() => { charger().then((r) => setN(Math.min(r.lecons_faites, Math.max(0, r.lecons.length - 1)))).catch((e) => setErreur(e.statut === 404 ? "Ce lien de formation est introuvable. Vérifiez-le ou contactez la boutique." : e.message)); }, [jeton]);
  // En attente de confirmation du paiement : on revérifie régulièrement
  useEffect(() => { if (a?.statut !== "a_verifier") return; const t = setInterval(() => charger().catch(() => {}), 20000); return () => clearInterval(t); }, [a?.statut]);

  if (erreur) return <div className="v-section"><div className="empty"><div className="empty-icon"><AlertTriangle size={26} /></div><h3>Formation indisponible</h3><p>{erreur}</p><a className="btn btn-primary" href="#/formations">Voir les formations</a></div></div>;
  if (!a) return <div className="splash" style={{ minHeight: 300 }}><span className="spinner" /></div>;
  const f = a.formation, lecon = a.lecons[n], toutesFaites = a.lecons_faites >= a.lecons.length;
  const avancement = a.lecons.length ? Math.round((a.lecons_faites / a.lecons.length) * 100) : 100;
  const terminer = async () => {
    setBusy(true);
    try { const r = await api("POST", `/api/boutique/formations/acces/${jeton}/lecon`, { position: n }); setA(r); if (n + 1 < r.lecons.length) setN(n + 1); haut.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    catch (e) { setErreur(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="v-section dx" ref={haut} style={{ scrollMarginTop: 80 }}>
      <a className="v-retour" href="#/formations"><ArrowLeft size={16} />Toutes les formations</a>
      <div className="dx-tete"><span className="dx-sur">Formation{f.categorie ? " · " + f.categorie : ""}</span><h1>{f.titre}</h1><p className="fo-chapo">{a.nom}</p></div>

      {a.statut === "a_verifier" && <div className="banner banner-info"><Clock size={16} /><div><b>Paiement en cours de vérification.</b> Vous avez déclaré {fmt(a.montant)} par {a.operateur} (réf. {a.reference_paiement}). Votre accès s'ouvre dès que la boutique le confirme ; gardez cette page, elle se met à jour toute seule.</div></div>}
      {a.statut === "refusee" && <div className="banner banner-critical"><XCircle size={16} /><div><b>Paiement non retrouvé.</b> La boutique n'a pas reçu le transfert déclaré (réf. {a.reference_paiement}). Contactez-la ou inscrivez-vous à nouveau avec la bonne référence.</div></div>}

      {a.acces && (
        <>
          <div className="fo-progres"><div className="dx-progres"><i style={{ width: avancement + "%" }} /></div><span>{a.lecons_faites} / {a.lecons.length} leçon{a.lecons.length > 1 ? "s" : ""}</span></div>

          {a.certificat && (
            <section className="dx-carte fo-reussite"><ShieldCheck size={30} /><div><h3>Formation réussie{a.evaluation?.meilleur_score != null ? ` — ${a.evaluation.meilleur_score} %` : ""}</h3><p>Votre certificat est prêt.</p></div><a className="btn btn-brand btn-lg" href={`#/certificat/${a.certificat}`}><span>Voir mon certificat</span></a></section>
          )}
          {resultat && !resultat.reussi && <div className="banner banner-warning"><AlertTriangle size={16} /><div><b>{resultat.hors_delai ? "Temps dépassé." : `Score : ${resultat.score} % (${resultat.bonnes} / ${resultat.total}).`}</b> Il faut {resultat.score_reussite} % pour réussir. {a.evaluation.tentatives_restantes > 0 ? "Relisez les leçons puis réessayez." : "Vous avez utilisé toutes vos tentatives : contactez la boutique."}</div></div>}

          <div className="fo-lecteur">
            <nav className="dx-carte fo-sommaire">
              {a.lecons.map((l, k) => (
                <button type="button" key={k} className={cx(k === n && "actif")} disabled={!l.ouverte} onClick={() => setN(k)}>
                  <span className={cx("fo-pastille", l.faite && "faite")}>{l.faite ? <Check size={13} /> : k + 1}</span>{l.titre}
                </button>
              ))}
              {a.support && (a.support.fichier || a.support.lien) && (
                <div className="fo-supports">
                  {a.support.fichier && <a className="link" href={`${API}/api/boutique/formations/acces/${jeton}/support`} target="_blank" rel="noopener"><FileText size={15} />Fiche à lire (PDF)</a>}
                  {a.support.lien && <a className="link" href={a.support.lien} target="_blank" rel="noopener"><ArrowRight size={15} />Support complémentaire</a>}
                </div>
              )}
            </nav>
            <div className="fo-contenu">
              {lecon ? (
                <section className="dx-carte">
                  <span className="dx-sur">Leçon {n + 1} / {a.lecons.length}</span>
                  <h2>{lecon.titre}</h2>
                  <TexteLecon texte={lecon.contenu} />
                  {lecon.video_url && <a className="btn btn-secondary" href={lecon.video_url} target="_blank" rel="noopener"><ArrowRight size={16} /><span>Voir la vidéo de la leçon</span></a>}
                  <div className="dx-nav">
                    <Btn icon={ArrowLeft} disabled={n === 0} onClick={() => setN(n - 1)}>Précédente</Btn>
                    {lecon.faite ? (n + 1 < a.lecons.length ? <Btn variant="primary" iconRight={ArrowRight} onClick={() => setN(n + 1)}>Suivante</Btn> : null)
                      : <Btn variant="brand" size="lg" iconRight={Check} loading={busy} onClick={terminer}>J'ai terminé cette leçon</Btn>}
                  </div>
                </section>
              ) : <section className="dx-carte"><p>Cette formation se compose d'une fiche à lire : ouvrez-la depuis le menu.</p></section>}
              {a.evaluation && toutesFaites && !a.reussi_le && (a.evaluation.disponible
                ? <Evaluation jeton={jeton} infos={a.evaluation} termine={(r) => { setResultat(r.resultat); setA(r.acces); haut.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} key={a.evaluation.tentatives} />
                : <section className="dx-carte"><h3><ShieldCheck size={17} />Évaluation</h3><p>Vous avez utilisé vos {a.evaluation.tentatives_max} tentatives. Contactez la boutique pour en obtenir de nouvelles.</p></section>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PageCertificat({ code }) {
  const [c, setC] = useState(null);
  const [erreur, setErreur] = useState("");
  useEffect(() => { api("GET", `/api/boutique/certificats/${encodeURIComponent(code)}`).then(setC).catch((e) => setErreur(e.statut === 404 ? "Aucun certificat ne porte ce code." : e.message)); }, [code]);
  if (erreur) return <div className="v-section"><div className="empty"><div className="empty-icon"><XCircle size={26} /></div><h3>Certificat introuvable</h3><p>{erreur}</p></div></div>;
  if (!c) return <div className="splash" style={{ minHeight: 300 }}><span className="spinner" /></div>;
  return (
    <div className="v-section dx">
      <div className="fo-certificat">
        <span className="dx-sur">{c.boutique}</span>
        <h1>Certificat de <em>réussite</em></h1>
        <p>décerné à</p>
        <strong>{c.nom}</strong>
        <p>pour avoir suivi et réussi la formation</p>
        <b>{c.formation}</b>
        <div className="fo-certificat-bas"><span>Le {new Date(c.obtenu_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>{c.score != null && <span>Score : {c.score} %</span>}<span className="num">{c.code}</span></div>
      </div>
      <div className="dx-actions fo-sans-impression"><Btn variant="brand" size="lg" icon={Printer} onClick={() => window.print()}>Imprimer ou enregistrer en PDF</Btn><a className="btn btn-secondary btn-lg" href="#/formations"><span>Voir les formations</span></a></div>
      <p className="dx-note fo-sans-impression"><ShieldCheck size={13} /> Certificat authentique : ce code est enregistré chez {c.boutique}. Toute personne peut le vérifier à cette adresse.</p>
    </div>
  );
}

/* Accueil : le rituel MILANA en trois étapes, puis une galerie */
function SectionsMilana() {
  const etapes = [
    ["01", "Votre diagnostic", "Quelques questions sur vos cheveux, votre cuir chevelu et vos habitudes. Gratuit, en 3 minutes.", "#/diagnostic", "Commencer"],
    ["02", "Votre routine", `Les soins MILANA Care choisis pour vous, leur mode d'emploi, et −${REMISE_DIAG} % sur votre routine.`, "#/diagnostic", "Voir ma routine"],
    ["03", "Votre savoir-faire", "Des formations courtes pour adopter les bons gestes, avec un certificat à la clé.", "#/formations", "Voir les formations"],
  ];
  return (
    <>
      <section className="v-section mi-rituel">
        <div className="mi-titre"><span className="dx-sur">Le rituel MILANA</span><h2>Trois étapes vers des cheveux <em>en pleine santé</em></h2></div>
        <div className="mi-etapes">
          {etapes.map(([n, titre, texte, lien, action]) => (
            <a key={n} href={lien} className="mi-etape"><i>{n}</i><h3>{titre}</h3><p>{texte}</p><span>{action}<ArrowRight size={15} /></span></a>
          ))}
        </div>
      </section>
      <section className="mi-galerie" aria-hidden="true">
        {[1, 3, 4, 6].map((n) => <div key={n}><img src={`/images/modeles/model-${n}.jpg`} alt="" loading="lazy" /></div>)}
      </section>
    </>
  );
}

function PageAccueil({ slug }) {
  const { config, boutiques, recherche, setRecherche, ...reste } = useBoutique();
  // Page d'une boutique : uniquement ses produits ; accueil : ceux de tous les administrateurs
  const produits = slug ? reste.produits.filter((p) => p.boutique_slug === slug) : reste.produits;
  const avecProduits = boutiques.filter((x) => reste.produits.some((p) => p.boutique_id === x.id));
  const [tri, setTri] = useState("nouveautes");
  const [dispo, setDispo] = useState(false);
  const [cat, setCat] = useState("");
  useEffect(() => setCat(""), [slug]);
  const catalogueRef = useRef(null);
  const liste = useMemo(() => {
    let l = produits.filter((p) => (!dispo || p.disponible) && (!cat || p.categorie === cat) && norm(p.nom + " " + p.description + " " + (p.categorie || "")).includes(norm(recherche)));
    if (tri === "prix-asc") l = [...l].sort((a, b) => a.prix - b.prix);
    if (tri === "prix-desc") l = [...l].sort((a, b) => b.prix - a.prix);
    if (tri === "populaires") l = [...l].sort((a, b) => b.ventes - a.ventes);
    // Les produits épuisés passent en fin de liste
    return [...l.filter((p) => p.disponible), ...l.filter((p) => !p.disponible)];
  }, [produits, recherche, tri, dispo, cat]);
  const categories = [...new Set(produits.map((p) => p.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const b = config.boutique;
  const promos = produits.filter((p) => p.remise > 0 && p.disponible);

  if (slug && config.plateforme) {
    return <div className="v-section"><div className="empty"><div className="empty-icon"><Store size={26} /></div><h3>Boutique introuvable</h3><p>Cette adresse ne correspond à aucune boutique.</p><a className="btn btn-primary" href="#/">Voir toutes les boutiques</a></div></div>;
  }

  return (
    <>
      {!recherche && (
        <section className="v-hero">
          <div className={cx("v-hero-in", !slug && "mi-hero")}>
            {!slug && (
              <div className="mi-visuel" aria-hidden="true">
                <img className="mi-portrait" src="/images/modeles/model-2.jpg" alt="" />
                <img className="mi-gamme" src="/images/gamme.png" alt="" />
                <span className="mi-pastille"><b>−{REMISE_DIAG} %</b>sur votre routine</span>
              </div>
            )}
            {slug ? <a className="v-retour" href="#/"><ArrowLeft size={16} />Toutes les boutiques</a> : null}
            <span className="v-hero-tag">{slug ? <><Store size={14} />Boutique</> : <><Sparkles size={14} />Soins capillaires naturels</>}</span>
            <h1>{slug ? b.nom : <>Votre routine capillaire, <em>sur mesure</em>.</>}</h1>
            <p>{slug
              ? <>{b.slogan ? b.slogan + ". " : ""}{config.livraison.zone ? `Livraison ${config.livraison.zone}. ` : ""}Payez à la livraison ou par Mobile Money{config.paiements.en_ligne ? ", en toute sécurité" : ""}.</>
              : <>Répondez à quelques questions : MILANA analyse vos cheveux, vous remet un bilan complet et compose votre routine de soins, avec {REMISE_DIAG} % de remise sur les produits recommandés.</>}</p>
            <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
              <a className="btn btn-brand btn-lg" href="#/diagnostic"><Sparkles size={16} /><span>Faire mon diagnostic gratuit</span></a>
              <Btn size="lg" iconRight={ArrowRight} onClick={() => catalogueRef.current?.scrollIntoView({ behavior: "smooth" })}>Voir les produits</Btn>
              {!slug && <a className="btn btn-secondary btn-lg" href="#/formations"><FileText size={16} /><span>Formations</span></a>}
              {b.whatsapp && <a className="btn btn-secondary btn-lg" href={`https://wa.me/${telInternational(b.whatsapp)}`} target="_blank" rel="noopener"><MessageSquare size={16} /><span>Nous écrire</span></a>}
            </div>
          </div>
          <div className="v-garanties">
            <div><Truck size={20} /><span><b>Livraison</b>{slug ? <>{config.livraison.frais ? ` ${fmt(config.livraison.frais)}` : " offerte"}{config.livraison.gratuite_des > 0 ? `, offerte dès ${fmt(config.livraison.gratuite_des)}` : ""}</> : " à domicile, selon la boutique"}</span></div>
            <div><Smartphone size={20} /><span><b>Mobile Money</b> Orange, MTN, Moov, Wave</span></div>
            <div><Banknote size={20} /><span><b>Paiement à la livraison</b> en espèces</span></div>
            <div><Receipt size={20} /><span><b>Ticket de caisse</b> téléchargeable</span></div>
          </div>
        </section>
      )}

      {!slug && !recherche && <SectionsMilana />}

      {!slug && !recherche && avecProduits.length > 1 && (
        <section className="v-section v-boutiques">
          <div className="v-section-tete"><h2>Nos boutiques</h2></div>
          <div className="v-boutiques-liste">
            {avecProduits.map((x) => (
              <a key={x.id} href={`#/boutique/${x.slug}`} className="v-boutique-carte">
                <span className="v-boutique-logo">{x.boutique.nom.trim().slice(0, 1).toUpperCase()}</span>
                <span className="grow"><b className="truncate">{x.boutique.nom}</b><small>{reste.produits.filter((p) => p.boutique_id === x.id).length} produit(s){x.ouverte ? "" : " · fermée"}</small></span>
                <ChevronRight size={16} />
              </a>
            ))}
          </div>
        </section>
      )}

      {!recherche && promos.length > 0 && (
        <section className="v-section v-promos">
          <div className="v-section-tete"><h2><Tag size={20} /> Promotions en cours</h2></div>
          <div className="v-grille">{promos.map((p, i) => <CarteProduit key={p.id} p={p} i={i} />)}</div>
        </section>
      )}

      <section className="v-section" ref={catalogueRef}>
        <div className="v-section-tete">
          <h2>{recherche ? `Résultats pour « ${recherche} »` : slug ? `Les produits de ${b.nom}` : "Tous les produits"}</h2>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="checkbox"><input type="checkbox" checked={dispo} onChange={(e) => setDispo(e.target.checked)} /><span className="checkbox-box"><Check size={12} strokeWidth={3} /></span><span>En stock uniquement</span></label>
            <div className="select-wrap">
              <select className="select" value={tri} onChange={(e) => setTri(e.target.value)} aria-label="Trier">
                <option value="nouveautes">Nouveautés</option>
                <option value="populaires">Meilleures ventes</option>
                <option value="prix-asc">Prix croissant</option>
                <option value="prix-desc">Prix décroissant</option>
              </select>
            </div>
          </div>
        </div>
        {categories.length > 1 && (
          <div className="v-categories">
            <button className={cx("chip", !cat && "on")} onClick={() => setCat("")}>Tout</button>
            {categories.map((k) => <button key={k} className={cx("chip", cat === k && "on")} onClick={() => setCat(k)}>{k}</button>)}
          </div>
        )}
        {liste.length === 0 ? (
          <div className="empty"><div className="empty-icon"><Search size={26} /></div><h3>Aucun produit trouvé</h3><p>{recherche ? "Essayez un autre mot." : slug ? "Cette boutique n'a pas encore publié de produit." : "Aucun produit n'est encore en vente. Vous vendez ? Créez votre espace et publiez vos produits."}</p>{recherche ? <Btn onClick={() => setRecherche("")}>Voir tous les produits</Btn> : !slug && <a className="btn btn-primary" href="/admin/?creer=1">Créer mon espace</a>}</div>
        ) : (
          <div className="v-grille">{liste.map((p, i) => <CarteProduit key={p.id} p={p} i={i} />)}</div>
        )}
      </section>
    </>
  );
}

/* =====================================================================
   Fiche produit
   ===================================================================== */
function PageProduit({ id }) {
  const { produits, ajouter, quantiteDans, go, ouvrirPanier, config } = useBoutique();
  const p = produits.find((x) => x.id === id);
  const [qte, setQte] = useState(1);
  if (!p) return <div className="v-section"><div className="empty"><div className="empty-icon"><Package size={26} /></div><h3>Produit introuvable</h3><p>Il a peut-être été retiré du catalogue.</p><Btn variant="primary" onClick={() => go("")}>Retour à la boutique</Btn></div></div>;
  const dejaPris = quantiteDans(p.id);
  const restant = Math.max(0, p.stock - dejaPris);
  const autres = produits.filter((x) => x.id !== p.id && x.disponible).slice(0, 4);
  return (
    <div className="v-section">
      <button className="v-retour" onClick={() => history.length > 1 ? history.back() : go("")}><ArrowLeft size={16} />Retour</button>
      <div className="v-fiche">
        <div className="v-fiche-media"><ImageProduit p={p} /></div>
        <div className="v-fiche-infos">
          <a href={`#/boutique/${p.boutique_slug}`} className="v-carte-boutique"><Store size={13} />Vendu par {p.boutique_nom}</a>
          <h1>{p.nom}</h1>
          <div className="v-fiche-prix">{fmt(p.prix)}{p.remise > 0 && <><s className="v-prix-barre">{fmt(p.prix_normal)}</s><span className="v-remise">−{p.remise} %</span></>}</div>
          {p.remise > 0 && p.promo_fin && <div className="subtle">Offre valable jusqu'au {new Date(p.promo_fin).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</div>}
          {p.disponible ? (
            <Badge tone={p.stock <= 5 ? "warning" : "success"} dot>{p.stock <= 5 ? `Plus que ${p.stock} en stock` : "En stock"}</Badge>
          ) : <Badge tone="critical" dot>Épuisé</Badge>}
          {p.description && <p className="v-fiche-desc">{p.description}</p>}
          {p.contenu?.length > 0 && (
            <div className="v-contenu">
              <div className="v-contenu-titre">Ce pack contient</div>
              <ul>{p.contenu.map((x, k) => <li key={k}><Check size={15} />{x}</li>)}</ul>
            </div>
          )}
          {p.disponible && config.ouverte && (
            <div className="stack-sm" style={{ marginTop: 8 }}>
              <div className="row" style={{ gap: 12 }}>
                <Stepper value={Math.min(qte, Math.max(1, restant))} onChange={setQte} max={Math.max(1, restant)} />
                {dejaPris > 0 && <span className="subtle">{dejaPris} déjà dans votre panier</span>}
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <Btn variant="primary" size="lg" icon={ShoppingCart} disabled={restant <= 0} onClick={() => { ajouter(p, Math.min(qte, restant)); setQte(1); }}>Ajouter au panier</Btn>
                <Btn variant="brand" size="lg" disabled={restant <= 0 && dejaPris === 0} onClick={() => { if (restant > 0) ajouter(p, Math.min(qte, restant), true); go("commander"); }}>Acheter maintenant</Btn>
              </div>
            </div>
          )}
          <ul className="v-rassurance">
            <li><Truck size={16} />Livraison {config.livraison.zone || "à domicile"}{config.livraison.frais ? ` · ${fmt(config.livraison.frais)}` : ""}</li>
            <li><Banknote size={16} />Paiement à la livraison possible</li>
            <li><Smartphone size={16} />Orange Money, MTN MoMo, Moov Money, Wave</li>
            <li><Receipt size={16} />Ticket de caisse téléchargeable après l'achat</li>
          </ul>
        </div>
      </div>
      {autres.length > 0 && (
        <>
          <h2 className="v-sous-titre">Vous aimerez aussi</h2>
          <div className="v-grille">{autres.map((x, i) => <CarteProduit key={x.id} p={x} i={i} />)}</div>
        </>
      )}
    </div>
  );
}

/* =====================================================================
   Panier (tiroir latéral)
   ===================================================================== */
function calculTotaux(lignes, config) {
  const sousTotal = lignes.reduce((s, l) => s + l.p.prix * l.quantite, 0);
  const l = config.livraison;
  const frais = lignes.length === 0 ? 0 : l.gratuite_des > 0 && sousTotal >= l.gratuite_des ? 0 : l.frais;
  return { sousTotal, frais, total: sousTotal + frais, manquePourGratuite: l.gratuite_des > 0 && l.frais > 0 ? Math.max(0, l.gratuite_des - sousTotal) : 0 };
}

function TiroirPanier() {
  const { panierOuvert, fermerPanier, lignes, changerQuantite, retirer, configPanier: config, go } = useBoutique();
  const [monte, setMonte] = useState(panierOuvert);
  const [ferme, setFerme] = useState(false);
  useEffect(() => {
    if (panierOuvert) { setMonte(true); setFerme(false); return; }
    if (!monte) return;
    setFerme(true);
    const t = setTimeout(() => { setMonte(false); setFerme(false); }, 220);
    return () => clearTimeout(t);
  }, [panierOuvert]);
  useEffect(() => {
    if (!panierOuvert) return;
    const h = (e) => e.key === "Escape" && fermerPanier();
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [panierOuvert]);
  if (!monte) return null;
  const t = calculTotaux(lignes, config);
  return createPortal(
    <div className={cx("overlay v-tiroir-overlay", ferme && "closing")}>
      <div className="backdrop" onMouseDown={fermerPanier} />
      <aside className="v-tiroir" role="dialog" aria-label="Panier">
        <div className="modal-head"><h2>Votre panier{lignes.length ? <small className="v-panier-boutique"> · {config.boutique.nom}</small> : null}</h2><button className="icon-btn" onClick={fermerPanier} aria-label="Fermer"><X size={18} /></button></div>
        {lignes.length === 0 ? (
          <div className="empty" style={{ flex: 1 }}>
            <div className="empty-icon"><ShoppingCart size={26} /></div>
            <h3>Votre panier est vide</h3>
            <p>Parcourez le catalogue et ajoutez vos articles.</p>
            <Btn variant="primary" onClick={() => { fermerPanier(); go(""); }}>Continuer mes achats</Btn>
          </div>
        ) : (
          <>
            <div className="v-tiroir-lignes">
              {t.manquePourGratuite > 0 && (
                <div className="v-gratuite">
                  <span>Plus que <b>{fmt(t.manquePourGratuite)}</b> pour la livraison offerte</span>
                  <div className="progress"><span style={{ width: `${Math.min(100, (t.sousTotal / config.livraison.gratuite_des) * 100)}%` }} /></div>
                </div>
              )}
              {lignes.map(({ p, quantite }) => (
                <div key={p.id} className="v-ligne">
                  <a href={`#/produit/${encodeURIComponent(p.id)}`} onClick={fermerPanier}><ImageProduit p={p} className="mini" /></a>
                  <div className="grow">
                    <div className="strong">{p.nom}</div>
                    <div className="subtle num">{fmt(p.prix)}</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <Stepper value={quantite} onChange={(q) => changerQuantite(p.id, q)} max={Math.max(1, p.stock)} />
                      <button className="icon-btn danger" onClick={() => retirer(p.id)} aria-label="Retirer"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="num strong">{fmt(p.prix * quantite)}</div>
                </div>
              ))}
            </div>
            <div className="v-tiroir-pied">
              <div className="summary-line"><span>Sous-total</span><span className="num">{fmt(t.sousTotal)}</span></div>
              <div className="summary-line"><span>Livraison</span><span className="num">{t.frais ? fmt(t.frais) : "Offerte"}</span></div>
              <div className="summary-total"><span className="strong">Total</span><strong>{fmt(t.total)}</strong></div>
              <Btn variant="brand" size="lg" full iconRight={ArrowRight} disabled={!config.ouverte} onClick={() => { fermerPanier(); go("commander"); }}>
                {config.ouverte ? "Passer la commande" : "Commandes fermées"}
              </Btn>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}

/* =====================================================================
   Commande : coordonnées, livraison, paiement
   ===================================================================== */
function PageCommander() {
  const { lignes, configPanier: configBoutique, go, viderPanier, recharger, toast, synchroniserPanier } = useBoutique();
  // Client venu par le lien d'un vendeur qui a ses propres moyens de paiement : ce sont eux qui sont proposés
  const refVendeur = configBoutique?.id ? lire(REF_KEY, {})[configBoutique.id] : null;
  const [transfertVendeur, setTransfertVendeur] = useState(null);
  useEffect(() => {
    if (!refVendeur || !configBoutique?.id) return;
    api("GET", `/api/boutique/paiements-vendeur?boutique=${encodeURIComponent(configBoutique.id)}&vendeur=${encodeURIComponent(refVendeur)}`)
      .then((r) => { if (r.transfert?.length) { setTransfertVendeur(r.transfert); setOp((o) => (r.transfert.some((x) => x.mode === o) ? o : r.transfert[0].mode)); } })
      .catch(() => {});
  }, [configBoutique?.id, refVendeur]);
  const config = transfertVendeur ? { ...configBoutique, paiements: { ...configBoutique.paiements, transfert: transfertVendeur } } : configBoutique;
  const memo = lire(CLIENT_KEY, {});
  const [c, setC] = useState({ nom: memo.nom || "", telephone: memo.telephone || "", email: memo.email || "", adresse: memo.adresse || "", ville: memo.ville || "", instructions: "" });
  const modes = [
    { cle: "livraison", titre: "Paiement à la livraison", desc: "Payez en espèces ou par Mobile Money au livreur.", icone: Banknote },
    ...(config.paiements.transfert.length ? [{ cle: "transfert", titre: "Transfert Mobile Money", desc: "Payez par le lien ou sur le numéro de la boutique, puis indiquez la référence.", icone: Smartphone }] : []),
    ...(config.paiements.en_ligne ? [{ cle: "en_ligne", titre: "Orange Money / MTN MoMo — portail sécurisé", desc: "Entrez votre numéro, puis confirmez avec votre code secret sur votre téléphone.", icone: ShieldCheck }] : []),
  ];
  const [mode, setMode] = useState(modes[0].cle);
  const [op, setOp] = useState(config.paiements.transfert[0]?.mode || "");
  const [tr, setTr] = useState({ telephone: memo.telephone || "", reference: "" });
  const [err, setErr] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState("");
  const [consentement, setConsentement] = useState(!!memo.consentement);
  const [apercu, setApercu] = useState(false);
  const t = calculTotaux(lignes, config);
  const set = (k, v) => { setC((x) => ({ ...x, [k]: v })); setErr((e) => ({ ...e, [k]: null })); };
  const operateur = config.paiements.transfert.find((o) => o.mode === op);
  const [portail, setPortail] = useState(false);

  if (lignes.length === 0) {
    return <div className="v-section"><div className="empty"><div className="empty-icon"><ShoppingCart size={26} /></div><h3>Votre panier est vide</h3><Btn variant="primary" onClick={() => go("")}>Voir les produits</Btn></div></div>;
  }

  const valider = async (e) => {
    e.preventDefault();
    const x = {};
    if (c.nom.trim().length < 2) x.nom = "Indiquez votre nom complet.";
    if (c.telephone.replace(/\D/g, "").length < 8) x.telephone = "Numéro de téléphone invalide.";
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) x.email = "Adresse e-mail invalide.";
    if (mode === "en_ligne" && !c.email) x.email = "Obligatoire pour le paiement en ligne.";
    if (c.adresse.trim().length < 3) x.adresse = "Indiquez le quartier, la rue ou un repère.";
    if (mode === "transfert") {
      if (tr.telephone.replace(/\D/g, "").length < 8) x.trTel = `Numéro ${op} qui a envoyé l'argent.`;
      if (tr.reference.trim().length < 4) x.trRef = "ID de transaction reçu par SMS.";
    }
    setErr(x);
    if (Object.keys(x).length) { document.querySelector(".has-error")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    // Étape intermédiaire : récapitulatif sous forme de ticket provisoire
    setApercu(true);
  };

  const ticketProvisoire = () => ({
    provisoire: true, boutique: config.boutique, numero: null, date: new Date().toISOString(), statut: "en_attente", client: c.nom.trim(), canal: "en_ligne",
    contact: c.telephone.trim(), adresse_livraison: [c.adresse.trim(), c.ville.trim()].filter(Boolean).join(", "),
    lignes: lignes.map(({ p, quantite }) => ({ nom: p.nom, quantite, prix_unitaire: p.prix, prix_normal: p.remise > 0 ? p.prix_normal : null, total: p.prix * quantite, pieces_par_lot: p.pieces_par_lot || 1, articles: quantite * (p.pieces_par_lot || 1) })),
    sous_total: t.sousTotal, frais_livraison: t.frais, total: t.total,
    paiement: { mode: mode === "transfert" ? op : mode === "en_ligne" ? "Paiement en ligne" : "À la livraison", statut: mode === "livraison" ? "en_attente" : mode === "transfert" ? "a_verifier" : "en_cours", reference: mode === "transfert" ? tr.reference : null },
    lien: null,
  });

  const confirmer = async () => {
    setEnvoi(true); setErreurGlobale("");
    const refDiagnostic = lire(DIAG_KEY, null)?.reference;
    ecrire(CLIENT_KEY, { nom: c.nom, telephone: c.telephone, email: c.email, adresse: c.adresse, ville: c.ville, consentement });
    try {
      const r = await api("POST", "/api/boutique/commandes", {
        boutique: config.id,
        // Commande arrivée par le lien de promotion d'un vendeur de cette boutique
        vendeur: lire(REF_KEY, {})[config.id] || undefined,
        client: { ...c, consentement },
        diagnostic: refDiagnostic || undefined,
        lignes: lignes.map((l) => ({ pack_id: l.p.pid, quantite: l.quantite })),
        paiement: mode === "transfert" ? { mode, operateur: op, telephone: tr.telephone, reference: tr.reference } : { mode },
      });
      ecrire(COMMANDES_KEY, [{ jeton: r.jeton, numero: r.numero, date: new Date().toISOString() }, ...lire(COMMANDES_KEY, []).filter((o) => o.jeton !== r.jeton)].slice(0, 30));
      viderPanier();
      recharger();
      if (r.redirection) { location.href = r.redirection; return; }
      sessionStorage.setItem("boutique-nouvelle", r.jeton);
      go("commande", r.jeton);
    } catch (e2) {
      setEnvoi(false);
      setApercu(false);
      if (e2.details?.indisponibles) {
        await recharger();
        synchroniserPanier(e2.details.indisponibles);
        toast({ titre: "Panier mis à jour", desc: e2.message, ton: "critical" });
      }
      setErreurGlobale(e2.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <form className="v-section v-checkout" onSubmit={valider} noValidate>
      <div className="v-checkout-form">
        <button type="button" className="v-retour" onClick={() => go("")}><ArrowLeft size={16} />Continuer mes achats</button>
        <h1 className="v-titre">Finaliser la commande</h1>
        <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}><Store size={14} style={{ verticalAlign: -2 }} /> Commande passée auprès de <b>{config.boutique.nom}</b></p>
        {erreurGlobale && <div className="banner banner-critical"><AlertCircle size={16} /><div>{erreurGlobale}</div></div>}

        <section className="card v-etape">
          <h2><span className="n">1</span>Vos coordonnées</h2>
          <div className="form-grid">
            <Field label="Nom complet" error={err.nom} className="full"><Input icon={User} value={c.nom} onChange={(e) => set("nom", e.target.value)} autoComplete="name" placeholder="Ex : Aïcha Koné" /></Field>
            <Field label="Téléphone" error={err.telephone} help="Le livreur vous appellera sur ce numéro."><Input icon={Phone} value={c.telephone} onChange={(e) => set("telephone", e.target.value)} inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" /></Field>
            <Field label="E-mail" optional={mode !== "en_ligne"} error={err.email} help="Pour recevoir votre ticket de caisse par e-mail."><Input icon={Mail} value={c.email} onChange={(e) => set("email", e.target.value)} inputMode="email" autoComplete="email" placeholder="vous@exemple.com" /></Field>
          </div>
          <label className="checkbox v-consentement">
            <input type="checkbox" checked={consentement} onChange={(e) => setConsentement(e.target.checked)} />
            <span className="checkbox-box"><Check size={12} strokeWidth={3} /></span>
            <span>J'accepte de recevoir les promotions et nouveautés de {config.boutique.nom} par SMS{c.email ? " et e-mail" : ""}. <span className="subtle">Désinscription possible à tout moment via le lien STOP.</span></span>
          </label>
        </section>

        <section className="card v-etape">
          <h2><span className="n">2</span>Livraison</h2>
          <div className="form-grid">
            <Field label="Adresse de livraison" error={err.adresse} className="full" help="Quartier, rue, point de repère."><Input icon={MapPin} value={c.adresse} onChange={(e) => set("adresse", e.target.value)} autoComplete="street-address" placeholder="Ex : Angré 8e tranche, près de la pharmacie" /></Field>
            <Field label="Ville / commune" optional><Input value={c.ville} onChange={(e) => set("ville", e.target.value)} autoComplete="address-level2" placeholder="Ex : Cocody, Abidjan" /></Field>
            <Field label="Instructions" optional><Input value={c.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Ex : appeler avant de passer" /></Field>
          </div>
          {config.livraison.zone && <p className="subtle" style={{ marginTop: 10 }}><Truck size={13} style={{ verticalAlign: -2 }} /> {config.livraison.zone}</p>}
        </section>

        <section className="card v-etape">
          <h2><span className="n">3</span>Paiement</h2>
          <div className="v-modes">
            {modes.map((m) => (
              <label key={m.cle} className={cx("v-mode", mode === m.cle && "actif")}>
                <input type="radio" name="mode" checked={mode === m.cle} onChange={() => setMode(m.cle)} />
                <span className="v-mode-radio" />
                <m.icone size={20} />
                <span className="grow"><b>{m.titre}</b><small>{m.desc}</small></span>
              </label>
            ))}
          </div>

          {mode === "transfert" && operateur && (
            <div className="pay-detail" style={{ marginTop: 12 }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {config.paiements.transfert.map((o) => (
                  <button type="button" key={o.mode} className={cx("pay-opt v-op", op === o.mode && "selected")} onClick={() => setOp(o.mode)}><LogoOperateur mode={o.mode} taille={24} /><span>{o.mode}</span></button>
                ))}
              </div>
              {portail && operateur.lien && <PortailPaiement operateur={operateur} montant={t.total} boutique={config.boutique.nom} onFermer={() => setPortail(false)} onPaye={() => { setPortail(false); setTimeout(() => document.getElementById("id-transaction")?.focus(), 100); }} />}
              {config.paiements.en_ligne && ["Orange Money", "MTN MoMo"].includes(operateur.mode) && (
                <div className="banner banner-info" style={{ margin: "12px 0" }}><ShieldCheck size={16} /><div><b>Plus simple : le portail de paiement sécurisé.</b> Vous y entrez votre numéro {operateur.mode}, puis vous confirmez avec votre code secret sur votre téléphone. Votre commande est validée automatiquement.<br /><button type="button" className="link" onClick={() => setMode("en_ligne")}>Payer par le portail sécurisé →</button></div></div>
              )}
              <ol className="v-instructions">
                <li>
                  {operateur.lien && <><button type="button" className="btn btn-primary v-lien-paiement" onClick={() => setPortail(true)}><LogoOperateur mode={operateur.mode} taille={20} /><span>Payer {fmt(t.total)} avec {operateur.mode}</span></button><br /></>}
                  {operateur.numero && <>{operateur.lien ? "ou envoyez" : "Envoyez"} <b className="num">{fmt(t.total)}</b> par <b>{operateur.mode}</b> au <b className="num">{operateur.numero}</b> <button type="button" className="link" onClick={() => navigator.clipboard?.writeText(operateur.numero.replace(/\s/g, "")).then(() => toast({ titre: "Numéro copié" }))}><Copy size={12} /> copier</button><br /></>}
                  <span className="subtle">{operateur.lien && !operateur.numero ? `Un QR code ${operateur.mode} s'affiche : scannez-le pour payer · ` : ""}Titulaire : {operateur.titulaire}</span>
                </li>
                <li>Notez l'<b>ID de transaction</b> indiqué dans le SMS de confirmation.</li>
                <li>Renseignez-le ci-dessous : nous vérifions la réception puis confirmons votre commande.</li>
              </ol>
              <div className="form-grid">
                <Field label={`Numéro ${operateur.mode} utilisé`} error={err.trTel}><Input icon={Phone} value={tr.telephone} onChange={(e) => { setTr((x) => ({ ...x, telephone: e.target.value })); setErr((z) => ({ ...z, trTel: null })); }} inputMode="tel" placeholder="07 00 00 00 00" /></Field>
                <Field label="ID de transaction" error={err.trRef}><Input id="id-transaction" value={tr.reference} onChange={(e) => { setTr((x) => ({ ...x, reference: e.target.value })); setErr((z) => ({ ...z, trRef: null })); }} placeholder="Ex : MP240929.1234.A5678" /></Field>
              </div>
            </div>
          )}
          {mode === "en_ligne" && (
            <div className="banner banner-info" style={{ marginTop: 12 }}><ShieldCheck size={16} /><div>Vous serez redirigé vers le portail de paiement sécurisé CinetPay : vous y entrez votre numéro et le montant est repris automatiquement. Vous recevez ensuite une notification sur votre téléphone pour confirmer avec votre code secret ; votre compte n'est débité qu'après cette confirmation. Le code secret n'est jamais saisi sur ce site.{config.paiements.en_ligne_test && <><br /><b>Mode test : aucun débit réel.</b></>}</div></div>
          )}
          {mode === "livraison" && (
            <div className="banner banner-success" style={{ marginTop: 12 }}><Banknote size={16} /><div>Vous paierez <b className="num">{fmt(t.total)}</b> à la réception de votre commande.</div></div>
          )}
        </section>
      </div>

      <aside className="v-recap card">
        <h2 className="card-title">Récapitulatif</h2>
        <div className="stack-sm" style={{ marginTop: 12 }}>
          {lignes.map(({ p, quantite }) => (
            <div key={p.id} className="row" style={{ gap: 10 }}>
              <span className="v-recap-img"><ImageProduit p={p} className="mini" /><span className="v-recap-q">{quantite}</span></span>
              <span className="grow truncate">{p.nom}</span>
              <span className="num">{fmt(p.prix * quantite)}</span>
            </div>
          ))}
        </div>
        <div className="stack-sm" style={{ marginTop: 14 }}>
          <div className="summary-line"><span>Sous-total</span><span className="num">{fmt(t.sousTotal)}</span></div>
          <div className="summary-line"><span>Livraison</span><span className="num">{t.frais ? fmt(t.frais) : "Offerte"}</span></div>
          <div className="summary-total"><span className="strong">Total</span><strong>{fmt(t.total)}</strong></div>
          <Btn type="submit" variant="brand" size="lg" full icon={FileText}>Vérifier ma commande</Btn>
          <p className="subtle" style={{ textAlign: "center" }}>Prix et disponibilités vérifiés à la validation.</p>
        </div>
      </aside>
      {apercu && createPortal(
        <div className="overlay">
          <div className="backdrop" onMouseDown={() => !envoi && setApercu(false)} />
          <div className="modal modal-md" role="dialog" aria-modal="true" aria-label="Récapitulatif de la commande">
            <div className="modal-head"><h2>Récapitulatif de votre commande</h2><button type="button" className="icon-btn" onClick={() => setApercu(false)} disabled={envoi} aria-label="Fermer"><X size={18} /></button></div>
            <div className="modal-body stack">
              <div className="banner banner-info"><FileText size={16} /><div>Vérifiez votre ticket avant de valider. Après validation, votre ticket définitif (PDF) sera disponible au téléchargement.</div></div>
              <TicketCaisse t={ticketProvisoire()} />
              <div className="stack-sm subtle"><div><MapPin size={13} style={{ verticalAlign: -2 }} /> Livraison : {c.adresse}{c.ville ? ", " + c.ville : ""}</div><div><Phone size={13} style={{ verticalAlign: -2 }} /> {c.telephone}{c.email ? " · " + c.email : ""}</div></div>
            </div>
            <div className="modal-foot">
              <Btn icon={ArrowLeft} onClick={() => setApercu(false)} disabled={envoi}>Modifier</Btn>
              <Btn variant="brand" loading={envoi} icon={mode === "en_ligne" ? CreditCard : CheckCircle2} onClick={confirmer}>{mode === "en_ligne" ? `Valider et payer ${fmt(t.total)}` : "Valider la commande"}</Btn>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </form>
  );
}

/* =====================================================================
   Portail de paiement d'un opérateur : QR code du lien de paiement de la boutique.
   Le paiement se fait dans l'application de l'opérateur : aucun code secret n'est saisi ici.
   ===================================================================== */
function PortailPaiement({ operateur, montant, boutique, onFermer, onPaye }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onFermer();
    addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, []);
  let domaine = "";
  try { domaine = new URL(operateur.lien).hostname; } catch { /* lien invalide : jamais proposé */ }
  return createPortal(
    <div className="portail-fond" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="portail" role="dialog" aria-modal="true" aria-label={`Paiement ${operateur.mode}`}>
        <button className="portail-fermer" onClick={onFermer} aria-label="Fermer"><X size={18} /></button>
        <div className="portail-tete"><LogoOperateur mode={operateur.mode} taille={40} /><div><b>Paiement {operateur.mode}</b><small>à {boutique}</small></div></div>
        <div className="portail-montant"><small>Montant à payer</small><strong className="num">{fmt(montant)}</strong></div>
        <div className="portail-qr"><QrCode texte={operateur.lien} taille={220} /></div>
        <ol className="portail-etapes">
          <li>Ouvrez l'application <b>{operateur.mode}</b> et <b>scannez ce QR code</b>.</li>
          <li>Entrez le montant : <b className="num">{fmt(montant)}</b>, puis validez.</li>
          <li>Revenez ici et indiquez l'<b>ID de transaction</b> reçu.</li>
        </ol>
        <a className="btn btn-secondary portail-ouvrir" href={operateur.lien} target="_blank" rel="noopener noreferrer"><Smartphone size={16} /><span>Je suis sur mon téléphone : ouvrir {operateur.mode}</span></a>
        <Btn variant="brand" full icon={CheckCircle2} onClick={onPaye}>J'ai payé, saisir l'ID de transaction</Btn>
        <p className="portail-securite"><ShieldCheck size={14} /><span>Avant de valider, vérifiez que le nom affiché sur votre téléphone est bien <b>{operateur.titulaire}</b>. Le paiement se fait dans l'application {operateur.mode}{domaine ? ` (${domaine})` : ""} ; ce site ne vous demande jamais votre code secret.</span></p>
      </div>
    </div>,
    document.body,
  );
}

/* =====================================================================
   Suivi de commande + ticket
   ===================================================================== */
function useQr(texte) {
  const [qr, setQr] = useState(null);
  useEffect(() => { let ok = true; if (texte) genererQr(texte).then((q) => ok && setQr(q)).catch(() => {}); return () => { ok = false; }; }, [texte]);
  return qr;
}
function QrCode({ texte, taille = 112 }) {
  const qr = useQr(texte);
  if (!qr) return <div className="qr-attente" style={{ width: taille, height: taille }}><span className="spinner" /></div>;
  const n = qr.getModuleCount();
  return <svg className="qr" width={taille} height={taille} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label="QR code du ticket"><rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" /><path d={cheminQr(qr)} fill="#000" /></svg>;
}
function TicketCaisse({ t }) {
  return (
    <div className="receipt-wrap">
      <div className="receipt">
        {lignesTicket(t).map((l, i) => {
          if (l.k === "titre") return <h3 key={i}>{l.txt}</h3>;
          if (l.k === "centre") return <div key={i} className="r-center" style={l.gras ? { fontWeight: 700, color: "#1f2124", marginTop: 2 } : null}>{l.txt}</div>;
          if (l.k === "sep") return <div key={i} className="r-sep" />;
          if (l.k === "texte") return <div key={i} className="r-row"><span style={{ fontWeight: 600 }}>{l.txt}</span></div>;
          if (l.k === "badge") return <div key={i} className="r-badge">{l.txt}</div>;
          return <div key={i} className={cx("r-row", l.grand && "r-total")}><span>{l.g}</span><span>{l.d}</span></div>;
        })}
        {t.lien && <div className="r-qr"><QrCode texte={t.lien} /><div>Scannez pour retrouver<br />votre ticket</div></div>}
        <div className="r-center" style={{ marginTop: 8 }}>{t.boutique?.message || "Merci pour votre achat !"}</div>
      </div>
    </div>
  );
}
function ActionsTicket({ t }) {
  const { toast } = useBoutique();
  const [pdf, setPdf] = useState(false);
  return (
    <div className="ticket-actions">
      {createPortal(<div className="print-zone"><TicketCaisse t={t} /></div>, document.body)}
      <Btn icon={Download} loading={pdf} onClick={async () => { setPdf(true); try { await telechargerTicketPdf(t); } catch (e) { toast({ titre: "Téléchargement impossible", desc: e.message, ton: "critical" }); } setPdf(false); }}>Télécharger (PDF)</Btn>
      <Btn icon={Printer} onClick={() => window.print()}>Imprimer</Btn>
      {t.lien && <Btn icon={Copy} onClick={() => navigator.clipboard?.writeText(t.lien).then(() => toast({ titre: "Lien copié" }))}>Copier le lien</Btn>}
    </div>
  );
}

/* Ticket validé affiché en PDF dans la page (si le navigateur le permet), sinon en HTML */
function TicketPdfApercu({ t }) {
  const integrable = pdfIntegrable();
  const [url, setUrl] = useState(null);
  const [echec, setEchec] = useState(false);
  const cle = JSON.stringify(t);
  useEffect(() => {
    if (!integrable) return;
    let actif = true, u = null;
    urlTicketPdf(t).then((x) => { u = x; if (actif) setUrl(x); else URL.revokeObjectURL(x); }).catch(() => actif && setEchec(true));
    return () => { actif = false; if (u) URL.revokeObjectURL(u); };
  }, [cle]);
  if (!integrable || echec) return <TicketCaisse t={t} />;
  if (!url) return <div className="pdf-attente"><span className="spinner" />Préparation de votre ticket PDF…</div>;
  return <iframe className="ticket-pdf" src={url + "#view=FitH"} title={`Ticket ${t.numero} (PDF)`} />;
}

/* Désinscription des messages marketing (lien STOP des SMS / e-mails) */
function PageStop({ jeton }) {
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("GET", `/api/boutique/stop/${encodeURIComponent(jeton)}`).then(setEtat).catch((e) => setErr(e.message)); }, [jeton]);
  const changer = async (abonner) => {
    setBusy(true);
    try { const r = await api("POST", `/api/boutique/stop/${encodeURIComponent(jeton)}`, { abonner }); setEtat((s) => ({ ...s, abonne: r.abonne, fait: true })); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  if (err) return <div className="v-section"><div className="empty"><div className="empty-icon"><AlertCircle size={26} /></div><h3>Lien invalide</h3><p>{err}</p><a className="btn btn-primary" href="#/">Retour à la boutique</a></div></div>;
  if (!etat) return <div className="v-section v-chargement"><span className="spinner" /></div>;
  return (
    <div className="v-section v-etroit">
      <div className="card card-body stack" style={{ textAlign: "center", alignItems: "center" }}>
        <div className="empty-icon">{etat.abonne ? <Bell size={26} /> : <BellOff size={26} />}</div>
        <h1 className="v-titre">{etat.abonne ? "Messages de " + etat.boutique : "Vous êtes désinscrit(e)"}</h1>
        <p className="muted">
          {etat.abonne
            ? `Bonjour ${etat.prenom || ""}, vous recevez actuellement nos promotions et nouveautés par SMS / e-mail.`
            : etat.fait ? "Vous ne recevrez plus nos messages promotionnels. Vos tickets et le suivi de vos commandes restent disponibles." : `Bonjour ${etat.prenom || ""}, vous ne recevez pas nos messages promotionnels.`}
        </p>
        {etat.abonne
          ? <Btn variant="primary" loading={busy} icon={BellOff} onClick={() => changer(false)}>Ne plus recevoir de messages</Btn>
          : <Btn loading={busy} icon={Bell} onClick={() => changer(true)}>Me réabonner</Btn>}
        <a className="link" href="#/">Retour à la boutique</a>
      </div>
    </div>
  );
}

const ETAPES = [
  { k: "en_attente", label: "Reçue", icon: Receipt },
  { k: "confirmee", label: "Confirmée", icon: CheckCircle2 },
  { k: "expediee", label: "En livraison", icon: Truck },
  { k: "livree", label: "Livrée", icon: PackageCheck },
];

function PageSuivi({ jeton, ticketSeul }) {
  const { toast, config } = useBoutique();
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");
  const nouvelle = useMemo(() => sessionStorage.getItem("boutique-nouvelle") === jeton, [jeton]);
  const charger = useCallback(() => api("GET", `/api/boutique/commandes/${encodeURIComponent(jeton)}`).then((r) => { setC(r); setErr(""); }).catch((e) => setErr(e.statut === 404 ? "Cette commande est introuvable. Vérifiez le lien." : e.message)), [jeton]);
  useEffect(() => { charger(); }, [charger]);
  // Paiement en ligne en cours : on interroge régulièrement ; sinon, rafraîchissement lent du suivi
  useEffect(() => {
    if (!c) return;
    const t = setInterval(charger, c.paiement?.statut === "en_cours" ? 5000 : 30000);
    return () => clearInterval(t);
  }, [c?.paiement?.statut, charger]);
  // Message de remerciement : une seule fois, juste après la commande
  useEffect(() => { if (nouvelle) sessionStorage.removeItem("boutique-nouvelle"); }, []);

  if (err) return <div className="v-section"><div className="empty"><div className="empty-icon"><Receipt size={26} /></div><h3>Commande introuvable</h3><p>{err}</p><a className="btn btn-primary" href="#/">Retour à la boutique</a></div></div>;
  if (!c) return <div className="v-section v-chargement"><span className="spinner" /></div>;

  const ticket = { ...c, lien: lienTicket(c.jeton) };
  if (ticketSeul) {
    return (
      <div className="v-section v-etroit">
        <h1 className="v-titre" style={{ textAlign: "center" }}>Ticket de caisse</h1>
        <p className="muted" style={{ textAlign: "center", marginBottom: 16 }}>Merci pour votre achat ! Téléchargez ou imprimez votre ticket.</p>
        <TicketPdfApercu t={ticket} />
        <ActionsTicket t={ticket} />
      </div>
    );
  }

  const annulee = c.statut === "annulee";
  const idx = ETAPES.findIndex((e) => e.k === c.statut);
  const sp = c.paiement?.statut;
  const quand = (k) => c.etapes.filter((e) => e.type === "statut" && e.statut === k).pop()?.cree_le;
  return (
    <div className="v-section v-suivi">
      <div className="v-suivi-tete">
        {nouvelle && !annulee ? (
          <>
            <svg className="check-anim" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="38" /><path d="M26 43 l11 11 l21 -23" /></svg>
            <h1>Merci {c.client ? c.client.split(" ")[0] : ""} !</h1>
            <p className="muted">Votre commande <b>{c.numero}</b> est enregistrée. Conservez cette page : elle vous permet de suivre votre commande.</p>
          </>
        ) : (
          <>
            <h1>Commande {c.numero}</h1>
            <p className="muted">Passée le {fmtDate(c.date)}</p>
          </>
        )}
      </div>

      {/* État du paiement */}
      {!annulee && sp === "en_cours" && (
        <div className="banner banner-info"><Loader2 size={16} className="tourne" /><div><b>Paiement en ligne en attente de validation.</b> Validez l'opération sur votre téléphone si vous y êtes invité ; cette page se met à jour automatiquement.{c.reprendre_paiement && <><br /><a className="link" href={c.reprendre_paiement}>Reprendre le paiement</a></>}</div></div>
      )}
      {!annulee && sp === "a_verifier" && (
        <div className="banner banner-warning"><Clock size={16} /><div><b>Paiement en cours de vérification.</b> Nous contrôlons la réception de votre transfert {c.paiement.mode} (réf. {c.paiement.reference}) et confirmons votre commande au plus vite.</div></div>
      )}
      {!annulee && sp === "en_attente" && (
        <div className="banner banner-success"><Banknote size={16} /><div>À régler à la livraison : <b className="num">{fmt(c.total)}</b>, en espèces ou par Mobile Money.</div></div>
      )}
      {!annulee && sp === "payee" && (
        <div className="banner banner-success"><CheckCircle2 size={16} /><div><b>Paiement reçu</b>{c.paiement.mode ? ` (${c.paiement.mode})` : ""}. Merci !</div></div>
      )}
      {annulee && (
        <div className="banner banner-critical"><XCircle size={16} /><div><b>Commande annulée.</b> {sp === "echoue" ? "Le paiement en ligne n'a pas abouti : aucun montant n'a été débité par la boutique. Vous pouvez repasser commande." : "Contactez-nous pour toute question."}</div></div>
      )}

      <div className="v-suivi-grille">
        <div className="stack">
          {!annulee && (
            <section className="card card-body">
              <div className="card-title" style={{ marginBottom: 14 }}>Suivi</div>
              <div className="steps">
                {ETAPES.map((e, i) => (
                  <div key={e.k} className={cx("step", i <= idx && "done", i === idx && "current")}>
                    <div className="step-dot">{i < idx ? <Check size={15} strokeWidth={3} /> : <e.icon size={15} />}</div>
                    <div className="step-label">{e.label}</div>
                    {quand(e.k) && <div className="subtle" style={{ fontSize: 11 }}>{new Date(quand(e.k)).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="card card-body">
            <div className="card-title" style={{ marginBottom: 10 }}>Articles</div>
            {c.lignes.map((l, i) => (
              <div key={i} className="row" style={{ gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--divider)" : 0 }}>
                <ImageProduit p={l} className="mini" />
                <div className="grow"><div className="strong">{l.nom}</div><div className="subtle num">{l.quantite} × {fmt(l.prix_unitaire)}{l.prix_normal > l.prix_unitaire ? <> <s>{fmt(l.prix_normal)}</s> · remise −{Math.round((1 - l.prix_unitaire / l.prix_normal) * 100)} %</> : null}</div></div>
                <div className="num strong">{fmt(l.total)}</div>
              </div>
            ))}
            <div className="stack-sm" style={{ marginTop: 10 }}>
              <div className="summary-line"><span>Sous-total</span><span className="num">{fmt(c.sous_total)}</span></div>
              <div className="summary-line"><span>Livraison</span><span className="num">{c.frais_livraison ? fmt(c.frais_livraison) : "Offerte"}</span></div>
              <div className="summary-total"><span className="strong">Total</span><strong>{fmt(c.total)}</strong></div>
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="card card-body stack-sm">
            <div className="card-title">Livraison</div>
            <div className="row muted" style={{ alignItems: "flex-start" }}><MapPin size={15} style={{ marginTop: 2 }} /><span>{c.adresse_livraison || "—"}</span></div>
            {(c.contact.whatsapp || c.contact.telephone) && <div className="pop-sep" style={{ margin: "6px 0" }} />}
            {c.contact.whatsapp && <a className="btn btn-secondary" href={`https://wa.me/${telInternational(c.contact.whatsapp)}?text=${encodeURIComponent(`Bonjour, au sujet de ma commande ${c.numero}`)}`} target="_blank" rel="noopener"><MessageSquare size={16} /><span>Question sur ma commande</span></a>}
            {!c.contact.whatsapp && c.contact.telephone && <a className="btn btn-secondary" href={`tel:${c.contact.telephone.replace(/\s/g, "")}`}><Phone size={16} /><span>Appeler la boutique</span></a>}
          </section>
          <section className="card card-body">
            <div className="card-title" style={{ marginBottom: 10 }}>Ticket de caisse</div>
            {nouvelle ? <TicketPdfApercu t={ticket} /> : <details className="ticket-apercu" open={sp === "payee"}><summary>Afficher le ticket</summary><TicketCaisse t={ticket} /></details>}
            <div style={{ marginTop: 10 }}><ActionsTicket t={ticket} /></div>
          </section>
        </div>
      </div>
      <div className="row" style={{ justifyContent: "center", marginTop: 24 }}><a className="btn btn-secondary" href="#/"><ArrowLeft size={16} /><span>Retour à la boutique</span></a></div>
    </div>
  );
}

function PageMesCommandes() {
  const [liste, setListe] = useState(null);
  useEffect(() => {
    const mes = lire(COMMANDES_KEY, []);
    Promise.all(mes.map((o) => api("GET", `/api/boutique/commandes/${encodeURIComponent(o.jeton)}`).then((r) => ({ ...o, r })).catch(() => null)))
      .then((l) => setListe(l.filter(Boolean)));
  }, []);
  const statutTxt = { en_attente: "Reçue", confirmee: "Confirmée", expediee: "En livraison", livree: "Livrée", annulee: "Annulée" };
  const ton = { livree: "success", annulee: "critical", expediee: "magic", confirmee: "info", en_attente: "warning" };
  return (
    <div className="v-section v-etroit">
      <h1 className="v-titre">Mes commandes</h1>
      <p className="muted" style={{ marginBottom: 16 }}>Les commandes passées depuis cet appareil.</p>
      {!liste ? <div className="v-chargement"><span className="spinner" /></div> : liste.length === 0 ? (
        <div className="empty"><div className="empty-icon"><Receipt size={26} /></div><h3>Aucune commande</h3><p>Vos commandes apparaîtront ici.</p><a className="btn btn-primary" href="#/">Découvrir la boutique</a></div>
      ) : (
        <div className="card">
          {liste.map((o, i) => (
            <a key={o.jeton} className="list-item" href={`#/commande/${o.jeton}`} style={{ animation: `fadeUp .35s ${i * 40}ms var(--ease-out) both` }}>
              <ImageProduit p={o.r.lignes[0]} className="mini" />
              <div className="grow">
                <div className="row-between"><span className="strong">{o.r.numero}</span><span className="num strong">{fmt(o.r.total)}</span></div>
                <div className="row-between"><span className="subtle">{fmtDate(o.r.date)} · {o.r.lignes.reduce((s, l) => s + l.quantite, 0)} article(s)</span><Badge tone={ton[o.r.statut]} dot>{statutTxt[o.r.statut]}</Badge></div>
              </div>
              <ChevronRight size={16} className="muted" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   Application
   ===================================================================== */
/* Apparition au défilement : chaque bloc entre en scène quand il devient visible */
const CIBLES_ANIM = ".v-carte, .v-boutique-carte, .v-section-tete, .v-garanties > div, .g-profil, .g-pack, .g-etapes > div, .g-titre, .g-contact-carte";
function useApparitions() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.body.classList.add("anim-pret");
    let image = 0, lot = 0;
    // Un bloc entre en scène dès que son haut passe dans la fenêtre ; ceux qui arrivent ensemble se suivent
    const verifier = () => {
      image = 0; lot = 0;
      document.querySelectorAll(CIBLES_ANIM).forEach((el) => {
        if (el.classList.contains("vu")) return;
        el.dataset.anim = "1";
        if (el.getBoundingClientRect().top < innerHeight * 0.94) { el.style.setProperty("--d", Math.min(lot++, 8) * 70 + "ms"); el.classList.add("vu"); }
      });
    };
    const demander = () => { if (!image) image = requestAnimationFrame(verifier); };
    verifier();
    addEventListener("scroll", demander, { passive: true }); addEventListener("resize", demander);
    const mo = new MutationObserver(demander);
    mo.observe(document.getElementById("root"), { childList: true, subtree: true });
    // Filet de sécurité : rien ne reste masqué si le défilement n'est pas détecté
    const filet = setInterval(verifier, 1500);
    return () => { removeEventListener("scroll", demander); removeEventListener("resize", demander); mo.disconnect(); clearInterval(filet); cancelAnimationFrame(image); };
  }, []);
}

function App() {
  const [route, go] = useRoute();
  useApparitions("");
  const [boutiques, setBoutiques] = useState(null);
  const [produitsBruts, setProduits] = useState([]);
  const [diag, setDiag] = useState(null);
  const [erreur, setErreur] = useState("");
  const [panier, setPanier] = useState(() => lire(PANIER_KEY, []));
  const [panierOuvert, setPanierOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [toasts, setToasts] = useState([]);
  const [bump, setBump] = useState(false);

  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((s) => [...s.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), t.duree || 3800);
  }, []);
  const fermerToast = useCallback((id) => setToasts((s) => s.filter((x) => x.id !== id)), []);

  const recharger = useCallback(async () => {
    const [b, liste] = await Promise.all([api("GET", "/api/boutique/boutiques"), api("GET", "/api/boutique/produits")]);
    // id = clé unique sur la plateforme ; pid = identifiant du produit dans sa boutique
    const p = liste.map((x) => ({ ...x, pid: x.id, id: x.cle }));
    setBoutiques(b); setProduits(p);
    // Diagnostic fait sur cet appareil : on relit le bilan (la remise peut avoir servi ou expiré)
    const ref = lire(DIAG_KEY, null)?.reference;
    if (ref) api("GET", `/api/boutique/diagnostic/${encodeURIComponent(ref)}`).then(setDiag).catch((e) => { if (e.statut === 404) { ecrire(DIAG_KEY, null); setDiag(null); } });
    else setDiag(null);
    return p;
  }, []);
  const enregistrerDiagnostic = (d) => { ecrire(DIAG_KEY, d ? { reference: d.reference } : null); setDiag(d); };
  // Prix de la routine : tant que la remise du diagnostic est valable, ses produits sont affichés à -15 %
  const produits = useMemo(() => {
    if (!diag?.remise?.valable) return produitsBruts;
    const routine = new Map(diag.produits.map((x) => [x.cle, x.prix_routine]));
    return produitsBruts.map((p) => (routine.has(p.id) && routine.get(p.id) < p.prix
      ? { ...p, prix: routine.get(p.id), prix_normal: p.prix_normal || p.prix, remise: Math.round((1 - routine.get(p.id) / (p.prix_normal || p.prix)) * 100), routine: true } : p));
  }, [produitsBruts, diag]);
  useEffect(() => { recharger().catch((e) => setErreur(e.message)); }, []);
  // Stock et prix à jour quand le client revient sur l'onglet
  useEffect(() => { const h = () => document.visibilityState === "visible" && recharger().catch(() => {}); document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h); }, []);
  useEffect(() => { ecrire(PANIER_KEY, panier); }, [panier]);

  // Lignes du panier avec les données produit à jour (produit retiré → ligne ignorée)
  const lignes = useMemo(() => panier.map((l) => ({ p: produits.find((p) => p.id === l.id), quantite: l.quantite })).filter((l) => l.p && l.p.disponible)
    .map((l) => ({ ...l, quantite: Math.min(l.quantite, l.p.stock) })), [panier, produits]);
  const nbArticles = lignes.reduce((s, l) => s + l.quantite, 0);
  const quantiteDans = (id) => panier.find((l) => l.id === id)?.quantite || 0;

  // Réglages en vigueur : ceux de la boutique consultée (page boutique, fiche produit) et ceux de la boutique du panier
  const configDe = (id) => (boutiques || []).find((b) => b.id === id) || CONFIG_PLATEFORME;
  const boutiqueVue = route.page === "boutique" ? (boutiques || []).find((b) => b.slug === route.id)?.id
    : route.page === "produit" ? produits.find((p) => p.id === route.id)?.boutique_id : null;
  const config = configDe(boutiqueVue);
  const configPanier = configDe(lignes[0]?.p.boutique_id);
  useEffect(() => { document.title = config.plateforme ? `${PLATEFORME} — soins capillaires et diagnostic sur mesure` : `${config.boutique.nom} — ${PLATEFORME}`; }, [config.id, config.boutique.nom]);
  // Arrivée par le lien de promotion d'un vendeur : on s'en souvient pour lui attribuer la commande
  useEffect(() => {
    if (route.page === "boutique" && route.vendeur && boutiqueVue && /^[A-Za-z0-9_-]{6,40}$/.test(route.vendeur)) ecrire(REF_KEY, { ...lire(REF_KEY, {}), [boutiqueVue]: route.vendeur });
  }, [route.page, route.vendeur, boutiqueVue]);

  const ajouter = (p, q, silencieux) => {
    // Une commande = une boutique : changer de boutique remplace le panier
    const autre = lignes[0] && lignes[0].p.boutique_id !== p.boutique_id ? lignes[0].p.boutique_nom : null;
    if (autre && !window.confirm(`Votre panier contient des articles de « ${autre} ».\n\nUne commande ne concerne qu'une seule boutique : vider le panier et ajouter cet article de « ${p.boutique_nom} » ?`)) return;
    setPanier((s) => {
      if (autre) return [{ id: p.id, quantite: Math.min(p.stock, q) }];
      const actuel = s.find((l) => l.id === p.id)?.quantite || 0;
      const nouvelle = Math.min(p.stock, actuel + q);
      return actuel ? s.map((l) => (l.id === p.id ? { ...l, quantite: nouvelle } : l)) : [...s, { id: p.id, quantite: nouvelle }];
    });
    setBump(true); setTimeout(() => setBump(false), 450);
    if (!silencieux) toast({ titre: "Ajouté au panier", desc: `${q} × ${p.nom}`, action: { label: "Voir le panier", onClick: () => setPanierOuvert(true) } });
  };
  const changerQuantite = (id, q) => setPanier((s) => s.map((l) => (l.id === id ? { ...l, quantite: q } : l)));
  const retirer = (id) => setPanier((s) => s.filter((l) => l.id !== id));
  const viderPanier = () => setPanier([]);
  const synchroniserPanier = (indispo) => setPanier((s) => s.map((l) => { const x = indispo.find((i) => l.id.endsWith("." + i.pack_id)); return x ? { ...l, quantite: x.disponible } : l; }).filter((l) => l.quantite > 0));

  if (erreur) return <div className="splash"><div className="empty"><div className="empty-icon"><AlertTriangle size={26} /></div><h3>Site momentanément indisponible</h3><p>{erreur}</p><Btn variant="primary" onClick={() => location.reload()}>Réessayer</Btn></div></div>;
  if (!boutiques) return <div className="splash"><span className="brand-mark splash-mark"><ShoppingBag size={22} strokeWidth={2.4} /></span><span className="spinner" /></div>;

  const ctx = {
    config, configPanier, boutiques, produits, route, go, lignes, nbArticles, quantiteDans, ajouter, changerQuantite, retirer, viderPanier, synchroniserPanier, recharger,
    diag, enregistrerDiagnostic,
    panierOuvert, ouvrirPanier: () => setPanierOuvert(true), fermerPanier: () => setPanierOuvert(false), recherche, setRecherche, toast, bump,
  };

  let page;
  switch (route.page) {
    case "diagnostic": page = <PageDiagnostic />; break;
    case "formations": page = <PageFormations />; break;
    case "formation": page = <PageFormation jeton={route.id} key={route.id} />; break;
    case "certificat": page = <PageCertificat code={route.id} key={route.id} />; break;
    case "produit": page = <PageProduit id={route.id} />; break;
    case "commander": page = <PageCommander />; break;
    case "commande": page = <PageSuivi jeton={route.id} key={route.id} />; break;
    case "recu": page = <PageSuivi jeton={route.id} key={"r" + route.id} ticketSeul />; break;
    case "mes-commandes": page = <PageMesCommandes />; break;
    case "stop": page = <PageStop jeton={route.id} />; break;
    case "boutique": page = <PageAccueil slug={route.id} />; break;
    default: page = <PageAccueil />;
  }

  return (
    <Ctx.Provider value={ctx}>
      <BandeauInfo />
      <EnTete />
      <main className="v-main" key={route.page + (route.id || "")}>{page}</main>
      <PiedDePage />
      <TiroirPanier />
      {nbArticles > 0 && route.page !== "commander" && (
        <button className="v-barre-panier only-mobile" onClick={() => setPanierOuvert(true)}>
          <ShoppingCart size={18} /><span>{nbArticles} article{nbArticles > 1 ? "s" : ""}</span><b className="num">{fmt(calculTotaux(lignes, configPanier).sousTotal)}</b><ArrowRight size={16} />
        </button>
      )}
      <Toasts items={toasts} fermer={fermerToast} />
    </Ctx.Provider>
  );
}

createRoot(document.getElementById("root")).render(<App />);

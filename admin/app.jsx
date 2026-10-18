import React, {
  useState, useEffect, useMemo, useCallback, useRef, useContext, createContext, useLayoutEffect,
} from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  Home, ShoppingCart, Tag, Users, Receipt, Landmark, Settings, Search, Bell, Plus, Minus, X, Menu,
  ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, ArrowUpRight, ArrowDownRight, ArrowUpDown,
  MoreHorizontal, Check, CheckCircle2, Clock, Truck, XCircle, PackageCheck, Package, Star, Phone, Mail,
  MapPin, Trash2, Pencil, Eye, EyeOff, Lock, ShieldCheck, LogOut, Moon, Sun, Monitor, Download, Upload,
  Printer, Copy, RotateCcw, ShoppingBag, LayoutGrid, List, AlertCircle, AlertTriangle, Info, Sparkles,
  CreditCard, Smartphone, Banknote, TrendingUp, Inbox, UserPlus, User, MessageSquare, Store, Wallet,
  Boxes, Megaphone, Percent, Send, History, ClipboardList, PackagePlus, PackageMinus, CalendarClock, FileText, Gift,
  UserCheck, Link2, KeyRound, ExternalLink,
} from "lucide-react";
import { lignesTicket, telechargerTicketPdf, urlTicketPdf, pdfIntegrable, telInternational, genererQr, cheminQr, lienTicket } from "../partage/ticket.js";

/* =====================================================================
   MILANA — administration de boutique (style Shopify)
   ===================================================================== */

/* ---------- Constantes métier ---------- */
const STATUTS = {
  en_attente: { label: "En attente", tone: "warning", icon: Clock },
  confirmee: { label: "Confirmée", tone: "info", icon: CheckCircle2 },
  expediee: { label: "Expédiée", tone: "magic", icon: Truck },
  livree: { label: "Livrée", tone: "success", icon: PackageCheck },
  annulee: { label: "Annulée", tone: "critical", icon: XCircle },
};
const FLOW = ["en_attente", "confirmee", "expediee", "livree"];
const NEXT_STEP = {
  en_attente: { statut: "confirmee", label: "Confirmer la commande", icon: CheckCircle2 },
  confirmee: { statut: "expediee", label: "Marquer comme expédiée", icon: Truck },
  expediee: { statut: "livree", label: "Marquer comme livrée", icon: PackageCheck },
};
/* Moyens de paiement utilisés en boutique en Côte d'Ivoire.
   type : especes (montant reçu → monnaie), mobile (numéro + ID de transaction),
   carte (n° d'autorisation du TPE), livraison (payé plus tard, à encaisser). */
const PAIEMENTS = [
  { key: "Espèces", court: "Espèces", type: "especes", icon: Banknote, color: "#16a34a", sigle: "₣" },
  { key: "Orange Money", court: "Orange", type: "mobile", icon: Smartphone, color: "#ff7900", sigle: "OM" },
  { key: "MTN MoMo", court: "MTN", type: "mobile", icon: Smartphone, color: "#ffcb05", sigle: "MTN", texte: "#1a1a1a" },
  { key: "Moov Money", court: "Moov", type: "mobile", icon: Smartphone, color: "#0066b3", sigle: "MV" },
  { key: "Wave", court: "Wave", type: "mobile", icon: Smartphone, color: "#1dc8ff", sigle: "W" },
  { key: "Carte bancaire", court: "Carte", type: "carte", icon: CreditCard, color: "#2c6ecb", sigle: "CB" },
  { key: "Paiement à la livraison", court: "À la livraison", type: "livraison", icon: Truck, color: "#8a8a8a", sigle: "…" },
  // Paiement réalisé par le client sur la boutique en ligne (CinetPay) — jamais saisi en caisse
  { key: "Paiement en ligne", court: "En ligne", type: "en_ligne", icon: CreditCard, color: "#6d28d9", sigle: "CP" },
];
// Libellés des anciennes versions
const PAIEMENTS_ANCIENS = {
  "Mobile Money": { key: "Mobile Money", court: "Mobile Money", type: "mobile", icon: Smartphone, color: "#e0a12c", sigle: "MM" },
  Carte: PAIEMENTS[5],
};
const infoPaiement = (mode) => PAIEMENTS.find((p) => p.key === mode) || PAIEMENTS_ANCIENS[mode] || PAIEMENTS[0];
const ModePaiement = ({ mode, taille = 22 }) => {
  const p = infoPaiement(mode);
  return <span className="pay-logo" style={{ background: p.color, color: p.texte || "#fff", width: taille, height: taille, fontSize: taille * 0.38 }}>{p.sigle}</span>;
};
const CATEGORIES = [
  { key: "Stock", color: "var(--c-blue)" },
  { key: "Marketing", color: "var(--c-gold)" },
  { key: "Logistique", color: "var(--c-green)" },
  { key: "Équipement", color: "var(--c-purple)" },
  { key: "Autre", color: "var(--c-gray)" },
];
const catColor = (k) => (CATEGORIES.find((c) => c.key === k) || CATEGORIES[4]).color;
const STOCK_FAIBLE = 10;

/* ---------- Utilitaires ---------- */
const uid = () => Math.random().toString(36).slice(2, 10);
let _seq = 0;
const nextId = (p = "id") => `${p}${++_seq}`;
const cx = (...a) => a.filter(Boolean).join(" ");
const norm = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const initials = (nom) => (nom || "?").split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const toneOf = (s) => { let h = 0; for (const ch of s || "") h = (h * 31 + ch.charCodeAt(0)) % 8; return h; };
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmt = (n) => nf.format(Math.round(n || 0)) + " FCFA";
const fmtNum = (n) => nf.format(Math.round(n || 0));
const fmtShort = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(".", ",") + " M";
  if (a >= 1e3) return Math.round(n / 1e3) + " k";
  return String(Math.round(n));
};
const pct = (n) => (n >= 0 ? "" : "−") + Math.abs(n).toFixed(0) + " %";

const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseDate = (s) => {
  if (!s) return new Date();
  if (s.length <= 10) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  return new Date(s);
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysBetween = (a, b) => Math.round((parseDate(isoDate(b)) - parseDate(isoDate(a))) / 864e5);
const fmtDate = (s) => parseDate(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const fmtDateCourt = (s) => { const d = parseDate(s); return d.toLocaleDateString("fr-FR", d.getFullYear() === new Date().getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }); };
const fmtDateLong = (d) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const fmtDateTime = (s) => parseDate(s).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const relDay = (dateStr, heure) => {
  const n = daysBetween(parseDate(dateStr), today());
  const h = heure ? ` à ${heure}` : "";
  if (n === 0) return "Aujourd'hui" + h;
  if (n === 1) return "Hier" + h;
  if (n > 1 && n < 7) return `Il y a ${n} jours`;
  return fmtDate(dateStr);
};
const venteStamp = (v) => (v?.date || "") + "T" + (v?.heure || "12:00");

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toCsv(rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\n");
}

/* =====================================================================
   Données de démonstration (générées autour de la date du jour)
   ===================================================================== */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedData() {
  const r = rng(20260813);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const T0 = today();
  const now = new Date();

  const base = [
    ["Aïcha Koné", "07 01 23 45 67", "Cocody, Abidjan", "VIP", "Cliente fidèle, préfère le paiement Mobile Money"],
    ["Yao Kouassi", "05 44 12 98 76", "Yopougon, Abidjan", "Standard", ""],
    ["Fatou Diabaté", "01 22 33 44 55", "Bouaké", "VIP", "Achète en gros pour revente"],
    ["Ibrahim Traoré", "07 88 99 00 11", "Marcory, Abidjan", "Standard", ""],
    ["Mariam Ouattara", "07 45 67 12 30", "Plateau, Abidjan", "VIP", "Livraison uniquement l'après-midi"],
    ["Serge N'Guessan", "05 12 78 45 90", "Yamoussoukro", "Standard", ""],
    ["Awa Bamba", "01 98 76 54 32", "Treichville, Abidjan", "Standard", "Aime les emballages cadeaux"],
    ["Koffi Assi", "07 33 21 09 87", "San-Pédro", "Standard", ""],
    ["Adjoua Yao", "05 66 43 21 10", "Bingerville", "VIP", ""],
    ["Moussa Sangaré", "07 21 34 56 78", "Korhogo", "Standard", ""],
    ["Christelle Gnagne", "01 55 44 33 22", "Angré, Abidjan", "Standard", "Nouvelle cliente via Instagram"],
    ["Bakary Coulibaly", "05 90 80 70 60", "Daloa", "Standard", ""],
  ];
  const clients = base.map(([nom, tel, ville, statut, notes], i) => ({
    id: uid(), nom, tel, ville, statut, notes,
    email: norm(nom).replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".") + "@mail.ci",
    dateAjout: isoDate(addDays(T0, -(i >= 9 ? 3 + Math.floor(r() * 20) : 60 + Math.floor(r() * 220)))),
  }));

  const packs = [
    ["Pack Découverte", 15000, 42, "📦", "Idéal pour démarrer, 3 articles essentiels", 0],
    ["Pack Premium", 45000, 18, "💎", "Sélection haut de gamme, 6 articles", 2],
    ["Pack Business", 90000, 7, "🚀", "Pour revendeurs, quantité en gros", 5],
    ["Pack Cadeau", 25000, 25, "🎁", "Emballage soigné, prêt à offrir", 3],
    ["Pack Beauté", 32000, 14, "💄", "Soins et maquillage, 4 produits", 7],
    ["Pack Café", 12000, 0, "☕", "Café d'Abidjan torréfié, 3 variétés", 1],
    ["Pack Bien-être", 28000, 22, "🕯️", "Bougies, huiles et thé détente", 4],
    ["Pack Gourmand", 18000, 5, "🍫", "Chocolats et douceurs artisanales", 6],
  ].map(([nom, prix, stock, emoji, desc, teinte], i) => ({
    id: uid(), nom, prix, stock, emoji, desc, teinte,
    cout: Math.round(prix * (0.45 + r() * 0.15) / 100) * 100,
    sku: "PK-" + String(101 + i),
    actif: true,
  }));

  const N = 78;
  const ages = [...Array(N)].map(() => Math.floor(Math.pow(r(), 1.5) * 92)).sort((a, b) => b - a);
  const ventes = [];
  const commandes = [];
  ages.forEach((daysAgo, i) => {
    const client = r() < 0.45 ? pick(clients.filter((c) => c.statut === "VIP")) : pick(clients);
    const pack = r() < 0.5 ? pick(packs.slice(0, 4)) : pick(packs);
    const qte = r() < 0.7 ? 1 : r() < 0.7 ? 2 : 3;
    const pr = r();
    const paiement = pr < 0.3 ? "Espèces" : pr < 0.5 ? "Orange Money" : pr < 0.62 ? "Wave" : pr < 0.74 ? "MTN MoMo" : pr < 0.8 ? "Moov Money" : pr < 0.9 ? "Carte bancaire" : "Paiement à la livraison";
    const date = addDays(T0, -daysAgo);
    let h = 8 + Math.floor(r() * 12);
    if (daysAgo === 0) h = Math.min(h, Math.max(8, now.getHours() - 1));
    const heure = pad(h) + ":" + pad(Math.floor(r() * 60));
    const statut = daysAgo === 0 ? pick(["en_attente", "en_attente", "confirmee"])
      : daysAgo <= 2 ? pick(["confirmee", "expediee", "en_attente"])
      : daysAgo <= 6 ? pick(["expediee", "livree", "livree"])
      : r() < 0.06 ? "annulee" : "livree";

    const vid = uid();
    const total = qte * pack.prix;
    const info = infoPaiement(paiement);
    const livree = statut === "livree";
    const aLivraison = info.type === "livraison";
    const cid = uid();
    ventes.push({
      id: vid, commandeId: cid, clientId: client.id, packId: pack.id, qte, prixUnitaire: pack.prix, date: isoDate(date), heure,
      // Paiement à la livraison : encaissé en espèces une fois la commande livrée
      paiement: aLivraison && livree ? "Espèces" : paiement,
      statutPaiement: aLivraison && !livree ? "en_attente" : "payee",
      montantRecu: info.type === "especes" || (aLivraison && livree) ? Math.ceil(total / 5000) * 5000 : null,
      telPaiement: info.type === "mobile" ? client.tel : "",
      reference: info.type === "mobile" ? "TX" + String(Math.floor(r() * 1e10)).padStart(10, "0") : info.type === "carte" ? "AUT" + String(Math.floor(r() * 1e6)).padStart(6, "0") : "",
    });

    const start = parseDate(isoDate(date)); start.setHours(h, Number(heure.slice(3)));
    const path = statut === "annulee" ? ["en_attente", "annulee"] : FLOW.slice(0, FLOW.indexOf(statut) + 1);
    const stepH = daysAgo === 0 ? 0.5 : Math.min(30, (daysAgo * 24) / (path.length + 1));
    const historique = path.map((s, k) => {
      let t = new Date(start.getTime() + k * stepH * 3600e3);
      if (t > now) t = new Date(now.getTime() - (path.length - k) * 60e3);
      return { statut: s, date: t.toISOString() };
    });
    commandes.push({ id: cid, venteId: vid, numero: "#" + (1001 + i), statut, adresseLivraison: client.ville, note: "", historique, canal: "boutique", fraisLivraison: 0 });
  });

  const investissements = [
    ["Achat de stock — Pack Premium x20", "Stock", 620000, 88],
    ["Publicité Facebook & Instagram", "Marketing", 80000, 80],
    ["Emballages & étiquettes", "Logistique", 35000, 72],
    ["Achat de stock — Pack Business x10", "Stock", 550000, 64],
    ["Imprimante de reçus", "Équipement", 95000, 50],
    ["Campagne influenceurs", "Marketing", 150000, 38],
    ["Achat de stock — Packs Cadeau & Beauté", "Stock", 480000, 24],
    ["Frais de livraison (moto)", "Logistique", 42000, 12],
    ["Achat de stock — Pack Découverte x40", "Stock", 310000, 4],
  ].map(([libelle, categorie, montant, d]) => ({ id: uid(), libelle, categorie, montant, date: isoDate(addDays(T0, -d)) }));

  return { clients, packs, ventes, commandes, investissements, boutique: boutiqueParDefaut() };
}

function boutiqueParDefaut() {
  return {
    nom: readJson(SETTINGS_KEY)?.nomBoutique || "Ma Boutique",
    adresse: "Cocody Angré, Abidjan",
    telephone: "",
    message: "Merci pour votre achat et à bientôt !",
    slogan: "", whatsapp: "",
    momo_orange: "", momo_mtn: "", momo_moov: "", momo_wave: "", momo_titulaire: "",
    lien_orange: "", lien_mtn: "", lien_moov: "", lien_wave: "",
    frais_livraison: "0", livraison_gratuite_des: "0", zone_livraison: "", boutique_ouverte: "1",
  };
}

/* Mise à niveau des données enregistrées par l'ancienne version */
function migrate(d) {
  const x = {
    clients: d.clients || [], packs: d.packs || [], ventes: d.ventes || [],
    commandes: d.commandes || [], investissements: d.investissements || [],
  };
  x.packs = x.packs.map((p, i) => ({ actif: true, sku: "PK-" + (101 + i), teinte: i % 8, cout: null, desc: "", ...p }));
  x.clients = x.clients.map((c) => ({ email: "", ville: "", notes: "", statut: "Standard", ...c }));
  x.ventes = x.ventes.map((v) => ({ statutPaiement: "payee", montantRecu: null, telPaiement: "", reference: "", ...v, paiement: v.paiement === "Carte" ? "Carte bancaire" : v.paiement }));
  x.boutique = { ...boutiqueParDefaut(), ...(d.boutique || {}) };
  const cmdParVente = new Map(x.commandes.map((c) => [c.venteId, c.id]));
  x.ventes = x.ventes.map((v) => (v.commandeId ? v : { ...v, commandeId: cmdParVente.get(v.id) || null }));
  x.commandes = x.commandes.map((c) => ({ canal: "boutique", fraisLivraison: 0, ...c }));
  x.commandes = x.commandes.map((c) => {
    if (c.historique) return c;
    const v = x.ventes.find((v) => v.id === c.venteId);
    return { note: "", ...c, historique: [{ statut: c.statut, date: parseDate(v?.date || isoDate(new Date())).toISOString() }] };
  });
  return x;
}

/* =====================================================================
   Persistance (localStorage)
   ===================================================================== */
const STORAGE_KEY = "moncommerce-data";
const SETTINGS_KEY = "moncommerce-reglages";
const AUTH_KEY = "moncommerce-auth";

const readJson = (k) => { try { const r = window.localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
const writeJson = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
const removeKey = (k) => { try { window.localStorage.removeItem(k); } catch { /* ignoré */ } };

/* Données de la boutique. En mode démo elles vivent dans localStorage ;
   connectées au serveur, elles sont chargées depuis l'API (voir App). */
function useStore(mode) {
  const [data, setData] = useState(null);
  useEffect(() => { if (mode === "demo" && data) writeJson(STORAGE_KEY, data); }, [data, mode]);
  const update = useCallback((fn) => setData((d) => (d ? fn(d) : d)), []);
  return { data, update, replace: setData };
}
const chargerLocal = () => { const raw = readJson(STORAGE_KEY); return raw ? migrate(raw) : seedData(); };

/* =====================================================================
   Connexion au serveur (API REST du dossier backend/)
   ===================================================================== */
let API_BASE = "";

class ErreurApi extends Error {
  constructor(message, statut) { super(message); this.statut = statut; }
}

async function apiFetch(method, chemin, corps) {
  const auth = readJson(AUTH_KEY);
  let res;
  try {
    res = await fetch(API_BASE + chemin, {
      method,
      headers: { "Content-Type": "application/json", ...(auth?.jeton ? { Authorization: "Bearer " + auth.jeton } : {}) },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
  } catch {
    throw new ErreurApi("Serveur injoignable. Vérifiez votre connexion.", 0);
  }
  if (res.status === 401 && auth?.jeton && !chemin.startsWith("/api/auth/")) {
    window.dispatchEvent(new Event("mc-session-expiree"));
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErreurApi(json.erreur || `Erreur ${res.status}`, res.status);
  return json;
}

/** Cherche l'API : même origine (interface servie par le backend), puis localhost:4000. */
async function detecterServeur() {
  const candidats = [];
  if (window.MONCOMMERCE_API_URL) candidats.push(String(window.MONCOMMERCE_API_URL).replace(/\/$/, ""));
  if (location.protocol.startsWith("http")) candidats.push("");
  candidats.push("http://localhost:4000");
  for (const base of candidats) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(base + "/api/sante", { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok && (await r.json()).service) return base;
    } catch { /* candidat suivant */ }
  }
  return null;
}

/* Conversion format serveur (snake_case, horodatages UTC) ↔ format de l'interface */
const localIso = (date, heure = "12:00") => {
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  const [hh, mi] = String(heure).split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mi || 0).toISOString();
};

function depuisServeur(p) {
  const evts = new Map();
  (p.evenements || []).forEach((e) => { if (!evts.has(e.commande_id)) evts.set(e.commande_id, []); evts.get(e.commande_id).push(e); });
  const ventes = p.ventes.map((v) => {
    const d = new Date(v.date_vente);
    return {
      id: v.id, commandeId: v.commande_id || null, clientId: v.client_id, packId: v.pack_id, vendeurId: v.vendeur_id || null, qte: v.quantite, prixUnitaire: v.prix_unitaire, prixCatalogue: v.prix_catalogue ?? null, date: isoDate(d), heure: hhmm(d),
      paiement: v.mode_paiement, statutPaiement: v.statut_paiement || "payee", montantRecu: v.montant_recu ?? null,
      telPaiement: v.telephone_paiement || "", reference: v.reference_paiement || "", payeLe: v.paye_le || null, vendeur: v.vendeur_nom || "",
    };
  });
  const venteDate = new Map(p.ventes.map((v) => [v.id, v.date_vente]));
  return {
    role: p.role || "admin",
    moi: p.moi || null,
    espace: p.espace || null,
    equipe: (p.equipe || []).map((u) => ({ id: u.id, nom: u.nom, tel: u.telephone, role: u.role, actif: u.actif !== 0, creeLe: u.cree_le })),
    clients: p.clients.map((c) => ({ id: c.id, nom: c.nom, tel: c.telephone || "", email: c.email || "", ville: c.ville || "", statut: c.statut || "Standard", notes: c.notes || "", dateAjout: isoDate(new Date(c.cree_le)), consentement: !!c.consentement_marketing })),
    packs: p.packs.map((x) => ({ id: x.id, nom: x.nom, desc: x.description || "", prix: x.prix, cout: x.cout ?? null, stock: x.stock, sku: x.sku || "", emoji: x.emoji || "📦", teinte: x.teinte ?? 0, actif: !!x.actif, image: x.image || null,
      contenu: x.contenu || "", prixPromo: x.prix_promo ?? null, promoFin: x.promo_fin || null, seuilAlerte: x.seuil_alerte ?? STOCK_FAIBLE,
      categorie: x.categorie || "", pieces: Math.max(1, Number(x.pieces_par_lot) || 1) })),
    livreurs: (p.livreurs || []).map((l) => ({ id: l.id, nom: l.nom, tel: l.telephone || "", zone: l.zone || "", actif: l.actif !== 0 })),
    // Journal des tickets de caisse : généré, imprimé, envoyé…
    tickets: (p.tickets || []).map((t) => ({ id: t.id, commandeId: t.commande_id, action: t.action, auteurId: t.auteur_id || null, date: t.cree_le })),
    ventes,
    commandes: p.commandes.map((c) => {
      const h = (evts.get(c.id) || []).map((e) => (e.type === "statut" ? { statut: e.statut, date: e.cree_le } : { type: e.type, texte: e.texte, date: e.cree_le }));
      return {
        id: c.id, venteId: c.vente_id, numero: c.numero, statut: c.statut, adresseLivraison: c.adresse_livraison || "", note: c.note || "", jetonRecu: c.jeton_recu || null,
        canal: c.canal || "boutique", fraisLivraison: Number(c.frais_livraison) || 0, contactTel: c.contact_telephone || "", contactEmail: c.contact_email || "",
        numeroTicket: c.numero_ticket || null, typeVente: c.type_vente || "b2c", ticketRemisLe: c.ticket_remis_le || null,
        // Livraison : colis à livrer (sinon retrait sur place), livreur, date prévue, échecs
        livraison: !!c.livraison, livreurId: c.livreur_id || null, livraisonPrevue: c.livraison_prevue || null, tentatives: c.livraison_tentatives || 0, livreeLe: c.livree_le || null,
        historique: h.length ? h : [{ statut: c.statut, date: venteDate.get(c.vente_id) || c.maj_le }],
      };
    }),
    investissements: p.investissements.map((i) => ({ id: i.id, libelle: i.libelle, categorie: i.categorie, montant: i.montant, date: String(i.date_invest).slice(0, 10) })),
    depenses: (p.depenses || []).map((x) => ({ id: x.id, libelle: x.libelle, categorie: x.categorie, montant: x.montant, date: String(x.date_depense).slice(0, 10), note: x.note || "", auteurId: x.auteur_id, auteur: x.auteur || "", creeLe: x.cree_le })),
    boutique: { ...boutiqueParDefaut(), ...(p.boutique || {}) },
  };
}

const clientVersServeur = (c) => ({ nom: c.nom, telephone: c.tel, email: c.email || "", ville: c.ville || "", statut: c.statut, notes: c.notes || "", consentement_marketing: c.consentement ? 1 : 0 });
const packVersServeur = (p) => ({ nom: p.nom, description: p.desc || "", prix: p.prix, cout: p.cout ?? null, stock: p.stock, sku: p.sku || "", emoji: p.emoji, teinte: p.teinte, actif: p.actif !== false, image: p.image ?? null,
  contenu: p.contenu || "", prix_promo: p.prixPromo ?? null, promo_fin: p.promoFin || null, seuil_alerte: p.seuilAlerte ?? STOCK_FAIBLE,
  categorie: p.categorie || "", pieces_par_lot: Math.max(1, Number(p.pieces) || 1) });

/* Promotion en cours ? (même règle que le serveur : lib/prix.js) */
const promoActive = (p) => p?.prixPromo != null && p.prixPromo > 0 && p.prixPromo < p.prix && (!p.promoFin || new Date(p.promoFin) > new Date());
const prixEffectif = (p) => (promoActive(p) ? p.prixPromo : p?.prix || 0);
const seuilDe = (p) => p?.seuilAlerte ?? STOCK_FAIBLE;
/* Adresse publique de la boutique ; avec l'identifiant d'un vendeur, les commandes passées par ce lien lui sont attribuées */
const lienBoutique = (d, vendeurId) => (d?.espace?.slug ? `${location.origin}/#/boutique/${d.espace.slug}${vendeurId ? "?v=" + vendeurId : ""}` : null);
const investVersServeur = (i) => ({ libelle: i.libelle, categorie: i.categorie, montant: i.montant, date_invest: i.date });

function versServeur(d) {
  return {
    clients: d.clients.map((c) => ({ id: c.id, ...clientVersServeur(c), cree_le: localIso(c.dateAjout || isoDate(new Date())) })),
    packs: d.packs.map((p) => ({ id: p.id, ...packVersServeur(p), actif: p.actif !== false ? 1 : 0 })),
    ventes: d.ventes.map((v) => ({ id: v.id, commande_id: v.commandeId || null, client_id: v.clientId, pack_id: v.packId, quantite: v.qte, prix_unitaire: v.prixUnitaire, mode_paiement: v.paiement, date_vente: localIso(v.date, v.heure),
      statut_paiement: v.statutPaiement || "payee", montant_recu: v.montantRecu ?? null, reference_paiement: v.reference || null, telephone_paiement: v.telPaiement || null })),
    commandes: d.commandes.map((c) => ({ id: c.id, vente_id: c.venteId, numero: c.numero, statut: c.statut, adresse_livraison: c.adresseLivraison || "", note: c.note || "", jeton_recu: c.jetonRecu || null,
      canal: c.canal || "boutique", frais_livraison: c.fraisLivraison || 0, contact_telephone: c.contactTel || null, contact_email: c.contactEmail || null,
      numero_ticket: c.numeroTicket || null, type_vente: c.typeVente || "b2c", ticket_remis_le: c.ticketRemisLe || null,
      livraison: c.livraison ? 1 : 0, livreur_id: c.livreurId || null, livraison_prevue: c.livraisonPrevue || null, livraison_tentatives: c.tentatives || 0, livree_le: c.livreeLe || null })),
    livreurs: (d.livreurs || []).map((l) => ({ id: l.id, nom: l.nom, telephone: l.tel, zone: l.zone || null, actif: l.actif === false ? 0 : 1 })),
    tickets: (d.tickets || []).map((t) => ({ commande_id: t.commandeId, action: t.action, cree_le: t.date })),
    evenements: d.commandes.flatMap((c) => (c.historique || []).map((e) => ({ commande_id: c.id, type: e.type || "statut", statut: e.statut || null, texte: e.texte || null, cree_le: new Date(e.date).toISOString() }))),
    investissements: d.investissements.map((i) => ({ id: i.id, ...investVersServeur(i) })),
    boutique: d.boutique,
  };
}

/* ---------- Opérations sur les données ---------- */
/* Lignes (ventes) d'une commande — une ou plusieurs */
const lignesDe = (d, c) => {
  const l = d.ventes.filter((v) => v.commandeId === c.id);
  return l.length ? l : d.ventes.filter((v) => v.id === c.venteId);
};

function applyStatut(d, ids, statut) {
  const set = new Set(ids);
  const now = new Date().toISOString();
  let packs = d.packs;
  const commandes = d.commandes.map((c) => {
    if (!set.has(c.id) || c.statut === statut) return c;
    for (const v of lignesDe(d, c)) {
      const art = v.qte * (d.packs.find((p) => p.id === v.packId)?.pieces || 1);
      const delta = statut === "annulee" ? art : c.statut === "annulee" ? -art : 0;
      if (delta) packs = packs.map((p) => (p.id === v.packId ? { ...p, stock: Math.max(0, p.stock + delta) } : p));
    }
    return { ...c, statut, historique: [...(c.historique || []), { statut, date: now }] };
  });
  return { ...d, commandes, packs };
}

function deleteCommande(d, id) {
  const c = d.commandes.find((x) => x.id === id);
  if (!c) return d;
  const lignes = lignesDe(d, c);
  let packs = d.packs;
  if (c.statut !== "annulee") for (const v of lignes) packs = packs.map((p) => (p.id === v.packId ? { ...p, stock: p.stock + v.qte * (p.pieces || 1) } : p));
  const ids = new Set(lignes.map((v) => v.id));
  return { ...d, packs, commandes: d.commandes.filter((x) => x.id !== id), ventes: d.ventes.filter((x) => !ids.has(x.id)) };
}

/* Numéro de ticket provisoire (mode démo ; connecté, c'est le serveur qui numérote) */
function nextTicket(d) {
  const max = d.commandes.reduce((m, c) => Math.max(m, parseInt(String(c.numeroTicket || "").replace(/\D/g, ""), 10) || 0), 0);
  return "T-" + String(max + 1).padStart(6, "0");
}

function nextNumero(d) {
  const max = d.commandes.reduce((m, c) => Math.max(m, parseInt(String(c.numero).replace(/\D/g, ""), 10) || 0), 1000);
  return "#" + (max + 1);
}

function enrichVentes(d) {
  const parId = new Map(d.commandes.map((c) => [c.id, c]));
  const parVente = new Map(d.commandes.map((c) => [c.venteId, c]));
  const cl = new Map(d.clients.map((c) => [c.id, c]));
  const pk = new Map(d.packs.map((p) => [p.id, p]));
  return d.ventes.map((v) => ({ ...v, total: v.qte * v.prixUnitaire, commande: parId.get(v.commandeId) || parVente.get(v.id), client: cl.get(v.clientId), pack: pk.get(v.packId) }));
}
const isValid = (v) => v.commande?.statut !== "annulee";

function enrichCommandes(d) {
  const vt = new Map(d.ventes.map((v) => [v.id, v]));
  const parCommande = new Map();
  for (const v of d.ventes) if (v.commandeId) { if (!parCommande.has(v.commandeId)) parCommande.set(v.commandeId, []); parCommande.get(v.commandeId).push(v); }
  const cl = new Map(d.clients.map((c) => [c.id, c]));
  const pk = new Map(d.packs.map((p) => [p.id, p]));
  return d.commandes.map((c) => {
    const brutes = parCommande.get(c.id) || [vt.get(c.venteId)].filter(Boolean);
    // pieces : articles réellement sortis (2 lots de 3 = 6 articles)
    const lignes = brutes.map((v) => ({ ...v, pack: pk.get(v.packId), total: v.qte * v.prixUnitaire, pieces: v.qte * (pk.get(v.packId)?.pieces || 1) }));
    const vente = lignes[0];
    const sousTotal = lignes.reduce((s, l) => s + l.total, 0);
    const frais = Number(c.fraisLivraison) || 0;
    return {
      ...c, vente, lignes, client: cl.get(vente?.clientId), pack: vente?.pack,
      sousTotal, frais, total: sousTotal + frais, articles: lignes.reduce((s, l) => s + l.qte, 0), pieces: lignes.reduce((s, l) => s + l.pieces, 0), stamp: venteStamp(vente),
    };
  });
}
/* Libellé court du contenu d'une commande */
const resumeCommande = (c) => (c.lignes?.length > 1 ? `${c.lignes.length} produits · ${c.articles} articles` : `${c.pack?.nom || "Produit supprimé"} × ${c.vente?.qte ?? 0}`);

function clientStats(d, clientId) {
  const vs = enrichVentes(d).filter((v) => v.clientId === clientId);
  const valid = vs.filter(isValid);
  const total = valid.reduce((s, v) => s + v.total, 0);
  const last = vs.map(venteStamp).sort().pop();
  return { ventes: vs, nb: vs.length, total, panier: valid.length ? total / valid.length : 0, last };
}

function computeTodo(d) {
  const count = (s) => d.commandes.filter((c) => c.statut === s).length;
  return {
    attente: count("en_attente"),
    aEncaisser: enrichCommandes(d).filter((c) => c.vente?.statutPaiement === "en_attente" && c.statut !== "annulee"),
    aVerifier: enrichCommandes(d).filter((c) => c.vente?.statutPaiement === "a_verifier" && c.statut !== "annulee"),
    enLigne: d.commandes.filter((c) => c.canal === "en_ligne" && c.statut === "en_attente").length,
    aExpedier: count("confirmee"),
    enLivraison: count("expediee"),
    faible: d.packs.filter((p) => p.actif !== false && p.stock > 0 && p.stock <= seuilDe(p)),
    rupture: d.packs.filter((p) => p.actif !== false && p.stock <= 0),
  };
}

function computeDashboard(d, days) {
  const T0 = today();
  const start = addDays(T0, -(days - 1));
  const pStart = addDays(start, -days);
  const vs = enrichVentes(d).filter(isValid);
  const inR = (s, a, b) => { const t = parseDate(s); return t >= a && t <= b; };
  const cur = vs.filter((v) => inR(v.date, start, T0));
  const prev = vs.filter((v) => inR(v.date, pStart, addDays(start, -1)));
  const sum = (a) => a.reduce((s, v) => s + v.total, 0);

  const byDay = new Map();
  vs.forEach((v) => { const o = byDay.get(v.date) || { t: 0, n: 0, q: 0 }; o.t += v.total; o.n += 1; o.q += v.qte; byDay.set(v.date, o); });
  const newByDay = new Map();
  d.clients.forEach((c) => c.dateAjout && newByDay.set(c.dateAjout, (newByDay.get(c.dateAjout) || 0) + 1));

  const series = [...Array(days)].map((_, i) => {
    const key = isoDate(addDays(start, i));
    const pk = isoDate(addDays(pStart, i));
    const o = byDay.get(key) || { t: 0, n: 0, q: 0 };
    return { date: key, value: o.t, prev: (byDay.get(pk) || { t: 0 }).t, n: o.n, q: o.q, nc: newByDay.get(key) || 0 };
  });

  const ca = sum(cur), caPrev = sum(prev);
  const nb = cur.length, nbPrev = prev.length;
  const panier = nb ? ca / nb : 0, panierPrev = nbPrev ? caPrev / nbPrev : 0;
  const nc = d.clients.filter((c) => c.dateAjout && inR(c.dateAjout, start, T0)).length;
  const ncPrev = d.clients.filter((c) => c.dateAjout && inR(c.dateAjout, pStart, addDays(start, -1))).length;
  const delta = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

  const byPack = new Map();
  cur.forEach((v) => { const o = byPack.get(v.packId) || { pack: v.pack, qte: 0, total: 0 }; o.qte += v.qte; o.total += v.total; byPack.set(v.packId, o); });
  const top = [...byPack.values()].filter((o) => o.pack).sort((a, b) => b.total - a.total).slice(0, 5);

  const paiements = [...PAIEMENTS, ...Object.values(PAIEMENTS_ANCIENS).slice(0, 1)]
    .map((p) => ({ label: p.court, color: p.color, value: cur.filter((v) => infoPaiement(v.statutPaiement === "en_attente" ? "Paiement à la livraison" : v.paiement).key === p.key).reduce((s, v) => s + v.total, 0) }))
    .filter((p) => p.value > 0);

  return {
    series, ca, nb, panier, nc, top, paiements,
    dCa: delta(ca, caPrev), dNb: delta(nb, nbPrev), dPanier: delta(panier, panierPrev), dNc: delta(nc, ncPrev),
  };
}

/* =====================================================================
   Contexte & hooks
   ===================================================================== */
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = h.split("?");
  const [page = "accueil", id = null] = path.split("/").filter(Boolean);
  return { page: decodeURIComponent(page), id: id ? decodeURIComponent(id) : null, query: Object.fromEntries(new URLSearchParams(qs)) };
}
function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const f = () => setRoute(parseHash());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const go = useCallback((page, id, query) => {
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    window.location.hash = "/" + page + (id ? "/" + encodeURIComponent(id) : "") + qs;
  }, []);
  return [route, go];
}

function usePresence(open, ms = 200) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, ms);
    return () => clearTimeout(t);
  }, [open]);
  return [mounted, closing];
}

/* Pile des calques ouverts : Échap ne ferme que le plus haut */
const layerStack = [];
function useEscape(active, onEsc) {
  const idRef = useRef(nextId("layer"));
  const cb = useRef(onEsc);
  cb.current = onEsc;
  useEffect(() => {
    if (!active) return;
    const id = idRef.current;
    layerStack.push(id);
    const h = (e) => {
      if (e.key === "Escape" && layerStack[layerStack.length - 1] === id) { e.preventDefault(); cb.current?.(); }
    };
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      const i = layerStack.lastIndexOf(id);
      if (i >= 0) layerStack.splice(i, 1);
    };
  }, [active]);
}

function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const fromRef = useRef(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); fromRef.current = target; return; }
    const from = fromRef.current;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      setValue(v);
      fromRef.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}
const CountUp = ({ value, format = fmtNum }) => <span className="num">{format(useCountUp(value))}</span>;

/* Indicateur glissant pour Segmented / Tabs */
function useIndicator(dep) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ opacity: 0 });
  const measure = useCallback(() => {
    const el = ref.current?.querySelector('[data-active="true"]');
    if (!el) { setStyle((s) => (s.opacity === 0 ? s : { opacity: 0 })); return; }
    const next = { width: el.offsetWidth, transform: `translateX(${el.offsetLeft}px)`, opacity: 1 };
    setStyle((s) => (s.width === next.width && s.transform === next.transform && s.opacity === 1 ? s : next));
  }, []);
  useLayoutEffect(measure);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure]);
  return [ref, style];
}

function usePaged(rows, per, resetKey) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const p = Math.min(page, pages);
  return {
    slice: rows.slice((p - 1) * per, p * per), page: p, pages, setPage, total: rows.length,
    from: rows.length ? (p - 1) * per + 1 : 0, to: Math.min(p * per, rows.length),
  };
}

function useSort(initialKey, initialDir = "desc") {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir });
  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "nom" || key === "client" ? "asc" : "desc" }));
  const apply = (rows, getters) => {
    const g = getters[sort.key];
    if (!g) return rows;
    const m = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = g(a), y = g(b);
      return (typeof x === "string" ? x.localeCompare(y, "fr") : x - y) * m;
    });
  };
  return { sort, toggle, apply, set: setSort };
}

/* =====================================================================
   Composants d'interface
   ===================================================================== */
function Btn({ children, variant = "secondary", size, icon: Icon, iconRight: IconR, loading, full, className, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx("btn", `btn-${variant}`, size && `btn-${size}`, full && "btn-full", !children && "btn-icon", loading && "is-loading", className)}
    >
      {loading && <span className="spinner" />}
      {Icon && <Icon size={size === "sm" ? 14 : 16} strokeWidth={2.2} />}
      {children && <span>{children}</span>}
      {IconR && <IconR size={14} strokeWidth={2.2} />}
    </button>
  );
}

const Badge = ({ tone = "neutral", children, dot, icon: Icon, className }) => (
  <span className={cx("badge", `badge-${tone}`, className)}>
    {dot && <span className="badge-dot" />}
    {Icon && <Icon size={12} strokeWidth={2.4} />}
    {children}
  </span>
);
const StatutBadge = ({ statut }) => {
  const s = STATUTS[statut] || STATUTS.en_attente;
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
};
const PaiementBadge = ({ c }) => {
  const sp = c?.vente?.statutPaiement || "payee";
  if (c?.statut === "annulee") return <Badge tone="neutral" dot>{sp === "payee" ? "Remboursée" : "Non payée"}</Badge>;
  if (sp === "en_attente") return <Badge tone="warning" dot>Paiement en attente</Badge>;
  if (sp === "a_verifier") return <Badge tone="critical" dot>Paiement à vérifier</Badge>;
  if (sp === "en_cours") return <Badge tone="info" dot>Paiement en ligne en cours</Badge>;
  if (sp === "echoue") return <Badge tone="critical" dot>Paiement échoué</Badge>;
  return <Badge tone="neutral" dot>Payée</Badge>;
};
const CanalBadge = ({ c }) => (c?.canal === "en_ligne" ? <Badge tone="magic" icon={ShoppingBag}>En ligne</Badge> : null);
const StockBadge = ({ stock, seuil = STOCK_FAIBLE }) => (stock <= 0 ? <Badge tone="critical">Rupture</Badge> : stock <= seuil ? <Badge tone="warning">{stock} en stock</Badge> : <Badge tone="success">{stock} en stock</Badge>);

const Delta = ({ value }) => (value == null
  ? <span className="delta neutral">—</span>
  : <span className={cx("delta", value >= 0 ? "up" : "down")}>{value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(value).toFixed(0)} %</span>);

function Card({ title, sub, actions, children, className, padded = true, style, onClick }) {
  return (
    <section className={cx("card", onClick && "interactive", className)} style={style} onClick={onClick}>
      {(title || actions) && (
        <header className="card-head">
          <div className="grow"><h2 className="card-title">{title}</h2>{sub && <p className="card-sub">{sub}</p>}</div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {padded ? <div className="card-body">{children}</div> : children}
    </section>
  );
}

function Field({ label, help, error, children, optional, className }) {
  return (
    <div className={cx("field", error && "has-error", className)}>
      {label && <label className="label">{label}{optional && <span className="optional"> (facultatif)</span>}</label>}
      {children}
      {error ? <div className="field-error"><AlertCircle size={14} />{error}</div> : help ? <div className="help">{help}</div> : null}
    </div>
  );
}
function Input({ prefix, suffix, icon: Icon, className, size, ...rest }) {
  return (
    <div className={cx("input-wrap", size === "lg" && "input-lg", className)}>
      {Icon && <Icon size={16} className="input-icon" />}
      {prefix && <span className="input-affix">{prefix}</span>}
      <input className="input" {...rest} />
      {suffix && <span className="input-affix">{suffix}</span>}
    </div>
  );
}
const Select = ({ children, className, ...rest }) => (
  <div className={cx("select-wrap", className)}>
    <select className="select" {...rest}>{children}</select>
    <ChevronDown size={16} className="select-icon" />
  </div>
);
const SearchInput = ({ value, onChange, placeholder, autoFocus }) => (
  <div className="input-wrap search">
    <Search size={16} className="input-icon" />
    <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
    {value && <button className="input-clear" onClick={() => onChange("")} aria-label="Effacer"><X size={13} /></button>}
  </div>
);

const Checkbox = ({ checked, indeterminate, onChange, label }) => (
  <label className="checkbox" onClick={(e) => e.stopPropagation()}>
    <input type="checkbox" checked={!!checked} ref={(el) => el && (el.indeterminate = !!indeterminate)} onChange={(e) => onChange(e.target.checked)} />
    <span className="checkbox-box">{indeterminate ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}</span>
    {label && <span>{label}</span>}
  </label>
);

const Switch = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx("switch", on && "on")} onClick={() => onChange(!on)} />
);

function Segmented({ options, value, onChange, full }) {
  const [ref, ind] = useIndicator(value);
  return (
    <div className={cx("segmented", full && "full")} ref={ref} role="tablist">
      <span className="seg-indicator" style={ind} />
      {options.map((o) => (
        <button key={String(o.value)} role="tab" data-active={o.value === value} aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

function Tabs({ tabs, value, onChange }) {
  const [ref, ind] = useIndicator(value);
  return (
    <div className="tabs" ref={ref} role="tablist">
      <span className="seg-indicator" style={ind} />
      {tabs.map((t) => (
        <button key={t.key} role="tab" data-active={t.key === value} aria-selected={t.key === value} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

const Avatar = ({ name, size = "md" }) => <span className={cx("avatar", size !== "md" && `avatar-${size}`, `tint-${toneOf(name)}`)}>{initials(name)}</span>;
/* Image téléversée (servie par l'API) ou vignette de secours */
const urlImage = (img) => (img && img.startsWith("/uploads/") ? API_BASE + img : img);
const Thumb = ({ pack, size = "md" }) => (pack?.image
  ? <span className={cx("thumb thumb-img", size !== "md" && `thumb-${size}`)}><img src={urlImage(pack.image)} alt="" loading="lazy" /></span>
  : <span className={cx("thumb", size !== "md" && `thumb-${size}`, `tint-${pack?.teinte ?? 6}`)}>{pack?.emoji || "📦"}</span>);

const EmptyState = ({ icon: Icon = Inbox, title, children, action }) => (
  <div className="empty">
    <div className="empty-icon"><Icon size={26} /></div>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action}
  </div>
);

const Pager = ({ pg }) => (pg.pages <= 1 ? null : (
  <div className="pager">
    <span>{pg.from}–{pg.to} sur {pg.total}</span>
    <div className="pager-btns">
      <Btn size="sm" icon={ChevronLeft} disabled={pg.page <= 1} onClick={() => pg.setPage(pg.page - 1)} aria-label="Page précédente" />
      <Btn size="sm" icon={ChevronRight} disabled={pg.page >= pg.pages} onClick={() => pg.setPage(pg.page + 1)} aria-label="Page suivante" />
    </div>
  </div>
));

function SortTh({ label, k, sort, onSort, className }) {
  const on = sort.sort.key === k;
  return (
    <th className={cx("sortable", on && "sorted", className)} onClick={() => onSort(k)}>
      {label}<ArrowUpDown size={12} className="sort-ic" />
    </th>
  );
}

function Stepper({ value, onChange, min = 1, max = 999 }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuer"><Minus size={14} /></button>
      <input value={value} inputMode="numeric" aria-label="Quantité"
        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); onChange(Math.min(max, Math.max(min, isNaN(n) ? min : n))); }} />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Augmenter"><Plus size={14} /></button>
    </div>
  );
}

function PageHeader({ title, back, badges, meta, actions }) {
  return (
    <div className="page-head">
      {back && <button className="back-btn" onClick={back} aria-label="Retour"><ArrowLeft size={18} /></button>}
      <div className="page-head-main">
        <div className="page-title-row"><h1 className="page-title">{title}</h1>{badges}</div>
        {meta && <div className="page-meta">{meta}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/* ---------- Modale ---------- */
function Modal({ open, onClose, title, children, footer, size = "md", className, hideHeader }) {
  const [mounted, closing] = usePresence(open, 200);
  const kept = useRef({});
  if (open) kept.current = { title, children, footer };
  useEscape(open, onClose);
  const ref = useRef(null);
  useEffect(() => {
    if (!open || !mounted) return;
    const t = setTimeout(() => {
      // Sur mobile, on évite d'ouvrir le clavier automatiquement (sauf champ marqué data-autofocus)
      const el = ref.current?.querySelector("[data-autofocus]")
        || (window.innerWidth > 768 ? ref.current?.querySelector("input:not([type=checkbox]):not([type=file]), textarea") : null);
      el?.focus({ preventScroll: true });
    }, 80);
    return () => clearTimeout(t);
  }, [open, mounted]);
  if (!mounted) return null;
  const k = kept.current;
  return createPortal(
    <div className={cx("overlay", closing && "closing")}>
      <div className="backdrop" onMouseDown={onClose} />
      <div ref={ref} className={cx("modal", `modal-${size}`, className)} role="dialog" aria-modal="true" aria-label={typeof k.title === "string" ? k.title : undefined}>
        {!hideHeader && (
          <div className="modal-head">
            <h2>{k.title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
          </div>
        )}
        {hideHeader ? k.children : <div className="modal-body">{k.children}</div>}
        {k.footer && <div className="modal-foot">{k.footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

function Drawer({ open, onClose, children }) {
  const [mounted, closing] = usePresence(open, 220);
  useEscape(open, onClose);
  if (!mounted) return null;
  return createPortal(
    <div className={cx("overlay drawer-overlay", closing && "closing")}>
      <div className="backdrop" onMouseDown={onClose} />
      <aside className="drawer">{children}</aside>
    </div>,
    document.body,
  );
}

function Popover({ open, onClose, trigger, children, align = "end", className }) {
  const ref = useRef(null);
  const [mounted, closing] = usePresence(open, 140);
  useEscape(open, onClose);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  return (
    <div className="pop-anchor" ref={ref}>
      {trigger}
      {mounted && <div className={cx("popover", `pop-${align}`, closing && "closing", className)}>{children}</div>}
    </div>
  );
}
const MenuItem = ({ icon: Icon, children, onClick, tone, hint }) => (
  <button className={cx("menu-item", tone && `tone-${tone}`)} onClick={onClick}>
    {Icon && <Icon size={16} />}<span className="grow">{children}</span>{hint && <kbd>{hint}</kbd>}
  </button>
);

function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onClose={() => setOpen(false)}
      trigger={<Btn icon={MoreHorizontal} iconRight={ChevronDown} onClick={() => setOpen((o) => !o)}>Plus d'actions</Btn>}>
      {items.filter(Boolean).map((it, i) => it === "sep" ? <div key={i} className="pop-sep" /> : (
        <MenuItem key={i} icon={it.icon} tone={it.tone} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</MenuItem>
      ))}
    </Popover>
  );
}

/* ---------- Toasts ---------- */
function ToastItem({ t, onDismiss }) {
  const [leaving, setLeaving] = useState(false);
  const duration = t.duration || 4200;
  const close = useCallback(() => { setLeaving(true); setTimeout(() => onDismiss(t.id), 200); }, [t.id, onDismiss]);
  const timer = useRef(null);
  const startTimer = () => { clearTimeout(timer.current); timer.current = setTimeout(close, duration); };
  useEffect(() => { startTimer(); return () => clearTimeout(timer.current); }, []);
  const Icon = t.tone === "critical" ? AlertCircle : t.tone === "info" ? Info : CheckCircle2;
  return (
    <div className={cx("toast", t.tone && `toast-${t.tone}`, leaving && "leaving")} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={startTimer}>
      <Icon size={18} className="toast-icon" />
      <div className="toast-text"><strong>{t.title}</strong>{t.desc && <span>{t.desc}</span>}</div>
      {t.action && <button className="toast-action" onClick={() => { t.action.onClick(); close(); }}>{t.action.label}</button>}
      <button className="toast-close" onClick={close} aria-label="Fermer"><X size={15} /></button>
      <span className="toast-bar" style={{ animationDuration: duration + "ms" }} />
    </div>
  );
}
const Toasts = ({ items, onDismiss }) => createPortal(
  <div className="toasts" role="status" aria-live="polite">
    {items.map((t) => <ToastItem key={t.id} t={t} onDismiss={onDismiss} />)}
  </div>,
  document.body,
);

function ConfirmDialog({ state, onDone }) {
  return (
    <Modal open={!!state} onClose={() => onDone(false)} title={state?.title} size="sm"
      footer={<>
        <Btn onClick={() => onDone(false)}>Annuler</Btn>
        <Btn variant={state?.tone === "critical" ? "critical" : "primary"} onClick={() => onDone(true)} data-autofocus>{state?.confirmLabel || "Confirmer"}</Btn>
      </>}>
      <p className="confirm-text">{state?.message}</p>
    </Modal>
  );
}

/* =====================================================================
   Graphiques (SVG natif, animés)
   ===================================================================== */
function niceMax(v) {
  if (v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.clientWidth);
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function AreaChart({ points, height = 240, compare = true, color = "var(--c-blue)" }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = useMemo(() => nextId("grad"), []);
  const n = points.length;
  const P = { l: 44, r: 10, t: 12, b: 26 };
  const iw = Math.max(10, w - P.l - P.r), ih = height - P.t - P.b;
  const max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.value, compare ? p.prev : 0))));
  const x = (i) => P.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => P.t + ih - (v / max) * ih;
  const path = (k) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const area = n ? `${path("value")} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";
  const step = Math.max(1, Math.ceil(n / (w < 500 ? 4 : 7)));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const i = Math.round(((px - P.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hp = hover != null ? points[hover] : null;
  const tipLeft = hover != null ? Math.min(Math.max(x(hover), 90), w - 90) : 0;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} onMouseMove={onMove} onTouchMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line className="grid-line" x1={P.l} x2={w - P.r} y1={y(max * f)} y2={y(max * f)} />
              <text className="axis-label" x={P.l - 8} y={y(max * f) + 4} textAnchor="end">{fmtShort(max * f)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % step === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= step / 2) ? (
            <text key={p.date} className="axis-label" x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
              {parseDate(p.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </text>
          ) : null)}
          {compare && <path d={path("prev")} fill="none" style={{ stroke: "var(--chart-prev)" }} strokeWidth="2" strokeDasharray="4 4" strokeLinejoin="round" />}
          <path className="area" d={area} style={{ fill: `url(#${gid})` }} />
          <path className="draw" pathLength="1" d={path("value")} fill="none" style={{ stroke: color }} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {hp && (
            <g>
              <line className="hover-line" x1={x(hover)} x2={x(hover)} y1={P.t} y2={P.t + ih} />
              {compare && <circle cx={x(hover)} cy={y(hp.prev)} r="4" style={{ fill: "var(--surface)", stroke: "var(--chart-prev)" }} strokeWidth="2" />}
              <circle cx={x(hover)} cy={y(hp.value)} r="5" style={{ fill: "var(--surface)", stroke: color }} strokeWidth="2.5" />
            </g>
          )}
        </svg>
      )}
      {hp && (
        <div className="chart-tip" style={{ left: tipLeft, transform: "translateX(-50%)" }}>
          <div className="tip-date">{parseDate(hp.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })}</div>
          <div className="tip-row"><i style={{ background: color }} />Ventes<b>{fmt(hp.value)}</b></div>
          {compare && <div className="tip-row"><i style={{ background: "var(--chart-prev)" }} />Période préc.<b>{fmt(hp.prev)}</b></div>}
        </div>
      )}
    </div>
  );
}

function Sparkline({ values, color = "var(--c-blue)" }) {
  const gid = useMemo(() => nextId("sp"), []);
  const n = values.length;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / Math.max(1, n - 1)) * 100, 36 - (v / max) * 30 - 2]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line} L100,36 L0,36 Z`} style={{ fill: `url(#${gid})` }} />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Donut({ items, size = 168, thickness = 22, format = fmt, centerLabel = "Total" }) {
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(null);
  useEffect(() => { const r = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(r); }, []);
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  const shown = active != null ? items[active] : null;
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "var(--surface-3)" }} strokeWidth={thickness} />
          {total > 0 && items.map((it, i) => {
            const len = (it.value / total) * C;
            const gap = items.filter((x) => x.value > 0).length > 1 ? 2 : 0;
            const seg = (
              <circle key={it.label} className="seg" cx={size / 2} cy={size / 2} r={r} fill="none"
                style={{ stroke: it.color, opacity: active != null && active !== i ? 0.35 : 1 }}
                strokeWidth={active === i ? thickness + 4 : thickness}
                strokeDasharray={ready ? `${Math.max(0, len - gap)} ${C}` : `0 ${C}`}
                strokeDashoffset={ready ? -acc : 0}
                onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
            );
            acc += len;
            return seg;
          })}
        </svg>
        <div className="donut-center">
          <div>
            <strong>{shown ? format(shown.value) : format(total)}</strong>
            <span>{shown ? `${shown.label} · ${total ? Math.round((shown.value / total) * 100) : 0} %` : centerLabel}</span>
          </div>
        </div>
      </div>
      <div className="donut-legend">
        {items.map((it, i) => (
          <div key={it.label} className={cx(active === i && "active")} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <i style={{ background: it.color }} />{it.label}<b>{total ? Math.round((it.value / total) * 100) : 0} %</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupedBars({ groups, series }) {
  const max = niceMax(Math.max(1, ...groups.flatMap((g) => g.values)));
  return (
    <div>
      <div className="bars">
        {groups.map((g, gi) => (
          <div className={cx("bar-group", gi === 0 && "first", gi === groups.length - 1 && "last")} key={g.label}>
            {g.values.map((v, si) => (
              <div key={si} className="bar" style={{ height: `${(v / max) * 100}%`, background: series[si].color, "--i": gi * 2 + si }} />
            ))}
            <div className="chart-tip">
              <div className="tip-date">{g.full || g.label}</div>
              {series.map((s, si) => <div className="tip-row" key={s.label}><i style={{ background: s.color }} />{s.label}<b>{fmt(g.values[si])}</b></div>)}
            </div>
          </div>
        ))}
      </div>
      <div className="bar-labels">{groups.map((g) => <span key={g.label}>{g.label}</span>)}</div>
    </div>
  );
}

/* =====================================================================
   Coque de l'application : barre du haut, navigation
   ===================================================================== */
const NAV = [
  { key: "accueil", label: "Accueil", icon: Home },
  { key: "commandes", label: "Commandes", icon: ShoppingCart, badge: (d) => d.commandes.filter((c) => c.statut === "en_attente").length },
  { key: "livraisons", label: "Livraisons", icon: Truck, badge: (d) => d.commandes.filter((c) => c.livraison && !["livree", "annulee"].includes(c.statut)).length },
  { key: "produits", label: "Produits", icon: Tag, admin: true },
  { key: "stocks", label: "Stocks", icon: Boxes, admin: true, badge: (d) => d.packs.filter((p) => p.actif !== false && p.stock <= seuilDe(p)).length },
  { key: "clients", label: "Clients", icon: Users, admin: true },
  { key: "diagnostics", label: "Diagnostics", icon: Sparkles, admin: true },
  { key: "formations", label: "Formations", icon: FileText, admin: true },
  { key: "depenses", label: "Dépenses", icon: Wallet, admin: true },
  { key: "ventes", label: "Ventes", icon: Receipt },
  { key: "tickets", label: "Tickets de caisse", icon: FileText, badge: (d) => d.commandes.filter((c) => c.statut !== "annulee" && !c.ticketRemisLe).length },
  { key: "vendeurs", label: "Vendeurs", icon: UserCheck, admin: true },
  { key: "marketing", label: "Marketing", icon: Megaphone, admin: true },
  { key: "finances", label: "Finances", icon: Landmark, admin: true },
];
/* Pages visibles selon le rôle : le vendeur vend, remet les tickets et suit les livraisons (ni produits, ni prix,
   ni stocks, ni dépenses, ni marketing, ni finances) */
const navPour = (estAdmin) => NAV.filter((n) => estAdmin || !n.admin);

/* Vendeur : le serveur ne transmet pas les quantités en stock (9999 = disponible, 0 = rupture) */
const stockCache = (p) => p?.stock >= 9999;
/* Le stock est compté en articles ; un « lot de 3 » vendu en sort 3. Lots encore vendables : */
const lotsDispo = (p) => (stockCache(p) ? Infinity : Math.floor(Math.max(0, Number(p?.stock) || 0) / Math.max(1, Number(p?.pieces) || 1)));
const libelleStock = (p) => (stockCache(p) ? "Disponible" : `${fmtNum(p.stock)} article${p.stock > 1 ? "s" : ""} en stock${(p.pieces || 1) > 1 ? ` · ${fmtNum(lotsDispo(p))} lot${lotsDispo(p) > 1 ? "s" : ""} de ${p.pieces}` : ""}`);

function useNotifications(data) {
  return useMemo(() => {
    const t = computeTodo(data);
    const list = [];
    if (t.attente) list.push({ id: "att", icon: Clock, tone: "tint-1", title: `${t.attente} commande${t.attente > 1 ? "s" : ""} à confirmer`, sub: "En attente de traitement", go: ["commandes", null, { statut: "en_attente" }] });
    if (t.aVerifier.length) list.push({ id: "ver", icon: ShieldCheck, tone: "tint-3", title: `${t.aVerifier.length} paiement${t.aVerifier.length > 1 ? "s" : ""} Mobile Money à vérifier`, sub: "Transferts déclarés par des clients en ligne", go: ["commandes", t.aVerifier[0].id] });
    if (t.enLigne) list.push({ id: "web", icon: ShoppingBag, tone: "tint-0", title: `${t.enLigne} nouvelle${t.enLigne > 1 ? "s" : ""} commande${t.enLigne > 1 ? "s" : ""} en ligne`, sub: "Passées sur la boutique client", go: ["commandes", null, { statut: "en_attente" }] });
    if (t.aEncaisser.length) list.push({ id: "enc", icon: Banknote, tone: "tint-1", title: `${t.aEncaisser.length} paiement${t.aEncaisser.length > 1 ? "s" : ""} à encaisser`, sub: `${fmt(t.aEncaisser.reduce((x, v) => x + v.total, 0))} en attente (livraison)`, go: ["ventes", null, { paiement: "en_attente" }] });
    const sansTicket = data.commandes.filter((c) => c.statut !== "annulee" && !c.ticketRemisLe).length;
    if (sansTicket) list.push({ id: "tk", icon: FileText, tone: "tint-3", title: `${sansTicket} ticket${sansTicket > 1 ? "s" : ""} non remis`, sub: "Vente sans ticket remis au client", go: ["tickets", null, { filtre: "non_remis" }] });
    if (t.aExpedier) list.push({ id: "exp", icon: Truck, tone: "tint-2", title: `${t.aExpedier} commande${t.aExpedier > 1 ? "s" : ""} à expédier`, sub: "Confirmées, prêtes à partir", go: ["commandes", null, { statut: "confirmee" }] });
    t.rupture.forEach((p) => list.push({ id: "r" + p.id, icon: AlertTriangle, tone: "tint-3", title: `Rupture : ${p.nom}`, sub: "Réapprovisionnez ce produit", go: ["produits", p.id] }));
    t.faible.forEach((p) => list.push({ id: "f" + p.id, icon: Package, tone: "tint-7", title: `Stock faible : ${p.nom}`, sub: `Plus que ${p.stock} en stock`, go: ["produits", p.id] }));
    return list;
  }, [data]);
}

function Topbar({ onMenu }) {
  const { data, settings, openCmdk, go, logout, cycleTheme, effectiveTheme, auth, estAdmin } = useApp();
  const notifs = useNotifications(data).filter((n) => estAdmin || !["produits", "clients"].includes(n.go[0]));
  const [nOpen, setNOpen] = useState(false);
  const [uOpen, setUOpen] = useState(false);
  const closeN = useCallback(() => setNOpen(false), []);
  const closeU = useCallback(() => setUOpen(false), []);
  const ThemeIcon = settings.theme === "systeme" ? Monitor : effectiveTheme === "dark" ? Moon : Sun;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="topbar">
      <button className="topbar-icon only-mobile" onClick={onMenu} aria-label="Ouvrir le menu"><Menu size={20} /></button>
      <a className="brand" href="#/accueil"><span className="brand-mark"><ShoppingBag size={16} strokeWidth={2.4} /></span><span className="brand-name">MILANA</span></a>
      <button className="topbar-search" onClick={openCmdk}><Search size={16} /><span>Rechercher</span><kbd>{isMac ? "⌘ K" : "Ctrl K"}</kbd></button>
      <div className="topbar-right">
        <button className="topbar-icon only-mobile" onClick={openCmdk} aria-label="Rechercher"><Search size={19} /></button>
        <button className="topbar-icon hide-sm" onClick={cycleTheme} aria-label="Changer de thème" title="Changer de thème"><ThemeIcon size={18} /></button>
        <Popover open={nOpen} onClose={closeN}
          trigger={<button className="topbar-icon" onClick={() => setNOpen((o) => !o)} aria-label="Notifications"><Bell size={18} />{notifs.length > 0 && <span className="notif-dot">{notifs.length}</span>}</button>}>
          <div style={{ width: 320, maxWidth: "calc(100vw - 32px)" }}>
            <div className="pop-head">Notifications</div>
            {notifs.length === 0 && <div className="empty" style={{ padding: 24 }}><div className="empty-icon"><Bell size={22} /></div><p>Tout est à jour 🎉</p></div>}
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {notifs.map((n) => (
                <button key={n.id} className="menu-item notif-item" onClick={() => { closeN(); go(...n.go); }}>
                  <span className={cx("todo-icon", n.tone)}><n.icon size={15} /></span>
                  <span className="grow">{n.title}<small>{n.sub}</small></span>
                </button>
              ))}
            </div>
          </div>
        </Popover>
        <Popover open={uOpen} onClose={closeU}
          trigger={<button className="user-btn" onClick={() => setUOpen((o) => !o)}><span className={cx("avatar avatar-sm", `tint-${toneOf((data.boutique?.nom || "Ma Boutique"))}`)}>{initials((data.boutique?.nom || "Ma Boutique"))}</span><span className="hide-sm">{(data.boutique?.nom || "Ma Boutique")}</span></button>}>
          <div style={{ padding: "8px 10px 10px" }}>
            <div className="strong">{(data.boutique?.nom || "Ma Boutique")}</div>
            <div className="subtle">{auth?.utilisateur?.nom ? `${auth.utilisateur.nom} · ` : ""}{estAdmin ? "Administrateur" : "Vendeur"}</div>
          </div>
          <div className="pop-sep" />
          <MenuItem icon={Settings} onClick={() => { closeU(); go("parametres"); }}>Paramètres</MenuItem>
          <MenuItem icon={ThemeIcon} onClick={cycleTheme}>Thème : {settings.theme === "systeme" ? "système" : settings.theme}</MenuItem>
          <MenuItem icon={Search} hint={isMac ? "⌘K" : "Ctrl K"} onClick={() => { closeU(); openCmdk(); }}>Recherche rapide</MenuItem>
          <div className="pop-sep" />
          <MenuItem icon={LogOut} tone="critical" onClick={() => { closeU(); logout(); }}>Se déconnecter</MenuItem>
        </Popover>
      </div>
    </header>
  );
}

function SidebarNav({ onNavigate }) {
  const { route, data, openSale, estAdmin } = useApp();
  return (
    <nav className="nav">
      <div className="nav-store">
        <span className={cx("avatar avatar-sm", `tint-${toneOf((data.boutique?.nom || "Ma Boutique"))}`)}>{initials((data.boutique?.nom || "Ma Boutique"))}</span>
        <div className="grow"><strong className="truncate">{(data.boutique?.nom || "Ma Boutique")}</strong><span>{estAdmin ? "Administrateur" : "Espace vendeur"} · FCFA</span></div>
      </div>
      <Btn variant="primary" full icon={Plus} className="nav-cta" onClick={() => { onNavigate?.(); openSale(); }}>Nouvelle vente</Btn>
      {navPour(estAdmin).map((n) => {
        const badge = n.badge?.(data);
        return (
          <a key={n.key} href={"#/" + n.key} className={cx("nav-item", route.page === n.key && "active")} onClick={onNavigate}>
            <n.icon size={18} /><span>{n.label}</span>{badge > 0 && <span className="nav-badge">{badge}</span>}
          </a>
        );
      })}
      <div className="nav-spacer" />
      <a href="#/parametres" className={cx("nav-item", route.page === "parametres" && "active")} onClick={onNavigate}><Settings size={18} /><span>Paramètres</span></a>
      <div className="nav-foot">MILANA · v8.0</div>
    </nav>
  );
}

function BottomNav({ onMenu }) {
  const { route, data, openSale, estAdmin } = useApp();
  const badge = data.commandes.filter((c) => c.statut === "en_attente").length;
  const item = (key, label, Icon, b) => (
    <a href={"#/" + key} className={cx("bn-item", route.page === key && "active")}>
      <Icon size={21} />{label}{b > 0 && <span className="nav-badge">{b}</span>}
    </a>
  );
  return (
    <nav className="bottom-nav">
      {item("accueil", "Accueil", Home)}
      {item("commandes", "Commandes", ShoppingCart, badge)}
      <div className="bn-fab-wrap"><button className="bn-fab" onClick={() => openSale()} aria-label="Nouvelle vente"><Plus size={24} strokeWidth={2.5} /></button></div>
      {estAdmin ? item("clients", "Clients", Users) : item("livraisons", "Livraisons", Truck, data.commandes.filter((c) => c.livraison && !["livree", "annulee"].includes(c.statut)).length)}
      <button className="bn-item" onClick={onMenu}><Menu size={21} />Menu</button>
    </nav>
  );
}

/* ---------- Palette de commandes (Ctrl/⌘ + K) ---------- */
function CommandPalette({ open, onClose }) {
  const { data, go, openSale, cycleTheme, estAdmin } = useApp();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);
  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const groups = useMemo(() => {
    const n = norm(q.trim());
    const match = (s) => !n || norm(s).includes(n);
    const actions = [
      { id: "a-sale", label: "Nouvelle vente", icon: Plus, run: () => openSale() },
      estAdmin && { id: "a-prod", label: "Ajouter un produit", icon: Tag, run: () => go("produits", "nouveau") },
      estAdmin && { id: "a-rec", label: "Réceptionner du stock", icon: PackagePlus, run: () => go("stocks", "reception") },
      estAdmin && { id: "a-promo", label: "Lancer une promotion", icon: Percent, run: () => go("marketing", "promotion") },
      { id: "a-cli", label: "Ajouter un client", icon: UserPlus, run: () => go("clients", "nouveau") },
      estAdmin && { id: "a-inv", label: "Enregistrer une dépense", icon: Wallet, run: () => go("finances", "nouveau") },
      { id: "a-theme", label: "Changer de thème", icon: Moon, run: () => cycleTheme() },
    ].filter((a) => a && match(a.label));
    const pages = [...navPour(estAdmin), { key: "parametres", label: "Paramètres", icon: Settings }]
      .filter((p) => match(p.label)).map((p) => ({ id: "p-" + p.key, label: p.label, icon: p.icon, hint: "Aller à", run: () => go(p.key) }));
    const g = [];
    if (n) {
      const cmds = enrichCommandes(data).filter((c) => match(c.numero + " " + (c.client?.nom || ""))).sort((a, b) => b.stamp.localeCompare(a.stamp)).slice(0, 5)
        .map((c) => ({ id: "c-" + c.id, label: `Commande ${c.numero}`, sub: `${c.client?.nom || "—"} · ${fmt(c.total)}`, icon: ShoppingCart, run: () => go("commandes", c.id) }));
      const cls = data.clients.filter((c) => match(c.nom + " " + c.tel + " " + c.ville)).slice(0, 5)
        .map((c) => ({ id: "cl-" + c.id, label: c.nom, sub: c.tel + (c.ville ? " · " + c.ville : ""), icon: User, run: () => go("clients", c.id) }));
      const pks = data.packs.filter((p) => match(p.nom + " " + (p.sku || ""))).slice(0, 5)
        .map((p) => ({ id: "pk-" + p.id, label: p.nom, sub: stockCache(p) ? fmt(p.prix) : `${fmt(p.prix)} · ${p.stock} en stock`, emoji: p.emoji, run: () => go("produits", p.id) }));
      if (cls.length) g.push({ title: "Clients", items: cls });
      if (cmds.length) g.push({ title: "Commandes", items: cmds });
      if (pks.length) g.push({ title: "Produits", items: pks });
    }
    if (actions.length) g.push({ title: "Actions", items: actions });
    if (pages.length) g.push({ title: "Pages", items: pages });
    return g;
  }, [q, data]);

  const flat = groups.flatMap((g) => g.items);
  useEffect(() => setIdx(0), [q]);
  useEffect(() => { listRef.current?.querySelector(".cmdk-item.active")?.scrollIntoView({ block: "nearest" }); }, [idx]);
  const run = (it) => { onClose(); setTimeout(() => it.run(), 10); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % Math.max(1, flat.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + flat.length) % Math.max(1, flat.length)); }
    else if (e.key === "Enter" && flat[idx]) { e.preventDefault(); run(flat[idx]); }
  };

  let k = -1;
  return (
    <Modal open={open} onClose={onClose} hideHeader size="md" className="cmdk" title="Recherche">
      <div className="cmdk-input">
        <Search size={18} className="muted" />
        <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Rechercher une commande, un client, un produit…" />
        <kbd>Échap</kbd>
      </div>
      <div className="cmdk-list" ref={listRef}>
        {flat.length === 0 && <EmptyState icon={Search} title="Aucun résultat">Essayez un nom de client, un numéro de commande ou un produit.</EmptyState>}
        {groups.map((g) => (
          <div key={g.title}>
            <div className="cmdk-group">{g.title}</div>
            {g.items.map((it) => {
              k += 1;
              const i = k;
              return (
                <button key={it.id} className={cx("cmdk-item", i === idx && "active")} onMouseMove={() => setIdx(i)} onClick={() => run(it)}>
                  <span className="cmdk-ic">{it.emoji ? <span style={{ fontSize: 15 }}>{it.emoji}</span> : <it.icon size={15} />}</span>
                  <span className="grow truncate">{it.label}{it.sub && <><br /><small>{it.sub}</small></>}</span>
                  {it.hint && <span className="cmdk-hint">{it.hint}</span>}
                  {i === idx && <ChevronRight size={15} className="muted" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="cmdk-foot hide-sm"><span><kbd>↑</kbd> <kbd>↓</kbd> naviguer</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>Échap</kbd> fermer</span></div>
    </Modal>
  );
}

/* =====================================================================
   Modales métier
   ===================================================================== */
function SuccessCheck() {
  return (
    <svg className="check-anim" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r="38" />
      <path d="M26 43 l11 11 l21 -23" />
    </svg>
  );
}
function Confetti() {
  const pieces = useMemo(() => [...Array(28)].map((_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.4, dur: 1.2 + Math.random() * 0.8,
    color: ["#36d399", "#e0a12c", "#2c6ecb", "#8b5cf6", "#e8664f"][i % 5], rot: Math.random() * 360,
  })), []);
  if (prefersReducedMotion()) return null;
  return <div className="confetti">{pieces.map((p, i) => <i key={i} style={{ left: p.left + "%", background: p.color, animationDelay: p.delay + "s", animationDuration: p.dur + "s", transform: `rotate(${p.rot}deg)` }} />)}</div>;
}

/* ---------- Paiement : saisie selon le moyen utilisé ---------- */
const paiementVide = (mode = "Espèces") => ({ mode, recu: "", tel: "", ref: "" });

/* Montants « ronds » proposés pour un paiement en espèces */
function billetsProposes(total) {
  const set = new Set([total]);
  for (const pas of [500, 1000, 2000, 5000, 10000]) set.add(Math.ceil(total / pas) * pas);
  return [...set].filter((x) => x >= total).sort((a, b) => a - b).slice(0, 4);
}

function validerPaiementLocal(v, total) {
  const p = infoPaiement(v.mode);
  if (p.type === "especes" && v.recu !== "" && Number(v.recu) < total) return `Montant insuffisant : ${fmt(total)} sont dus.`;
  if (p.type === "mobile" && v.tel.replace(/\D/g, "").length < 8) return `Indiquez le numéro ${p.key} du payeur.`;
  return null;
}
/* Champs de la vente côté interface / côté API */
function paiementLocal(v, total) {
  const p = infoPaiement(v.mode);
  return {
    paiement: v.mode,
    statutPaiement: p.type === "livraison" ? "en_attente" : "payee",
    montantRecu: p.type === "especes" ? (v.recu === "" ? total : Number(v.recu)) : null,
    telPaiement: p.type === "mobile" ? v.tel.trim() : "",
    reference: p.type === "mobile" || p.type === "carte" ? v.ref.trim() : "",
  };
}
function paiementVersServeur(v, total) {
  const l = paiementLocal(v, total);
  return { mode_paiement: l.paiement, montant_recu: l.montantRecu, telephone_paiement: l.telPaiement || null, reference_paiement: l.reference || null };
}

const LIENS_PAIEMENT = { "Wave": "lien_wave", "Orange Money": "lien_orange", "MTN MoMo": "lien_mtn", "Moov Money": "lien_moov" };
function PaiementForm({ total, value, onChange, telClient, erreur, sansLivraison }) {
  const { data } = useApp();
  const p = infoPaiement(value.mode);
  // Lien de paiement réglé par l'administrateur pour cet opérateur (Paramètres › Moyens de paiement)
  const lienPaiement = p.type === "mobile" ? String(data.boutique?.[LIENS_PAIEMENT[p.key]] || "").trim() : "";
  const modes = PAIEMENTS.filter((m) => m.type !== "en_ligne" && !(sansLivraison && m.type === "livraison"));
  const recu = value.recu === "" ? null : Number(value.recu);
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="stack-sm">
      <div className="pay-grid">
        {modes.map((m) => (
          <button key={m.key} type="button" className={cx("pay-opt", value.mode === m.key && "selected")}
            onClick={() => onChange({ ...value, mode: m.key, tel: m.type === "mobile" ? value.tel || telClient || "" : value.tel })}>
            <ModePaiement mode={m.key} taille={24} /><span>{m.court}</span>
          </button>
        ))}
      </div>
      <div className="pay-detail" key={p.type}>
        {p.type === "especes" && (
          <>
            <Field label="Montant reçu du client" error={erreur}>
              <Input value={value.recu} onChange={(e) => set("recu", e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" placeholder={fmtNum(total)} />
            </Field>
            {total > 0 && <div className="chips">{billetsProposes(total).map((b) => <button key={b} type="button" className={cx("chip", recu === b && "on")} onClick={() => set("recu", String(b))}>{b === total ? "Montant exact" : fmtNum(b)}</button>)}</div>}
            <div className="monnaie"><span>Monnaie à rendre</span><strong className="num">{recu != null && recu >= total ? fmt(recu - total) : "—"}</strong></div>
          </>
        )}
        {p.type === "mobile" && (
          <>
            {lienPaiement && /^https:\/\//.test(lienPaiement) && (
              <div className="lien-caisse">
                <QrCode texte={lienPaiement} taille={140} libelle={`QR code de paiement ${p.key}`} />
                <div className="stack-sm">
                  <b>Faites scanner ce QR code au client</b>
                  <span className="subtle">Il paie {fmt(total)} avec {p.key} sur son téléphone, puis vous montre l'ID de transaction à saisir ci-dessous.</span>
                  <a className="btn btn-sm" href={lienPaiement} target="_blank" rel="noopener noreferrer"><Link2 size={14} />Ouvrir le lien</a>
                </div>
              </div>
            )}
            <Field label={`Numéro ${p.key} du payeur`} error={erreur}><Input icon={Phone} value={value.tel} onChange={(e) => set("tel", e.target.value)} placeholder="07 00 00 00 00" inputMode="tel" /></Field>
            <Field label="ID de transaction" optional help="Référence indiquée dans le SMS de confirmation de l'opérateur."><Input value={value.ref} onChange={(e) => set("ref", e.target.value)} placeholder="Ex : MP240929.1234.A5678" /></Field>
          </>
        )}
        {p.type === "carte" && (
          <Field label="N° d'autorisation" optional help="Imprimé sur le reçu du terminal de paiement (TPE)."><Input value={value.ref} onChange={(e) => set("ref", e.target.value)} placeholder="Ex : 004512" /></Field>
        )}
        {p.type === "livraison" && (
          <div className="banner banner-warning"><Truck size={16} /><div>La commande restera « paiement en attente ». Encaissez-la depuis la fiche commande à la livraison.</div></div>
        )}
      </div>
    </div>
  );
}

/* ---------- Ticket de caisse ---------- */
// Un client enregistré sans nom (« Client 0707… ») n'est pas nommé sur le ticket : son contact suffit
const nomCourt = (nom) => { if (/^Client \d/.test(String(nom || ""))) return null; const p = String(nom || "").trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || null; };

/* Ticket au format commun (même forme que GET /api/recus/:jeton) */
function construireTicket(data, c, mode) {
  const v = c.vente || {};
  const total = c.total;
  return {
    boutique: data.boutique || boutiqueParDefaut(),
    numero: c.numero,
    numero_ticket: c.numeroTicket || null,
    type_vente: c.typeVente || "b2c",
    contact: c.contactTel || c.client?.tel || null,
    adresse_livraison: c.adresseLivraison || null,
    date: localIso(v.date, v.heure),
    statut: c.statut,
    vendeur: v.vendeur ? nomCourt(v.vendeur) : null,
    client: c.client ? nomCourt(c.client.nom) : null,
    canal: c.canal,
    lignes: (c.lignes || []).map((l) => ({ nom: l.pack?.nom || "Article", quantite: l.qte, prix_unitaire: l.prixUnitaire, prix_normal: l.prixCatalogue > l.prixUnitaire ? l.prixCatalogue : null, total: l.total, pieces_par_lot: l.pack?.pieces || 1, articles: l.pieces })),
    total_articles: c.pieces,
    sous_total: c.sousTotal ?? total,
    frais_livraison: c.frais || 0,
    total,
    paiement: {
      mode: v.paiement, statut: v.statutPaiement || "payee", montant_recu: v.montantRecu ?? null,
      monnaie: v.montantRecu != null ? Math.max(0, v.montantRecu - total) : null, reference: v.reference || null,
    },
    lien: mode === "api" ? lienTicket(c.jetonRecu) : null,
  };
}

function useQr(texte) {
  const [qr, setQr] = useState(null);
  useEffect(() => {
    if (!texte) { setQr(null); return; }
    let actif = true;
    genererQr(texte).then((q) => actif && setQr(q)).catch(() => actif && setQr(null));
    return () => { actif = false; };
  }, [texte]);
  return qr;
}

function QrCode({ texte, taille = 120, libelle = "QR code du ticket" }) {
  const qr = useQr(texte);
  if (!qr) return <div className="qr-attente" style={{ width: taille, height: taille }}><span className="spinner" /></div>;
  const n = qr.getModuleCount();
  return <svg className="qr" width={taille} height={taille} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label={libelle}><rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" /><path d={cheminQr(qr)} fill="#000" /></svg>;
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
        {t.lien && (
          <div className="r-qr">
            <QrCode texte={t.lien} taille={112} />
            <div>Scannez pour télécharger<br />votre ticket</div>
          </div>
        )}
        <div className="r-center" style={{ marginTop: 8 }}>{t.boutique?.message || "Merci pour votre achat !"}</div>
      </div>
    </div>
  );
}

/* Ticket validé affiché directement en PDF (si le navigateur sait l'afficher), sinon en HTML */
function TicketPdfApercu({ t }) {
  const integrable = pdfIntegrable();
  const [url, setUrl] = useState(null);
  const [echec, setEchec] = useState(false);
  const cle = JSON.stringify(t);
  useEffect(() => {
    if (!integrable) return;
    let actif = true, u = null;
    setUrl(null);
    urlTicketPdf(t).then((x) => { u = x; if (actif) setUrl(x); else URL.revokeObjectURL(x); }).catch(() => actif && setEchec(true));
    return () => { actif = false; if (u) URL.revokeObjectURL(u); };
  }, [cle]);
  if (!integrable || echec) return <TicketCaisse t={t} />;
  if (!url) return <div className="pdf-attente"><span className="spinner" />Génération du ticket PDF…</div>;
  return <iframe className="ticket-pdf" src={url + "#toolbar=1&view=FitH"} title={`Ticket ${t.numero || ""} (PDF)`} />;
}

/* Envoi du ticket par e-mail au client */
function EmailTicketModal({ open, onClose, t, cmd, onEnvoye }) {
  const { mode, sync, toast } = useApp();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setEmail(cmd?.contactEmail || cmd?.client?.email || ""); setErr(""); setBusy(false); } }, [open]);
  const envoyer = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr("Adresse e-mail invalide."); return; }
    if (mode !== "api") {
      // Démo locale : le logiciel de messagerie de l'appareil prend le relais
      const corps = lignesTicket(t).map((l) => l.k === "ligne" ? `${l.g} : ${l.d}` : l.k === "sep" ? "----------------" : l.txt || "").join("\n");
      window.location.href = `mailto:${e}?subject=${encodeURIComponent(`Votre ticket ${t.numero_ticket || t.numero} — ${t.boutique?.nom}`)}&body=${encodeURIComponent(corps)}`;
      onEnvoye?.();
      onClose();
      return;
    }
    setBusy(true);
    const r = await sync(["POST", `/api/commandes/${cmd.id}/envoyer-email`, { email: e }]);
    setBusy(false);
    if (!r) return;
    toast({ title: r[0]?.simule ? "E-mail simulé" : "Ticket envoyé par e-mail", desc: r[0]?.simule ? "Aucun serveur e-mail (SMTP) configuré sur l'hébergement." : `À ${e}` });
    onEnvoye?.();
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Envoyer le ticket par e-mail" size="sm"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" icon={Send} loading={busy} onClick={envoyer}>Envoyer</Btn></>}>
      <div className="stack-sm">
        <p className="subtle">Le client reçoit son ticket {t.numero_ticket || t.numero} ({fmt(t.total)}) avec le lien de téléchargement du PDF.</p>
        <Field label="Adresse e-mail du client" error={err} help={cmd?.client && !cmd.client.email ? "Elle sera aussi enregistrée sur la fiche du client." : null}>
          <Input icon={Mail} type="email" value={email} onChange={(ev) => { setEmail(ev.target.value); setErr(""); }} placeholder="client@exemple.ci" data-autofocus onKeyDown={(ev) => ev.key === "Enter" && envoyer()} />
        </Field>
      </div>
    </Modal>
  );
}

/* Actions sur un ticket : chacune est journalisée (qui a imprimé / envoyé quoi, et quand).
   Un ticket est « remis » dès qu'il a été imprimé, téléchargé ou envoyé au client. */
const ACTIONS_TICKET = {
  genere: "généré", imprime: "imprimé", pdf: "PDF", whatsapp: "WhatsApp", sms: "SMS", email: "e-mail",
  lien: "lien copié", consulte_client: "consulté par le client", historique: "vente antérieure",
};
const REMISE_TICKET = new Set(["imprime", "pdf", "whatsapp", "sms", "email", "consulte_client", "historique"]);

function ActionsTicket({ t, cmd, compact }) {
  const { toast, mode, sync, update } = useApp();
  const [pdf, setPdf] = useState(false);
  const [sms, setSms] = useState(false);
  const [mail, setMail] = useState(false);
  const telephoner = cmd?.contactTel || cmd?.client?.tel;
  const texte = `${t.boutique?.nom} : merci pour votre achat (ticket ${t.numero_ticket || t.numero}, ${fmt(t.total)}).${t.lien ? " Votre ticket de caisse : " + t.lien : ""}`;
  /* Journalise l'action ; « serveur » = le serveur ne l'a pas déjà enregistrée lui-même */
  const marquer = (action, serveur = true) => {
    if (!cmd) return;
    const maintenant = new Date().toISOString();
    update((d) => ({
      ...d,
      commandes: d.commandes.map((c) => (c.id === cmd.id ? { ...c, ticketRemisLe: c.ticketRemisLe || (REMISE_TICKET.has(action) ? maintenant : null) } : c)),
      tickets: [...(d.tickets || []), { id: uid(), commandeId: cmd.id, action, auteurId: d.moi || null, date: maintenant }],
    }));
    if (serveur) sync(["POST", `/api/commandes/${cmd.id}/ticket`, { action }]);
  };
  const telecharger = async () => {
    setPdf(true);
    try { await telechargerTicketPdf(t); marquer("pdf"); toast({ title: "Ticket téléchargé (PDF)" }); }
    catch (e) { toast({ title: "Téléchargement impossible", desc: e.message, tone: "critical" }); }
    finally { setPdf(false); }
  };
  const envoyerSms = async () => {
    setSms(true);
    const r = await sync(["POST", `/api/commandes/${cmd.id}/envoyer-recu`, {}]);
    setSms(false);
    if (r) { marquer("sms", false); toast({ title: r[0]?.simule ? "SMS simulé" : "Ticket envoyé par SMS", desc: r[0]?.simule ? "Aucun fournisseur SMS configuré sur le serveur." : `Au ${telephoner}` }); }
  };
  return (
    <div className={cx("ticket-actions", compact && "compact")}>
      {/* Copie du ticket réservée à l'impression (format 80 mm) */}
      {createPortal(<div className="print-zone"><TicketCaisse t={t} /></div>, document.body)}
      <Btn icon={Printer} onClick={() => { window.print(); marquer("imprime"); }}>Imprimer</Btn>
      <Btn icon={Download} loading={pdf} onClick={telecharger}>PDF</Btn>
      {telephoner && <Btn icon={MessageSquare} onClick={() => { window.open(`https://wa.me/${telInternational(telephoner)}?text=${encodeURIComponent(texte)}`, "_blank", "noopener"); marquer("whatsapp"); }}>WhatsApp</Btn>}
      {cmd && <Btn icon={Mail} onClick={() => setMail(true)}>E-mail</Btn>}
      {mode === "api" && telephoner && <Btn icon={Smartphone} loading={sms} onClick={envoyerSms}>SMS</Btn>}
      {t.lien && <Btn icon={Copy} onClick={() => navigator.clipboard?.writeText(t.lien).then(() => { marquer("lien"); toast({ title: "Lien du ticket copié" }); }, () => toast({ title: "Copie impossible", tone: "critical" }))}>Lien</Btn>}
      {cmd && <EmailTicketModal open={mail} onClose={() => setMail(false)} t={t} cmd={cmd} onEnvoye={() => marquer("email", mode !== "api")} />}
    </div>
  );
}

/* ---------- Nouvelle vente : contact, adresse, ville → catégorie → article → quantité ---------- */
const chiffres = (s) => String(s || "").replace(/\D/g, "");

function SaleModal({ open, preset, onClose }) {
  const { data, update, sync, toast, go, auth, mode, estAdmin } = useApp();
  const fraisBoutique = Number(data.boutique?.frais_livraison) || 0;
  const vide = { tel: "", nom: "", adresse: "", ville: "" };
  const [c, setC] = useState(vide);
  const [cat, setCat] = useState("");
  const [qp, setQp] = useState("");
  const [panier, setPanier] = useState([]); // [{ packId, qte }] : plusieurs produits dans une même vente
  const [livraison, setLivraison] = useState(false);
  const [frais, setFrais] = useState("");
  const [b2b, setB2b] = useState(false);
  const [pay, setPay] = useState(paiementVide());
  const [err, setErr] = useState({});
  const [done, setDone] = useState(null);
  const [saving, setSaving] = useState(false);
  const [apercu, setApercu] = useState(false);

  const reinitialiser = () => {
    const cl = data.clients.find((x) => x.id === preset?.clientId);
    setC(cl ? { tel: cl.tel, nom: cl.nom, adresse: "", ville: cl.ville || "" } : vide);
    setCat(""); setQp(""); setPanier(preset?.packId ? [{ packId: preset.packId, qte: 1 }] : []); setLivraison(false); setFrais(String(fraisBoutique || "")); setB2b(false);
    setPay(paiementVide()); setErr({}); setDone(null); setSaving(false); setApercu(false);
  };
  useEffect(() => { if (open) reinitialiser(); }, [open]);

  // Client reconnu à son numéro : on travaille avec le téléphone
  const client = chiffres(c.tel).length >= 8 ? data.clients.find((x) => chiffres(x.tel) === chiffres(c.tel)) : null;
  useEffect(() => { if (client) setC((s) => ({ ...s, nom: s.nom || client.nom, ville: s.ville || client.ville || "" })); }, [client?.id]);

  const actifs = data.packs.filter((p) => p.actif !== false);
  const categories = [...new Set(actifs.map((p) => p.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const packs = actifs.filter((p) => (!cat || p.categorie === cat) && norm(p.nom + " " + (p.sku || "")).includes(norm(qp)));
  const lignesPanier = panier.map((l) => { const p = data.packs.find((x) => x.id === l.packId); return p && { ...l, pack: p, prixU: prixEffectif(p), parLot: p.pieces || 1 }; }).filter(Boolean);
  const pack = lignesPanier[0]?.pack;
  const sousTotal = lignesPanier.reduce((s, l) => s + l.prixU * l.qte, 0);
  const articlesPanier = lignesPanier.reduce((s, l) => s + l.qte * l.parLot, 0);
  // Frais de livraison : montant convenu avec le client, saisi par le vendeur (imprimé sur le ticket)
  const montantFrais = livraison ? Math.max(0, Number(frais) || 0) : 0;
  const basculerArticle = (p) => { setPanier((l) => (l.some((x) => x.packId === p.id) ? l.filter((x) => x.packId !== p.id) : [...l, { packId: p.id, qte: 1 }])); setErr((e) => ({ ...e, pack: null })); };
  const changerQte = (id, q) => setPanier((l) => l.map((x) => (x.packId === id ? { ...x, qte: q } : x)));
  const total = sousTotal + montantFrais;
  const set = (k, v) => { setC((s) => ({ ...s, [k]: v })); setErr((e) => ({ ...e, [k]: null })); };

  const basculerLivraison = (v) => {
    setLivraison(v);
    // Une commande à livrer se règle le plus souvent à la livraison
    setPay((p) => (v && p.mode === "Espèces" && p.recu === "" ? paiementVide("Paiement à la livraison") : !v && p.mode === "Paiement à la livraison" ? paiementVide() : p));
  };
  const adresseComplete = [c.adresse.trim(), c.ville.trim()].filter(Boolean).join(", ");

  /* Étape 1 : vérification, puis récapitulatif sous forme de ticket provisoire */
  const verifier = () => {
    const e = {};
    if (chiffres(c.tel).length < 8) e.tel = "Numéro du client requis.";
    if (livraison && !adresseComplete) e.adresse = "Indiquez l'adresse ou la ville de livraison.";
    if (!lignesPanier.length) e.pack = "Cliquez sur un ou plusieurs articles.";
    const manque = lignesPanier.find((l) => l.qte > lotsDispo(l.pack));
    if (manque) e.pack = `Stock insuffisant pour ${manque.pack.nom} (${lotsDispo(manque.pack)} disponible${lotsDispo(manque.pack) > 1 ? "s" : ""}).`;
    const ep = validerPaiementLocal(pay, total);
    if (ep) e.pay = ep;
    setErr(e);
    if (Object.keys(e).length) return;
    setApercu(true);
  };

  const nomClient = c.nom.trim() || client?.nom || `Client ${c.tel.trim()}`;
  const ticketProvisoire = () => {
    const l = paiementLocal(pay, total);
    return {
      provisoire: true, boutique: data.boutique || boutiqueParDefaut(), numero: null, date: new Date().toISOString(), statut: "en_attente", type_vente: b2b ? "b2b" : "b2c",
      vendeur: auth?.utilisateur?.nom ? nomCourt(auth.utilisateur.nom) : null, client: nomCourt(nomClient), contact: c.tel.trim(), adresse_livraison: adresseComplete || null, canal: "boutique",
      lignes: lignesPanier.map((l) => ({ nom: l.pack.nom, quantite: l.qte, prix_unitaire: l.prixU, prix_normal: l.pack.prix > l.prixU ? l.pack.prix : null, total: l.prixU * l.qte, pieces_par_lot: l.parLot, articles: l.qte * l.parLot })), total_articles: articlesPanier,
      sous_total: sousTotal, frais_livraison: montantFrais, total,
      paiement: { mode: l.paiement, statut: l.statutPaiement, montant_recu: l.montantRecu, monnaie: l.montantRecu != null ? Math.max(0, l.montantRecu - total) : null, reference: l.reference || null },
      lien: null,
    };
  };

  /* Étape 2 : validation définitive — le ticket numéroté est généré avec la vente */
  const submit = () => {
    setSaving(true);
    setTimeout(async () => {
      const now = new Date();
      const ids = lignesPanier.map(() => uid()), venteId = ids[0], cmdId = uid();
      const newClient = !client ? { id: uid(), nom: nomClient, tel: c.tel.trim(), email: "", ville: c.ville.trim(), statut: "Standard", notes: "", dateAjout: isoDate(now), consentement: false } : null;
      const cl = client || newClient;
      update((d) => ({
        ...d,
        clients: newClient ? [...d.clients, newClient] : d.clients,
        ventes: [...d.ventes, ...lignesPanier.map((l, i) => ({ id: ids[i], commandeId: cmdId, clientId: cl.id, packId: l.pack.id, vendeurId: d.moi || null, qte: l.qte, prixUnitaire: l.prixU, date: isoDate(now), heure: hhmm(now), vendeur: auth?.utilisateur?.nom || "", ...paiementLocal(pay, total) }))],
        packs: d.packs.map((p) => { const l = lignesPanier.find((x) => x.pack.id === p.id); return l && !stockCache(p) ? { ...p, stock: Math.max(0, p.stock - l.qte * l.parLot) } : p; }),
        commandes: [...d.commandes, { id: cmdId, venteId, numero: nextNumero(d), numeroTicket: nextTicket(d), typeVente: b2b ? "b2b" : "b2c", ticketRemisLe: null, statut: "en_attente", adresseLivraison: adresseComplete || cl.ville || "", contactTel: c.tel.trim(), note: "", canal: "boutique", fraisLivraison: montantFrais, livraison, livreurId: null, livraisonPrevue: null, tentatives: 0, historique: [{ statut: "en_attente", date: now.toISOString() }] }],
        tickets: [...(d.tickets || []), { id: uid(), commandeId: cmdId, action: "genere", auteurId: d.moi || null, date: now.toISOString() }],
      }));
      // Connecté au serveur : on attend sa confirmation (stock vérifié, numéro de ticket attribué)
      const res = await sync(
        ...(newClient ? [["POST", "/api/clients", { id: newClient.id, ...clientVersServeur(newClient) }]] : []),
        ["POST", "/api/ventes", { id: venteId, commande_id: cmdId, client_id: cl.id, pack_id: pack.id, lignes: lignesPanier.map((l, i) => ({ id: ids[i], pack_id: l.pack.id, quantite: l.qte })), adresse_livraison: adresseComplete || cl.ville || "", frais_livraison: montantFrais, livraison, type_vente: b2b ? "b2b" : "b2c", ...paiementVersServeur(pay, total) }],
      );
      setSaving(false); setApercu(false);
      if (!res) return; // erreur déjà signalée, données rechargées depuis le serveur
      const recue = res[res.length - 1]?.commande;
      if (recue) update((d) => ({ ...d, commandes: d.commandes.map((x) => (x.id === cmdId ? { ...x, numero: recue.numero, numeroTicket: recue.numero_ticket, jetonRecu: recue.jeton_recu } : x)) }));
      setDone({ cmdId, total, client: nomClient });
      toast({ title: "Vente enregistrée", desc: `Ticket ${recue?.numero_ticket || ""} · ${fmt(total)}` });
    }, 300);
  };

  if (done) {
    const cmdFinale = enrichCommandes(data).find((x) => x.id === done.cmdId);
    const ticket = cmdFinale && construireTicket(data, cmdFinale, mode);
    const monnaie = cmdFinale?.vente?.montantRecu != null ? cmdFinale.vente.montantRecu - cmdFinale.total : 0;
    // Pas de vente sans ticket : la fenêtre ne se ferme qu'une fois le ticket remis au client
    const remis = !!cmdFinale?.ticketRemisLe || !cmdFinale;
    const fermer = () => { if (remis) onClose(); else toast({ title: "Remettez d'abord le ticket au client", desc: "Imprimez-le, téléchargez-le ou envoyez-le.", tone: "critical" }); };
    return (
      <Modal open={open} onClose={fermer} title="Vente enregistrée" size="md" hideHeader>
        <div className="success" style={{ position: "relative" }}>
          <Confetti />
          <SuccessCheck />
          <h3>Vente enregistrée !</h3>
          <p>Ticket <b>{cmdFinale?.numeroTicket || "…"}</b> pour {done.client}<br /><span className="num strong" style={{ color: "var(--text)" }}>{fmt(done.total)}</span></p>
          {monnaie > 0 && <div className="banner banner-success" style={{ animation: "fadeUp .4s .5s var(--ease-out) both" }}><Banknote size={16} /><div>Monnaie à rendre : <b className="num">{fmt(monnaie)}</b></div></div>}
          {ticket && (
            <div className="success-ticket">
              <div className="label" style={{ marginBottom: 8 }}>Ticket de caisse {cmdFinale.numeroTicket}</div>
              <TicketPdfApercu t={ticket} />
              <ActionsTicket t={ticket} cmd={cmdFinale} />
              {remis
                ? <div className="banner banner-success" style={{ marginTop: 10 }}><CheckCircle2 size={16} /><div>Ticket remis au client. La vente est terminée.</div></div>
                : <div className="banner banner-warning" style={{ marginTop: 10 }}><AlertTriangle size={16} /><div><b>Remettez le ticket au client pour terminer la vente</b> : imprimez-le, téléchargez-le ou envoyez-le (WhatsApp, e-mail, SMS).</div></div>}
            </div>
          )}
          <div className="row" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <Btn onClick={fermer} disabled={!remis}>Fermer</Btn>
            <Btn onClick={reinitialiser} icon={Plus} disabled={!remis}>Autre vente</Btn>
            <Btn variant="primary" disabled={!remis} onClick={() => { onClose(); go("commandes", done.cmdId); }}>Voir la commande</Btn>
          </div>
          {!remis && estAdmin && <button type="button" className="link" style={{ marginTop: 8 }} onClick={onClose}>Fermer sans remettre le ticket (administrateur)</button>}
        </div>
      </Modal>
    );
  }

  if (apercu && pack) {
    const aLaLivraison = infoPaiement(pay.mode).type === "livraison";
    return (
      <Modal open={open} onClose={onClose} title="Récapitulatif de la vente" size="md" hideHeader>
        <div className="modal-head">
          <h2>Récapitulatif avant validation</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body stack">
          <div className="banner banner-info"><FileText size={16} /><div>Vérifiez le ticket avec le client. Rien n'est encore enregistré : le stock et le numéro de ticket seront attribués à la validation.</div></div>
          <TicketCaisse t={ticketProvisoire()} />
        </div>
        <div className="modal-foot">
          <Btn icon={ArrowLeft} onClick={() => setApercu(false)} disabled={saving}>Modifier</Btn>
          <Btn variant="brand" icon={CheckCircle2} loading={saving} onClick={submit}>{aLaLivraison ? "Valider la commande" : `Valider et encaisser ${fmt(total)}`}</Btn>
        </div>
      </Modal>
    );
  }

  const clientOk = chiffres(c.tel).length >= 8;
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle vente" size="xl" hideHeader>
      <div className="modal-head">
        <h2>Nouvelle vente</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      </div>
      <div className="sale-grid" style={{ overflow: "auto" }}>
        <div className="sale-pick">
          <section>
            <div className="sale-step-title"><span className={cx("n", clientOk && "ok")}>{clientOk ? <Check size={13} strokeWidth={3} /> : 1}</span>Client</div>
            <div className="form-grid">
              <Field label="Contact (téléphone)" error={err.tel} help={client ? `Client connu : ${client.nom}` : clientOk ? "Nouveau client : sa fiche sera créée." : null}>
                <Input icon={Phone} value={c.tel} onChange={(e) => set("tel", e.target.value)} placeholder="07 00 00 00 00" inputMode="tel" data-autofocus />
              </Field>
              <Field label="Nom" optional><Input icon={User} value={c.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Ex : Awa Bamba" /></Field>
              <Field label="Adresse" optional={!livraison} error={err.adresse}><Input icon={MapPin} value={c.adresse} onChange={(e) => set("adresse", e.target.value)} placeholder="Quartier, rue, repère" /></Field>
              <Field label="Ville / commune" optional><Input value={c.ville} onChange={(e) => set("ville", e.target.value)} placeholder="Ex : Cocody" /></Field>
            </div>
          </section>

          <section>
            <div className="sale-step-title"><span className={cx("n", pack && "ok")}>{pack ? <Check size={13} strokeWidth={3} /> : 2}</span>Articles <span className="subtle" style={{ fontWeight: 400 }}>· touchez plusieurs articles pour les ajouter</span></div>
            {categories.length > 0 && (
              <div className="chips" style={{ marginBottom: 10 }}>
                <button type="button" className={cx("chip", !cat && "on")} onClick={() => setCat("")}>Tout</button>
                {categories.map((k) => <button type="button" key={k} className={cx("chip", cat === k && "on")} onClick={() => setCat(k)}>{k}</button>)}
              </div>
            )}
            <SearchInput value={qp} onChange={setQp} placeholder="Rechercher un article…" />
            {err.pack && <div className="field-error" style={{ marginTop: 8 }}><AlertCircle size={14} />{err.pack}</div>}
            <div className="pick-grid">
              {packs.map((p) => (
                <button key={p.id} className={cx("pick-tile", panier.some((x) => x.packId === p.id) && "selected")} disabled={lotsDispo(p) <= 0} onClick={() => basculerArticle(p)}>
                  {panier.some((x) => x.packId === p.id) && <span className="pick-check"><Check size={12} strokeWidth={3} /></span>}
                  <Thumb pack={p} />
                  <span className="pt-name">{p.nom}</span>
                  <span className="row" style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: 4 }}>
                    <span className="pt-price">{fmt(prixEffectif(p))}</span>
                    {promoActive(p) && <span className="prix-barre">{fmt(p.prix)}</span>}
                  </span>
                  <span className="subtle">{lotsDispo(p) <= 0 ? "Rupture de stock" : stockCache(p) ? `Disponible${(p.pieces || 1) > 1 ? ` · lot de ${p.pieces}` : ""}` : libelleStock(p)}</span>
                </button>
              ))}
              {packs.length === 0 && <div className="subtle">Aucun article trouvé.</div>}
            </div>
          </section>
        </div>

        <aside className="sale-summary">
          <div className="strong">Récapitulatif</div>
          {lignesPanier.length ? lignesPanier.map((l) => (
            <div className="stack-sm" key={l.pack.id} style={{ animation: "fadeUp .3s var(--ease-out)" }}>
              <div className="row" style={{ gap: 12 }}>
                <Thumb pack={l.pack} />
                <div className="grow"><div className="strong truncate">{l.pack.nom}</div><div className="subtle num">{fmt(l.prixU)}{promoActive(l.pack) && <> <span className="prix-barre">{fmt(l.pack.prix)}</span></>}</div></div>
                <Stepper value={l.qte} onChange={(q) => changerQte(l.pack.id, q)} max={Math.max(1, Math.min(999, lotsDispo(l.pack)))} />
                <button type="button" className="icon-btn" aria-label={`Retirer ${l.pack.nom}`} title="Retirer" onClick={() => basculerArticle(l.pack)}><X size={15} /></button>
              </div>
              {l.parLot > 1 && <div className="subtle">{l.qte} lot{l.qte > 1 ? "s" : ""} de {l.parLot} = <b>{l.qte * l.parLot} articles</b> remis au client</div>}
            </div>
          )) : <div className="subtle" style={{ padding: "8px 0" }}>Touchez un ou plusieurs articles</div>}
          {lignesPanier.length > 1 && <div className="subtle">{lignesPanier.length} produits · <b>{articlesPanier} articles</b> au total</div>}

          <div className="row-between">
            <div><div className="strong">Livraison</div><div className="subtle">{livraison ? "Colis suivi dans Livraisons ; montant sur le ticket" : "Retrait sur place"}</div></div>
            <Switch on={livraison} onChange={basculerLivraison} label="Livraison" />
          </div>
          {livraison && <Field label="Frais de livraison" help="Montant convenu avec le client : il est imprimé sur le ticket."><Input value={frais} onChange={(e) => setFrais(e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" placeholder="0" /></Field>}
          <div className="row-between">
            <div><div className="strong">Vente à un professionnel (B2B)</div><div className="subtle">Le ticket reste obligatoire</div></div>
            <Switch on={b2b} onChange={setB2b} label="Vente B2B" />
          </div>

          <div>
            <div className="label" style={{ marginBottom: 8 }}>Paiement</div>
            <PaiementForm total={total} value={pay} onChange={(v) => { setPay(v); setErr((e) => ({ ...e, pay: null })); }} telClient={c.tel} erreur={err.pay} />
          </div>
          <div className="stack-sm sale-cta">
            <div className="summary-line"><span>Sous-total</span><span className="num">{fmt(sousTotal)}</span></div>
            <div className="summary-line"><span>Livraison</span><span className="num">{livraison ? fmt(montantFrais) : "—"}</span></div>
            <div className="summary-total"><span className="strong">Total</span><strong><CountUp value={total} format={fmt} /></strong></div>
            <Btn variant="brand" size="lg" full onClick={verifier} icon={FileText}>Voir le récapitulatif (ticket)</Btn>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

/* ---------- Image produit (fichier → redimensionnée côté navigateur) ---------- */
const IMAGE_MAX = 800; // px, côté le plus long

function redimensionnerImage(fichier) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif|bmp|heic|heif)$/i.test(fichier.type) && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(fichier.name)) {
      return reject(new Error("Choisissez une image (JPEG, PNG ou WebP)."));
    }
    if (fichier.size > 15 * 1024 * 1024) return reject(new Error("Image trop lourde (15 Mo maximum)."));
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const echelle = Math.min(1, IMAGE_MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * echelle), h = Math.round(img.height * echelle);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; // fond blanc pour les PNG transparents convertis en JPEG
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossible de lire cette image.")); };
    img.src = url;
  });
}

function ImagePicker({ value, onChange }) {
  const inputRef = useRef(null);
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState("");
  const [lecture, setLecture] = useState(false);
  const charger = async (fichier) => {
    if (!fichier) return;
    setErreur(""); setLecture(true);
    try { onChange(await redimensionnerImage(fichier)); } catch (e) { setErreur(e.message); } finally { setLecture(false); }
  };
  const ouvrir = () => inputRef.current?.click();
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { charger(e.target.files?.[0]); e.target.value = ""; }} />
      {value ? (
        <div className="img-preview">
          <img src={urlImage(value)} alt="Aperçu du produit" />
          <div className="img-preview-actions">
            <Btn size="sm" icon={Upload} onClick={ouvrir}>Remplacer</Btn>
            <Btn size="sm" variant="critical-plain" icon={Trash2} onClick={() => onChange(null)}>Retirer</Btn>
          </div>
        </div>
      ) : (
        <button type="button" className={cx("dropzone", survol && "survol")} onClick={ouvrir}
          onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
          onDrop={(e) => { e.preventDefault(); setSurvol(false); charger(e.dataTransfer.files?.[0]); }}>
          {lecture ? <span className="spinner" /> : <span className="dropzone-icon"><Upload size={20} /></span>}
          <span className="strong">Ajouter une image</span>
          <span className="subtle">Cliquez ou glissez-déposez un fichier depuis votre appareil</span>
        </button>
      )}
      {erreur && <div className="field-error" style={{ marginTop: 6 }}><AlertCircle size={14} />{erreur}</div>}
    </div>
  );
}

/* ---------- Produit ---------- */
function ProductModal({ open, pack, onClose }) {
  const { data, update, sync, toast, confirm } = useApp();
  const blank = { nom: "", desc: "", prix: "", cout: "", stock: "", sku: "", emoji: "📦", teinte: 0, actif: true, image: null, contenu: "", seuilAlerte: String(STOCK_FAIBLE), prixPromo: "", promoFin: "", categorie: "", pieces: "1" };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState({});
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErr({});
    setF(pack
      ? { ...blank, ...pack, prix: String(pack.prix ?? ""), cout: pack.cout != null ? String(pack.cout) : "", stock: String(pack.stock ?? 0),
        contenu: pack.contenu || "", categorie: pack.categorie || "", pieces: String(pack.pieces || 1), seuilAlerte: String(seuilDe(pack)), prixPromo: pack.prixPromo != null ? String(pack.prixPromo) : "", promoFin: pack.promoFin ? isoDate(new Date(pack.promoFin)) : "" }
      : { ...blank, sku: "PK-" + (101 + data.packs.length), teinte: data.packs.length % 8 });
  }, [open, pack?.id]);
  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); if (err[k]) setErr((e) => ({ ...e, [k]: null })); };
  const prix = Number(f.prix) || 0, cout = Number(f.cout) || 0;
  const marge = prix && cout ? prix - cout : null;
  const prixPromo = f.prixPromo === "" ? null : Number(f.prixPromo);
  const vendus = pack ? data.ventes.filter((v) => v.packId === pack.id).reduce((s, v) => s + v.qte, 0) : 0;
  const elements = String(f.contenu || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  const save = () => {
    const e = {};
    if (!f.nom.trim()) e.nom = "Le titre est obligatoire.";
    if (!(prix > 0)) e.prix = "Indiquez un prix supérieur à 0.";
    if (f.stock !== "" && (Number(f.stock) < 0 || !Number.isInteger(Number(f.stock)))) e.stock = "Quantité entière positive.";
    if (prixPromo != null && !(prixPromo > 0 && prixPromo < prix)) e.prixPromo = "Le prix promotionnel doit être inférieur au prix de vente.";
    if (f.promoFin && prixPromo == null) e.prixPromo = "Indiquez le prix promotionnel.";
    if (f.promoFin && parseDate(f.promoFin) < today()) e.promoFin = "Date déjà passée.";
    setErr(e);
    if (Object.keys(e).length) { setShake(true); setTimeout(() => setShake(false), 450); return; }
    const fin = f.promoFin ? (() => { const d = parseDate(f.promoFin); d.setHours(23, 59, 59, 0); return d.toISOString(); })() : null;
    const clean = { ...f, nom: f.nom.trim(), prix, cout: f.cout === "" ? null : cout, stock: Number(f.stock) || 0,
      contenu: elements.join("\n"), seuilAlerte: Math.max(0, Number(f.seuilAlerte) || 0), prixPromo, promoFin: prixPromo != null ? fin : null,
      categorie: f.categorie.trim(), pieces: Math.max(1, Math.round(Number(f.pieces) || 1)) };
    if (pack) {
      update((d) => ({ ...d, packs: d.packs.map((p) => (p.id === pack.id ? { ...p, ...clean } : p)) }));
      sync(["PUT", `/api/packs/${pack.id}`, packVersServeur(clean)]);
    } else {
      const id = uid();
      update((d) => ({ ...d, packs: [...d.packs, { id, ...clean }] }));
      sync(["POST", "/api/packs", { id, ...packVersServeur(clean) }]);
    }
    toast({ title: pack ? "Produit mis à jour" : "Produit ajouté", desc: clean.nom });
    onClose();
  };
  const remove = async () => {
    const ok = await confirm({
      title: `Supprimer « ${pack.nom} » ?`,
      message: vendus ? `Ce produit apparaît dans ${vendus} vente(s). Les ventes seront conservées mais le produit n'apparaîtra plus au catalogue.` : "Cette action est définitive.",
      confirmLabel: "Supprimer", tone: "critical",
    });
    if (!ok) return;
    update((d) => ({ ...d, packs: d.packs.filter((p) => p.id !== pack.id) }));
    sync(["DELETE", `/api/packs/${pack.id}`]);
    toast({ title: "Produit supprimé", desc: pack.nom });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={pack ? "Modifier le produit" : "Ajouter un produit"} size="lg" className={shake ? "shake" : ""}
      footer={<>
        {pack && <Btn variant="critical-plain" icon={Trash2} onClick={remove} className="spacer">Supprimer</Btn>}
        <Btn onClick={onClose}>Annuler</Btn>
        <Btn variant="primary" onClick={save}>{pack ? "Enregistrer" : "Ajouter le produit"}</Btn>
      </>}>
      <div className="stack">
        <Field label="Titre" error={err.nom}><Input value={f.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Ex : Pack Élégance" /></Field>
        <div className="form-grid">
          <Field label="Catégorie" optional help="Sert à retrouver l'article en un clic lors d'une vente.">
            <Input value={f.categorie} onChange={(e) => set("categorie", e.target.value)} placeholder="Ex : Chaussettes" list="categories-produits" />
            <datalist id="categories-produits">{[...new Set(data.packs.map((p) => p.categorie).filter(Boolean))].map((k) => <option key={k} value={k} />)}</datalist>
          </Field>
          <Field label="Articles par lot" help={Number(f.pieces) > 1 ? `Chaque lot vendu sort ${f.pieces} articles du stock (le stock se compte en articles).` : "1 = vendu à l'unité. Pour un lot de 3, saisissez 3."}>
            <Input value={f.pieces} onChange={(e) => set("pieces", e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" suffix="article(s)" />
          </Field>
        </div>
        <Field label="Description" optional><textarea className="textarea" value={f.desc} onChange={(e) => set("desc", e.target.value)} placeholder="Ses avantages, à qui il s'adresse…" /></Field>
        <Field label="Contenu détaillé (équipements)" optional help={elements.length ? `${elements.length} élément${elements.length > 1 ? "s" : ""} — affichés sur la fiche produit de la boutique en ligne.` : "Un élément par ligne. Ex : Sac en cuir, Portefeuille, Ceinture…"}>
          <textarea className="textarea" rows={4} value={f.contenu} onChange={(e) => set("contenu", e.target.value)} placeholder={"Sac en cuir\nPortefeuille assorti\nCeinture réglable"} />
        </Field>
        <Field label="Image du produit" optional help="JPEG, PNG ou WebP. L'image est automatiquement redimensionnée.">
          <ImagePicker value={f.image} onChange={(v) => set("image", v)} />
        </Field>
        <div className="card" style={{ boxShadow: "none", border: "1px solid var(--border)" }}>
          <div className="card-section"><div className="card-title">Prix</div></div>
          <div className="card-section form-grid">
            <Field label="Prix de vente" error={err.prix}><Input value={f.prix} onChange={(e) => set("prix", e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" placeholder="0" /></Field>
            <Field label="Coût par article" optional help="Les clients ne verront pas ce prix."><Input value={f.cout} onChange={(e) => set("cout", e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" placeholder="0" /></Field>
            {marge != null && (
              <div className="full row" style={{ gap: 24, animation: "fadeDown .25s var(--ease-out)" }}>
                <div><div className="subtle">Marge</div><div className="strong num">{fmt(marge)}</div></div>
                <div><div className="subtle">Taux de marge</div><div className="strong num" style={{ color: marge >= 0 ? "var(--success-dot)" : "var(--critical-solid)" }}>{((marge / prix) * 100).toFixed(1).replace(".", ",")} %</div></div>
              </div>
            )}
          </div>
        </div>
        <div className="card" style={{ boxShadow: "none", border: "1px solid var(--border)" }}>
          <div className="card-section"><div className="card-title">Promotion</div><div className="subtle">Prix réduit appliqué en caisse et sur la boutique en ligne. Pour alerter les clients, utilisez Marketing → Lancer une promotion.</div></div>
          <div className="card-section form-grid">
            <Field label="Prix promotionnel" optional error={err.prixPromo} help={prixPromo > 0 && prix > prixPromo ? `Remise de ${Math.round((1 - prixPromo / prix) * 100)} %` : null}>
              <Input value={f.prixPromo} onChange={(e) => set("prixPromo", e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" placeholder="Aucune promotion" />
            </Field>
            <Field label="Fin de la promotion" optional error={err.promoFin} help="Sans date : jusqu'à ce que vous la retiriez.">
              <Input type="date" value={f.promoFin} onChange={(e) => set("promoFin", e.target.value)} min={isoDate(new Date())} />
            </Field>
          </div>
        </div>
        <div className="card" style={{ boxShadow: "none", border: "1px solid var(--border)" }}>
          <div className="card-section"><div className="card-title">Inventaire</div></div>
          <div className="card-section form-grid">
            <Field label="SKU (référence)"><Input value={f.sku} onChange={(e) => set("sku", e.target.value)} /></Field>
            <Field label="Seuil d'alerte" help="Alerte « stock faible » à partir de cette quantité."><Input value={f.seuilAlerte} onChange={(e) => set("seuilAlerte", e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" suffix="unités" /></Field>
            <Field label={pack ? "Quantité en stock (correction)" : "Stock initial"} error={err.stock} className="full" help={pack ? "Pour une livraison fournisseur, préférez Stocks → Réception (historique et coût d'achat)." : null}>
              <div className="row">
                <div className="grow"><Input value={f.stock} onChange={(e) => set("stock", e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="0" /></div>
                <Stepper value={Number(f.stock) || 0} min={0} max={99999} onChange={(v) => set("stock", String(v))} />
              </div>
            </Field>
          </div>
        </div>
        <div className="row-between card" style={{ padding: 14, boxShadow: "none", border: "1px solid var(--border)" }}>
          <div><div className="strong">Produit actif</div><div className="subtle">Un brouillon n'apparaît pas dans le point de vente.</div></div>
          <Switch on={f.actif !== false} onChange={(v) => set("actif", v)} label="Produit actif" />
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Client ---------- */
function ClientModal({ open, client, onClose, onSaved }) {
  const { update, sync, toast } = useApp();
  const blank = { nom: "", tel: "", email: "", ville: "", statut: "Standard", notes: "", consentement: false };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState({});
  const [shake, setShake] = useState(false);
  useEffect(() => { if (open) { setF(client ? { ...blank, ...client } : blank); setErr({}); } }, [open, client?.id]);
  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); if (err[k]) setErr((e) => ({ ...e, [k]: null })); };
  const save = () => {
    const e = {};
    if (!f.nom.trim()) e.nom = "Le nom est obligatoire.";
    if (f.tel.replace(/\D/g, "").length < 8) e.tel = "Numéro de téléphone invalide.";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Adresse e-mail invalide.";
    setErr(e);
    if (Object.keys(e).length) { setShake(true); setTimeout(() => setShake(false), 450); return; }
    const clean = { ...f, nom: f.nom.trim(), tel: f.tel.trim(), email: f.email.trim(), ville: f.ville.trim() };
    let id = client?.id;
    if (client) {
      update((d) => ({ ...d, clients: d.clients.map((c) => (c.id === client.id ? { ...c, ...clean } : c)) }));
      sync(["PUT", `/api/clients/${client.id}`, clientVersServeur(clean)]);
    } else {
      id = uid();
      update((d) => ({ ...d, clients: [...d.clients, { id, dateAjout: isoDate(new Date()), ...clean }] }));
      sync(["POST", "/api/clients", { id, ...clientVersServeur(clean) }]);
    }
    toast({ title: client ? "Client mis à jour" : "Client ajouté", desc: clean.nom });
    onClose();
    onSaved?.(id);
  };
  return (
    <Modal open={open} onClose={onClose} title={client ? "Modifier le client" : "Ajouter un client"} size="md" className={shake ? "shake" : ""}
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={save}>{client ? "Enregistrer" : "Ajouter le client"}</Btn></>}>
      <div className="form-grid">
        <Field label="Nom complet" error={err.nom} className="full"><Input value={f.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Ex : Awa Bamba" /></Field>
        <Field label="Téléphone" error={err.tel}><Input icon={Phone} value={f.tel} onChange={(e) => set("tel", e.target.value)} placeholder="07 00 00 00 00" inputMode="tel" /></Field>
        <Field label="E-mail" optional error={err.email}><Input icon={Mail} value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="email@exemple.com" inputMode="email" /></Field>
        <Field label="Ville / quartier" optional className="full"><Input icon={MapPin} value={f.ville} onChange={(e) => set("ville", e.target.value)} placeholder="Ex : Cocody, Abidjan" /></Field>
        <Field label="Statut" className="full">
          <Segmented full value={f.statut} onChange={(v) => set("statut", v)} options={[{ value: "Standard", label: "Standard", icon: User }, { value: "VIP", label: "VIP", icon: Star }]} />
        </Field>
        <Field label="Notes" optional className="full"><textarea className="textarea" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Préférences, remarques…" /></Field>
        <div className="full row-between card" style={{ padding: 14, boxShadow: "none", border: "1px solid var(--border)" }}>
          <div><div className="strong">Accepte les messages marketing</div><div className="subtle">Promotions, nouveautés et message du lundi par SMS / e-mail. Ne cochez qu'avec l'accord du client.</div></div>
          <Switch on={!!f.consentement} onChange={(v) => set("consentement", v)} label="Consentement marketing" />
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Dépense / investissement ---------- */
function InvestModal({ open, item, onClose }) {
  const { update, sync, toast } = useApp();
  const blank = { libelle: "", categorie: "Stock", montant: "", date: isoDate(new Date()) };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState({});
  useEffect(() => { if (open) { setF(item ? { ...item, montant: String(item.montant) } : blank); setErr({}); } }, [open, item?.id]);
  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); if (err[k]) setErr((e) => ({ ...e, [k]: null })); };
  const save = () => {
    const e = {};
    if (!f.libelle.trim()) e.libelle = "Le libellé est obligatoire.";
    if (!(Number(f.montant) > 0)) e.montant = "Indiquez un montant.";
    setErr(e);
    if (Object.keys(e).length) return;
    const clean = { ...f, libelle: f.libelle.trim(), montant: Number(f.montant) };
    if (item) {
      update((d) => ({ ...d, investissements: d.investissements.map((i) => (i.id === item.id ? { ...i, ...clean } : i)) }));
      sync(["PUT", `/api/investissements/${item.id}`, investVersServeur(clean)]);
    } else {
      const id = uid();
      update((d) => ({ ...d, investissements: [{ id, ...clean }, ...d.investissements] }));
      sync(["POST", "/api/investissements", { id, ...investVersServeur(clean) }]);
    }
    toast({ title: item ? "Dépense mise à jour" : "Dépense enregistrée", desc: `${clean.libelle} · ${fmt(clean.montant)}` });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={item ? "Modifier la dépense" : "Enregistrer une dépense"} size="md"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={save}>Enregistrer</Btn></>}>
      <div className="form-grid">
        <Field label="Libellé" error={err.libelle} className="full"><Input value={f.libelle} onChange={(e) => set("libelle", e.target.value)} placeholder="Ex : Achat de stock" /></Field>
        <Field label="Montant" error={err.montant}><Input value={f.montant} onChange={(e) => set("montant", e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" placeholder="0" /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Catégorie" className="full">
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" className={cx("btn btn-sm", f.categorie === c.key ? "btn-primary" : "btn-secondary")} onClick={() => set("categorie", c.key)}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: c.color }} />{c.key}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/* ---------- Reçu imprimable ---------- */
function TicketModal({ open, cmd, onClose }) {
  const { data, mode } = useApp();
  const t = cmd ? construireTicket(data, cmd, mode) : null;
  return (
    <Modal open={open} onClose={onClose} title="Ticket de caisse" size="sm" footer={t && <ActionsTicket t={t} cmd={cmd} compact />}>
      {t && <TicketCaisse t={t} />}
      {t && !t.lien && mode !== "api" && <p className="subtle" style={{ textAlign: "center", marginTop: 8 }}>Mode démo : le lien et le QR code de téléchargement sont disponibles une fois connecté au serveur.</p>}
    </Modal>
  );
}

/* ---------- Encaisser une vente « paiement à la livraison » ---------- */
function EncaisserModal({ open, cmd, onClose }) {
  const { update, sync, toast } = useApp();
  const [pay, setPay] = useState(paiementVide());
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const aVerifier = cmd?.vente?.statutPaiement === "a_verifier";
  useEffect(() => {
    if (!open) return;
    // Transfert déclaré par le client : on préremplit avec ce qu'il a saisi
    setPay(aVerifier ? { mode: cmd.vente.paiement, recu: "", tel: cmd.vente.telPaiement || "", ref: cmd.vente.reference || "" } : paiementVide());
    setErr(null); setBusy(false);
  }, [open]);
  if (!cmd) return <Modal open={false} onClose={onClose} />;
  const total = cmd.total;
  const valider = async () => {
    const e = validerPaiementLocal(pay, total);
    if (e) return setErr(e);
    setBusy(true);
    const maintenant = new Date().toISOString();
    const l = paiementLocal(pay, total);
    update((d) => ({
      ...d,
      ventes: d.ventes.map((v) => (v.commandeId === cmd.id || v.id === cmd.venteId ? { ...v, ...l, statutPaiement: "payee", payeLe: maintenant } : v)),
      commandes: d.commandes.map((c) => (c.id === cmd.id ? { ...c, historique: [...(c.historique || []), { type: "paiement", texte: aVerifier ? `Paiement vérifié et confirmé (${l.paiement})` : `Paiement encaissé (${l.paiement})`, date: maintenant }] } : c)),
    }));
    const r = await sync(["PATCH", `/api/commandes/${cmd.id}/paiement`, paiementVersServeur(pay, total)]);
    setBusy(false);
    if (!r) return;
    const monnaie = l.montantRecu != null ? l.montantRecu - total : 0;
    toast({ title: `Paiement de ${fmt(total)} encaissé`, desc: monnaie > 0 ? `Monnaie à rendre : ${fmt(monnaie)}` : l.paiement });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={aVerifier ? `Vérifier le paiement ${cmd.numero}` : `Encaisser ${cmd.numero}`} size="md"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="brand" icon={CheckCircle2} loading={busy} onClick={valider}>{aVerifier ? "J'ai bien reçu le paiement" : `Encaisser ${fmt(total)}`}</Btn></>}>
      <div className="stack">
        {aVerifier && (
          <div className="banner banner-warning"><ShieldCheck size={16} /><div>
            Le client déclare avoir envoyé <b>{fmt(total)}</b> par <b>{cmd.vente.paiement}</b> depuis le <b>{cmd.vente.telPaiement || "—"}</b> (réf. <b>{cmd.vente.reference || "—"}</b>).
            Vérifiez sur votre relevé {cmd.vente.paiement} que la somme est bien arrivée avant de confirmer.
          </div></div>
        )}
        <div className="row-between"><span className="muted">Montant à encaisser</span><strong className="num" style={{ fontSize: 20 }}>{fmt(total)}</strong></div>
        <PaiementForm total={total} value={pay} onChange={(v) => { setPay(v); setErr(null); }} telClient={cmd.client?.tel} erreur={err} sansLivraison />
      </div>
    </Modal>
  );
}

/* =====================================================================
   PAGE : Accueil
   ===================================================================== */
function PageAccueil() {
  const { data, settings, go, openSale, mode, auth, remplacerTout, toast, estAdmin } = useApp();
  const [period, setPeriod] = useState(30);
  const [chargement, setChargement] = useState(null);
  const baseVide = mode === "api" && data.clients.length === 0 && data.packs.length === 0 && data.ventes.length === 0;
  const peutImporter = auth?.utilisateur?.role === "admin";
  const local = baseVide ? readJson(STORAGE_KEY) : null;
  const demarrer = async (quoi) => {
    setChargement(quoi);
    const ok = await remplacerTout(quoi === "demo" ? { ...seedData(), boutique: data.boutique } : migrate(local));
    setChargement(null);
    if (ok) toast({ title: quoi === "demo" ? "Données de démonstration chargées" : "Données du navigateur envoyées sur le serveur" });
  };
  const m = useMemo(() => computeDashboard(data, period), [data, period]);
  const todo = useMemo(() => computeTodo(data), [data]);
  const recent = useMemo(() => enrichCommandes(data).sort((a, b) => b.stamp.localeCompare(a.stamp)).slice(0, 6), [data]);
  const h = new Date().getHours();
  const hello = h < 5 ? "Bonsoir" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";

  const kpis = [
    { label: "Chiffre d'affaires", value: m.ca, format: fmt, delta: m.dCa, spark: m.series.map((s) => s.value), color: "var(--c-blue)", icon: TrendingUp, tint: 4 },
    { label: "Commandes", value: m.nb, format: fmtNum, delta: m.dNb, spark: m.series.map((s) => s.n), color: "var(--c-green)", icon: ShoppingCart, tint: 0 },
    { label: "Panier moyen", value: m.panier, format: fmt, delta: m.dPanier, spark: m.series.map((s) => (s.n ? s.value / s.n : 0)), color: "var(--c-purple)", icon: ShoppingBag, tint: 5 },
    { label: "Nouveaux clients", value: m.nc, format: fmtNum, delta: m.dNc, spark: m.series.map((s) => s.nc), color: "var(--c-gold)", icon: UserPlus, tint: 1 },
  ];

  const todos = [
    todo.attente && { icon: Clock, tint: 1, title: `${todo.attente} commande${todo.attente > 1 ? "s" : ""} à confirmer`, sub: "Validez-les pour lancer la préparation", go: () => go("commandes", null, { statut: "en_attente" }) },
    todo.aVerifier.length && { icon: ShieldCheck, tint: 3, title: `${todo.aVerifier.length} paiement${todo.aVerifier.length > 1 ? "s" : ""} à vérifier`, sub: "Transferts Mobile Money déclarés en ligne : contrôlez votre relevé", go: () => go("commandes", todo.aVerifier[0].id) },
    todo.aEncaisser.length && { icon: Banknote, tint: 1, title: `${todo.aEncaisser.length} paiement${todo.aEncaisser.length > 1 ? "s" : ""} à encaisser`, sub: `${fmt(todo.aEncaisser.reduce((x, v) => x + v.total, 0))} payables à la livraison`, go: () => go("ventes", null, { paiement: "en_attente" }) },
    todo.aExpedier && { icon: Truck, tint: 2, title: `${todo.aExpedier} commande${todo.aExpedier > 1 ? "s" : ""} à expédier`, sub: "Prêtes pour la livraison", go: () => go("commandes", null, { statut: "confirmee" }) },
    todo.enLivraison && { icon: PackageCheck, tint: 5, title: `${todo.enLivraison} en cours de livraison`, sub: "Marquez-les livrées à réception", go: () => go("commandes", null, { statut: "expediee" }) },
    todo.rupture.length && { icon: AlertTriangle, tint: 3, title: `${todo.rupture.length} produit${todo.rupture.length > 1 ? "s" : ""} en rupture`, sub: todo.rupture.map((p) => p.nom).join(", "), go: () => go("produits", null, { filtre: "rupture" }) },
    todo.faible.length && { icon: Package, tint: 7, title: `${todo.faible.length} produit${todo.faible.length > 1 ? "s" : ""} en stock faible`, sub: todo.faible.map((p) => p.nom).join(", "), go: () => go("produits", null, { filtre: "faible" }) },
  ].filter(Boolean);

  const topMax = Math.max(1, ...m.top.map((t) => t.total));

  return (
    <>
      <PageHeader
        title={`${hello} 👋`}
        meta={<>{estAdmin ? "Voici l'activité de" : "Voici votre activité chez"} <b>{(data.boutique?.nom || "Ma Boutique")}</b> · {fmtDateLong(new Date())}</>}
        actions={<>
          <Segmented value={period} onChange={setPeriod} options={[{ value: 7, label: "7 jours" }, { value: 30, label: "30 jours" }, { value: 90, label: "90 jours" }]} />
          <Btn variant="primary" icon={Plus} onClick={() => openSale()} className="hide-sm">Nouvelle vente</Btn>
        </>}
      />

      {mode === "api" && <CarteLien />}

      {baseVide && (
        <div className="card onboarding" style={{ marginBottom: 16 }}>
          <div className="card-body row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <span className="todo-icon tint-0" style={{ width: 44, height: 44, borderRadius: 12 }}><Sparkles size={20} /></span>
            <div className="grow" style={{ minWidth: 220 }}>
              <div className="strong" style={{ fontSize: 15 }}>Votre boutique est prête</div>
              <p className="muted" style={{ marginTop: 2 }}>
                La base de données du serveur est vide. Ajoutez vos produits et clients, ou partez d'un exemple.
                {!peutImporter && " Seul un administrateur peut charger des données d'exemple."}
              </p>
              <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
                {peutImporter && <Btn variant="primary" icon={Plus} onClick={() => go("produits", "nouveau")}>Ajouter un produit</Btn>}
                {peutImporter && local && <Btn icon={Upload} loading={chargement === "local"} onClick={() => demarrer("local")}>Importer les données de ce navigateur</Btn>}
                {peutImporter && <Btn icon={Sparkles} loading={chargement === "demo"} onClick={() => demarrer("demo")}>Charger des données d'exemple</Btn>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="kpi-grid stagger">
        {kpis.map((k, i) => (
          <div className="card kpi" key={k.label} style={{ "--i": i }}>
            <div className="kpi-label"><span className={cx("kpi-dot", `tint-${k.tint}`)}><k.icon size={13} /></span>{k.label}</div>
            <div className="kpi-value"><CountUp value={k.value} format={k.format} /></div>
            <div className="kpi-foot"><Delta value={k.delta} /><span className="hide-sm">vs période préc.</span></div>
            <div className="kpi-spark" key={period}><Sparkline values={k.spark} color={k.color} /></div>
          </div>
        ))}
      </div>

      <div className="grid-main">
        <Card title="Ventes au fil du temps" sub={`${period} derniers jours, commandes annulées exclues`}>
          <div className="chart-head">
            <div className="big-num"><CountUp value={m.ca} format={fmt} /></div>
            <Delta value={m.dCa} />
            <div className="legend hide-sm">
              <span><i style={{ background: "var(--c-blue)" }} />Période actuelle</span>
              <span><i className="dashed" />Période précédente</span>
            </div>
          </div>
          <AreaChart key={period} points={m.series} />
        </Card>

        <Card title="À traiter" sub={todos.length ? "Vos priorités du moment" : null} padded={false}>
          <div style={{ padding: 6 }}>
            {todos.length === 0 && <EmptyState icon={CheckCircle2} title="Tout est à jour 🎉">Aucune commande ni aucun stock ne demande votre attention.</EmptyState>}
            {todos.map((t, i) => (
              <button key={i} className="todo-item" onClick={t.go} style={{ animation: `fadeUp .4s ${i * 60}ms var(--ease-out) both` }}>
                <span className={cx("todo-icon", `tint-${t.tint}`)}><t.icon size={16} /></span>
                <span className="grow"><span className="strong">{t.title}</span><br /><span className="subtle truncate" style={{ display: "block" }}>{t.sub}</span></span>
                <ChevronRight size={16} className="todo-arrow" />
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid-3">
        <Card title="Meilleurs produits" sub={`Par chiffre d'affaires · ${period} j`} actions={<Btn variant="plain" size="sm" onClick={() => go("produits")}>Tout voir</Btn>}>
          {m.top.length === 0 && <EmptyState icon={Tag} title="Pas encore de ventes" />}
          <div className="stack" style={{ gap: 14 }}>
            {m.top.map((t, i) => (
              <div key={t.pack.id} className="row" style={{ gap: 12, cursor: "pointer" }} onClick={() => go("produits", t.pack.id)}>
                <Thumb pack={t.pack} size="sm" />
                <div className="grow">
                  <div className="row-between"><span className="strong truncate">{t.pack.nom}</span><span className="num strong">{fmtShort(t.total)}</span></div>
                  <div className="row" style={{ gap: 8, marginTop: 5 }}>
                    <div className="progress grow"><span style={{ width: `${(t.total / topMax) * 100}%`, animationDelay: `${i * 80}ms` }} /></div>
                    <span className="subtle num">{t.qte} u.</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Moyens de paiement" sub={`${period} derniers jours`}>
          <Donut key={period} items={m.paiements} format={fmtShort} />
        </Card>

        <Card title="Commandes récentes" padded={false} actions={<Btn variant="plain" size="sm" onClick={() => go("commandes")}>Tout voir</Btn>}>
          <div className="list" style={{ marginTop: 8 }}>
            {recent.map((c) => (
              <a key={c.id} className="list-item" href={`#/commandes/${c.id}`}>
                <Thumb pack={c.pack} size="sm" />
                <div className="grow">
                  <div className="row-between"><span className="strong">{c.numero}</span><span className="num strong">{fmt(c.total)}</span></div>
                  <div className="row-between"><span className="subtle truncate">{c.client?.nom || "—"} · {relDay(c.vente?.date, c.vente?.heure)}</span><StatutBadge statut={c.statut} /></div>
                </div>
              </a>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

/* =====================================================================
   PAGE : Commandes (liste)
   ===================================================================== */
function PageCommandes({ route }) {
  const { data, update, sync, go, toast, confirm, openSale, estAdmin } = useApp();
  const [tab, setTab] = useState(route.query.statut || "toutes");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const sort = useSort("date");
  useEffect(() => { if (route.query.statut) setTab(route.query.statut); }, [route.query.statut]);
  useEffect(() => setSel(new Set()), [tab, q]);

  const all = useMemo(() => enrichCommandes(data), [data]);
  const counts = useMemo(() => Object.fromEntries(Object.keys(STATUTS).map((k) => [k, all.filter((c) => c.statut === k).length])), [all]);
  const rows = sort.apply(
    all.filter((c) => (tab === "toutes" || c.statut === tab) && norm(`${c.contactTel || ""} ${c.client?.tel || ""} ${c.numero} ${c.numeroTicket || ""} ${c.client?.nom} ${c.lignes.map((l) => l.pack?.nom).join(" ")} ${c.adresseLivraison} ${c.canal === "en_ligne" ? "en ligne web" : ""}`).replace(/(\d)\s+(?=\d)/g, "$1").includes(norm(q).replace(/(\d)\s+(?=\d)/g, "$1"))),
    { date: (c) => c.stamp, total: (c) => c.total, client: (c) => c.client?.nom || "", numero: (c) => parseInt(String(c.numero).replace(/\D/g, ""), 10) || 0 },
  );
  const pg = usePaged(rows, 15, tab + q + sort.sort.key + sort.sort.dir);

  const T0 = today();
  const last30 = all.filter((c) => daysBetween(parseDate(c.vente?.date), T0) < 30);
  const strip = [
    { label: "Commandes (30 j)", value: last30.length },
    { label: "Articles commandés", value: last30.reduce((s, c) => s + c.pieces, 0) },
    { label: "Livrées (30 j)", value: last30.filter((c) => c.statut === "livree").length },
    { label: "Taux d'annulation", value: last30.length ? Math.round((last30.filter((c) => c.statut === "annulee").length / last30.length) * 100) : 0, suffix: " %" },
  ];

  const allOnPage = pg.slice.length > 0 && pg.slice.every((c) => sel.has(c.id));
  const someOnPage = pg.slice.some((c) => sel.has(c.id));
  const toggleAll = (v) => setSel((s) => { const n = new Set(s); pg.slice.forEach((c) => (v ? n.add(c.id) : n.delete(c.id))); return n; });
  const toggle = (id, v) => setSel((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });

  const bulk = async (statut) => {
    const ids = [...sel];
    if (statut === "annulee") {
      const ok = await confirm({ title: `Annuler ${ids.length} commande${ids.length > 1 ? "s" : ""} ?`, message: "Les articles seront remis en stock. Vous pourrez toujours rétablir une commande depuis sa fiche.", confirmLabel: "Annuler les commandes", tone: "critical" });
      if (!ok) return;
    }
    update((d) => applyStatut(d, ids, statut));
    sync(["POST", "/api/commandes/statut", { ids, statut }]);
    toast({ title: `${ids.length} commande${ids.length > 1 ? "s" : ""} : ${STATUTS[statut].label.toLowerCase()}` });
    setSel(new Set());
  };

  const exporter = () => {
    downloadFile(`commandes-${isoDate(new Date())}.csv`, toCsv([
      ["Contact", "Client", "Article", "Quantité", "Nombre d'articles", "Montant (FCFA)", "Lieu de livraison", "Statut", "Paiement", "Date", "Commande", "Ticket"],
      ...rows.map((c) => [c.contactTel || c.client?.tel, c.client?.nom, c.lignes.map((l) => `${l.pack?.nom || "?"} x${l.qte}`).join(" + "), c.articles, c.pieces, c.total, c.adresseLivraison, STATUTS[c.statut]?.label, c.vente?.paiement, c.vente?.date, c.numero, c.numeroTicket]),
    ]), "text/csv;charset=utf-8");
    toast({ title: "Export terminé", desc: `${rows.length} commande(s) exportée(s) en CSV` });
  };

  const tabs = [{ key: "toutes", label: "Toutes", count: all.length }, ...Object.entries(STATUTS).map(([k, s]) => ({ key: k, label: s.label, count: counts[k] }))];

  return (
    <>
      <PageHeader title="Commandes" actions={<><Btn icon={Download} onClick={exporter}>Exporter</Btn><Btn variant="primary" icon={Plus} onClick={() => openSale()}>Créer une vente</Btn></>} />

      <div className="card stat-strip stagger">
        {strip.map((s, i) => <div key={s.label} style={{ "--i": i }}><div className="label">{s.label}</div><div className="value"><CountUp value={s.value} />{s.suffix}</div></div>)}
      </div>

      <div className="card">
        <div className="table-toolbar"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
        <div className="table-filters"><SearchInput value={q} onChange={setQ} placeholder="Rechercher par téléphone, client, article, lieu…" /></div>
        {rows.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={q ? "Aucune commande trouvée" : "Aucune commande ici"}>
            {q ? "Modifiez votre recherche ou changez d'onglet." : "Les commandes apparaîtront ici dès votre prochaine vente."}
          </EmptyState>
        ) : (
          <div className="table-scroll has-bulk">
            {/* Barre d'actions groupées : recouvre l'en-tête pour ne pas décaler les lignes */}
            {sel.size > 0 && (
              <div className="bulk-bar">
                <Checkbox checked={allOnPage} indeterminate={!allOnPage && someOnPage} onChange={toggleAll} label={<strong>{sel.size} sélectionnée{sel.size > 1 ? "s" : ""}</strong>} />
                <span className="grow" />
                <Btn size="sm" onClick={() => bulk("confirmee")}>Confirmer</Btn>
                <Btn size="sm" onClick={() => bulk("expediee")}>Expédier</Btn>
                <Btn size="sm" onClick={() => bulk("livree")}>Livrer</Btn>
                {estAdmin && <Btn size="sm" variant="critical-plain" onClick={() => bulk("annulee")}>Annuler</Btn>}
              </div>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th className="col-check hide-sm"><Checkbox checked={allOnPage} indeterminate={!allOnPage && someOnPage} onChange={toggleAll} label={<span className="sr-only">Tout sélectionner</span>} /></th>
                  <SortTh label="Contact" k="client" sort={sort} onSort={sort.toggle} />
                  <th>Article</th>
                  <th className="right hide-sm">Qté</th>
                  <SortTh label="Montant" k="total" sort={sort} onSort={sort.toggle} className="right" />
                  <th className="hide-sm">Lieu de livraison</th>
                  <th>Statut</th>
                  <SortTh label="Date" k="date" sort={sort} onSort={sort.toggle} className="hide-md" />
                </tr>
              </thead>
              <tbody key={tab + pg.page}>
                {pg.slice.map((c, i) => (
                  <tr key={c.id} className={cx("clickable", sel.has(c.id) && "selected")} style={{ "--i": i }} tabIndex={0}
                    onClick={() => go("commandes", c.id)} onKeyDown={(e) => e.key === "Enter" && go("commandes", c.id)}>
                    <td className="col-check hide-sm"><Checkbox checked={sel.has(c.id)} onChange={(v) => toggle(c.id, v)} label={<span className="sr-only">Sélectionner {c.numero}</span>} /></td>
                    {/* Tout ce qu'il faut pour traiter la commande, sans l'ouvrir : on travaille avec le numéro du client */}
                    <td><span className="cell-main num">{c.contactTel || c.client?.tel || "—"}</span>{c.canal === "en_ligne" && <ShoppingBag size={13} className="canal-web" aria-label="En ligne" />}{c.typeVente === "b2b" && <Badge tone="info" className="badge-inline">B2B</Badge>}
                      <div className="cell-sub">{c.client?.nom || "Client supprimé"}</div></td>
                    <td className="wrap">{c.lignes.length > 1 ? c.lignes.map((l) => `${l.pack?.nom || "?"} × ${l.qte}`).join(", ") : c.pack?.nom || "Produit supprimé"}
                      <div className="cell-sub only-mobile">× {c.articles}{c.pieces !== c.articles ? ` (${c.pieces} articles)` : ""} · {c.adresseLivraison || "retrait sur place"}</div></td>
                    <td className="right num hide-sm">{c.articles}{c.pieces !== c.articles && <div className="cell-sub">{c.pieces} articles</div>}</td>
                    <td className="right num strong">{fmt(c.total)}{c.frais > 0 && <div className="cell-sub">dont {fmt(c.frais)} livr.</div>}</td>
                    <td className="hide-sm wrap">{c.adresseLivraison || <span className="subtle">Retrait sur place</span>}</td>
                    <td><PaiementBadge c={c} /><div style={{ marginTop: 3 }}><StatutBadge statut={c.statut} /></div></td>
                    <td className="hide-md muted">{relDay(c.vente?.date, c.vente?.heure)}<div className="cell-sub">{c.numeroTicket || c.numero}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager pg={pg} />
      </div>
    </>
  );
}

/* =====================================================================
   PAGE : Commande (détail)
   ===================================================================== */
/* =====================================================================
   PAGE : Dépenses (saisies par le vendeur ou l'administrateur)
   ===================================================================== */
const CATEGORIES_DEPENSE = ["Transport", "Livraison", "Emballage", "Communication", "Repas", "Autre"];
/* =====================================================================
   PAGE : Diagnostics capillaires (administrateur) — bilans reçus depuis la boutique
   ===================================================================== */
const LIBELLES_DIAG = {
  hairType: "Type de cheveux", texture: "Texture", density: "Densité", scalp: "Cuir chevelu", problems: "Problèmes", duration: "Depuis",
  washFrequency: "Lavages", chemicals: "Produits chimiques", heatTools: "Appareils chauffants", diet: "Alimentation", water: "Eau par jour", stress: "Stress", sleep: "Sommeil suffisant",
};
const tonGravite = (g) => (g === "Élevée" ? "critical" : g === "Modérée" ? "warning" : "success");

function PageDiagnostics() {
  const { mode, toast, go } = useApp();
  const [liste, setListe] = useState(null);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  useEffect(() => { if (mode === "api") apiFetch("GET", "/api/diagnostics").then(setListe).catch((e) => { setListe([]); toast({ title: "Diagnostics indisponibles", desc: e.message, tone: "critical" }); }); }, [mode]);
  if (mode !== "api") return <><PageHeader title="Diagnostics" /><Card><EmptyState icon={Sparkles} title="Disponible avec le serveur" /></Card></>;
  if (!liste) return <><PageHeader title="Diagnostics" /><Card><div className="pdf-attente"><span className="spinner" />Chargement…</div></Card></>;

  const cherche = q.trim().toLowerCase();
  const vus = cherche ? liste.filter((d) => `${d.prenom} ${d.nom} ${d.telephone} ${d.reference} ${d.ville || ""}`.toLowerCase().includes(cherche)) : liste;
  const mois = new Date().toISOString().slice(0, 7);
  const moyenne = liste.length ? Math.round(liste.reduce((s, d) => s + d.score, 0) / liste.length) : 0;
  const ouvrir = async (d) => { try { setDetail(await apiFetch("GET", "/api/diagnostics/" + d.id)); } catch (e) { toast({ title: "Ouverture impossible", desc: e.message, tone: "critical" }); } };
  const exporter = () => {
    const champ = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lignes = [["Date", "Référence", "Prénom", "Nom", "Téléphone", "E-mail", "Ville", "Score", "Gravité", "Objectif principal", "Remise utilisée"],
      ...vus.map((d) => [d.cree_le, d.reference, d.prenom, d.nom, d.telephone, d.email, d.ville, d.score, d.gravite, d.objectif, d.remise_utilisee_le ? "oui" : "non"])];
    const url = URL.createObjectURL(new Blob(["\ufeff" + lignes.map((l) => l.map(champ).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "diagnostics-milana.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <>
      <PageHeader title="Diagnostics" meta="Les bilans capillaires faits par vos clients sur la boutique"
        actions={liste.length > 0 && <Btn icon={Download} onClick={exporter}>Exporter</Btn>} />
      <div className="kpi-grid kpi-3 stagger">
        {[["Diagnostics reçus", liste.length, fmtNum], ["Ce mois-ci", liste.filter((d) => d.cree_le.startsWith(mois)).length, fmtNum], ["Score moyen", moyenne, (v) => v + " / 100"]].map(([l, v, f], i) => (
          <div className="card kpi" key={l} style={{ "--i": i }}><div className="kpi-label"><span className="kpi-dot tint-1"><Sparkles size={13} /></span>{l}</div><div className="kpi-value"><CountUp value={v} format={f} /></div></div>
        ))}
      </div>
      <Card title="Bilans reçus" padded={false}>
        <div style={{ padding: "12px 16px" }}><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, un téléphone, une référence…" /></div>
        {vus.length === 0 ? <EmptyState icon={Sparkles} title={liste.length ? "Aucun résultat" : "Aucun diagnostic pour le moment"}>{liste.length ? "Essayez un autre nom ou numéro." : "Dès qu'un client termine le questionnaire sur la boutique, son bilan apparaît ici et sa fiche client est créée."}</EmptyState> : (
          <div className="table-scroll"><table className="table">
            <thead><tr><th>Date</th><th>Client</th><th className="hide-sm">Objectif principal</th><th className="right">Score</th><th>Gravité</th><th className="hide-sm">Remise</th></tr></thead>
            <tbody>{vus.map((d, i) => (
              <tr key={d.id} style={{ "--i": Math.min(i, 20), cursor: "pointer" }} onClick={() => ouvrir(d)}>
                <td>{fmtDateCourt(d.cree_le)}</td>
                <td className="wrap"><div className="cell-main">{d.prenom} {d.nom}</div><div className="cell-sub">{d.telephone}{d.ville ? " · " + d.ville : ""}</div></td>
                <td className="hide-sm wrap muted">{d.objectif}</td>
                <td className="right num strong">{d.score}</td>
                <td><Badge tone={tonGravite(d.gravite)} dot>{d.gravite}</Badge></td>
                <td className="hide-sm">{d.remise_utilisee_le ? <Badge tone="success">Utilisée</Badge> : <Badge>Non utilisée</Badge>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.prenom} ${detail.nom} — ${detail.reference}` : ""} size="lg"
        footer={<><Btn onClick={() => setDetail(null)}>Fermer</Btn>{detail?.client_id && <Btn variant="primary" icon={Users} onClick={() => { setDetail(null); go("clients"); }}>Voir les clients</Btn>}</>}>
        {detail && (
          <div className="stack">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Badge tone={tonGravite(detail.gravite)} dot>Score {detail.score} / 100 · gravité {detail.gravite.toLowerCase()}</Badge>
              <Badge>{detail.telephone}</Badge>{detail.email && <Badge>{detail.email}</Badge>}{detail.ville && <Badge>{detail.ville}</Badge>}
              {detail.sexe && <Badge>{detail.sexe === "femme" ? "Femme" : "Homme"}{detail.age ? `, ${detail.age} ans` : ""}</Badge>}
            </div>
            <div className="form-grid">
              {Object.entries(detail.resultat.scores || {}).map(([k, v]) => <div key={k}><div className="cell-sub" style={{ textTransform: "capitalize" }}>{k}</div><div className="num strong">{v} / 100</div></div>)}
            </div>
            <div><div className="cell-sub">Objectifs</div><div>{detail.resultat.objectif_principal} · {detail.resultat.objectif_secondaire}</div><div className="cell-sub" style={{ marginTop: 4 }}>Porosité : {detail.resultat.porosite} — résultats attendus en {detail.resultat.delai}</div></div>
            <div><div className="cell-sub">Produits recommandés</div>{(detail.resultat.recommandes || []).map((r) => <div key={r.pack_id}><b>{r.nom}</b> — {r.usage}</div>)}</div>
            <div><div className="cell-sub">Causes probables</div><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{(detail.resultat.causes || []).map((c) => <li key={c}>{c}</li>)}</ul></div>
            <div><div className="cell-sub">Réponses du client</div>
              <div className="form-grid">{Object.entries(LIBELLES_DIAG).map(([k, l]) => <div key={k}><div className="cell-sub">{l}</div><div>{[].concat(detail.reponses[k] ?? "—").join(", ").replace(/_/g, " ")}</div></div>)}</div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* =====================================================================
   PAGE : Formations (administrateur) — catalogue, leçons, évaluation, inscriptions
   ===================================================================== */
const STATUTS_INSCRIPTION = { gratuit: ["Gratuite", "info"], a_verifier: ["Paiement à vérifier", "warning"], payee: ["Payée", "success"], refusee: ["Paiement refusé", "critical"] };
const FORMATION_VIDE = { titre: "", description: "", categorie: "", duree: "", prix: "", publie: true, support_lien: "", minuteur: "", score_reussite: 60, tentatives_max: 3, lecons: [], questions: [] };

function FormationModal({ formation, onClose, onSaved }) {
  const { toast, confirm } = useApp();
  const [f, setF] = useState(FORMATION_VIDE);
  const [onglet, setOnglet] = useState("infos");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (formation) { setF({ ...FORMATION_VIDE, ...formation, prix: formation.prix || "", minuteur: formation.minuteur || "", lecons: formation.lecons || [], questions: formation.questions || [] }); setOnglet("infos"); setErr(""); setBusy(false); } }, [formation]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const majListe = (cle, n, champs) => setF((s) => ({ ...s, [cle]: s[cle].map((x, i) => (i === n ? { ...x, ...champs } : x)) }));
  const retirer = (cle, n) => setF((s) => ({ ...s, [cle]: s[cle].filter((_, i) => i !== n) }));
  const monter = (cle, n) => setF((s) => { const l = [...s[cle]]; if (n > 0) [l[n - 1], l[n]] = [l[n], l[n - 1]]; return { ...s, [cle]: l }; });
  const nouvelle = !formation?.id;
  const enregistrer = async () => {
    setBusy(true); setErr("");
    try {
      const corps = { ...f, prix: Number(f.prix) || 0, minuteur: f.minuteur === "" ? null : Number(f.minuteur) };
      onSaved(nouvelle ? await apiFetch("POST", "/api/formations", corps) : await apiFetch("PUT", "/api/formations/" + formation.id, corps));
      toast({ title: nouvelle ? "Formation créée" : "Formation enregistrée", desc: f.titre });
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const supprimer = async () => {
    if (!(await confirm({ title: `Supprimer « ${formation.titre} » ?`, message: "Ses leçons et son évaluation seront effacées.", confirmLabel: "Supprimer", tone: "critical" }))) return;
    try { onSaved(await apiFetch("DELETE", "/api/formations/" + formation.id)); toast({ title: "Formation supprimée" }); onClose(); } catch (e) { setErr(e.message); }
  };
  return (
    <Modal open={!!formation} onClose={onClose} title={nouvelle ? "Nouvelle formation" : "Modifier la formation"} size="lg"
      footer={<>{!nouvelle && <Btn variant="critical-plain" icon={Trash2} onClick={supprimer} className="spacer">Supprimer</Btn>}<Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" icon={Check} loading={busy} onClick={enregistrer}>Enregistrer</Btn></>}>
      <div className="stack">
        <Segmented full value={onglet} onChange={setOnglet} options={[{ value: "infos", label: "Présentation" }, { value: "lecons", label: `Leçons (${f.lecons.length})` }, { value: "eval", label: `Évaluation (${f.questions.length})` }]} />
        {err && <div className="banner banner-critical"><AlertTriangle size={16} /><div>{err}</div></div>}

        {onglet === "infos" && (
          <>
            <Field label="Titre"><Input value={f.titre} onChange={(e) => set("titre", e.target.value)} placeholder="Ex : Routine hydratation pour cheveux secs" autoFocus /></Field>
            <Field label="Description" optional><textarea className="textarea" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Ce que la personne va apprendre." /></Field>
            <div className="form-grid">
              <Field label="Prix" help="Vide ou 0 : formation gratuite, ouverte dès l'inscription."><Input value={f.prix} onChange={(e) => set("prix", e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" placeholder="Gratuite" /></Field>
              <Field label="Catégorie" optional><Input value={f.categorie} onChange={(e) => set("categorie", e.target.value)} placeholder="Ex : Bases" /></Field>
              <Field label="Durée affichée" optional><Input value={f.duree} onChange={(e) => set("duree", e.target.value)} placeholder="Ex : 20 min" /></Field>
              <Field label="Support complémentaire" optional help="Lien https vers un PDF ou une vidéo, donné aux inscrits."><Input value={f.support_lien} onChange={(e) => set("support_lien", e.target.value)} placeholder="https://…" /></Field>
            </div>
            {formation?.support_nom && <div className="cell-sub">Fiche PDF fournie avec la plateforme : {formation.support_nom}</div>}
            <div className="row" style={{ gap: 10 }}><Switch on={f.publie} onChange={(v) => set("publie", v)} label="Publiée" /><span>{f.publie ? "Publiée : visible dans le catalogue" : "Brouillon : cachée du catalogue, les inscrits gardent leur accès"}</span></div>
          </>
        )}

        {onglet === "lecons" && (
          <>
            <div className="cell-sub">Les leçons se suivent dans l'ordre. Dans le texte : une ligne vide sépare deux paragraphes, **deux étoiles** mettent en gras, un tiret en début de ligne fait une liste.</div>
            {f.lecons.map((l, n) => (
              <div className="card" key={n} style={{ padding: 14 }}>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}><Badge>Leçon {n + 1}</Badge><span className="spacer" />{n > 0 && <Btn size="sm" onClick={() => monter("lecons", n)}>Monter</Btn>}<button className="icon-btn danger" onClick={() => retirer("lecons", n)} aria-label="Retirer la leçon"><Trash2 size={15} /></button></div>
                <div className="stack">
                  <Input value={l.titre} onChange={(e) => majListe("lecons", n, { titre: e.target.value })} placeholder="Titre de la leçon" />
                  <textarea className="textarea" rows={6} value={l.contenu} onChange={(e) => majListe("lecons", n, { contenu: e.target.value })} placeholder="Texte de la leçon" />
                  <Input value={l.video_url || ""} onChange={(e) => majListe("lecons", n, { video_url: e.target.value })} placeholder="Lien d'une vidéo (facultatif) : https://…" />
                </div>
              </div>
            ))}
            <Btn icon={Plus} onClick={() => set("lecons", [...f.lecons, { titre: "", contenu: "", video_url: "" }])}>Ajouter une leçon</Btn>
          </>
        )}

        {onglet === "eval" && (
          <>
            <div className="cell-sub">Sans question, la formation n'a ni évaluation ni certificat. Cochez la bonne réponse de chaque question : elle n'est jamais montrée aux apprenants.</div>
            <div className="form-grid">
              <Field label="Score pour réussir"><Input value={f.score_reussite} onChange={(e) => set("score_reussite", e.target.value.replace(/[^\d]/g, ""))} suffix="%" inputMode="numeric" /></Field>
              <Field label="Tentatives autorisées"><Input value={f.tentatives_max} onChange={(e) => set("tentatives_max", e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" /></Field>
              <Field label="Durée de l'évaluation" help="Vide : 1 minute par question."><Input value={f.minuteur} onChange={(e) => set("minuteur", e.target.value.replace(/[^\d]/g, ""))} suffix="secondes" inputMode="numeric" /></Field>
            </div>
            {f.questions.map((q, n) => (
              <div className="card" key={n} style={{ padding: 14 }}>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}><Badge>Question {n + 1}</Badge><span className="spacer" /><button className="icon-btn danger" onClick={() => retirer("questions", n)} aria-label="Retirer la question"><Trash2 size={15} /></button></div>
                <div className="stack">
                  <Input value={q.question} onChange={(e) => majListe("questions", n, { question: e.target.value })} placeholder="Énoncé de la question" />
                  {[0, 1, 2, 3].map((k) => (
                    <div className="row" key={k} style={{ gap: 8 }}>
                      <input type="radio" name={"bonne-" + n} checked={q.bonne === k} onChange={() => majListe("questions", n, { bonne: k })} aria-label={`Réponse ${k + 1} : bonne réponse`} disabled={!(q.options[k] || "").trim()} />
                      <div className="grow"><Input value={q.options[k] || ""} onChange={(e) => { const o = [0, 1, 2, 3].map((x) => q.options[x] || ""); o[k] = e.target.value; majListe("questions", n, { options: o }); }} placeholder={`Réponse ${k + 1}${k > 1 ? " (facultative)" : ""}`} /></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Btn icon={Plus} onClick={() => set("questions", [...f.questions, { question: "", options: ["", "", "", ""], bonne: 0 }])}>Ajouter une question</Btn>
          </>
        )}
      </div>
    </Modal>
  );
}

function PageFormations() {
  const { mode, toast, confirm } = useApp();
  const [t, setT] = useState(null);
  const [vue, setVue] = useState("formations");
  const [edition, setEdition] = useState(null);
  const [offre, setOffre] = useState(null); // { formation_id, nom, telephone }
  const [busy, setBusy] = useState("");
  useEffect(() => { if (mode === "api") apiFetch("GET", "/api/formations").then(setT).catch((e) => { setT({ formations: [], inscriptions: [] }); toast({ title: "Formations indisponibles", desc: e.message, tone: "critical" }); }); }, [mode]);
  if (mode !== "api") return <><PageHeader title="Formations" /><Card><EmptyState icon={FileText} title="Disponible avec le serveur" /></Card></>;
  if (!t) return <><PageHeader title="Formations" /><Card><div className="pdf-attente"><span className="spinner" />Chargement…</div></Card></>;

  const aVerifier = t.inscriptions.filter((i) => i.statut === "a_verifier");
  const encaisse = t.inscriptions.filter((i) => i.statut === "payee").reduce((s, i) => s + i.montant, 0);
  const lienAcces = (i) => `${location.origin}/#/formation/${i.jeton}`;
  const copier = (i) => navigator.clipboard?.writeText(lienAcces(i)).then(() => toast({ title: "Lien d'accès copié", desc: i.nom }), () => toast({ title: "Copie impossible", tone: "critical" }));
  const paiement = async (i, recu) => {
    if (!(await confirm({ title: recu ? `Paiement de ${i.nom} reçu ?` : `Refuser le paiement de ${i.nom} ?`, message: recu ? `${fmt(i.montant)} par ${i.operateur}, référence ${i.reference_paiement}. Vérifiez d'abord sur votre téléphone : l'accès à la formation s'ouvre tout de suite.` : "La personne verra que son paiement n'a pas été retrouvé.", confirmLabel: recu ? "Paiement reçu" : "Refuser", tone: recu ? undefined : "critical" }))) return;
    setBusy(i.id);
    try { setT(await apiFetch("POST", `/api/formations/inscriptions/${i.id}/paiement`, { recu })); toast({ title: recu ? "Accès ouvert" : "Paiement refusé", desc: i.nom }); }
    catch (e) { toast({ title: "Action impossible", desc: e.message, tone: "critical" }); }
    finally { setBusy(""); }
  };
  const offrir = async () => {
    setBusy("offre");
    try {
      const r = await apiFetch("POST", "/api/formations/inscriptions", offre);
      setT({ formations: r.formations, inscriptions: r.inscriptions });
      const lien = `${location.origin}/#/formation/${r.jeton}`;
      navigator.clipboard?.writeText(lien).catch(() => {});
      toast({ title: "Accès créé, lien copié", desc: "Envoyez-le à " + offre.nom });
      setOffre(null); setVue("inscriptions");
    } catch (e) { toast({ title: "Création impossible", desc: e.message, tone: "critical" }); }
    finally { setBusy(""); }
  };

  return (
    <>
      <PageHeader title="Formations" meta="Vos formations, leurs leçons, et les personnes inscrites"
        actions={<><Btn icon={UserPlus} onClick={() => setOffre({ formation_id: t.formations[0]?.id || "", nom: "", telephone: "" })} disabled={!t.formations.length}>Donner un accès</Btn><Btn variant="primary" icon={Plus} onClick={() => setEdition({})}>Nouvelle formation</Btn></>} />
      {aVerifier.length > 0 && <div className="banner banner-warning" style={{ marginBottom: 16 }}><AlertTriangle size={16} /><div className="grow"><b>{aVerifier.length} paiement{aVerifier.length > 1 ? "s" : ""} à vérifier.</b> Contrôlez la référence sur votre téléphone, puis ouvrez l'accès.</div><Btn size="sm" variant="primary" onClick={() => setVue("inscriptions")}>Voir</Btn></div>}
      <div className="kpi-grid kpi-3 stagger">
        {[["Formations publiées", t.formations.filter((f) => f.publie).length, fmtNum], ["Personnes inscrites", t.inscriptions.filter((i) => i.statut === "gratuit" || i.statut === "payee").length, fmtNum], ["Encaissé (formations payées)", encaisse, fmt]].map(([l, v, f], i) => (
          <div className="card kpi" key={l} style={{ "--i": i }}><div className="kpi-label"><span className="kpi-dot tint-1"><FileText size={13} /></span>{l}</div><div className="kpi-value"><CountUp value={v} format={f} /></div></div>
        ))}
      </div>
      <div style={{ margin: "4px 0 14px" }}><Segmented value={vue} onChange={setVue} options={[{ value: "formations", label: `Formations (${t.formations.length})` }, { value: "inscriptions", label: `Inscriptions (${t.inscriptions.length})` }]} /></div>

      {vue === "formations" ? (
        <Card title="Catalogue" padded={false}>
          <div style={{ height: 12 }} />
          {t.formations.length === 0 ? <EmptyState icon={FileText} title="Aucune formation" action={<Btn variant="primary" icon={Plus} onClick={() => setEdition({})}>Nouvelle formation</Btn>}>Créez votre première formation : un titre, quelques leçons, une évaluation.</EmptyState> : (
            <div className="table-scroll"><table className="table">
              <thead><tr><th>Formation</th><th className="hide-sm">Contenu</th><th className="right">Prix</th><th className="right hide-sm">Inscrits</th><th>État</th><th /></tr></thead>
              <tbody>{t.formations.map((f, i) => (
                <tr key={f.id} style={{ "--i": Math.min(i, 20), cursor: "pointer" }} onClick={() => setEdition(f)}>
                  <td className="wrap"><div className="cell-main">{f.titre}</div><div className="cell-sub">{f.categorie || "Sans catégorie"}{f.duree ? " · " + f.duree : ""}</div></td>
                  <td className="hide-sm muted">{f.lecons.length} leçon{f.lecons.length > 1 ? "s" : ""} · {f.questions.length ? f.questions.length + " questions" : "sans évaluation"}</td>
                  <td className="right num strong">{f.prix > 0 ? fmt(f.prix) : "Gratuite"}</td>
                  <td className="right num hide-sm">{f.inscrits}</td>
                  <td>{f.publie ? <Badge tone="success" dot>Publiée</Badge> : <Badge>Brouillon</Badge>}</td>
                  <td className="right"><button className="icon-btn" aria-label="Modifier"><Pencil size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      ) : (
        <Card title="Personnes inscrites" padded={false}>
          <div style={{ height: 12 }} />
          {t.inscriptions.length === 0 ? <EmptyState icon={Users} title="Aucune inscription">Les inscriptions faites sur la boutique apparaissent ici.</EmptyState> : (
            <div className="table-scroll"><table className="table">
              <thead><tr><th>Date</th><th>Personne</th><th className="hide-sm">Formation</th><th>Paiement</th><th className="hide-sm">Avancement</th><th /></tr></thead>
              <tbody>{t.inscriptions.map((i, n) => {
                const [libelle, ton] = STATUTS_INSCRIPTION[i.statut] || [i.statut, undefined];
                return (
                  <tr key={i.id} style={{ "--i": Math.min(n, 20) }}>
                    <td>{fmtDateCourt(i.cree_le)}</td>
                    <td className="wrap"><div className="cell-main">{i.nom}</div><div className="cell-sub">{i.telephone}</div></td>
                    <td className="hide-sm wrap muted">{i.formation}</td>
                    <td className="wrap"><Badge tone={ton} dot>{libelle}</Badge>{i.reference_paiement && <div className="cell-sub">{fmt(i.montant)} · {i.operateur} · réf. {i.reference_paiement}</div>}</td>
                    <td className="hide-sm">{i.certificat ? <Badge tone="success">Certifié · {i.meilleur_score} %</Badge> : <span className="muted">{i.lecons_faites} / {i.lecons} leçons{i.tentatives ? ` · ${i.tentatives} essai${i.tentatives > 1 ? "s" : ""}` : ""}</span>}</td>
                    <td className="right"><div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {i.statut === "a_verifier" && <><Btn size="sm" variant="primary" icon={Check} loading={busy === i.id} onClick={() => paiement(i, true)}>Reçu</Btn><Btn size="sm" onClick={() => paiement(i, false)}>Refuser</Btn></>}
                      {i.statut === "refusee" && <Btn size="sm" onClick={() => paiement(i, true)}>Finalement reçu</Btn>}
                      <button className="icon-btn" onClick={() => copier(i)} aria-label="Copier le lien d'accès" title="Copier le lien d'accès"><Copy size={15} /></button>
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </Card>
      )}

      <FormationModal formation={edition} onClose={() => setEdition(null)} onSaved={setT} />
      <Modal open={!!offre} onClose={() => setOffre(null)} title="Donner un accès à une formation"
        footer={<><Btn onClick={() => setOffre(null)}>Annuler</Btn><Btn variant="primary" icon={Check} loading={busy === "offre"} onClick={offrir}>Créer l'accès</Btn></>}>
        {offre && (
          <div className="stack">
            <div className="cell-sub">Pour une personne qui a payé en boutique, ou à qui vous offrez la formation. Vous recevez un lien à lui envoyer.</div>
            <Field label="Formation"><Select value={offre.formation_id} onChange={(e) => setOffre({ ...offre, formation_id: e.target.value })}>{t.formations.map((f) => <option key={f.id} value={f.id}>{f.titre}</option>)}</Select></Field>
            <Field label="Nom complet" help="Il figurera sur le certificat."><Input value={offre.nom} onChange={(e) => setOffre({ ...offre, nom: e.target.value })} /></Field>
            <Field label="Téléphone"><Input value={offre.telephone} onChange={(e) => setOffre({ ...offre, telephone: e.target.value })} inputMode="tel" /></Field>
          </div>
        )}
      </Modal>
    </>
  );
}

function PageDepenses() {
  const { data, mode, toast, confirm, rafraichir, estAdmin, auth } = useApp();
  const vide = { libelle: "", categorie: "Transport", montant: "", date: isoDate(new Date()), note: "" };
  const [f, setF] = useState(vide);
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const liste = data.depenses || [];
  const mois = isoDate(new Date()).slice(0, 7), jour = isoDate(new Date());
  const somme = (l) => l.reduce((s, d) => s + d.montant, 0);
  if (mode !== "api") return <><PageHeader title="Dépenses" /><Card><EmptyState icon={Wallet} title="Disponible avec le serveur" /></Card></>;
  const enregistrer = async () => {
    if (f.libelle.trim().length < 2) return toast({ title: "Indiquez l'objet de la dépense", tone: "critical" });
    if (!(Number(f.montant) > 0)) return toast({ title: "Indiquez le montant", tone: "critical" });
    setBusy(true);
    try {
      await apiFetch("POST", "/api/depenses", { ...f, montant: Number(f.montant) });
      toast({ title: "Dépense enregistrée", desc: `${f.libelle.trim()} · ${fmt(Number(f.montant))}` });
      setOuvert(false); setF(vide); await rafraichir();
    } catch (e) { toast({ title: "Enregistrement impossible", desc: e.message, tone: "critical" }); }
    finally { setBusy(false); }
  };
  const supprimer = async (d) => {
    if (!(await confirm({ title: `Supprimer « ${d.libelle} » ?`, message: `Dépense de ${fmt(d.montant)}.`, confirmLabel: "Supprimer", tone: "critical" }))) return;
    try { await apiFetch("DELETE", "/api/depenses/" + d.id); await rafraichir(); } catch (e) { toast({ title: "Suppression impossible", desc: e.message, tone: "critical" }); }
  };
  return (
    <>
      <PageHeader title="Dépenses" meta={estAdmin ? "Dépenses saisies par vous et par vos vendeurs" : "Vos dépenses : transport, livraison, emballage…"}
        actions={<Btn variant="primary" icon={Plus} onClick={() => { setF(vide); setOuvert(true); }}>Saisir une dépense</Btn>} />
      <div className="kpi-grid kpi-3 stagger">
        {[["Aujourd'hui", somme(liste.filter((d) => d.date === jour))], ["Ce mois-ci", somme(liste.filter((d) => d.date.startsWith(mois)))], ["Total", somme(liste)]].map(([l, v], i) => (
          <div className="card kpi" key={l} style={{ "--i": i }}><div className="kpi-label"><span className="kpi-dot tint-3"><Wallet size={13} /></span>{l}</div><div className="kpi-value"><CountUp value={v} format={fmt} /></div></div>
        ))}
      </div>
      <Card title="Dépenses enregistrées" padded={false}>
        <div style={{ height: 12 }} />
        {liste.length === 0 ? <EmptyState icon={Wallet} title="Aucune dépense" action={<Btn variant="primary" icon={Plus} onClick={() => setOuvert(true)}>Saisir une dépense</Btn>}>Notez ici vos frais : transport, livraison, emballage, crédit de communication…</EmptyState> : (
          <div className="table-scroll"><table className="table">
            <thead><tr><th>Date</th><th>Objet</th><th className="hide-sm">Catégorie</th>{estAdmin && <th className="hide-sm">Saisie par</th>}<th className="right">Montant</th><th /></tr></thead>
            <tbody>{liste.map((d, i) => (
              <tr key={d.id} style={{ "--i": Math.min(i, 20) }}>
                <td>{fmtDateCourt(d.date)}</td>
                <td className="wrap"><div className="cell-main">{d.libelle}</div>{d.note && <div className="cell-sub">{d.note}</div>}</td>
                <td className="hide-sm"><Badge>{d.categorie}</Badge></td>
                {estAdmin && <td className="hide-sm muted">{d.auteur || "—"}</td>}
                <td className="right num strong">{fmt(d.montant)}</td>
                <td className="right">{(estAdmin || (d.auteurId === auth?.utilisateur?.id && String(d.creeLe).slice(0, 10) === new Date().toISOString().slice(0, 10))) && <button className="icon-btn danger" onClick={() => supprimer(d)} aria-label={`Supprimer ${d.libelle}`}><Trash2 size={15} /></button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Saisir une dépense"
        footer={<><Btn onClick={() => setOuvert(false)}>Annuler</Btn><Btn variant="primary" icon={Check} loading={busy} onClick={enregistrer}>Enregistrer</Btn></>}>
        <div className="stack">
          <Field label="Objet de la dépense"><Input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="Ex : taxi pour livraison à Cocody" autoFocus /></Field>
          <div className="form-grid">
            <Field label="Montant"><Input value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value.replace(/[^\d]/g, "") })} suffix="FCFA" inputMode="numeric" /></Field>
            <Field label="Date"><Input type="date" value={f.date} max={isoDate(new Date())} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          </div>
          <Field label="Catégorie"><div className="chips">{CATEGORIES_DEPENSE.map((c) => <button type="button" key={c} className={cx("chip", f.categorie === c && "on")} onClick={() => setF({ ...f, categorie: c })}>{c}</button>)}</div></Field>
          <Field label="Note" optional><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}

/* Retour d'un article après la vente : rétractation (remboursement) ou échange */
function RetourModal({ open, cmd, onClose, onFait }) {
  const { data, toast, rafraichir } = useApp();
  const [f, setF] = useState({ ligne: "", qte: 1, motif: "retractation", echange: "", stock: true, note: "", tout: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ ligne: cmd.lignes[0]?.id || "", qte: 1, motif: "retractation", echange: "", stock: true, note: "", tout: false }); setBusy(false); } }, [open]);
  if (!cmd) return null;
  const ligne = cmd.lignes.find((l) => l.id === f.ligne) || cmd.lignes[0];
  const seule = cmd.lignes.length === 1 && f.qte >= (ligne?.qte || 1);
  const autres = data.packs.filter((p) => p.actif !== false && p.stock > 0);
  const nouveau = data.packs.find((p) => p.id === f.echange);
  const prixNouveau = nouveau ? (promoActive(nouveau) ? nouveau.prixPromo : nouveau.prix) : 0;
  const complet = f.motif === "retractation" && (f.tout || seule);
  const diff = complet ? cmd.lignes.reduce((s, l) => s + l.qte * l.prixUnitaire, 0) : ligne ? f.qte * ligne.prixUnitaire - (f.motif === "echange" ? f.qte * prixNouveau : 0) : 0;
  const valider = async () => {
    if (f.motif === "echange" && !f.echange) return toast({ title: "Choisissez l'article donné en échange", tone: "critical" });
    setBusy(true);
    try {
      await apiFetch("POST", `/api/commandes/${cmd.id}/retour`, complet ? { tout: true, remettre_en_stock: f.stock, note: f.note } : { vente_id: ligne.id, quantite: f.qte, motif: f.motif, echange_pack_id: f.echange || undefined, remettre_en_stock: f.stock, note: f.note });
      toast({ title: f.motif === "echange" ? "Échange enregistré" : "Retour enregistré", desc: diff > 0 ? `${fmt(diff)} à rembourser au client` : diff < 0 ? `${fmt(-diff)} de complément à encaisser` : "Sans différence de prix" });
      await rafraichir(); onFait?.(); onClose();
    } catch (e) { toast({ title: "Retour impossible", desc: e.message, tone: "critical" }); setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Retour d'article — ${cmd.numero}`}
      footer={<><Btn onClick={onClose}>Fermer</Btn><Btn variant="primary" icon={RotateCcw} loading={busy} onClick={valider}>{f.motif === "echange" ? "Enregistrer l'échange" : "Enregistrer le retour"}</Btn></>}>
      <div className="stack">
        <Field label="Motif"><Segmented full value={f.motif} onChange={(motif) => setF({ ...f, motif })} options={[{ value: "retractation", label: "Rétractation" }, { value: "echange", label: "Échange" }]} /></Field>
        {f.motif === "retractation" && cmd.lignes.length > 0 && <Checkbox checked={f.tout} onChange={() => setF({ ...f, tout: !f.tout })} label={`Le client rend tous les articles de la commande (${cmd.lignes.reduce((s, l) => s + l.qte, 0)})`} />}
        {!(f.motif === "retractation" && f.tout) && <>
        <Field label="Article rendu par le client">
          <Select value={ligne?.id || ""} onChange={(e) => setF({ ...f, ligne: e.target.value, qte: 1 })}>{cmd.lignes.map((l) => <option key={l.id} value={l.id}>{l.pack?.nom || "Article"} — {l.qte} × {fmt(l.prixUnitaire)}</option>)}</Select>
        </Field>
        <Field label="Quantité rendue" help={ligne ? `${ligne.qte} acheté${ligne.qte > 1 ? "s" : ""} sur cette commande.` : null}><Stepper value={f.qte} onChange={(qte) => setF({ ...f, qte })} min={1} max={ligne?.qte || 1} /></Field>
        </>}
        {f.motif === "echange" && (
          <Field label="Article donné en échange">
            <Select value={f.echange} onChange={(e) => setF({ ...f, echange: e.target.value })}><option value="">Choisir un article…</option>{autres.map((p) => <option key={p.id} value={p.id}>{p.nom} — {fmt(promoActive(p) ? p.prixPromo : p.prix)}{stockCache(p) ? "" : ` (${p.stock} en stock)`}</option>)}</Select>
          </Field>
        )}
        <Checkbox checked={f.stock} onChange={() => setF({ ...f, stock: !f.stock })} label="Remettre l'article rendu en stock (décochez s'il est abîmé)" />
        <Field label="Note" optional><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ex : taille trop petite" /></Field>
        {complet
          ? <div className="banner banner-info"><Banknote size={16} /><div><b>Retour complet : {fmt(diff)} à rembourser</b> au client. La commande passe en « Annulée »{cmd.statut === "livree" ? ", même après livraison," : ""} et le retour est noté dans la chronologie.</div></div>
          : <div className={cx("banner", diff > 0 ? "banner-info" : diff < 0 ? "banner-warning" : "banner-success")}><Banknote size={16} /><div>{diff > 0 ? <><b>{fmt(diff)} à rembourser</b> au client.</> : diff < 0 ? <><b>{fmt(-diff)} de complément</b> à encaisser.</> : "Aucune différence de prix."} Le total de la commande et le ticket de caisse sont mis à jour.</div></div>}
      </div>
    </Modal>
  );
}

function PageCommande({ id }) {
  const { data, update, sync, go, toast, confirm, estAdmin } = useApp();
  const [receipt, setReceipt] = useState(false);
  const [encaisser, setEncaisser] = useState(false);
  const [comment, setComment] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [note, setNote] = useState(null);
  const [retour, setRetour] = useState(false);
  const [retours, setRetours] = useState([]);
  const { mode } = useApp();
  const chargerRetours = useCallback(() => { if (mode === "api") apiFetch("GET", `/api/commandes/${id}/retours`).then(setRetours).catch(() => {}); }, [id, mode]);
  useEffect(() => { chargerRetours(); }, [chargerRetours]);
  const c = useMemo(() => enrichCommandes(data).find((x) => x.id === id), [data, id]);

  if (!c) {
    return <><PageHeader title="Commande introuvable" back={() => go("commandes")} /><Card><EmptyState icon={ShoppingCart} title="Cette commande n'existe pas" action={<Btn variant="primary" onClick={() => go("commandes")}>Retour aux commandes</Btn>}>Elle a peut-être été supprimée.</EmptyState></Card></>;
  }
  const v = c.vente;
  const next = NEXT_STEP[c.statut];
  const setStatut = (s) => {
    update((d) => applyStatut(d, [c.id], s));
    sync(["PATCH", `/api/commandes/${c.id}/statut`, { statut: s }]);
    toast({ title: `Commande ${c.numero} : ${STATUTS[s].label.toLowerCase()}`, desc: s === "annulee" ? "Les articles ont été remis en stock." : c.statut === "annulee" ? "Le stock a été mis à jour." : undefined });
  };
  const cancel = async () => {
    if (await confirm({ title: `Annuler la commande ${c.numero} ?`, message: "La commande sera marquée comme annulée et le client remboursé. Les articles seront remis en stock.", confirmLabel: "Annuler la commande", tone: "critical" })) setStatut("annulee");
  };
  const remove = async () => {
    if (await confirm({ title: `Supprimer ${c.numero} ?`, message: "La commande et la vente associée seront définitivement supprimées. Le stock sera réintégré.", confirmLabel: "Supprimer", tone: "critical" })) {
      update((d) => deleteCommande(d, c.id));
      sync(["DELETE", `/api/commandes/${c.id}`]);
      go("commandes");
      toast({ title: "Commande supprimée", desc: c.numero });
    }
  };
  const patch = (fields) => update((d) => ({ ...d, commandes: d.commandes.map((x) => (x.id === c.id ? { ...x, ...fields(x) } : x)) }));
  const addComment = () => {
    if (!comment.trim()) return;
    patch((x) => ({ historique: [...(x.historique || []), { type: "note", texte: comment.trim(), date: new Date().toISOString() }] }));
    sync(["POST", `/api/commandes/${c.id}/commentaires`, { texte: comment.trim() }]);
    setComment("");
  };
  const stepIdx = FLOW.indexOf(c.statut);
  const events = [...(c.historique || [])].reverse();
  const cs = c.client ? clientStats(data, c.client.id) : null;

  return (
    <>
      <PageHeader
        back={() => go("commandes")}
        title={c.numero}
        badges={<><CanalBadge c={c} />{c.typeVente === "b2b" && <Badge tone="info">B2B</Badge>}<PaiementBadge c={c} /><StatutBadge statut={c.statut} /></>}
        meta={`${c.numeroTicket ? "Ticket " + c.numeroTicket + " · " : ""}${fmtDateTime(venteStamp(v))} · ${c.canal === "en_ligne" ? "commande passée sur la boutique en ligne" : "via le point de vente"}`}
        actions={<>
          <Btn icon={Receipt} onClick={() => setReceipt(true)}>Ticket de caisse</Btn>
          <MoreMenu items={[
            c.statut === "annulee" && estAdmin && { label: "Rétablir la commande", icon: RotateCcw, onClick: () => setStatut("en_attente") },
            c.statut !== "annulee" && mode === "api" && { label: "Retour ou échange d'article", icon: RotateCcw, onClick: () => setRetour(true) },
            c.statut !== "annulee" && estAdmin && { label: "Annuler la commande", icon: XCircle, onClick: cancel },
            c.statut !== "annulee" && c.statut !== "livree" && estAdmin && { label: c.livraison ? "Passer en retrait sur place" : "Passer en livraison", icon: Truck, onClick: () => { patch(() => ({ livraison: !c.livraison })); sync(["PATCH", `/api/commandes/${c.id}/livraison`, { livraison: !c.livraison }]); } },
            ...(estAdmin ? ["sep", { label: "Supprimer", icon: Trash2, tone: "critical", onClick: remove }] : []),
          ]} />
        </>}
      />

      <RetourModal open={retour} cmd={c} onClose={() => setRetour(false)} onFait={chargerRetours} />
      <div className="layout-detail">
        <div>
          <Card title={<span className="row"><StatutBadge statut={c.statut} /></span>} actions={next && <Btn variant="primary" icon={next.icon} onClick={() => setStatut(next.statut)}>{next.label}</Btn>}>
            {c.statut === "annulee" ? (
              <div className="banner banner-critical"><XCircle size={16} /><div>Cette commande a été annulée. Les articles ont été remis en stock.</div></div>
            ) : (
              <div className="steps">
                {FLOW.map((s, i) => {
                  const St = STATUTS[s];
                  return (
                    <div key={s} className={cx("step", i <= stepIdx && "done", i === stepIdx && "current")}>
                      <div className="step-dot">{i < stepIdx ? <Check size={15} strokeWidth={3} /> : <St.icon size={15} />}</div>
                      <div className="step-label">{St.label}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 16, borderTop: "1px solid var(--divider)" }}>
              {c.lignes.map((l) => (
                <div key={l.id} className="list-item ligne-commande" style={{ padding: "12px 0 0", borderTop: 0 }}>
                  <Thumb pack={l.pack} size="lg" />
                  <div className="grow">
                    <div className="strong">{l.pack?.nom || "Produit supprimé"}</div>
                    <div className="subtle">{l.pack?.sku && `SKU : ${l.pack.sku}`}</div>
                    <div className="num muted">{fmt(l.prixUnitaire)} × {l.qte}</div>
                  </div>
                  <div className="num strong ligne-total">{fmt(l.total)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title={<span className="row"><PaiementBadge c={c} /></span>}
            actions={["en_attente", "a_verifier", "echoue"].includes(v?.statutPaiement) && c.statut !== "annulee" && (estAdmin || v?.statutPaiement !== "a_verifier") && (v?.statutPaiement === "a_verifier"
              ? <Btn variant="brand" icon={ShieldCheck} onClick={() => setEncaisser(true)}>Vérifier le paiement</Btn>
              : <Btn variant="brand" icon={Banknote} onClick={() => setEncaisser(true)}>Encaisser le paiement</Btn>)}>
            <div className="stack-sm">
              <div className="summary-line"><span>Sous-total</span><span>{c.articles} article{c.articles > 1 ? "s" : ""}</span><span className="num">{fmt(c.sousTotal)}</span></div>
              <div className="summary-line"><span>Livraison</span><span /><span className="num">{c.frais ? fmt(c.frais) : c.canal === "en_ligne" ? "Gratuite" : "—"}</span></div>
              <div className="summary-line" style={{ color: "var(--text)", fontWeight: 650 }}><span>Total</span><span /><span className="num">{fmt(c.total)}</span></div>
              <div className="summary-total" style={{ fontSize: 13 }}>
                <span className="muted">{{
                  en_attente: c.statut === "annulee" ? "Non payé" : "À encaisser à la livraison",
                  a_verifier: "Transfert déclaré par le client, à vérifier",
                  en_cours: "Paiement en ligne non finalisé",
                  echoue: "Paiement en ligne échoué",
                }[v?.statutPaiement] || (c.statut === "annulee" ? "Remboursé au client" : "Payé par le client")}</span>
                <span className="num strong">{fmt(c.total)}</span>
              </div>
              {v?.statutPaiement !== "en_attente" && v?.statutPaiement !== "en_cours" && (
                <div className="pay-recap">
                  <ModePaiement mode={v?.paiement} taille={32} />
                  <div className="grow">
                    <div className="strong">{infoPaiement(v?.paiement).key}</div>
                    <div className="subtle">
                      {[v?.telPaiement && `N° ${v.telPaiement}`, v?.reference && `Réf. ${v.reference}`, v?.montantRecu != null && `Reçu ${fmt(v.montantRecu)} · rendu ${fmt(Math.max(0, v.montantRecu - c.total))}`].filter(Boolean).join(" · ") || "Aucun détail enregistré"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {retours.length > 0 && (
            <Card title="Articles retournés" sub={`${retours.length} retour${retours.length > 1 ? "s" : ""} sur cette commande`}>
              <div className="stack-sm">
                {retours.map((r) => (
                  <div key={r.id} className="retour-ligne">
                    <span className={cx("todo-icon", r.motif === "echange" ? "tint-4" : "tint-3")}><RotateCcw size={15} /></span>
                    <div className="grow">
                      <div className="strong">{r.quantite} × {r.article}{r.motif === "echange" ? <> → {r.echange_article}</> : null}</div>
                      <div className="subtle">{r.motif === "echange" ? "Échange" : "Rétractation"} · {fmtDateTime(r.cree_le)} · {r.remis_en_stock ? "remis en stock" : "non remis en stock"}{r.note ? ` · ${r.note}` : ""}</div>
                    </div>
                    <Badge tone={r.difference > 0 ? "info" : r.difference < 0 ? "warning" : "neutral"}>{r.difference > 0 ? `${fmt(r.difference)} à rembourser` : r.difference < 0 ? `${fmt(-r.difference)} à encaisser` : "Sans différence"}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Chronologie">
            <div className="comment-box">
              <Avatar name="Moi" size="sm" />
              <textarea className="textarea grow" rows={1} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ajouter un commentaire…"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addComment(); }} />
              <Btn onClick={addComment} disabled={!comment.trim()}>Publier</Btn>
            </div>
            <div className="timeline">
              {events.map((e, i) => (
                <div key={i} className={cx("tl-item", i === 0 && "first")} style={{ "--i": i }}>
                  <span className="tl-dot" />
                  {e.type === "note" ? (
                    <><div className="tl-title row"><MessageSquare size={13} /> Commentaire</div><div className="tl-note">{e.texte}</div></>
                  ) : e.type === "paiement" ? (
                    <div className="tl-title row"><Banknote size={13} /> {e.texte}</div>
                  ) : (
                    <div className="tl-title">{e.statut === "en_attente" && i === events.length - 1 ? `Commande passée par ${c.client?.nom || "un client"} · ${fmt(c.total)}` : `Commande ${STATUTS[e.statut]?.label.toLowerCase()}`}</div>
                  )}
                  <div className="tl-date">{fmtDateTime(e.date)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <Card title="Notes" actions={note == null && <button className="icon-btn" onClick={() => setNote(c.note || "")} aria-label="Modifier la note"><Pencil size={15} /></button>}>
            {note == null ? (
              <p className={c.note ? "" : "subtle"} style={{ whiteSpace: "pre-wrap" }}>{c.note || "Aucune note sur cette commande"}</p>
            ) : (
              <div className="stack-sm">
                <textarea className="textarea" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Instructions de livraison, remarques…" />
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <Btn size="sm" onClick={() => setNote(null)}>Annuler</Btn>
                  <Btn size="sm" variant="primary" onClick={() => { patch(() => ({ note })); sync(["PATCH", `/api/commandes/${c.id}`, { note }]); setNote(null); toast({ title: "Note enregistrée" }); }}>Enregistrer</Btn>
                </div>
              </div>
            )}
          </Card>

          <Card title="Client">
            {c.client ? (
              <div className="stack-sm">
                <a href={`#/clients/${c.client.id}`} className="row" style={{ gap: 10, color: "inherit" }}>
                  <Avatar name={c.client.nom} />
                  <div className="grow"><div className="link">{c.client.nom}</div><div className="subtle">{cs.nb} commande{cs.nb > 1 ? "s" : ""}</div></div>
                  {c.client.statut === "VIP" && <Badge tone="warning" icon={Star}>VIP</Badge>}
                </a>
                <div className="pop-sep" style={{ margin: "8px 0" }} />
                <div className="label">Coordonnées</div>
                <div className="row muted"><Phone size={14} /><a href={`tel:${c.client.tel.replace(/\s/g, "")}`}>{c.client.tel}</a></div>
                {c.client.email && <div className="row muted"><Mail size={14} /><a href={`mailto:${c.client.email}`} className="truncate">{c.client.email}</a></div>}
              </div>
            ) : <p className="subtle">Client supprimé</p>}
          </Card>

          <Card title="Adresse de livraison" actions={<button className="icon-btn" onClick={() => { setAddr(c.adresseLivraison || ""); setAddrOpen(true); }} aria-label="Modifier l'adresse"><Pencil size={15} /></button>}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <MapPin size={16} className="muted" style={{ marginTop: 2 }} />
              <div>{c.client?.nom && <div className="strong">{c.client.nom}</div>}<div className={c.adresseLivraison ? "muted" : "subtle"}>{c.adresseLivraison || "Aucune adresse"}</div></div>
            </div>
          </Card>
        </div>
      </div>

      <TicketModal open={receipt} cmd={c} onClose={() => setReceipt(false)} />
      <EncaisserModal open={encaisser} cmd={c} onClose={() => setEncaisser(false)} />
      <Modal open={addrOpen} onClose={() => setAddrOpen(false)} title="Adresse de livraison" size="sm"
        footer={<><Btn onClick={() => setAddrOpen(false)}>Annuler</Btn><Btn variant="primary" onClick={() => { patch(() => ({ adresseLivraison: addr.trim() })); sync(["PATCH", `/api/commandes/${c.id}`, { adresse_livraison: addr.trim() }]); setAddrOpen(false); toast({ title: "Adresse mise à jour" }); }}>Enregistrer</Btn></>}>
        <Field label="Adresse"><textarea className="textarea" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Quartier, rue, point de repère…" /></Field>
      </Modal>
    </>
  );
}

/* =====================================================================
   PAGE : Produits
   ===================================================================== */
/* Fiche produit en lecture seule (vendeur) */
function FicheProduitModal({ open, pack, onClose, onVendre }) {
  const elements = String(pack?.contenu || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return (
    <Modal open={open} onClose={onClose} title={pack?.nom || "Produit"} size="md"
      footer={pack && <><Btn onClick={onClose}>Fermer</Btn><Btn variant="primary" icon={ShoppingCart} disabled={pack.stock <= 0 || pack.actif === false} onClick={() => onVendre(pack)}>Vendre ce produit</Btn></>}>
      {pack && (
        <div className="stack">
          <div className="row" style={{ gap: 14 }}>
            <Thumb pack={pack} size="xl" />
            <div className="grow stack-sm">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="strong num" style={{ fontSize: 22 }}>{fmt(prixEffectif(pack))}</span>{promoActive(pack) && <><span className="prix-barre">{fmt(pack.prix)}</span><Badge tone="success">Promo</Badge></>}</div>
              {promoActive(pack) && pack.promoFin && <div className="subtle">Promotion jusqu'au {fmtDate(isoDate(new Date(pack.promoFin)))}</div>}
              <div><StockBadge stock={pack.stock} seuil={seuilDe(pack)} /> <span className="subtle">{pack.sku}</span></div>
            </div>
          </div>
          {pack.desc && <p className="muted">{pack.desc}</p>}
          {elements.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Contenu du pack</div>
              <ul className="liste-contenu">{elements.map((x, i) => <li key={i}><Check size={14} />{x}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function PageProduits({ route }) {
  const { data, update, sync, go, toast, estAdmin, openSale } = useApp();
  const [tab, setTab] = useState(route.query.filtre || "tous");
  const [q, setQ] = useState("");
  const [view, setView] = useState(() => readJson("moncommerce-vue-produits") || "grille");
  const sort = useSort("nom", "asc");
  useEffect(() => { if (route.query.filtre) setTab(route.query.filtre); }, [route.query.filtre]);
  useEffect(() => writeJson("moncommerce-vue-produits", view), [view]);

  const modalId = route.id;
  const editing = modalId && modalId !== "nouveau" ? data.packs.find((p) => p.id === modalId) : null;
  const modalOpen = modalId === "nouveau" || !!editing;

  const vendus = useMemo(() => {
    const m = new Map();
    enrichVentes(data).filter(isValid).forEach((v) => m.set(v.packId, (m.get(v.packId) || 0) + v.qte));
    return m;
  }, [data]);

  const filters = {
    tous: () => true,
    actifs: (p) => p.actif !== false,
    brouillons: (p) => p.actif === false,
    faible: (p) => p.stock > 0 && p.stock <= seuilDe(p),
    promo: (p) => promoActive(p),
    rupture: (p) => p.stock <= 0,
  };
  const tabs = [
    { key: "tous", label: "Tous" }, { key: "actifs", label: "Actifs" }, { key: "brouillons", label: "Brouillons" },
    { key: "faible", label: "Stock faible" }, { key: "rupture", label: "Rupture" }, { key: "promo", label: "En promotion" },
  ].map((t) => ({ ...t, count: data.packs.filter(filters[t.key]).length }));

  const rows = sort.apply(
    data.packs.filter((p) => filters[tab](p) && norm(p.nom + " " + p.sku + " " + p.desc).includes(norm(q))),
    { nom: (p) => p.nom, prix: (p) => p.prix, stock: (p) => p.stock, vendus: (p) => vendus.get(p.id) || 0 },
  );

  const valeurStock = data.packs.reduce((s, p) => s + (p.stock / (p.pieces || 1)) * p.prix, 0);
  const adjust = (p, delta) => {
    update((d) => ({ ...d, packs: d.packs.map((x) => (x.id === p.id ? { ...x, stock: Math.max(0, x.stock + delta) } : x)) }));
    sync(["PATCH", `/api/packs/${p.id}/stock`, { delta }]);
  };
  const exporter = () => {
    downloadFile(`produits-${isoDate(new Date())}.csv`, toCsv([["SKU", "Nom", "Prix (FCFA)", "Coût (FCFA)", "Stock", "Vendus", "Statut"], ...rows.map((p) => [p.sku, p.nom, p.prix, p.cout ?? "", p.stock, vendus.get(p.id) || 0, p.actif === false ? "Brouillon" : "Actif"])]), "text/csv;charset=utf-8");
    toast({ title: "Export terminé", desc: `${rows.length} produit(s)` });
  };

  return (
    <>
      <PageHeader title="Produits" meta={`${data.packs.length} produits · valeur du stock ${fmt(valeurStock)}`}
        actions={estAdmin && <><Btn icon={Download} onClick={exporter} className="hide-sm">Exporter</Btn><Btn variant="primary" icon={Plus} onClick={() => go("produits", "nouveau")}>Ajouter un produit</Btn></>} />
      {!estAdmin && <div className="banner banner-info" style={{ marginBottom: 16 }}><Info size={16} /><div>Catalogue en consultation : les prix, le contenu des packs et les stocks sont gérés par l'administrateur.</div></div>}

      <div className="card">
        <div className="table-toolbar">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <Segmented value={view} onChange={setView} options={[{ value: "grille", label: "", icon: LayoutGrid }, { value: "liste", label: "", icon: List }]} />
        </div>
        <div className="table-filters">
          <SearchInput value={q} onChange={setQ} placeholder="Rechercher un produit ou un SKU…" />
          <Select value={sort.sort.key + ":" + sort.sort.dir} onChange={(e) => { const [key, dir] = e.target.value.split(":"); sort.set({ key, dir }); }} style={{ width: 180 }} aria-label="Trier">
            <option value="nom:asc">Nom A → Z</option>
            <option value="nom:desc">Nom Z → A</option>
            <option value="prix:desc">Prix décroissant</option>
            <option value="prix:asc">Prix croissant</option>
            <option value="stock:asc">Stock croissant</option>
            <option value="vendus:desc">Plus vendus</option>
          </Select>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Tag} title={q || tab !== "tous" ? "Aucun produit trouvé" : "Ajoutez votre premier produit"}
            action={!q && tab === "tous" && estAdmin && <Btn variant="primary" icon={Plus} onClick={() => go("produits", "nouveau")}>Ajouter un produit</Btn>}>
            {q || tab !== "tous" ? "Essayez un autre filtre ou une autre recherche." : "Créez vos packs pour commencer à vendre."}
          </EmptyState>
        ) : view === "grille" ? (
          <div className="product-grid" key={tab + q}>
            {rows.map((p, i) => (
              <div key={p.id} className="product-card" style={{ "--i": i }} role="button" tabIndex={0} onClick={() => go("produits", p.id)} onKeyDown={(e) => e.key === "Enter" && go("produits", p.id)}>
                <div className="pc-media"><Thumb pack={p} size="xl" /></div>
                <div className="pc-badge">{p.actif === false ? <Badge tone="neutral">Brouillon</Badge> : <StockBadge stock={p.stock} seuil={seuilDe(p)} />}</div>
                {promoActive(p) && <div className="pc-promo">−{Math.round((1 - p.prixPromo / p.prix) * 100)} %</div>}
                {estAdmin && <div className="pc-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" aria-label="Retirer 1 du stock" onClick={() => adjust(p, -1)}><Minus size={14} /></button>
                  <button className="icon-btn" aria-label="Ajouter 1 au stock" onClick={() => adjust(p, 1)}><Plus size={14} /></button>
                </div>}
                <div className="pc-body">
                  <div className="pc-name truncate">{p.nom}</div>
                  <div className="pc-desc">{p.desc || <span className="subtle">Pas de description</span>}</div>
                  <div className="row-between"><span className="pc-price">{fmt(prixEffectif(p))}{promoActive(p) && <span className="prix-barre">{fmt(p.prix)}</span>}</span><span className="subtle">{vendus.get(p.id) || 0} vendus</span></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="Produit" k="nom" sort={sort} onSort={sort.toggle} />
                  <th className="hide-sm">Statut</th>
                  <SortTh label="Stock" k="stock" sort={sort} onSort={sort.toggle} />
                  <SortTh label="Vendus" k="vendus" sort={sort} onSort={sort.toggle} className="hide-sm right" />
                  <SortTh label="Prix" k="prix" sort={sort} onSort={sort.toggle} className="right" />
                </tr>
              </thead>
              <tbody key={tab + q}>
                {rows.map((p, i) => (
                  <tr key={p.id} className="clickable" style={{ "--i": i }} onClick={() => go("produits", p.id)}>
                    <td className="wrap"><div className="cell-product"><Thumb pack={p} size="sm" /><div><div className="cell-main">{p.nom}</div><div className="cell-sub">{p.sku}</div></div></div></td>
                    <td className="hide-sm">{p.actif === false ? <Badge>Brouillon</Badge> : <Badge tone="success">Actif</Badge>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row"><StockBadge stock={p.stock} seuil={seuilDe(p)} />{estAdmin && <span className="hide-sm row" style={{ gap: 2 }}><button className="icon-btn" onClick={() => adjust(p, -1)} aria-label="Retirer 1"><Minus size={13} /></button><button className="icon-btn" onClick={() => adjust(p, 1)} aria-label="Ajouter 1"><Plus size={13} /></button></span>}</div>
                    </td>
                    <td className="hide-sm right num">{vendus.get(p.id) || 0}</td>
                    <td className="right num strong">{fmt(prixEffectif(p))}{promoActive(p) && <div className="prix-barre">{fmt(p.prix)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {estAdmin
        ? <ProductModal open={modalOpen} pack={editing} onClose={() => go("produits")} />
        : <FicheProduitModal open={!!editing} pack={editing} onClose={() => go("produits")} onVendre={(p) => { go("produits"); openSale({ packId: p.id }); }} />}
    </>
  );
}

/* =====================================================================
   PAGE : Clients (liste)
   ===================================================================== */
function PageClients({ route }) {
  const { data, go, toast } = useApp();
  const [tab, setTab] = useState("tous");
  const [q, setQ] = useState("");
  const sort = useSort("total");
  const stats = useMemo(() => {
    const m = new Map();
    enrichVentes(data).forEach((v) => {
      const o = m.get(v.clientId) || { nb: 0, total: 0, last: "" };
      o.nb += 1;
      if (isValid(v)) o.total += v.total;
      const s = venteStamp(v);
      if (s > o.last) o.last = s;
      m.set(v.clientId, o);
    });
    return m;
  }, [data]);
  const st = (id) => stats.get(id) || { nb: 0, total: 0, last: "" };

  const rows = sort.apply(
    data.clients.filter((c) => (tab === "tous" || (tab === "abonnes" ? c.consentement : c.statut === tab)) && norm(c.nom + " " + c.tel + " " + c.ville + " " + c.email).includes(norm(q))),
    { nom: (c) => c.nom, total: (c) => st(c.id).total, nb: (c) => st(c.id).nb, date: (c) => c.dateAjout || "" },
  );
  const pg = usePaged(rows, 15, tab + q + sort.sort.key + sort.sort.dir);

  const T0 = today();
  const nouveaux = data.clients.filter((c) => c.dateAjout && daysBetween(parseDate(c.dateAjout), T0) < 30).length;
  const acheteurs = data.clients.filter((c) => st(c.id).nb > 0);
  const moyenne = acheteurs.length ? acheteurs.reduce((s, c) => s + st(c.id).total, 0) / acheteurs.length : 0;
  const recurrents = data.clients.filter((c) => st(c.id).nb > 1).length;

  const exporter = () => {
    downloadFile(`clients-${isoDate(new Date())}.csv`, toCsv([["Nom", "Téléphone", "E-mail", "Ville", "Statut", "Commandes", "Total dépensé (FCFA)", "Client depuis"], ...rows.map((c) => [c.nom, c.tel, c.email, c.ville, c.statut, st(c.id).nb, st(c.id).total, c.dateAjout])]), "text/csv;charset=utf-8");
    toast({ title: "Export terminé", desc: `${rows.length} client(s)` });
  };

  return (
    <>
      <PageHeader title="Clients" actions={<><Btn icon={Download} onClick={exporter} className="hide-sm">Exporter</Btn><Btn variant="primary" icon={UserPlus} onClick={() => go("clients", "nouveau")}>Ajouter un client</Btn></>} />
      <div className="card stat-strip stagger">
        {[
          { label: "Clients", value: data.clients.length, f: fmtNum },
          { label: "Nouveaux (30 j)", value: nouveaux, f: fmtNum },
          { label: "Clients récurrents", value: recurrents, f: fmtNum },
          { label: "Dépense moyenne", value: moyenne, f: fmt },
        ].map((s, i) => <div key={s.label} style={{ "--i": i }}><div className="label">{s.label}</div><div className="value"><CountUp value={s.value} format={s.f} /></div></div>)}
      </div>
      <div className="card">
        <div className="table-toolbar">
          <Tabs value={tab} onChange={setTab} tabs={[
            { key: "tous", label: "Tous", count: data.clients.length },
            { key: "VIP", label: "VIP", count: data.clients.filter((c) => c.statut === "VIP").length },
            { key: "Standard", label: "Standard", count: data.clients.filter((c) => c.statut !== "VIP").length },
            { key: "abonnes", label: "Abonnés marketing", count: data.clients.filter((c) => c.consentement).length },
          ]} />
        </div>
        <div className="table-filters"><SearchInput value={q} onChange={setQ} placeholder="Rechercher par nom, téléphone, ville…" /></div>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Aucun client trouvé" action={!q && <Btn variant="primary" icon={UserPlus} onClick={() => go("clients", "nouveau")}>Ajouter un client</Btn>}>
            {q ? "Essayez une autre recherche." : "Ajoutez vos clients pour suivre leurs achats."}
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="Client" k="nom" sort={sort} onSort={sort.toggle} />
                  <th className="hide-md">Ville</th>
                  <SortTh label="Commandes" k="nb" sort={sort} onSort={sort.toggle} className="hide-sm right" />
                  <SortTh label="Dépensé" k="total" sort={sort} onSort={sort.toggle} className="right" />
                  <th className="hide-sm">Statut</th>
                  <SortTh label="Client depuis" k="date" sort={sort} onSort={sort.toggle} className="hide-md" />
                </tr>
              </thead>
              <tbody key={tab + pg.page}>
                {pg.slice.map((c, i) => (
                  <tr key={c.id} className="clickable" style={{ "--i": i }} tabIndex={0} onClick={() => go("clients", c.id)} onKeyDown={(e) => e.key === "Enter" && go("clients", c.id)}>
                    <td><div className="cell-product"><Avatar name={c.nom} /><div><div className="cell-main">{c.nom}</div><div className="cell-sub">{c.tel}</div></div></div></td>
                    <td className="hide-md muted">{c.ville || "—"}</td>
                    <td className="hide-sm right num">{st(c.id).nb}</td>
                    <td className="right num strong">{fmt(st(c.id).total)}</td>
                    <td className="hide-sm"><span className="row" style={{ gap: 4 }}>{c.statut === "VIP" ? <Badge tone="warning" icon={Star}>VIP</Badge> : <Badge>Standard</Badge>}{c.consentement && <Badge tone="info" icon={Megaphone}>Abonné</Badge>}</span></td>
                    <td className="hide-md muted">{c.dateAjout ? fmtDate(c.dateAjout) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager pg={pg} />
      </div>
      <ClientModal open={route.id === "nouveau"} onClose={() => go("clients")} />
    </>
  );
}

/* =====================================================================
   PAGE : Client (détail)
   ===================================================================== */
function PageClient({ id }) {
  const { data, update, sync, go, toast, confirm, openSale, estAdmin } = useApp();
  const [edit, setEdit] = useState(false);
  const [notes, setNotes] = useState(null);
  const client = data.clients.find((c) => c.id === id);
  const s = useMemo(() => (client ? clientStats(data, client.id) : null), [data, id]);
  if (!client) {
    return <><PageHeader title="Client introuvable" back={() => go("clients")} /><Card><EmptyState icon={Users} title="Ce client n'existe pas" action={<Btn variant="primary" onClick={() => go("clients")}>Retour aux clients</Btn>}>Il a peut-être été supprimé.</EmptyState></Card></>;
  }
  const cmds = enrichCommandes(data).filter((c) => c.vente?.clientId === client.id).sort((a, b) => b.stamp.localeCompare(a.stamp));
  const remove = async () => {
    const ok = await confirm({ title: `Supprimer ${client.nom} ?`, message: s.nb ? `Ce client a ${s.nb} commande(s). Elles seront conservées, sans client associé.` : "Cette action est définitive.", confirmLabel: "Supprimer le client", tone: "critical" });
    if (!ok) return;
    update((d) => ({ ...d, clients: d.clients.filter((c) => c.id !== client.id) }));
    sync(["DELETE", `/api/clients/${client.id}`]);
    go("clients");
    toast({ title: "Client supprimé", desc: client.nom });
  };
  const toggleVip = () => {
    const statut = client.statut === "VIP" ? "Standard" : "VIP";
    update((d) => ({ ...d, clients: d.clients.map((c) => (c.id === client.id ? { ...c, statut } : c)) }));
    sync(["PUT", `/api/clients/${client.id}`, { statut }]);
    toast({ title: statut === "VIP" ? `${client.nom} est maintenant VIP ⭐` : `${client.nom} repasse en Standard` });
  };

  return (
    <>
      <PageHeader back={() => go("clients")} title={client.nom}
        badges={client.statut === "VIP" && <Badge tone="warning" icon={Star}>VIP</Badge>}
        meta={`${client.ville ? client.ville + " · " : ""}Client depuis ${client.dateAjout ? fmtDate(client.dateAjout) : "—"}`}
        actions={<>
          <Btn icon={Pencil} onClick={() => setEdit(true)}>Modifier</Btn>
          <MoreMenu items={[
            { label: client.statut === "VIP" ? "Retirer le statut VIP" : "Passer en VIP", icon: Star, onClick: toggleVip },
            ...(estAdmin ? ["sep", { label: "Supprimer le client", icon: Trash2, tone: "critical", onClick: remove }] : []),
          ]} />
          <Btn variant="primary" icon={Plus} onClick={() => openSale({ clientId: client.id })}>Nouvelle vente</Btn>
        </>} />

      <div className="layout-detail">
        <div>
          <div className="card stat-strip stagger" style={{ marginBottom: 0 }}>
            {[
              { label: "Total dépensé", value: s.total, f: fmt },
              { label: "Commandes", value: s.nb, f: fmtNum },
              { label: "Panier moyen", value: s.panier, f: fmt },
            ].map((x, i) => <div key={x.label} style={{ "--i": i }}><div className="label">{x.label}</div><div className="value"><CountUp value={x.value} format={x.f} /></div></div>)}
            <div style={{ "--i": 3 }}><div className="label">Dernière commande</div><div className="value" style={{ fontSize: 15, paddingTop: 3 }}>{s.last ? relDay(s.last.slice(0, 10)) : "—"}</div></div>
          </div>

          <Card title="Commandes" sub={cmds.length ? `${cmds.length} commande${cmds.length > 1 ? "s" : ""}` : null} padded={false}>
            {cmds.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="Aucune commande" action={<Btn variant="primary" icon={Plus} onClick={() => openSale({ clientId: client.id })}>Créer une vente</Btn>}>Ce client n'a pas encore acheté.</EmptyState>
            ) : (
              <div className="list" style={{ marginTop: 8 }}>
                {cmds.map((c, i) => (
                  <a key={c.id} href={`#/commandes/${c.id}`} className="list-item" style={{ animation: `rowIn .35s ${i * 30}ms var(--ease-out) both` }}>
                    <Thumb pack={c.pack} size="sm" />
                    <div className="grow">
                      <div className="row-between"><span><span className="strong">{c.numero}</span> <span className="subtle">· {resumeCommande(c)}</span></span><span className="num strong">{fmt(c.total)}</span></div>
                      <div className="row-between"><span className="subtle">{fmtDateTime(c.stamp)} · {c.vente?.paiement}</span><StatutBadge statut={c.statut} /></div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card title="Coordonnées" actions={<button className="icon-btn" onClick={() => setEdit(true)} aria-label="Modifier"><Pencil size={15} /></button>}>
            <div className="row" style={{ gap: 12, marginBottom: 14 }}>
              <Avatar name={client.nom} size="lg" />
              <div><div className="strong">{client.nom}</div><div className="subtle">{client.statut}</div></div>
            </div>
            <div className="stack-sm">
              <div className="row muted"><Phone size={14} /><a href={`tel:${client.tel.replace(/\s/g, "")}`}>{client.tel}</a></div>
              {client.email ? <div className="row muted"><Mail size={14} /><a href={`mailto:${client.email}`} className="truncate">{client.email}</a></div> : <div className="row subtle"><Mail size={14} />Pas d'e-mail</div>}
              <div className="row muted"><MapPin size={14} />{client.ville || <span className="subtle">Pas d'adresse</span>}</div>
              <div className="row muted"><Megaphone size={14} />{client.consentement ? "Abonné aux promotions et nouveautés" : <span className="subtle">Non abonné aux messages marketing</span>}</div>
            </div>
          </Card>
          <Card title="Notes" actions={notes == null && <button className="icon-btn" onClick={() => setNotes(client.notes || "")} aria-label="Modifier les notes"><Pencil size={15} /></button>}>
            {notes == null ? (
              <p className={client.notes ? "" : "subtle"} style={{ whiteSpace: "pre-wrap" }}>{client.notes || "Aucune note"}</p>
            ) : (
              <div className="stack-sm">
                <textarea className="textarea" autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <Btn size="sm" onClick={() => setNotes(null)}>Annuler</Btn>
                  <Btn size="sm" variant="primary" onClick={() => { update((d) => ({ ...d, clients: d.clients.map((c) => (c.id === client.id ? { ...c, notes } : c)) })); sync(["PUT", `/api/clients/${client.id}`, { notes }]); setNotes(null); toast({ title: "Notes enregistrées" }); }}>Enregistrer</Btn>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      <ClientModal open={edit} client={client} onClose={() => setEdit(false)} />
    </>
  );
}

/* =====================================================================
   PAGE : Ventes (journal des transactions)
   ===================================================================== */
function PageVentes() {
  const { route } = useApp();
  const { data, go, toast, openSale } = useApp();
  const [q, setQ] = useState("");
  const [pay, setPay] = useState(route.query.paiement || "");
  useEffect(() => { if (route.query.paiement) setPay(route.query.paiement); }, [route.query.paiement]);
  const [period, setPeriod] = useState(30);
  const sort = useSort("date");
  const T0 = today();
  const all = useMemo(() => enrichVentes(data), [data]);
  const rows = sort.apply(
    all.filter((v) => (!pay || (pay === "en_attente" ? v.statutPaiement !== "payee" : v.paiement === pay && v.statutPaiement === "payee")) && (!period || daysBetween(parseDate(v.date), T0) < period) && norm(`${v.client?.nom} ${v.pack?.nom} ${v.commande?.numero}`).includes(norm(q))),
    { date: venteStamp, total: (v) => v.total, client: (v) => v.client?.nom || "", qte: (v) => v.qte },
  );
  const valid = rows.filter(isValid);
  const total = valid.reduce((s, v) => s + v.total, 0);
  const articles = valid.reduce((s, v) => s + v.qte, 0);
  const pg = usePaged(rows, 20, q + pay + period + sort.sort.key + sort.sort.dir);

  const exporter = () => {
    downloadFile(`ventes-${isoDate(new Date())}.csv`, toCsv([["Date", "Heure", "Commande", "Client", "Produit", "Quantité", "Prix unitaire", "Montant", "Paiement", "Statut", "Statut paiement", "Référence", "N° payeur", "Montant reçu"], ...rows.map((v) => [v.date, v.heure || "", v.commande?.numero || "", v.client?.nom || "", v.pack?.nom || "", v.qte, v.prixUnitaire, v.total, v.paiement, STATUTS[v.commande?.statut]?.label || "", v.statutPaiement === "en_attente" ? "En attente" : "Payé", v.reference || "", v.telPaiement || "", v.montantRecu ?? ""])]), "text/csv;charset=utf-8");
    toast({ title: "Export terminé", desc: `${rows.length} vente(s)` });
  };

  return (
    <>
      <PageHeader title="Ventes" meta="Journal détaillé de toutes les transactions"
        actions={<><Btn icon={Download} onClick={exporter}>Exporter</Btn><Btn variant="primary" icon={Plus} onClick={() => openSale()}>Nouvelle vente</Btn></>} />
      <div className="card stat-strip stagger">
        {[
          { label: "Montant encaissé", value: total, f: fmt },
          { label: "Transactions", value: valid.length, f: fmtNum },
          { label: "Articles vendus", value: articles, f: fmtNum },
          { label: "Panier moyen", value: valid.length ? total / valid.length : 0, f: fmt },
        ].map((s, i) => <div key={s.label} style={{ "--i": i }}><div className="label">{s.label}</div><div className="value"><CountUp value={s.value} format={s.f} /></div></div>)}
      </div>
      <div className="card">
        <div className="table-filters">
          <SearchInput value={q} onChange={setQ} placeholder="Client, produit, n° de commande…" />
          <Select value={pay} onChange={(e) => setPay(e.target.value)} style={{ width: 170 }} aria-label="Moyen de paiement">
            <option value="">Tous paiements</option>
            {PAIEMENTS.filter((p) => p.type !== "livraison").map((p) => <option key={p.key}>{p.key}</option>)}
            <option value="en_attente">Paiement en attente</option>
          </Select>
          <Select value={period} onChange={(e) => setPeriod(Number(e.target.value))} style={{ width: 150 }} aria-label="Période">
            <option value={7}>7 derniers jours</option>
            <option value={30}>30 derniers jours</option>
            <option value={90}>90 derniers jours</option>
            <option value={0}>Toute la période</option>
          </Select>
        </div>
        {rows.length === 0 ? <EmptyState icon={Receipt} title="Aucune vente sur cette période">Modifiez les filtres ou enregistrez une nouvelle vente.</EmptyState> : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="Date" k="date" sort={sort} onSort={sort.toggle} />
                  <th className="hide-md">Commande</th>
                  <SortTh label="Client" k="client" sort={sort} onSort={sort.toggle} className="hide-sm" />
                  <th>Produit</th>
                  <SortTh label="Qté" k="qte" sort={sort} onSort={sort.toggle} className="right hide-sm" />
                  <th className="hide-md">Paiement</th>
                  <SortTh label="Montant" k="total" sort={sort} onSort={sort.toggle} className="right" />
                </tr>
              </thead>
              <tbody key={pg.page + pay + period}>
                {pg.slice.map((v, i) => {
                  const off = !isValid(v);
                  return (
                    <tr key={v.id} className="clickable" style={{ "--i": i, opacity: off ? 0.55 : 1 }} onClick={() => v.commande && go("commandes", v.commande.id)}>
                      <td><div className="cell-main" style={{ fontWeight: 500 }}>{fmtDateCourt(v.date)}</div><div className="cell-sub">{v.heure || ""}</div></td>
                      <td className="hide-md">{v.commande?.numero || "—"}</td>
                      <td className="hide-sm">{v.client?.nom || <span className="subtle">—</span>}</td>
                      <td className="wrap"><div className="cell-product"><Thumb pack={v.pack} size="sm" /><span>{v.pack?.nom || "Produit supprimé"}</span></div></td>
                      <td className="right num hide-sm">{v.qte}</td>
                      <td className="hide-md"><span className="row"><ModePaiement mode={v.statutPaiement === "en_attente" ? "Paiement à la livraison" : v.paiement} taille={20} />{v.statutPaiement !== "payee" ? <Badge tone="warning">{{ a_verifier: "À vérifier", en_cours: "En cours", echoue: "Échoué" }[v.statutPaiement] || "En attente"}</Badge> : infoPaiement(v.paiement).court}</span></td>
                      <td className="right num strong" style={{ textDecoration: off ? "line-through" : "none" }}>{fmt(v.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={2} className="hide-md" /><td className="hide-sm" /><td className="wrap">Total · {valid.length} ventes</td><td className="right num hide-sm">{articles}</td><td className="hide-md" /><td className="right num">{fmt(total)}</td></tr>
              </tfoot>
            </table>
          </div>
        )}
        <Pager pg={pg} />
      </div>
    </>
  );
}

/* ---------- Lien public de la boutique / lien de promotion du vendeur ---------- */
function CarteLien() {
  const { data, toast, estAdmin } = useApp();
  const lien = lienBoutique(data, estAdmin ? null : data.moi);
  if (!lien) return null;
  const texte = `Découvrez ${data.boutique?.nom || "notre boutique"} : ${lien}`;
  const copier = () => navigator.clipboard?.writeText(lien).then(() => toast({ title: "Lien copié" }), () => toast({ title: "Copie impossible", tone: "critical" }));
  return (
    <div className="card carte-lien" style={{ marginBottom: 16 }}>
      <div className="card-body row" style={{ gap: 14, flexWrap: "wrap" }}>
        <span className="todo-icon tint-0" style={{ width: 44, height: 44, borderRadius: 12 }}><Link2 size={20} /></span>
        <div className="grow" style={{ minWidth: 220 }}>
          <div className="strong">{estAdmin ? "Adresse publique de votre boutique" : "Mon lien de promotion"}</div>
          <div className="subtle">{estAdmin ? "Vos produits actifs apparaissent aussi sur la page d'accueil de la plateforme." : "Partagez-le : chaque commande passée par ce lien vous est attribuée."}</div>
          <div className="lien-url num">{lien}</div>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Btn icon={Copy} onClick={copier}>Copier</Btn>
          <Btn icon={MessageSquare} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank", "noopener")}>WhatsApp</Btn>
          <a className="btn btn-secondary" href={lien} target="_blank" rel="noopener"><ExternalLink size={16} /><span>Voir</span></a>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   PAGE : Vendeurs (administrateur) — comptes de l'espace et suivi de leur activité
   ===================================================================== */
function MotDePasseModal({ membre, onClose }) {
  const { toast } = useApp();
  const [mdp, setMdp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMdp(""); setErr(""); setBusy(false); }, [membre?.id]);
  const valider = async () => {
    if (mdp.length < 6) return setErr("6 caractères minimum.");
    setBusy(true);
    try { await apiFetch("PATCH", `/api/auth/equipe/${membre.id}`, { mot_de_passe: mdp }); toast({ title: "Mot de passe modifié", desc: `Communiquez-le à ${membre.nom}.` }); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal open={!!membre} onClose={onClose} title={`Nouveau mot de passe — ${membre?.nom || ""}`} size="sm"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" loading={busy} onClick={valider}>Enregistrer</Btn></>}>
      <Field label="Nouveau mot de passe" error={err} help="6 caractères minimum. L'ancien ne fonctionnera plus."><Input icon={Lock} type="password" value={mdp} onChange={(e) => { setMdp(e.target.value); setErr(""); }} autoComplete="new-password" data-autofocus /></Field>
    </Modal>
  );
}

function PageVendeurs() {
  const { data, mode, toast, confirm, rafraichir, auth } = useApp();
  const [ajout, setAjout] = useState(false);
  const [mdp, setMdp] = useState(null);
  const [period, setPeriod] = useState(30);

  const stats = useMemo(() => {
    const depuis = period ? isoDate(addDays(today(), -period)) : "";
    const m = new Map();
    for (const c of enrichCommandes(data)) {
      const id = c.vente?.vendeurId;
      if (!id || c.statut === "annulee" || (depuis && c.vente.date < depuis)) continue;
      const o = m.get(id) || { caisse: 0, enLigne: 0, ca: 0, articles: 0, last: "" };
      if (c.canal === "en_ligne") o.enLigne += 1; else o.caisse += 1;
      o.ca += c.sousTotal; o.articles += c.articles;
      if (c.stamp > o.last) o.last = c.stamp;
      m.set(id, o);
    }
    return m;
  }, [data, period]);
  const st = (id) => stats.get(id) || { caisse: 0, enLigne: 0, ca: 0, articles: 0, last: "" };

  if (mode !== "api") {
    return <><PageHeader title="Vendeurs" /><Card><EmptyState icon={UserCheck} title="Disponible avec le serveur">Les comptes vendeurs sont créés une fois connecté au serveur.</EmptyState></Card></>;
  }
  const equipe = data.equipe || [];
  const vendeurs = equipe.filter((u) => u.role === "vendeur");
  const admins = equipe.filter((u) => u.role === "admin");
  const total = [...stats.values()].reduce((s, o) => s + o.ca, 0);
  const caVendeurs = vendeurs.reduce((s, u) => s + st(u.id).ca, 0);
  const meilleur = [...vendeurs].sort((a, b) => st(b.id).ca - st(a.id).ca)[0];

  const basculer = async (u) => {
    if (u.actif && !(await confirm({ title: `Désactiver ${u.nom} ?`, message: "Ce vendeur ne pourra plus se connecter. Son historique de ventes est conservé et vous pourrez le réactiver.", confirmLabel: "Désactiver", tone: "critical" }))) return;
    try { await apiFetch("PATCH", `/api/auth/equipe/${u.id}`, { actif: !u.actif }); toast({ title: u.actif ? `${u.nom} est désactivé` : `${u.nom} est réactivé` }); rafraichir(); }
    catch (e) { toast({ title: "Modification impossible", desc: e.message, tone: "critical" }); }
  };
  const copierLien = (u) => navigator.clipboard?.writeText(lienBoutique(data, u.id)).then(() => toast({ title: "Lien de promotion copié", desc: `Lien de ${u.nom}` }), () => toast({ title: "Copie impossible", tone: "critical" }));

  const kpis = [
    { label: "Vendeurs actifs", value: vendeurs.filter((u) => u.actif).length, f: fmtNum, icon: UserCheck, tint: 4 },
    { label: "Ventes des vendeurs", value: caVendeurs, f: fmt, icon: TrendingUp, tint: 0 },
    { label: "Part du chiffre d'affaires", value: total ? (caVendeurs / total) * 100 : 0, f: pct, icon: Percent, tint: 5 },
  ];
  const ligne = (u, i) => {
    const s = st(u.id);
    return (
      <tr key={u.id} style={{ "--i": i, opacity: u.actif ? 1 : 0.55 }}>
        <td><div className="cell-product"><Avatar name={u.nom} /><div><div className="cell-main">{u.nom}{u.id === data.moi ? " (vous)" : ""}</div><div className="cell-sub">{u.tel}</div></div></div></td>
        <td className="hide-sm">{!u.actif ? <Badge tone="critical">Désactivé</Badge> : u.role === "admin" ? <Badge tone="info" icon={ShieldCheck}>Administrateur</Badge> : <Badge tone="success" dot>Actif</Badge>}</td>
        <td className="right num">{s.caisse}</td>
        <td className="right num">{s.enLigne}</td>
        <td className="right num strong">{fmt(s.ca)}</td>
        <td className="hide-md muted">{s.last ? relDay(s.last.slice(0, 10)) : "—"}</td>
        <td className="right"><span className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
          <button className="icon-btn" title="Copier son lien de promotion" aria-label={`Copier le lien de ${u.nom}`} onClick={() => copierLien(u)}><Link2 size={15} /></button>
          {u.id !== data.moi && <button className="icon-btn" title="Changer son mot de passe" aria-label={`Mot de passe de ${u.nom}`} onClick={() => setMdp(u)}><KeyRound size={15} /></button>}
          {u.id !== data.moi && <button className={cx("icon-btn", u.actif && "danger")} title={u.actif ? "Désactiver" : "Réactiver"} aria-label={u.actif ? `Désactiver ${u.nom}` : `Réactiver ${u.nom}`} onClick={() => basculer(u)}>{u.actif ? <XCircle size={15} /> : <RotateCcw size={15} />}</button>}
        </span></td>
      </tr>
    );
  };

  return (
    <>
      <PageHeader title="Vendeurs" meta="Les vendeurs de votre espace et le suivi de leurs ventes"
        actions={<>
          <Segmented value={period} onChange={setPeriod} options={[{ value: 7, label: "7 jours" }, { value: 30, label: "30 jours" }, { value: 0, label: "Tout" }]} />
          <Btn variant="primary" icon={UserPlus} onClick={() => setAjout(true)}>Ajouter un vendeur</Btn>
        </>} />
      <div className="kpi-grid kpi-3 stagger">
        {kpis.map((k, i) => (
          <div className="card kpi" key={k.label} style={{ "--i": i }}>
            <div className="kpi-label"><span className={cx("kpi-dot", `tint-${k.tint}`)}><k.icon size={13} /></span>{k.label}</div>
            <div className="kpi-value"><CountUp value={k.value} format={k.f} /></div>
          </div>
        ))}
      </div>
      {meilleur && st(meilleur.id).ca > 0 && <div className="banner banner-success" style={{ marginBottom: 16 }}><Star size={16} /><div>Meilleur vendeur sur la période : <b>{meilleur.nom}</b> avec <b className="num">{fmt(st(meilleur.id).ca)}</b> ({st(meilleur.id).caisse + st(meilleur.id).enLigne} commande{st(meilleur.id).caisse + st(meilleur.id).enLigne > 1 ? "s" : ""}).</div></div>}

      <Card title="Mes vendeurs" sub="Chaque vendeur ne voit que sa propre activité. Les commandes passées par son lien de promotion lui sont attribuées." padded={false}>
        <div style={{ height: 12 }} />
        {vendeurs.length === 0 ? (
          <EmptyState icon={UserCheck} title="Aucun vendeur pour le moment" action={<Btn variant="primary" icon={UserPlus} onClick={() => setAjout(true)}>Ajouter un vendeur</Btn>}>Créez un compte pour chaque vendeur : il se connectera depuis « Mon espace vendeur » sur la page d'accueil.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Vendeur</th><th className="hide-sm">Statut</th><th className="right">En caisse</th><th className="right">Via son lien</th><th className="right">Chiffre d'affaires</th><th className="hide-md">Dernière vente</th><th style={{ width: 110 }} /></tr></thead>
              <tbody key={period}>{[...vendeurs].sort((a, b) => st(b.id).ca - st(a.id).ca).map(ligne)}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Administrateurs de cet espace" sub="Pour un espace séparé, chaque personne crée son propre compte administrateur depuis la page d'accueil." padded={false}>
        <div style={{ height: 12 }} />
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Administrateur</th><th className="hide-sm">Statut</th><th className="right">En caisse</th><th className="right">Via son lien</th><th className="right">Chiffre d'affaires</th><th className="hide-md">Dernière vente</th><th style={{ width: 110 }} /></tr></thead>
            <tbody key={period}>{admins.map(ligne)}</tbody>
          </table>
        </div>
      </Card>

      <EquipeModal open={ajout} onClose={() => setAjout(false)} />
      <MotDePasseModal membre={mdp} onClose={() => setMdp(null)} />
    </>
  );
}

/* =====================================================================
   PAGE : Tickets de caisse — contrôle des ventes par les tickets
   Chaque vente (caisse, B2B, en ligne) a un ticket numéroté. L'administrateur
   y voit ce que chaque vendeur a vendu, les tickets non remis et l'écoulement
   des articles ; le vendeur n'y voit que ses propres tickets.
   ===================================================================== */
function PageTickets({ route }) {
  const { data, go, toast, estAdmin, mode } = useApp();
  const [period, setPeriod] = useState(30);
  const [tab, setTab] = useState(route.query.filtre || "tous");
  const [q, setQ] = useState("");
  const [vendeur, setVendeur] = useState("");
  useEffect(() => { if (route.query.filtre) setTab(route.query.filtre); }, [route.query.filtre]);

  const noms = useMemo(() => new Map((data.equipe || []).map((u) => [u.id, u.nom])), [data.equipe]);
  const actions = useMemo(() => {
    const m = new Map();
    for (const t of data.tickets || []) { if (!m.has(t.commandeId)) m.set(t.commandeId, []); m.get(t.commandeId).push(t); }
    return m;
  }, [data.tickets]);
  const tous = useMemo(() => {
    const depuis = period ? isoDate(addDays(today(), -(period - 1))) : "";
    return enrichCommandes(data).filter((c) => c.vente && (!depuis || c.vente.date >= depuis)).map((c) => ({
      ...c,
      vendeurId: c.vente.vendeurId || null,
      vendeurNom: c.vente.vendeurId ? noms.get(c.vente.vendeurId) || c.vente.vendeur || "Vendeur" : c.canal === "en_ligne" ? "Boutique en ligne" : c.vente.vendeur || "—",
      remis: !!c.ticketRemisLe,
      modes: [...new Set((actions.get(c.id) || []).map((t) => t.action).filter((a) => a !== "genere"))],
    })).sort((a, b) => b.stamp.localeCompare(a.stamp));
  }, [data, period, noms, actions]);
  const valides = tous.filter((c) => c.statut !== "annulee");
  const nonRemis = valides.filter((c) => !c.remis);
  const compte = (a) => valides.filter((c) => c.modes.includes(a)).length;

  // Par vendeur
  const parVendeur = useMemo(() => {
    const m = new Map();
    for (const c of valides) {
      const k = c.vendeurId || "_" + c.vendeurNom;
      const o = m.get(k) || { cle: k, id: c.vendeurId, nom: c.vendeurNom, tickets: 0, remis: 0, b2b: 0, lots: 0, pieces: 0, ca: 0 };
      o.tickets += 1; o.remis += c.remis ? 1 : 0; o.b2b += c.typeVente === "b2b" ? 1 : 0; o.lots += c.articles; o.pieces += c.pieces; o.ca += c.sousTotal;
      m.set(k, o);
    }
    return [...m.values()].sort((a, b) => b.ca - a.ca);
  }, [valides]);

  // Écoulement des articles, d'après les tickets
  const ecoulement = useMemo(() => {
    const m = new Map();
    for (const c of valides) for (const l of c.lignes) {
      const o = m.get(l.packId) || { pack: l.pack, tickets: new Set(), lots: 0, pieces: 0, ca: 0 };
      o.tickets.add(c.id); o.lots += l.qte; o.pieces += l.pieces; o.ca += l.total;
      m.set(l.packId, o);
    }
    return [...m.values()].sort((a, b) => b.pieces - a.pieces);
  }, [valides]);

  const filtres = { tous: () => true, non_remis: (c) => !c.remis && c.statut !== "annulee", b2b: (c) => c.typeVente === "b2b", en_ligne: (c) => c.canal === "en_ligne" };
  const rows = tous.filter((c) => filtres[tab](c) && (!vendeur || (c.vendeurId || "_" + c.vendeurNom) === vendeur)
    && norm(`${c.numeroTicket} ${c.numero} ${c.contactTel || c.client?.tel || ""} ${c.client?.nom || ""} ${c.lignes.map((l) => l.pack?.nom).join(" ")}`).includes(norm(q)));
  const pg = usePaged(rows, 15, tab + q + vendeur + period);

  const exporter = () => {
    downloadFile(`tickets-${isoDate(new Date())}.csv`, toCsv([
      ["Ticket", "Commande", "Date", "Vendeur", "Type", "Contact", "Client", "Articles", "Lots", "Nombre d'articles", "Montant (FCFA)", "Livraison (FCFA)", "Ticket remis", "Par", "Statut"],
      ...rows.map((c) => [c.numeroTicket, c.numero, c.stamp.replace("T", " "), c.vendeurNom, c.typeVente === "b2b" ? "B2B" : c.canal === "en_ligne" ? "En ligne" : "Caisse", c.contactTel || c.client?.tel || "", c.client?.nom || "",
        c.lignes.map((l) => `${l.pack?.nom || "?"} x${l.qte}`).join(" + "), c.articles, c.pieces, c.total, c.frais, c.remis ? "oui" : "non", c.modes.map((a) => ACTIONS_TICKET[a] || a).join(", "), STATUTS[c.statut]?.label]),
    ]), "text/csv;charset=utf-8");
    toast({ title: "Export terminé", desc: `${rows.length} ticket(s)` });
  };

  const kpis = [
    { label: "Tickets émis", value: valides.length, f: fmtNum, icon: Receipt, tint: 4, sub: `${compte("imprime")} imprimés · ${compte("whatsapp") + compte("sms") + compte("email")} envoyés · ${compte("pdf")} PDF` },
    { label: "Tickets non remis", value: nonRemis.length, f: fmtNum, icon: AlertTriangle, tint: nonRemis.length ? 3 : 0, color: nonRemis.length ? "var(--critical-solid)" : undefined, sub: nonRemis.length ? "Vente sans ticket remis au client" : "Tous les tickets ont été remis" },
    { label: "Articles sortis", value: valides.reduce((s, c) => s + c.pieces, 0), f: fmtNum, icon: Boxes, tint: 5, sub: `${fmtNum(valides.reduce((s, c) => s + c.articles, 0))} unités / lots vendus` },
    { label: "Montant des tickets", value: valides.reduce((s, c) => s + c.total, 0), f: fmt, icon: TrendingUp, tint: 0, sub: `dont ${fmt(valides.reduce((s, c) => s + c.frais, 0))} de livraison` },
  ];

  return (
    <>
      <PageHeader title="Tickets de caisse" meta={estAdmin ? "Le contrôle des ventes : un ticket numéroté pour chaque vente, même en B2B" : "Vos tickets : un ticket numéroté pour chaque vente"}
        actions={<>
          <Segmented value={period} onChange={setPeriod} options={[{ value: 1, label: "Aujourd'hui" }, { value: 7, label: "7 j" }, { value: 30, label: "30 j" }, { value: 0, label: "Tout" }]} />
          <Btn icon={Download} onClick={exporter} className="hide-sm">Exporter</Btn>
        </>} />
      <div className="kpi-grid stagger">
        {kpis.map((k, i) => (
          <div className="card kpi" key={k.label} style={{ "--i": i }}>
            <div className="kpi-label"><span className={cx("kpi-dot", `tint-${k.tint}`)}><k.icon size={13} /></span>{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}><CountUp value={k.value} format={k.f} /></div>
            <div className="subtle">{k.sub}</div>
          </div>
        ))}
      </div>
      {nonRemis.length > 0 && (
        <div className="banner banner-warning" style={{ marginBottom: 16 }}><AlertTriangle size={16} /><div>
          <b>{nonRemis.length} vente{nonRemis.length > 1 ? "s" : ""} sans ticket remis</b> : {nonRemis.slice(0, 4).map((c) => `${c.numeroTicket} (${c.vendeurNom})`).join(", ")}{nonRemis.length > 4 ? "…" : ""}.
          {" "}Ouvrez la commande pour imprimer ou envoyer le ticket. <button className="link" onClick={() => setTab("non_remis")}>Voir ces tickets</button>
        </div></div>
      )}

      {estAdmin && (
        <Card title="Ventes par vendeur, d'après les tickets" sub="Seules les ventes ayant un ticket sont comptées : c'est le cas de toutes les ventes enregistrées." padded={false}>
          <div style={{ height: 12 }} />
          {parVendeur.length === 0 ? <EmptyState icon={Receipt} title="Aucun ticket sur la période" /> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Vendeur</th><th className="right">Tickets</th><th className="right">Remis</th><th className="right">Non remis</th><th className="right hide-sm">B2B</th><th className="right hide-sm">Articles sortis</th><th className="right">Montant</th></tr></thead>
                <tbody key={period}>
                  {parVendeur.map((v, i) => (
                    <tr key={v.cle} className="clickable" style={{ "--i": i }} onClick={() => setVendeur(vendeur === v.cle ? "" : v.cle)}>
                      <td><div className="cell-product"><Avatar name={v.nom} size="sm" /><div className="cell-main">{v.nom}</div></div></td>
                      <td className="right num strong">{v.tickets}</td>
                      <td className="right num">{v.remis}</td>
                      <td className="right num" style={{ color: v.tickets - v.remis ? "var(--critical-solid)" : undefined, fontWeight: v.tickets - v.remis ? 700 : undefined }}>{v.tickets - v.remis}</td>
                      <td className="right num hide-sm">{v.b2b}</td>
                      <td className="right num hide-sm">{fmtNum(v.pieces)}</td>
                      <td className="right num strong">{fmt(v.ca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {estAdmin && (
        <Card title="Écoulement des articles, d'après les tickets" sub="Ce qui est réellement sorti du stock, ticket par ticket. Pour un lot, le nombre d'articles tient compte des articles par lot." padded={false}>
          <div style={{ height: 12 }} />
          {ecoulement.length === 0 ? <EmptyState icon={Boxes} title="Aucun article vendu sur la période" /> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Article</th><th className="right">Tickets</th><th className="right">Unités / lots</th><th className="right">Articles sortis</th><th className="right hide-sm">Montant</th><th className="right">Stock restant</th></tr></thead>
                <tbody key={period}>
                  {ecoulement.map((e, i) => {
                    const p = e.pack, parLot = p?.pieces || 1;
                    return (
                      <tr key={p?.id || i} style={{ "--i": Math.min(i, 20) }}>
                        <td className="wrap"><div className="cell-product"><Thumb pack={p} size="sm" /><div><div className="cell-main">{p?.nom || "Produit supprimé"}</div><div className="cell-sub">{[p?.categorie, parLot > 1 && `lot de ${parLot}`].filter(Boolean).join(" · ")}</div></div></div></td>
                        <td className="right num">{e.tickets.size}</td>
                        <td className="right num">{fmtNum(e.lots)}</td>
                        <td className="right num strong">{fmtNum(e.pieces)}</td>
                        <td className="right num hide-sm">{fmt(e.ca)}</td>
                        <td className="right num">{p && !stockCache(p) ? <>{fmtNum(p.stock)} art.{parLot > 1 && <span className="subtle"> ({fmtNum(Math.floor(p.stock / parLot))} lots)</span>}</> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <div className="card">
        <div className="table-toolbar">
          <Tabs value={tab} onChange={setTab} tabs={[
            { key: "tous", label: "Tous les tickets", count: tous.length },
            { key: "non_remis", label: "Non remis", count: tous.filter(filtres.non_remis).length },
            { key: "b2b", label: "B2B", count: tous.filter(filtres.b2b).length },
            { key: "en_ligne", label: "En ligne", count: tous.filter(filtres.en_ligne).length },
          ]} />
        </div>
        <div className="table-filters">
          <SearchInput value={q} onChange={setQ} placeholder="Rechercher par ticket, téléphone, client, article…" />
          {estAdmin && parVendeur.length > 0 && (
            <Select value={vendeur} onChange={(e) => setVendeur(e.target.value)} style={{ width: 210 }} aria-label="Vendeur">
              <option value="">Tous les vendeurs</option>
              {parVendeur.map((v) => <option key={v.cle} value={v.cle}>{v.nom}</option>)}
            </Select>
          )}
        </div>
        {rows.length === 0 ? <EmptyState icon={Receipt} title="Aucun ticket ici">{mode === "api" ? "Chaque vente enregistrée crée automatiquement son ticket." : "Enregistrez une vente pour créer un ticket."}</EmptyState> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Ticket</th><th className="hide-sm">Vendeur</th><th>Contact</th><th className="hide-md">Article</th><th className="right hide-sm">Articles</th><th className="right">Montant</th><th>Remise du ticket</th></tr></thead>
              <tbody key={tab + pg.page + vendeur}>
                {pg.slice.map((c, i) => (
                  <tr key={c.id} className="clickable" style={{ "--i": i, opacity: c.statut === "annulee" ? 0.55 : 1 }} tabIndex={0} onClick={() => go("commandes", c.id)} onKeyDown={(e) => e.key === "Enter" && go("commandes", c.id)}>
                    <td><span className="cell-main num">{c.numeroTicket || "—"}</span>{c.typeVente === "b2b" && <Badge tone="info" className="badge-inline">B2B</Badge>}<div className="cell-sub">{fmtDateTime(c.stamp)}{c.statut === "annulee" ? " · annulée" : ""}</div></td>
                    <td className="hide-sm">{c.vendeurNom}</td>
                    <td><span className="num">{c.contactTel || c.client?.tel || "—"}</span><div className="cell-sub">{c.client?.nom}</div></td>
                    <td className="hide-md wrap">{resumeCommande(c)}</td>
                    <td className="right num hide-sm">{c.pieces}</td>
                    <td className="right num strong">{fmt(c.total)}</td>
                    <td>{c.remis
                      ? <><Badge tone="success" dot>Remis</Badge><div className="cell-sub">{c.modes.filter((a) => REMISE_TICKET.has(a)).map((a) => ACTIONS_TICKET[a]).join(", ")}</div></>
                      : c.statut === "annulee" ? <Badge>Annulée</Badge> : <Badge tone="critical" dot>Non remis</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager pg={pg} />
      </div>
    </>
  );
}

/* =====================================================================
   PAGE : Livraisons — suivi des colis, du départ de la boutique à la remise au client
   Colis à préparer → en cours de livraison → livré (ou échec : le colis revient).
   ===================================================================== */
const MOTIFS_ECHEC = ["Client absent", "Client injoignable", "Adresse introuvable", "Colis refusé", "Reporté par le client"];
const aEncaisser = (c) => (c.vente?.statutPaiement && c.vente.statutPaiement !== "payee" ? c.total : 0);

function LivreursModal({ open, onClose }) {
  const { data, update, sync, toast, confirm } = useApp();
  const vide = { id: null, nom: "", tel: "", zone: "" };
  const [f, setF] = useState(vide);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setF(vide); setErr(""); } }, [open]);
  const livreurs = data.livreurs || [];
  const enregistrer = () => {
    if (!f.nom.trim() || f.tel.replace(/\D/g, "").length < 8) return setErr("Nom et numéro de téléphone requis.");
    const propre = { nom: f.nom.trim(), tel: f.tel.trim(), zone: f.zone.trim() };
    if (f.id) {
      update((d) => ({ ...d, livreurs: d.livreurs.map((l) => (l.id === f.id ? { ...l, ...propre } : l)) }));
      sync(["PUT", `/api/livreurs/${f.id}`, { nom: propre.nom, telephone: propre.tel, zone: propre.zone }]);
    } else {
      const id = uid();
      update((d) => ({ ...d, livreurs: [...(d.livreurs || []), { id, ...propre, actif: true }] }));
      sync(["POST", "/api/livreurs", { id, nom: propre.nom, telephone: propre.tel, zone: propre.zone }]);
    }
    toast({ title: f.id ? "Livreur mis à jour" : "Livreur ajouté", desc: propre.nom });
    setF(vide); setErr("");
  };
  const basculer = (l) => {
    update((d) => ({ ...d, livreurs: d.livreurs.map((x) => (x.id === l.id ? { ...x, actif: !l.actif } : x)) }));
    sync(["PUT", `/api/livreurs/${l.id}`, { actif: !l.actif }]);
  };
  const retirer = async (l) => {
    if (!(await confirm({ title: `Retirer ${l.nom} ?`, message: "Ses colis en cours seront à confier à un autre livreur. Ses livraisons passées restent dans l'historique.", confirmLabel: "Retirer", tone: "critical" }))) return;
    update((d) => ({ ...d, livreurs: d.livreurs.filter((x) => x.id !== l.id), commandes: d.commandes.map((c) => (c.livreurId === l.id && !["livree", "annulee"].includes(c.statut) ? { ...c, livreurId: null } : c)) }));
    sync(["DELETE", `/api/livreurs/${l.id}`]);
  };
  return (
    <Modal open={open} onClose={onClose} title="Livreurs" size="lg" footer={<Btn onClick={onClose}>Fermer</Btn>}>
      <div className="stack">
        {livreurs.length === 0 ? <p className="subtle">Aucun livreur pour le moment. Ajoutez vos livreurs (coursiers, motos, société de livraison) pour leur confier des colis.</p> : (
          <div className="list">
            {livreurs.map((l) => (
              <div key={l.id} className="list-item" style={{ opacity: l.actif ? 1 : 0.55 }}>
                <Avatar name={l.nom} size="sm" />
                <div className="grow"><div className="strong">{l.nom}{!l.actif && " (inactif)"}</div><div className="subtle">{l.tel}{l.zone ? " · " + l.zone : ""}</div></div>
                <button className="icon-btn" title="Modifier" aria-label={`Modifier ${l.nom}`} onClick={() => { setF({ id: l.id, nom: l.nom, tel: l.tel, zone: l.zone || "" }); setErr(""); }}><Pencil size={14} /></button>
                <button className="icon-btn" title={l.actif ? "Désactiver" : "Réactiver"} aria-label={l.actif ? `Désactiver ${l.nom}` : `Réactiver ${l.nom}`} onClick={() => basculer(l)}>{l.actif ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                <button className="icon-btn danger" title="Retirer" aria-label={`Retirer ${l.nom}`} onClick={() => retirer(l)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="card" style={{ padding: 14, boxShadow: "none", border: "1px solid var(--border)" }}>
          <div className="strong" style={{ marginBottom: 10 }}>{f.id ? "Modifier le livreur" : "Ajouter un livreur"}</div>
          <div className="form-grid">
            <Field label="Nom"><Input icon={User} value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} placeholder="Ex : Moussa Traoré" /></Field>
            <Field label="Téléphone"><Input icon={Phone} value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} placeholder="05 00 00 00 00" inputMode="tel" /></Field>
            <Field label="Zone couverte" optional className="full"><Input icon={MapPin} value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} placeholder="Ex : Cocody, Riviera, Bingerville" /></Field>
          </div>
          {err && <div className="field-error" style={{ marginTop: 8 }}><AlertCircle size={14} />{err}</div>}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            {f.id && <Btn onClick={() => setF(vide)}>Annuler</Btn>}
            <Btn variant="primary" icon={f.id ? Check : Plus} onClick={enregistrer}>{f.id ? "Enregistrer" : "Ajouter le livreur"}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* Feuille de route d'un livreur : ses colis, adresses, contacts et montants à encaisser */
function FeuilleRouteModal({ open, onClose, colis, livreurId }) {
  const { data, toast } = useApp();
  const [id, setId] = useState("");
  useEffect(() => { if (open) setId(livreurId || ""); }, [open, livreurId]);
  const livreurs = (data.livreurs || []).filter((l) => colis.some((c) => c.livreurId === l.id));
  const livreur = (data.livreurs || []).find((l) => l.id === id) || livreurs[0];
  const liste = colis.filter((c) => livreur && c.livreurId === livreur.id).sort((a, b) => (a.adresseLivraison || "").localeCompare(b.adresseLivraison || "", "fr"));
  const total = liste.reduce((s, c) => s + aEncaisser(c), 0);
  const texte = livreur ? [
    `${data.boutique?.nom || "Boutique"} — feuille de route du ${fmtDate(isoDate(new Date()))}`,
    `Livreur : ${livreur.nom} · ${liste.length} colis · à encaisser : ${fmt(total)}`,
    "",
    ...liste.map((c, i) => `${i + 1}. ${c.adresseLivraison || "Adresse à préciser"}\n   ${c.client?.nom && !/^Client \d/.test(c.client.nom) ? c.client.nom + " · " : ""}${c.contactTel || c.client?.tel || ""}\n   ${c.lignes.map((l) => `${l.pack?.nom || "Article"} × ${l.qte}`).join(", ")}\n   ${aEncaisser(c) ? "À encaisser : " + fmt(aEncaisser(c)) : "Déjà payé"} · ${c.numeroTicket || c.numero}`),
  ].join("\n") : "";
  return (
    <Modal open={open} onClose={onClose} title="Feuille de route" size="lg"
      footer={livreur && liste.length > 0 && <>
        <Btn icon={Copy} onClick={() => navigator.clipboard?.writeText(texte).then(() => toast({ title: "Feuille de route copiée" }), () => toast({ title: "Copie impossible", tone: "critical" }))}>Copier</Btn>
        <Btn icon={Printer} onClick={() => window.print()}>Imprimer</Btn>
        <Btn variant="primary" icon={MessageSquare} onClick={() => window.open(`https://wa.me/${telInternational(livreur.tel)}?text=${encodeURIComponent(texte)}`, "_blank", "noopener")}>Envoyer au livreur (WhatsApp)</Btn>
      </>}>
      {livreurs.length === 0 ? <EmptyState icon={Truck} title="Aucun colis confié à un livreur">Confiez d'abord des colis à un livreur.</EmptyState> : (
        <div className="stack">
          <Field label="Livreur"><Select value={livreur?.id || ""} onChange={(e) => setId(e.target.value)}>{livreurs.map((l) => <option key={l.id} value={l.id}>{l.nom} — {colis.filter((c) => c.livreurId === l.id).length} colis</option>)}</Select></Field>
          <div className="feuille">
            <div className="row-between" style={{ flexWrap: "wrap" }}><strong>{livreur.nom} · {livreur.tel}</strong><span>{liste.length} colis · à encaisser <b className="num">{fmt(total)}</b></span></div>
            <ol>
              {liste.map((c) => (
                <li key={c.id}>
                  <div className="strong">{c.adresseLivraison || "Adresse à préciser"}</div>
                  <div>{c.client?.nom && !/^Client \d/.test(c.client.nom) ? c.client.nom + " · " : ""}<span className="num">{c.contactTel || c.client?.tel}</span></div>
                  <div className="subtle">{c.lignes.map((l) => `${l.pack?.nom || "Article"} × ${l.qte}`).join(", ")} · {c.numeroTicket || c.numero}</div>
                  <div className="strong">{aEncaisser(c) ? `À encaisser : ${fmt(aEncaisser(c))}` : "Déjà payé"}</div>
                </li>
              ))}
            </ol>
          </div>
          {createPortal(<div className="print-zone feuille-impression"><h2>{data.boutique?.nom} — feuille de route</h2><pre>{texte.split("\n").slice(1).join("\n")}</pre></div>, document.body)}
        </div>
      )}
    </Modal>
  );
}

function EchecLivraisonModal({ cmd, onClose, onValider }) {
  const [motif, setMotif] = useState(MOTIFS_ECHEC[0]);
  const [autre, setAutre] = useState("");
  useEffect(() => { setMotif(MOTIFS_ECHEC[0]); setAutre(""); }, [cmd?.id]);
  return (
    <Modal open={!!cmd} onClose={onClose} title="Livraison non aboutie" size="sm"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="critical" onClick={() => onValider(cmd, autre.trim() || motif)}>Enregistrer l'échec</Btn></>}>
      <div className="stack-sm">
        <p className="subtle">Le colis revient à la boutique : il repasse dans « À préparer » et pourra repartir. La vente et le stock ne changent pas.</p>
        <div className="chips">{MOTIFS_ECHEC.map((m) => <button type="button" key={m} className={cx("chip", motif === m && !autre && "on")} onClick={() => { setMotif(m); setAutre(""); }}>{m}</button>)}</div>
        <Field label="Autre motif" optional><Input value={autre} onChange={(e) => setAutre(e.target.value)} placeholder="Précisez…" /></Field>
      </div>
    </Modal>
  );
}

function PageLivraisons() {
  const { data, update, sync, go, toast, estAdmin, openSale } = useApp();
  const [tab, setTab] = useState("a_preparer");
  const [q, setQ] = useState("");
  const [filtreLivreur, setFiltreLivreur] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [lot, setLot] = useState({ livreur: "", date: "" });
  const [gerer, setGerer] = useState(false);
  const [feuille, setFeuille] = useState(null);
  const [echec, setEchec] = useState(null);
  const [encaisser, setEncaisser] = useState(null);
  const [aLivrer, setALivrer] = useState(null);
  useEffect(() => setSel(new Set()), [tab, q, filtreLivreur]);

  const livreurs = data.livreurs || [];
  const nomLivreur = (id) => livreurs.find((l) => l.id === id)?.nom || null;
  const aujourdhui = isoDate(new Date());
  const tous = useMemo(() => enrichCommandes(data).filter((c) => c.livraison && c.vente), [data]);
  const actifs = tous.filter((c) => c.statut !== "annulee");
  const groupes = {
    a_preparer: actifs.filter((c) => c.statut === "en_attente" || c.statut === "confirmee"),
    en_cours: actifs.filter((c) => c.statut === "expediee"),
    livrees: actifs.filter((c) => c.statut === "livree"),
  };
  const enRetard = (c) => c.statut !== "livree" && c.livraisonPrevue && c.livraisonPrevue < aujourdhui;
  const nonLivres = [...groupes.a_preparer, ...groupes.en_cours];
  const base = tab === "toutes" ? tous : tab === "retard" ? nonLivres.filter(enRetard) : groupes[tab];
  const rows = base.filter((c) => (!filtreLivreur || (filtreLivreur === "_aucun" ? !c.livreurId : c.livreurId === filtreLivreur))
    && norm(`${c.contactTel || ""} ${c.client?.tel || ""} ${c.client?.nom || ""} ${c.adresseLivraison} ${c.numero} ${c.numeroTicket || ""} ${c.lignes.map((l) => l.pack?.nom).join(" ")}`).replace(/(\d)\s+(?=\d)/g, "$1").includes(norm(q).replace(/(\d)\s+(?=\d)/g, "$1")))
    .sort((a, b) => (tab === "livrees" || tab === "toutes" ? b.stamp.localeCompare(a.stamp) : (a.livraisonPrevue || "9999").localeCompare(b.livraisonPrevue || "9999") || a.stamp.localeCompare(b.stamp)));
  const pg = usePaged(rows, 15, tab + q + filtreLivreur);

  /* ---- actions ---- */
  const majLivraison = (ids, champs) => update((d) => ({ ...d, commandes: d.commandes.map((c) => (ids.includes(c.id) ? { ...c, ...champs } : c)) }));
  const affecter = (ids, livreurId, date) => {
    majLivraison(ids, { livreurId: livreurId || null, ...(date ? { livraisonPrevue: date } : {}) });
    if (ids.length === 1) sync(["PATCH", `/api/commandes/${ids[0]}/livraison`, { livreur_id: livreurId || null, ...(date ? { livraison_prevue: date } : {}) }]);
    else sync(["POST", "/api/commandes/livraison/affecter", { ids, livreur_id: livreurId || null, livraison_prevue: date || undefined }]);
  };
  const prevoir = (c, date) => { majLivraison([c.id], { livraisonPrevue: date || null }); sync(["PATCH", `/api/commandes/${c.id}/livraison`, { livraison_prevue: date || null }]); };
  const changerStatut = (ids, statut) => {
    update((d) => { const n = applyStatut(d, ids, statut); return { ...n, commandes: n.commandes.map((c) => (ids.includes(c.id) ? { ...c, livreeLe: statut === "livree" ? new Date().toISOString() : null } : c)) }; });
    sync(ids.length === 1 ? ["PATCH", `/api/commandes/${ids[0]}/statut`, { statut }] : ["POST", "/api/commandes/statut", { ids, statut }]);
  };
  const partir = (ids) => {
    const sans = actifs.filter((c) => ids.includes(c.id) && !c.livreurId).length;
    changerStatut(ids, "expediee");
    toast({ title: `${ids.length} colis parti${ids.length > 1 ? "s" : ""} en livraison`, desc: sans ? `${sans} sans livreur désigné` : undefined });
    setSel(new Set());
  };
  const livrer = (c) => {
    // Paiement à la livraison : on encaisse d'abord, le colis est marqué livré ensuite
    if (aEncaisser(c)) { setALivrer(c.id); setEncaisser(c); return; }
    changerStatut([c.id], "livree");
    toast({ title: "Colis livré", desc: c.client?.nom });
  };
  useEffect(() => {
    if (!aLivrer || encaisser) return;
    const c = enrichCommandes(data).find((x) => x.id === aLivrer);
    if (c && !aEncaisser(c)) { changerStatut([c.id], "livree"); toast({ title: "Colis livré et encaissé", desc: fmt(c.total) }); }
    setALivrer(null);
  }, [aLivrer, encaisser, data]);
  const declarerEchec = (c, motif) => {
    const maintenant = new Date().toISOString();
    update((d) => ({ ...d, commandes: d.commandes.map((x) => (x.id === c.id ? { ...x, statut: "confirmee", tentatives: (x.tentatives || 0) + 1, historique: [...(x.historique || []), { type: "note", texte: `Échec de livraison : ${motif}`, date: maintenant }] } : x)) }));
    sync(["POST", `/api/commandes/${c.id}/echec-livraison`, { motif }]);
    toast({ title: "Échec de livraison enregistré", desc: motif });
    setEchec(null);
  };
  const prevenirClient = (c) => {
    const l = livreurs.find((x) => x.id === c.livreurId);
    const texte = `Bonjour, ${data.boutique?.nom || "votre boutique"} : votre commande ${c.numero} ${c.statut === "expediee" ? "est en cours de livraison" : "sera livrée" + (c.livraisonPrevue ? " le " + fmtDate(c.livraisonPrevue) : " prochainement")}${c.adresseLivraison ? " à : " + c.adresseLivraison : ""}.${l ? ` Livreur : ${l.nom}, ${l.tel}.` : ""}${aEncaisser(c) ? ` Montant à régler à la livraison : ${fmt(c.total)}.` : " Commande déjà réglée."}`;
    window.open(`https://wa.me/${telInternational(c.contactTel || c.client?.tel)}?text=${encodeURIComponent(texte)}`, "_blank", "noopener");
  };

  /* ---- indicateurs ---- */
  const il30 = isoDate(addDays(today(), -30));
  const livreesAujourdhui = groupes.livrees.filter((c) => (c.livreeLe || "").slice(0, 10) === aujourdhui || (!c.livreeLe && c.vente.date === aujourdhui)).length;
  const retards = nonLivres.filter(enRetard).length;
  const sansLivreur = nonLivres.filter((c) => !c.livreurId).length;
  const kpis = [
    { label: "Colis à préparer", value: groupes.a_preparer.length, f: fmtNum, icon: Package, tint: 1, sub: sansLivreur ? `${sansLivreur} sans livreur` : "Tous ont un livreur" },
    { label: "En cours de livraison", value: groupes.en_cours.length, f: fmtNum, icon: Truck, tint: 5, sub: retards ? `${retards} en retard sur la date prévue` : "Aucun retard" },
    { label: "Livrés aujourd'hui", value: livreesAujourdhui, f: fmtNum, icon: PackageCheck, tint: 0, sub: `${groupes.livrees.filter((c) => c.vente.date >= il30).length} sur 30 jours` },
    { label: "À encaisser à la livraison", value: nonLivres.reduce((s, c) => s + aEncaisser(c), 0), f: fmt, icon: Banknote, tint: 3, sub: `Frais de livraison (30 j) : ${fmt(actifs.filter((c) => c.vente.date >= il30).reduce((s, c) => s + c.frais, 0))}` },
  ];
  const parLivreur = livreurs.map((l) => {
    const siens = actifs.filter((c) => c.livreurId === l.id);
    return { l, aPreparer: siens.filter((c) => c.statut === "en_attente" || c.statut === "confirmee").length, enCours: siens.filter((c) => c.statut === "expediee").length,
      livres: siens.filter((c) => c.statut === "livree" && c.vente.date >= il30).length, encaisser: siens.filter((c) => c.statut !== "livree").reduce((s, c) => s + aEncaisser(c), 0), echecs: siens.reduce((s, c) => s + (c.tentatives || 0), 0) };
  });

  const selection = [...sel];
  const allOnPage = pg.slice.length > 0 && pg.slice.every((c) => sel.has(c.id));
  const toggle = (id, v) => setSel((s) => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });
  const toggleAll = (v) => setSel((s) => { const n = new Set(s); pg.slice.forEach((c) => (v ? n.add(c.id) : n.delete(c.id))); return n; });

  return (
    <>
      <PageHeader title="Livraisons" meta="Le suivi de chaque colis : préparation, départ, remise au client, encaissement"
        actions={<>
          {estAdmin && <Btn icon={Users} onClick={() => setGerer(true)}>Livreurs</Btn>}
          <Btn icon={ClipboardList} onClick={() => setFeuille({ livreurId: filtreLivreur && filtreLivreur !== "_aucun" ? filtreLivreur : "" })}>Feuille de route</Btn>
          <Btn variant="primary" icon={Plus} onClick={() => openSale()} className="hide-sm">Nouvelle commande</Btn>
        </>} />
      <div className="kpi-grid stagger">
        {kpis.map((k, i) => (
          <div className="card kpi" key={k.label} style={{ "--i": i }}>
            <div className="kpi-label"><span className={cx("kpi-dot", `tint-${k.tint}`)}><k.icon size={13} /></span>{k.label}</div>
            <div className="kpi-value"><CountUp value={k.value} format={k.f} /></div>
            <div className="subtle">{k.sub}</div>
          </div>
        ))}
      </div>
      {livreurs.length === 0 && estAdmin && <div className="banner banner-info" style={{ marginBottom: 16 }}><Info size={16} /><div>Ajoutez vos livreurs pour leur confier des colis et leur envoyer leur feuille de route. <button className="link" onClick={() => setGerer(true)}>Ajouter un livreur</button></div></div>}
      {retards > 0 && <div className="banner banner-warning" style={{ marginBottom: 16 }}><AlertTriangle size={16} /><div><b>{retards} colis en retard</b> sur la date de livraison prévue. <button className="link" onClick={() => setTab("retard")}>Voir ces colis</button></div></div>}

      <div className="card">
        <div className="table-toolbar">
          <Tabs value={tab} onChange={setTab} tabs={[
            { key: "a_preparer", label: "À préparer", count: groupes.a_preparer.length },
            { key: "en_cours", label: "En livraison", count: groupes.en_cours.length },
            { key: "retard", label: "En retard", count: retards },
            { key: "livrees", label: "Livrés", count: groupes.livrees.length },
            { key: "toutes", label: "Tous", count: tous.length },
          ]} />
        </div>
        <div className="table-filters">
          <SearchInput value={q} onChange={setQ} placeholder="Rechercher par téléphone, client, lieu, article…" />
          <Select value={filtreLivreur} onChange={(e) => setFiltreLivreur(e.target.value)} style={{ width: 210 }} aria-label="Livreur">
            <option value="">Tous les livreurs</option>
            <option value="_aucun">Sans livreur</option>
            {livreurs.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
          </Select>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Truck} title={q || filtreLivreur ? "Aucun colis trouvé" : tab === "a_preparer" ? "Aucun colis à préparer" : "Aucun colis ici"}>
            {tab === "a_preparer" && !q ? "Les commandes en ligne et les ventes avec l'option « Livraison » apparaissent ici." : "Changez d'onglet ou de filtre."}
          </EmptyState>
        ) : (
          <div className="table-scroll has-bulk">
            {sel.size > 0 && (
              <div className="bulk-bar bulk-livraison">
                <Checkbox checked={allOnPage} indeterminate={!allOnPage} onChange={toggleAll} label={<strong>{sel.size} colis</strong>} />
                <span className="grow" />
                <Select value={lot.livreur} onChange={(e) => setLot({ ...lot, livreur: e.target.value })} style={{ width: 170 }} aria-label="Livreur"><option value="">Choisir un livreur…</option>{livreurs.filter((l) => l.actif).map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}</Select>
                <input type="date" className="input date-compacte" value={lot.date} min={aujourdhui} onChange={(e) => setLot({ ...lot, date: e.target.value })} aria-label="Date prévue" />
                <Btn size="sm" disabled={!lot.livreur} onClick={() => { affecter(selection, lot.livreur, lot.date); toast({ title: `${selection.length} colis confié${selection.length > 1 ? "s" : ""} à ${nomLivreur(lot.livreur)}` }); setSel(new Set()); }}>Confier</Btn>
                <Btn size="sm" variant="primary" icon={Truck} onClick={() => partir(selection.filter((id) => groupes.a_preparer.some((c) => c.id === id)))}>Départ</Btn>
              </div>
            )}
            <table className="table table-livraisons">
              <thead><tr>
                <th className="col-check hide-sm"><Checkbox checked={allOnPage} onChange={toggleAll} label={<span className="sr-only">Tout sélectionner</span>} /></th>
                <th>Contact</th><th>Lieu de livraison</th><th className="hide-md">Colis</th><th className="right">À encaisser</th><th className="hide-sm">Livreur</th><th className="hide-md">Prévue le</th><th>Statut</th><th style={{ width: 150 }} />
              </tr></thead>
              <tbody key={tab + pg.page}>
                {pg.slice.map((c, i) => {
                  const fini = c.statut === "livree" || c.statut === "annulee";
                  return (
                    <tr key={c.id} className={cx(sel.has(c.id) && "selected")} style={{ "--i": i }}>
                      <td className="col-check hide-sm">{!fini && <Checkbox checked={sel.has(c.id)} onChange={(v) => toggle(c.id, v)} label={<span className="sr-only">Sélectionner</span>} />}</td>
                      <td><button className="link cell-main num" onClick={() => go("commandes", c.id)}>{c.contactTel || c.client?.tel || "—"}</button><div className="cell-sub">{c.client?.nom}</div></td>
                      <td className="wrap">{c.adresseLivraison || <span className="subtle">Adresse à préciser</span>}
                        <div className="cell-sub only-mobile">{resumeCommande(c)} · {nomLivreur(c.livreurId) || "sans livreur"}</div></td>
                      <td className="hide-md wrap">{c.lignes.map((l) => `${l.pack?.nom || "?"} × ${l.qte}`).join(", ")}<div className="cell-sub">{c.pieces} article{c.pieces > 1 ? "s" : ""} · {c.numeroTicket || c.numero}</div></td>
                      <td className="right num strong">{aEncaisser(c) ? fmt(aEncaisser(c)) : <Badge tone="success">Payé</Badge>}{c.frais > 0 && <div className="cell-sub">dont {fmt(c.frais)} livr.</div>}</td>
                      <td className="hide-sm">{fini ? nomLivreur(c.livreurId) || <span className="subtle">—</span> : (
                        <Select value={c.livreurId || ""} onChange={(e) => affecter([c.id], e.target.value)} aria-label="Livreur" style={{ minWidth: 150 }}>
                          <option value="">Sans livreur</option>
                          {livreurs.filter((l) => l.actif || l.id === c.livreurId).map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
                        </Select>)}</td>
                      <td className="hide-md">{fini ? (c.livreeLe ? fmtDateCourt(c.livreeLe.slice(0, 10)) : c.livraisonPrevue ? fmtDateCourt(c.livraisonPrevue) : "—") : (
                        <input type="date" className={cx("input date-compacte", enRetard(c) && "retard")} value={c.livraisonPrevue || ""} onChange={(e) => prevoir(c, e.target.value)} aria-label="Date prévue" />)}</td>
                      <td><StatutBadge statut={c.statut} />{enRetard(c) && <div><Badge tone="critical">En retard</Badge></div>}{c.tentatives > 0 && <div><Badge tone="warning">{c.tentatives} échec{c.tentatives > 1 ? "s" : ""}</Badge></div>}</td>
                      <td className="right"><span className="row" style={{ gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {(c.statut === "en_attente" || c.statut === "confirmee") && <Btn size="sm" variant="primary" icon={Truck} onClick={() => partir([c.id])}>Départ</Btn>}
                        {c.statut === "expediee" && <>
                          <Btn size="sm" variant="primary" icon={PackageCheck} onClick={() => livrer(c)}>Livré</Btn>
                          <Btn size="sm" variant="critical-plain" onClick={() => setEchec(c)}>Échec</Btn>
                        </>}
                        {!fini && (c.contactTel || c.client?.tel) && <button className="icon-btn" title="Prévenir le client (WhatsApp)" aria-label="Prévenir le client" onClick={() => prevenirClient(c)}><MessageSquare size={15} /></button>}
                      </span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager pg={pg} />
      </div>

      {livreurs.length > 0 && (
        <Card title="Par livreur" sub="Colis confiés, livrés sur 30 jours et argent à rapporter" padded={false}
          actions={estAdmin && <Btn size="sm" icon={Pencil} onClick={() => setGerer(true)}>Gérer</Btn>}>
          <div style={{ height: 12 }} />
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Livreur</th><th className="right">À préparer</th><th className="right">En cours</th><th className="right hide-sm">Livrés (30 j)</th><th className="right hide-sm">Échecs</th><th className="right">À encaisser</th><th style={{ width: 60 }} /></tr></thead>
              <tbody>
                {parLivreur.map(({ l, aPreparer, enCours, livres, encaisser: e, echecs }, i) => (
                  <tr key={l.id} style={{ "--i": i, opacity: l.actif ? 1 : 0.55 }}>
                    <td><div className="cell-product"><Avatar name={l.nom} size="sm" /><div><div className="cell-main">{l.nom}</div><div className="cell-sub">{l.tel}{l.zone ? " · " + l.zone : ""}</div></div></div></td>
                    <td className="right num">{aPreparer}</td><td className="right num strong">{enCours}</td><td className="right num hide-sm">{livres}</td><td className="right num hide-sm">{echecs}</td>
                    <td className="right num strong">{fmt(e)}</td>
                    <td className="right"><button className="icon-btn" title="Feuille de route" aria-label={`Feuille de route de ${l.nom}`} disabled={!aPreparer && !enCours} onClick={() => setFeuille({ livreurId: l.id })}><ClipboardList size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LivreursModal open={gerer} onClose={() => setGerer(false)} />
      <FeuilleRouteModal open={!!feuille} livreurId={feuille?.livreurId} colis={nonLivres} onClose={() => setFeuille(null)} />
      <EchecLivraisonModal cmd={echec} onClose={() => setEchec(null)} onValider={declarerEchec} />
      <EncaisserModal open={!!encaisser} cmd={encaisser} onClose={() => setEncaisser(null)} />
    </>
  );
}

/* Page réservée à l'administrateur */
const AccesReserve = () => {
  const { go } = useApp();
  return <Card><EmptyState icon={Lock} title="Accès réservé à l'administrateur" action={<Btn variant="primary" onClick={() => go("accueil")}>Retour à l'accueil</Btn>}>Votre compte vendeur ne donne pas accès à cette page.</EmptyState></Card>;
};

/* =====================================================================
   PAGE : Stocks (administrateur) — réceptions, sorties, inventaire, journal
   ===================================================================== */
const MOTIFS_STOCK = {
  vente: { label: "Vente en caisse", tone: "info" }, vente_en_ligne: { label: "Vente en ligne", tone: "magic" },
  annulation: { label: "Annulation", tone: "neutral" }, retablissement: { label: "Rétablissement", tone: "neutral" },
  suppression: { label: "Suppression de vente", tone: "neutral" }, reception: { label: "Réception", tone: "success" },
  inventaire: { label: "Inventaire", tone: "warning" }, casse: { label: "Casse / perte", tone: "critical" },
  retour: { label: "Retour", tone: "success" }, ajustement: { label: "Ajustement", tone: "warning" }, stock_initial: { label: "Stock initial", tone: "neutral" },
};

function ReceptionModal({ open, packId, onClose }) {
  const { data, update, sync, toast } = useApp();
  const [f, setF] = useState({});
  const [err, setErr] = useState({});
  const packs = data.packs.filter((p) => p.actif !== false || p.id === packId);
  useEffect(() => {
    if (!open) return;
    const p = data.packs.find((x) => x.id === packId) || packs[0];
    setF({ packId: p?.id || "", quantite: "", cout: p?.cout != null ? String(p.cout) : "", fournisseur: "", depense: true });
    setErr({});
  }, [open, packId]);
  const pack = data.packs.find((p) => p.id === f.packId);
  const q = Number(f.quantite) || 0, cout = f.cout === "" ? null : Number(f.cout);
  const set = (k, v) => { setF((s) => ({ ...s, [k]: v, ...(k === "packId" ? { cout: data.packs.find((p) => p.id === v)?.cout != null ? String(data.packs.find((p) => p.id === v).cout) : "" } : {}) })); setErr({}); };
  const valider = () => {
    const e = {};
    if (!pack) e.packId = "Choisissez un produit.";
    if (!(q > 0)) e.quantite = "Indiquez la quantité reçue.";
    setErr(e);
    if (Object.keys(e).length) return;
    const fournisseur = f.fournisseur.trim();
    const depense = f.depense && cout > 0 ? { id: uid(), libelle: `Achat de stock — ${pack.nom} ×${q}${fournisseur ? " (" + fournisseur + ")" : ""}`, categorie: "Stock", montant: q * cout, date: isoDate(new Date()) } : null;
    update((d) => ({
      ...d,
      packs: d.packs.map((p) => (p.id === pack.id ? { ...p, stock: p.stock + q, cout: cout ?? p.cout } : p)),
      investissements: depense ? [depense, ...d.investissements] : d.investissements,
    }));
    sync(["POST", "/api/stocks/reception", { pack_id: pack.id, quantite: q, cout_unitaire: cout, fournisseur, creer_depense: !!depense }]);
    toast({ title: `+${q} ${pack.nom}`, desc: depense ? `Dépense de ${fmt(depense.montant)} enregistrée (Stock)` : "Réception enregistrée" });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Réception de marchandise" size="md"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" icon={PackagePlus} onClick={valider}>Enregistrer la réception</Btn></>}>
      <div className="form-grid">
        <Field label="Produit" error={err.packId} className="full">
          <Select value={f.packId || ""} onChange={(e) => set("packId", e.target.value)}>{packs.map((p) => <option key={p.id} value={p.id}>{p.nom} — {p.stock} articles en stock</option>)}</Select>
        </Field>
        <Field label="Quantité reçue" error={err.quantite}><Input value={f.quantite || ""} onChange={(e) => set("quantite", e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" suffix="unités" placeholder="0" data-autofocus /></Field>
        <Field label="Coût d'achat unitaire" optional help="Met à jour le coût du produit (calcul des marges)."><Input value={f.cout || ""} onChange={(e) => set("cout", e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" suffix="FCFA" placeholder="0" /></Field>
        <Field label="Fournisseur" optional className="full"><Input value={f.fournisseur || ""} onChange={(e) => set("fournisseur", e.target.value)} placeholder="Ex : Grossiste Adjamé" /></Field>
        <div className="full"><Checkbox checked={f.depense} onChange={(v) => set("depense", v)} label={`Enregistrer l'achat dans les dépenses${q && cout ? ` (${fmt(q * cout)})` : ""}`} /></div>
        {pack && q > 0 && <div className="full banner banner-success"><PackagePlus size={16} /><div>Stock de <b>{pack.nom}</b> : {pack.stock} → <b>{pack.stock + q}</b></div></div>}
      </div>
    </Modal>
  );
}

function SortieModal({ open, packId, onClose }) {
  const { data, update, sync, toast } = useApp();
  const [f, setF] = useState({});
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setF({ packId: packId || data.packs[0]?.id || "", quantite: "", motif: "casse", note: "" }); setErr(""); } }, [open, packId]);
  const pack = data.packs.find((p) => p.id === f.packId);
  const q = Number(f.quantite) || 0;
  const valider = () => {
    if (!pack) return setErr("Choisissez un produit.");
    if (!(q > 0)) return setErr("Indiquez la quantité.");
    if (q > pack.stock) return setErr(`Stock insuffisant (${pack.stock} en stock).`);
    update((d) => ({ ...d, packs: d.packs.map((p) => (p.id === pack.id ? { ...p, stock: p.stock - q } : p)) }));
    sync(["POST", "/api/stocks/sortie", { pack_id: pack.id, quantite: q, motif: f.motif, note: f.note.trim() }]);
    toast({ title: `−${q} ${pack.nom}`, desc: MOTIFS_STOCK[f.motif].label });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Sortie de stock" size="md"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="critical" icon={PackageMinus} onClick={valider}>Retirer du stock</Btn></>}>
      <div className="form-grid">
        <Field label="Produit" className="full"><Select value={f.packId || ""} onChange={(e) => setF({ ...f, packId: e.target.value })}>{data.packs.map((p) => <option key={p.id} value={p.id}>{p.nom} — {p.stock} articles en stock</option>)}</Select></Field>
        <Field label="Quantité" error={err}><Input value={f.quantite || ""} onChange={(e) => { setF({ ...f, quantite: e.target.value.replace(/[^\d]/g, "") }); setErr(""); }} inputMode="numeric" suffix="unités" placeholder="0" data-autofocus /></Field>
        <Field label="Motif"><Select value={f.motif || "casse"} onChange={(e) => setF({ ...f, motif: e.target.value })}><option value="casse">Casse / perte / vol</option><option value="ajustement">Ajustement (usage interne, cadeau…)</option></Select></Field>
        <Field label="Commentaire" optional className="full"><Input value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ex : carton abîmé à la livraison" /></Field>
      </div>
    </Modal>
  );
}

function InventaireModal({ open, onClose }) {
  const { data, update, sync, toast } = useApp();
  const [reel, setReel] = useState({});
  useEffect(() => { if (open) setReel(Object.fromEntries(data.packs.map((p) => [p.id, String(p.stock)]))); }, [open]);
  const ecarts = data.packs.map((p) => ({ p, apres: reel[p.id] === "" || reel[p.id] == null ? p.stock : Number(reel[p.id]) })).filter((x) => x.apres !== x.p.stock);
  const valider = () => {
    if (!ecarts.length) { onClose(); return; }
    const m = new Map(ecarts.map((x) => [x.p.id, x.apres]));
    update((d) => ({ ...d, packs: d.packs.map((p) => (m.has(p.id) ? { ...p, stock: m.get(p.id) } : p)) }));
    sync(["POST", "/api/stocks/inventaire", { lignes: ecarts.map((x) => ({ pack_id: x.p.id, stock_reel: x.apres })) }]);
    toast({ title: "Inventaire enregistré", desc: `${ecarts.length} écart${ecarts.length > 1 ? "s" : ""} corrigé${ecarts.length > 1 ? "s" : ""}` });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Inventaire (comptage physique)" size="lg"
      footer={<><span className="subtle spacer">{ecarts.length ? `${ecarts.length} écart(s) à corriger` : "Aucun écart"}</span><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" icon={ClipboardList} onClick={valider}>Valider l'inventaire</Btn></>}>
      <p className="subtle" style={{ marginBottom: 12 }}>Saisissez la quantité réellement comptée en boutique. Les écarts sont corrigés et tracés dans le journal des mouvements.</p>
      <div className="table-scroll">
        <table className="table">
          <thead><tr><th>Produit</th><th className="right">Théorique</th><th style={{ width: 130 }}>Compté</th><th className="right">Écart</th></tr></thead>
          <tbody>
            {data.packs.map((p) => {
              const v = reel[p.id] ?? "";
              const d = v === "" ? 0 : Number(v) - p.stock;
              return (
                <tr key={p.id}>
                  <td><div className="cell-product"><Thumb pack={p} size="sm" /><div className="cell-main">{p.nom}</div></div></td>
                  <td className="right num">{p.stock}</td>
                  <td><Input value={v} onChange={(e) => setReel((r) => ({ ...r, [p.id]: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" /></td>
                  <td className="right num strong" style={{ color: d > 0 ? "var(--success-dot)" : d < 0 ? "var(--critical-solid)" : undefined }}>{d > 0 ? "+" + d : d || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function PageStocks({ route }) {
  const { data, mode, go } = useApp();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("tous");
  const [modal, setModal] = useState(route.id === "reception" ? { type: "reception" } : null);
  const [mvts, setMvts] = useState(null);
  const [mvtPack, setMvtPack] = useState("");
  const signature = data.packs.map((p) => p.id + ":" + p.stock).join(",");

  useEffect(() => {
    if (mode !== "api") return;
    let actif = true;
    const t = setTimeout(() => apiFetch("GET", `/api/stocks/mouvements?limite=150${mvtPack ? "&pack_id=" + encodeURIComponent(mvtPack) : ""}`)
      .then((r) => actif && setMvts(r)).catch(() => actif && setMvts([])), 600);
    return () => { actif = false; clearTimeout(t); };
  }, [mode, mvtPack, signature]);

  const vendus30 = useMemo(() => {
    const depuis = isoDate(addDays(today(), -30));
    const m = new Map();
    enrichVentes(data).filter((v) => isValid(v) && v.date >= depuis).forEach((v) => m.set(v.packId, (m.get(v.packId) || 0) + v.qte));
    return m;
  }, [data]);

  const filtres = { tous: () => true, alerte: (p) => p.stock > 0 && p.stock <= seuilDe(p), rupture: (p) => p.stock <= 0, brouillons: (p) => p.actif === false };
  const rows = data.packs.filter((p) => filtres[tab](p) && norm(p.nom + " " + p.sku).includes(norm(q))).sort((a, b) => (a.stock - seuilDe(a)) - (b.stock - seuilDe(b)));
  const unites = data.packs.reduce((s, p) => s + p.stock, 0);
  // Prix et coût sont ceux d'un lot ; le stock est en articles
  const valeurAchat = Math.round(data.packs.reduce((s, p) => s + (p.stock / (p.pieces || 1)) * (p.cout || 0), 0));
  const valeurVente = Math.round(data.packs.reduce((s, p) => s + (p.stock / (p.pieces || 1)) * prixEffectif(p), 0));
  const alertes = data.packs.filter((p) => p.actif !== false && p.stock <= seuilDe(p)).length;
  const couverture = (p) => { const v = vendus30.get(p.id) || 0; return v ? Math.floor(p.stock / (v / 30)) : null; };

  const kpis = [
    { label: "Articles en stock", value: unites, f: fmtNum, icon: Boxes, tint: 4 },
    { label: "Valeur au prix d'achat", value: valeurAchat, f: fmt, icon: Wallet, tint: 3 },
    { label: "Valeur au prix de vente", value: valeurVente, f: fmt, icon: TrendingUp, tint: 0 },
    { label: "Produits en alerte", value: alertes, f: fmtNum, icon: AlertTriangle, tint: alertes ? 3 : 0, color: alertes ? "var(--critical-solid)" : undefined },
  ];

  return (
    <>
      <PageHeader title="Stocks" meta="Contrôle complet de l'inventaire : entrées, sorties, comptages et historique"
        actions={<>
          <Btn icon={ClipboardList} onClick={() => setModal({ type: "inventaire" })} className="hide-sm">Inventaire</Btn>
          <Btn icon={PackageMinus} onClick={() => setModal({ type: "sortie" })}>Sortie</Btn>
          <Btn variant="primary" icon={PackagePlus} onClick={() => setModal({ type: "reception" })}>Réception</Btn>
        </>} />
      <div className="kpi-grid stagger">
        {kpis.map((k, i) => (
          <div className="card kpi" key={k.label} style={{ "--i": i }}>
            <div className="kpi-label"><span className={cx("kpi-dot", `tint-${k.tint}`)}><k.icon size={13} /></span>{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}><CountUp value={k.value} format={k.f} /></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-toolbar">
          <Tabs value={tab} onChange={setTab} tabs={[
            { key: "tous", label: "Tous", count: data.packs.length },
            { key: "alerte", label: "Stock faible", count: data.packs.filter(filtres.alerte).length },
            { key: "rupture", label: "Rupture", count: data.packs.filter(filtres.rupture).length },
            { key: "brouillons", label: "Brouillons", count: data.packs.filter(filtres.brouillons).length },
          ]} />
        </div>
        <div className="table-filters"><SearchInput value={q} onChange={setQ} placeholder="Rechercher un produit…" /></div>
        {rows.length === 0 ? <EmptyState icon={Boxes} title="Aucun produit">Essayez un autre filtre.</EmptyState> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Produit</th><th>Stock</th><th className="hide-sm right">Seuil</th><th className="hide-sm right">Vendus 30 j</th><th className="hide-md right">Couverture</th><th className="hide-md right">Valeur (achat)</th><th style={{ width: 96 }} /></tr></thead>
              <tbody key={tab + q}>
                {rows.map((p, i) => {
                  const c = couverture(p);
                  return (
                    <tr key={p.id} style={{ "--i": i }}>
                      <td className="wrap"><div className="cell-product"><Thumb pack={p} size="sm" /><div><div className="cell-main">{p.nom}</div><div className="cell-sub">{p.sku}{p.actif === false ? " · brouillon" : ""}</div></div></div></td>
                      <td><StockBadge stock={p.stock} seuil={seuilDe(p)} />{(p.pieces || 1) > 1 && <div className="cell-sub">soit {fmtNum(lotsDispo(p))} lot{lotsDispo(p) > 1 ? "s" : ""} de {p.pieces}</div>}</td>
                      <td className="hide-sm right num muted">{seuilDe(p)}</td>
                      <td className="hide-sm right num">{vendus30.get(p.id) || 0}</td>
                      <td className="hide-md right num">{c == null ? <span className="subtle">—</span> : <span style={{ color: c < 7 ? "var(--critical-solid)" : undefined }}>{c} j</span>}</td>
                      <td className="hide-md right num">{p.cout != null ? fmt(Math.round((p.stock / (p.pieces || 1)) * p.cout)) : <span className="subtle">coût ?</span>}</td>
                      <td className="right"><span className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
                        <button className="icon-btn" title="Réception" aria-label={`Réceptionner ${p.nom}`} onClick={() => setModal({ type: "reception", packId: p.id })}><PackagePlus size={15} /></button>
                        <button className="icon-btn" title="Sortie" aria-label={`Sortie de ${p.nom}`} onClick={() => setModal({ type: "sortie", packId: p.id })}><PackageMinus size={15} /></button>
                        <button className="icon-btn" title="Modifier le produit" aria-label={`Modifier ${p.nom}`} onClick={() => go("produits", p.id)}><Pencil size={14} /></button>
                      </span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Card title="Journal des mouvements" sub="Chaque entrée et sortie de stock, avec son auteur" padded={false}
        actions={mode === "api" && <Select value={mvtPack} onChange={(e) => setMvtPack(e.target.value)} style={{ width: 200 }} aria-label="Produit"><option value="">Tous les produits</option>{data.packs.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</Select>}>
        <div style={{ height: 12 }} />
        {mode !== "api" ? <EmptyState icon={History} title="Disponible avec le serveur">Le journal des mouvements est enregistré par le serveur.</EmptyState>
          : mvts == null ? <div className="pdf-attente"><span className="spinner" />Chargement…</div>
          : mvts.length === 0 ? <EmptyState icon={History} title="Aucun mouvement" /> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Date</th><th>Produit</th><th>Motif</th><th className="right">Mouvement</th><th className="right hide-sm">Stock après</th><th className="hide-md">Détail</th></tr></thead>
                <tbody>
                  {mvts.map((m, i) => (
                    <tr key={m.id} style={{ "--i": Math.min(i, 20) }}>
                      <td className="muted">{fmtDateTime(m.cree_le)}</td>
                      <td className="wrap">{m.pack_nom || <span className="subtle">Produit supprimé</span>}</td>
                      <td><Badge tone={MOTIFS_STOCK[m.motif]?.tone || "neutral"}>{MOTIFS_STOCK[m.motif]?.label || m.motif_libelle}</Badge></td>
                      <td className="right num strong" style={{ color: m.delta > 0 ? "var(--success-dot)" : "var(--critical-solid)" }}>{m.delta > 0 ? "+" + m.delta : m.delta}</td>
                      <td className="right num hide-sm">{m.stock_apres}</td>
                      <td className="hide-md subtle wrap">{[m.reference, m.note, m.auteur_nom && "par " + m.auteur_nom].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <ReceptionModal open={modal?.type === "reception"} packId={modal?.packId} onClose={() => { setModal(null); if (route.id) go("stocks"); }} />
      <SortieModal open={modal?.type === "sortie"} packId={modal?.packId} onClose={() => setModal(null)} />
      <InventaireModal open={modal?.type === "inventaire"} onClose={() => setModal(null)} />
    </>
  );
}

/* =====================================================================
   PAGE : Marketing (administrateur) — fidélisation, campagnes, promotions
   ===================================================================== */
const TYPES_CAMPAGNE = [
  { value: "bonne_semaine", label: "Bonne semaine", icon: Sun },
  { value: "promotion", label: "Promotion", icon: Percent },
  { value: "nouveautes", label: "Nouveautés", icon: Sparkles },
  { value: "libre", label: "Message libre", icon: MessageSquare },
];
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const AIDE_VARIABLES = "Variables : {prenom}, {boutique}, {lien}, {promos}, {nouveautes}, {promos_detail}, {nouveautes_detail}";

function CanauxChoix({ value, onChange }) {
  const t = (c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
      <Checkbox checked={value.includes("sms")} onChange={() => t("sms")} label="SMS" />
      <Checkbox checked={value.includes("email")} onChange={() => t("email")} label="E-mail" />
    </div>
  );
}

/* Aperçu en direct : nombre de destinataires + message tel que reçu */
function useApercuCampagne(open, { audience, canaux, type, message }) {
  const [a, setA] = useState(null);
  useEffect(() => {
    if (!open) return;
    let actif = true;
    const t = setTimeout(() => apiFetch("POST", "/api/campagnes/apercu", { audience, canaux, type, message })
      .then((r) => actif && setA(r)).catch(() => actif && setA(null)), 350);
    return () => { actif = false; clearTimeout(t); };
  }, [open, audience, canaux.join(","), type, message]);
  return a;
}

function ApercuMessage({ a, canaux }) {
  if (!a) return <div className="pdf-attente"><span className="spinner" />Calcul des destinataires…</div>;
  return (
    <div className="apercu-message">
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Badge tone="info" icon={Users}>{a.destinataires} destinataire{a.destinataires > 1 ? "s" : ""}</Badge>
        {canaux.includes("sms") && <Badge icon={Smartphone}>{a.sms} SMS</Badge>}
        {canaux.includes("email") && <Badge icon={Mail}>{a.email} e-mail{a.email > 1 ? "s" : ""}</Badge>}
      </div>
      {a.exemple ? <div className="bulle-sms">{a.exemple}</div> : <div className="subtle">Le message est vide.</div>}
      {a.destinataires === 0 && <div className="field-error" style={{ marginTop: 8 }}><AlertCircle size={14} />Aucun client abonné dans cette audience.</div>}
    </div>
  );
}

function CampagneModal({ open, preset, info, onClose, onLancee }) {
  const { toast } = useApp();
  const [f, setF] = useState({ titre: "", type: "bonne_semaine", message: "", audience: "tous", canaux: ["sms", "email"] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const type = preset?.type || "bonne_semaine";
    setF({ titre: preset?.titre || "", type, message: info?.modeles?.[type] || "", audience: preset?.audience || "tous", canaux: ["sms", "email"] });
    setBusy(false);
  }, [open]);
  const a = useApercuCampagne(open, f);
  const choisirType = (type) => setF((s) => ({ ...s, type, message: info?.modeles?.[type] ?? s.message }));
  const lancer = async () => {
    if (!f.message.trim()) return toast({ title: "Le message est vide", tone: "critical" });
    if (!f.canaux.length) return toast({ title: "Choisissez au moins un canal", tone: "critical" });
    setBusy(true);
    try {
      const c = await apiFetch("POST", "/api/campagnes", { ...f, titre: f.titre.trim() || TYPES_CAMPAGNE.find((t) => t.value === f.type)?.label });
      toast({ title: "Campagne lancée", desc: `${c.nb_destinataires} client(s)${c.simule ? " — envoi simulé" : ""}` });
      onLancee?.();
      onClose();
    } catch (e) { toast({ title: "Lancement impossible", desc: e.message, tone: "critical" }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle campagne" size="lg"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" icon={Send} loading={busy} disabled={a && a.destinataires === 0} onClick={lancer}>Envoyer{a ? ` à ${a.destinataires} client${a.destinataires > 1 ? "s" : ""}` : ""}</Btn></>}>
      <div className="stack">
        <Field label="Type de message"><Segmented full value={f.type} onChange={choisirType} options={TYPES_CAMPAGNE} /></Field>
        <div className="form-grid">
          <Field label="Titre (interne)" optional><Input value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} placeholder="Ex : Fête des mères" /></Field>
          <Field label="Audience"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(info?.audiences || { tous: "Tous les clients abonnés" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <Field label="Message" help={AIDE_VARIABLES}><textarea className="textarea" rows={4} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        <Field label="Canaux"><CanauxChoix value={f.canaux} onChange={(canaux) => setF({ ...f, canaux })} /></Field>
        <Field label="Aperçu (premier destinataire)"><ApercuMessage a={a} canaux={f.canaux} /></Field>
      </div>
    </Modal>
  );
}

function PromotionModal({ open, onClose, onLancee }) {
  const { data, update, mode, toast, rafraichir } = useApp();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) { setF({ ids: [], mode: "pourcentage", valeur: "20", fin: isoDate(addDays(new Date(), 7)), alerter: mode === "api", canaux: ["sms", "email"], audience: "tous" }); setErr(""); setBusy(false); }
  }, [open]);
  const packs = data.packs.filter((p) => p.actif !== false);
  const v = Number(f.valeur) || 0;
  const nouveauPrix = (p) => (f.mode === "prix" ? Math.round(v) : Math.round((p.prix * (100 - v)) / 100 / 5) * 5);
  const ids = f.ids || [];
  const toggle = (id) => setF((s) => ({ ...s, ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] }));
  const a = useApercuCampagne(open && mode === "api" && f.alerter, { audience: f.audience || "tous", canaux: f.canaux || [], type: "promotion", message: "" });
  const lancer = async () => {
    if (!ids.length) return setErr("Choisissez au moins un produit.");
    if (f.mode === "pourcentage" && !(v > 0 && v < 100)) return setErr("Réduction entre 1 et 99 %.");
    const invalides = ids.map((id) => data.packs.find((p) => p.id === id)).filter((p) => !(nouveauPrix(p) > 0 && nouveauPrix(p) < p.prix));
    if (invalides.length) return setErr(`Prix promotionnel invalide pour : ${invalides.map((p) => p.nom).join(", ")}`);
    const fin = f.fin ? (() => { const d = parseDate(f.fin); d.setHours(23, 59, 59, 0); return d.toISOString(); })() : null;
    if (mode !== "api") {
      update((d) => ({ ...d, packs: d.packs.map((p) => (ids.includes(p.id) ? { ...p, prixPromo: nouveauPrix(p), promoFin: fin } : p)) }));
      toast({ title: "Promotion appliquée", desc: `${ids.length} produit(s)` });
      onClose();
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch("POST", "/api/campagnes/promotion", { pack_ids: ids, mode: f.mode, valeur: v, fin, alerter: f.alerter, canaux: f.canaux, audience: f.audience });
      await rafraichir();
      toast({ title: "Promotion lancée 🎉", desc: r.campagne ? `${r.campagne.nb_destinataires} client(s) alerté(s)${r.campagne.simule ? " (envoi simulé)" : ""}` : `${r.packs.length} produit(s) en promotion` });
      onLancee?.();
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Lancer une promotion" size="lg"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="brand" icon={Percent} loading={busy} onClick={lancer}>{f.alerter ? "Lancer et alerter les clients" : "Appliquer la promotion"}</Btn></>}>
      <div className="stack">
        <Field label={`Produits (${ids.length} sélectionné${ids.length > 1 ? "s" : ""})`}>
          <div className="promo-liste">
            {packs.map((p) => (
              <label key={p.id} className={cx("promo-item", ids.includes(p.id) && "on")}>
                <Checkbox checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />
                <Thumb pack={p} size="sm" />
                <span className="grow truncate">{p.nom}</span>
                <span className="num">{ids.includes(p.id) && nouveauPrix(p) > 0 && nouveauPrix(p) < p.prix ? <><span className="prix-barre">{fmt(p.prix)}</span> <b>{fmt(nouveauPrix(p))}</b></> : fmt(prixEffectif(p))}</span>
              </label>
            ))}
          </div>
        </Field>
        <div className="form-grid">
          <Field label="Type de remise"><Segmented full value={f.mode} onChange={(m) => setF({ ...f, mode: m, valeur: m === "prix" ? "" : "20" })} options={[{ value: "pourcentage", label: "Pourcentage" }, { value: "prix", label: "Prix fixe" }]} /></Field>
          <Field label={f.mode === "prix" ? "Nouveau prix" : "Réduction"}><Input value={f.valeur || ""} onChange={(e) => { setF({ ...f, valeur: e.target.value.replace(/[^\d]/g, "") }); setErr(""); }} inputMode="numeric" suffix={f.mode === "prix" ? "FCFA" : "%"} /></Field>
          <Field label="Fin de la promotion" optional><Input type="date" value={f.fin || ""} min={isoDate(addDays(new Date(), 1))} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Field>
          <Field label="Audience alertée"><Select value={f.audience || "tous"} onChange={(e) => setF({ ...f, audience: e.target.value })} disabled={!f.alerter}><option value="tous">Tous les clients abonnés</option><option value="vip">Clients VIP</option><option value="fideles">Clients fidèles</option><option value="inactifs">Clients inactifs (30 j)</option></Select></Field>
        </div>
        <div className="card" style={{ padding: 14, boxShadow: "none", border: "1px solid var(--border)" }}>
          <div className="row-between">
            <div><div className="strong">Alerter automatiquement les clients</div><div className="subtle">{mode === "api" ? "SMS et/ou e-mail aux clients ayant accepté de recevoir nos offres." : "Disponible une fois connecté au serveur."}</div></div>
            <Switch on={!!f.alerter} onChange={(x) => mode === "api" && setF({ ...f, alerter: x })} label="Alerter les clients" />
          </div>
          {f.alerter && <div style={{ marginTop: 12 }} className="stack-sm"><CanauxChoix value={f.canaux || []} onChange={(canaux) => setF({ ...f, canaux })} /><ApercuMessage a={a} canaux={f.canaux || []} /><div className="help">Le message reprendra les prix promotionnels une fois la promotion appliquée.</div></div>}
        </div>
        {err && <div className="field-error"><AlertCircle size={14} />{err}</div>}
      </div>
    </Modal>
  );
}

function CampagneDetailModal({ id, onClose }) {
  const [c, setC] = useState(null);
  useEffect(() => { setC(null); if (id) apiFetch("GET", `/api/campagnes/${id}`).then(setC).catch(() => setC({ erreur: true })); }, [id]);
  return (
    <Modal open={!!id} onClose={onClose} title={c?.titre || "Campagne"} size="lg" footer={<Btn onClick={onClose}>Fermer</Btn>}>
      {!c ? <div className="pdf-attente"><span className="spinner" />Chargement…</div> : c.erreur ? <EmptyState icon={AlertCircle} title="Campagne introuvable" /> : (
        <div className="stack">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Badge tone={c.statut === "envoyee" ? "success" : "info"} dot>{c.statut === "envoyee" ? "Envoyée" : "En cours"}</Badge>
            {c.simule ? <Badge tone="warning">Simulée</Badge> : null}
            {c.automatique ? <Badge icon={CalendarClock}>Automatique</Badge> : null}
            <span className="subtle">{fmtDateTime(c.cree_le)}</span>
          </div>
          <div className="bulle-sms">{c.message}</div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Client</th><th>Canal</th><th className="hide-sm">Destinataire</th><th>Statut</th></tr></thead>
              <tbody>
                {c.envois.map((e) => (
                  <tr key={e.id}>
                    <td>{e.client_nom || "—"}</td>
                    <td>{e.canal === "sms" ? "SMS" : "E-mail"}</td>
                    <td className="hide-sm muted">{e.destinataire}</td>
                    <td><Badge tone={e.statut === "envoye" ? "success" : e.statut === "simule" ? "warning" : "critical"}>{e.statut === "envoye" ? "Envoyé" : e.statut === "simule" ? "Simulé" : "Échec"}</Badge>{e.erreur && <div className="cell-sub">{e.erreur}</div>}</td>
                  </tr>
                ))}
                {c.envois.length === 0 && <tr><td colSpan={4} className="subtle">Aucun envoi.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CarteHebdo({ info, onMaj }) {
  const { toast } = useApp();
  const [h, setH] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { if (info?.hebdo) setH({ actif: info.hebdo.actif === "1", jour: Number(info.hebdo.jour), heure: Number(info.hebdo.heure), canaux: String(info.hebdo.canaux || "").split(",").filter(Boolean), message: info.hebdo.message }); }, [info]);
  const a = useApercuCampagne(!!h, { audience: "tous", canaux: h?.canaux || [], type: "bonne_semaine", message: h?.message || "" });
  if (!h) return null;
  const enregistrer = async (patch = {}) => {
    const n = { ...h, ...patch };
    setH(n); setBusy("save");
    try { await apiFetch("PUT", "/api/campagnes/hebdo", n); toast({ title: n.actif ? `Message automatique activé (${JOURS[n.jour].toLowerCase()} ${n.heure} h)` : "Message automatique désactivé" }); onMaj(); }
    catch (e) { toast({ title: "Enregistrement impossible", desc: e.message, tone: "critical" }); }
    finally { setBusy(""); }
  };
  const maintenant = async () => {
    setBusy("now");
    try { const c = await apiFetch("POST", "/api/campagnes/hebdo/maintenant"); toast({ title: "Message de la semaine envoyé", desc: `${c.nb_destinataires} client(s)${c.simule ? " — simulé" : ""}` }); onMaj(); }
    catch (e) { toast({ title: "Envoi impossible", desc: e.message, tone: "critical" }); }
    finally { setBusy(""); }
  };
  return (
    <Card title="Message automatique de début de semaine" sub="Bonne semaine + nouveautés + promotions en cours, envoyé chaque semaine aux clients abonnés"
      actions={<Switch on={h.actif} onChange={(v) => enregistrer({ actif: v })} label="Activer le message automatique" />}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Jour d'envoi"><Select value={h.jour} onChange={(e) => setH({ ...h, jour: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 0].map((j) => <option key={j} value={j}>{JOURS[j]}</option>)}</Select></Field>
          <Field label="Heure (Abidjan)"><Select value={h.heure} onChange={(e) => setH({ ...h, heure: Number(e.target.value) })}>{[...Array(24)].map((_, k) => <option key={k} value={k}>{pad(k)} h 00</option>)}</Select></Field>
        </div>
        <Field label="Message" help={AIDE_VARIABLES}><textarea className="textarea" rows={3} value={h.message} onChange={(e) => setH({ ...h, message: e.target.value })} /></Field>
        <Field label="Canaux"><CanauxChoix value={h.canaux} onChange={(canaux) => setH({ ...h, canaux })} /></Field>
        <Field label="Aperçu"><ApercuMessage a={a} canaux={h.canaux} /></Field>
        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          {info.hebdo.dernier && <span className="subtle spacer">Dernier envoi : semaine {info.hebdo.dernier}</span>}
          <Btn icon={Send} loading={busy === "now"} onClick={maintenant}>Envoyer maintenant</Btn>
          <Btn variant="primary" loading={busy === "save"} onClick={() => enregistrer()}>Enregistrer</Btn>
        </div>
      </div>
    </Card>
  );
}

function PageMarketing({ route }) {
  const { data, mode, go, toast, update, sync, confirm } = useApp();
  const [info, setInfo] = useState(null);
  const [compose, setCompose] = useState(null);
  const [promo, setPromo] = useState(route.id === "promotion");
  const [detail, setDetail] = useState(null);
  const charger = useCallback(() => {
    if (mode !== "api") return;
    apiFetch("GET", "/api/campagnes").then(setInfo).catch((e) => toast({ title: "Marketing indisponible", desc: e.message, tone: "critical" }));
  }, [mode]);
  useEffect(() => { charger(); }, [charger]);
  // Les campagnes partent en arrière-plan : on rafraîchit l'historique tant qu'une est en cours
  useEffect(() => {
    if (!info?.campagnes?.some((c) => c.statut !== "envoyee")) return;
    const t = setTimeout(charger, 2500);
    return () => clearTimeout(t);
  }, [info]);

  // Plan de fidélisation : segments calculés sur l'historique d'achat
  const segments = useMemo(() => {
    const st = new Map();
    enrichVentes(data).filter(isValid).forEach((v) => {
      const o = st.get(v.clientId) || { cmds: new Set(), total: 0, last: "" };
      o.cmds.add(v.commandeId || v.id); o.total += v.total;
      if (v.date > o.last) o.last = v.date;
      st.set(v.clientId, o);
    });
    const il30 = isoDate(addDays(today(), -30));
    const ab = (l) => l.filter((c) => c.consentement).length;
    const s = (c) => st.get(c.id);
    const vip = data.clients.filter((c) => c.statut === "VIP");
    const fideles = data.clients.filter((c) => (s(c)?.cmds.size || 0) >= 2);
    const inactifs = data.clients.filter((c) => s(c) && s(c).last < il30);
    const nouveaux = data.clients.filter((c) => c.dateAjout && c.dateAjout >= il30);
    return [
      { key: "vip", titre: "Clients VIP", icon: Star, tint: 1, liste: vip, conseil: "Remerciez-les avec une offre exclusive ou un accès en avant-première.", type: "promotion" },
      { key: "fideles", titre: "Clients fidèles (2 achats et +)", icon: Gift, tint: 0, liste: fideles, conseil: "Proposez une remise fidélité pour leur prochain achat.", type: "promotion" },
      { key: "inactifs", titre: "Sans achat depuis 30 jours", icon: Clock, tint: 3, liste: inactifs, conseil: "Relancez-les avec les nouveautés ou une promotion limitée.", type: "nouveautes" },
      { key: null, titre: "Nouveaux clients (30 jours)", icon: UserPlus, tint: 4, liste: nouveaux, conseil: "Souhaitez-leur la bienvenue et présentez la boutique.", type: "bonne_semaine" },
    ].map((x) => ({ ...x, abonnes: ab(x.liste) }));
  }, [data]);

  const abonnes = data.clients.filter((c) => c.consentement).length;
  const stats = info?.stats || { clients: data.clients.length, abonnes, joignables_sms: abonnes, joignables_email: data.clients.filter((c) => c.consentement && c.email).length };
  const promos = data.packs.filter(promoActive);
  const arreterPromo = async (p) => {
    if (!(await confirm({ title: `Arrêter la promotion sur ${p.nom} ?`, message: `Le prix revient à ${fmt(p.prix)}.`, confirmLabel: "Arrêter" }))) return;
    update((d) => ({ ...d, packs: d.packs.map((x) => (x.id === p.id ? { ...x, prixPromo: null, promoFin: null } : x)) }));
    sync(["DELETE", `/api/campagnes/promotion/${p.id}`]);
    toast({ title: "Promotion arrêtée", desc: p.nom });
  };
  const kpis = [
    { label: "Clients", value: stats.clients, icon: Users, tint: 4 },
    { label: "Abonnés marketing", value: stats.abonnes, icon: Megaphone, tint: 0, sub: stats.clients ? `${Math.round((stats.abonnes / stats.clients) * 100)} % des clients` : null },
    { label: "Joignables par SMS", value: stats.joignables_sms, icon: Smartphone, tint: 1 },
    { label: "Joignables par e-mail", value: stats.joignables_email, icon: Mail, tint: 5 },
  ];

  return (
    <>
      <PageHeader title="Marketing" meta="Fidélisation, campagnes SMS / e-mail et promotions"
        actions={<>
          {mode === "api" && <Btn icon={Send} onClick={() => setCompose({})}>Nouvelle campagne</Btn>}
          <Btn variant="primary" icon={Percent} onClick={() => setPromo(true)}>Lancer une promotion</Btn>
        </>} />
      {mode !== "api" && <div className="banner banner-warning" style={{ marginBottom: 16 }}><AlertTriangle size={16} /><div>Mode démo : les envois de SMS / e-mails et le message automatique nécessitent le serveur. Les promotions s'appliquent localement.</div></div>}
      {info && (!info.fournisseurs.sms || !info.fournisseurs.email) && (
        <div className="banner banner-warning" style={{ marginBottom: 16 }}><Info size={16} /><div>
          <b>Envois simulés</b> pour {[!info.fournisseurs.sms && "les SMS", !info.fournisseurs.email && "les e-mails"].filter(Boolean).join(" et ")} : les messages sont préparés et enregistrés, mais pas réellement envoyés.
          Ajoutez les identifiants du fournisseur ({[!info.fournisseurs.sms && "SMS_PROVIDER_*", !info.fournisseurs.email && "SMTP_*"].filter(Boolean).join(", ")}) dans les variables de l'hébergement pour les envoyer réellement.
        </div></div>
      )}
      <div className="kpi-grid stagger">
        {kpis.map((k, i) => (
          <div className="card kpi" key={k.label} style={{ "--i": i }}>
            <div className="kpi-label"><span className={cx("kpi-dot", `tint-${k.tint}`)}><k.icon size={13} /></span>{k.label}</div>
            <div className="kpi-value"><CountUp value={k.value} format={fmtNum} /></div>
            {k.sub && <div className="subtle">{k.sub}</div>}
          </div>
        ))}
      </div>

      <Card title="Plan de fidélisation" sub="Vos clients regroupés selon leurs achats — seuls les abonnés reçoivent les messages">
        <div className="segments">
          {segments.map((s) => (
            <div key={s.titre} className="segment">
              <div className="row" style={{ gap: 10 }}><span className={cx("todo-icon", `tint-${s.tint}`)}><s.icon size={15} /></span><div className="grow"><div className="strong">{s.titre}</div><div className="subtle">{s.liste.length} client{s.liste.length > 1 ? "s" : ""} · {s.abonnes} abonné{s.abonnes > 1 ? "s" : ""}</div></div></div>
              <p className="subtle">{s.conseil}</p>
              {mode === "api" && s.key && <Btn size="sm" icon={Send} disabled={!s.abonnes} onClick={() => setCompose({ audience: s.key, type: s.type, titre: s.titre })}>Contacter</Btn>}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid-main">
        {mode === "api" ? (info ? <CarteHebdo info={info} onMaj={charger} /> : <Card title="Message automatique"><div className="pdf-attente"><span className="spinner" />Chargement…</div></Card>) : <Card title="Message automatique de début de semaine"><EmptyState icon={CalendarClock} title="Disponible avec le serveur" /></Card>}
        <Card title="Promotions en cours" sub={promos.length ? `${promos.length} produit${promos.length > 1 ? "s" : ""}` : null}
          actions={<Btn size="sm" icon={Plus} onClick={() => setPromo(true)}>Ajouter</Btn>}>
          {promos.length === 0 ? <EmptyState icon={Percent} title="Aucune promotion">Lancez une promotion : les clients abonnés sont alertés automatiquement.</EmptyState> : (
            <div className="list">
              {promos.map((p) => (
                <div key={p.id} className="list-item">
                  <Thumb pack={p} size="sm" />
                  <div className="grow">
                    <div className="row-between"><span className="strong truncate">{p.nom}</span><Badge tone="success">−{Math.round((1 - p.prixPromo / p.prix) * 100)} %</Badge></div>
                    <div className="row-between"><span className="num"><b>{fmt(p.prixPromo)}</b> <span className="prix-barre">{fmt(p.prix)}</span></span><span className="subtle">{p.promoFin ? "jusqu'au " + fmtDateCourt(isoDate(new Date(p.promoFin))) : "sans fin"}</span></div>
                  </div>
                  <button className="icon-btn danger" onClick={() => arreterPromo(p)} aria-label={`Arrêter la promotion ${p.nom}`}><X size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {mode === "api" && (
        <Card title="Historique des campagnes" padded={false}>
          <div style={{ height: 12 }} />
          {!info ? <div className="pdf-attente"><span className="spinner" />Chargement…</div> : info.campagnes.length === 0 ? <EmptyState icon={Megaphone} title="Aucune campagne envoyée">Lancez une promotion ou une campagne pour fidéliser vos clients.</EmptyState> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Campagne</th><th className="hide-sm">Canaux</th><th className="right">Destinataires</th><th className="right hide-sm">Envoyés</th><th>Statut</th></tr></thead>
                <tbody>
                  {info.campagnes.map((c, i) => (
                    <tr key={c.id} className="clickable" style={{ "--i": Math.min(i, 20) }} onClick={() => setDetail(c.id)}>
                      <td className="wrap"><div className="cell-main">{c.titre}{c.automatique ? <CalendarClock size={13} style={{ marginLeft: 6, verticalAlign: -2 }} /> : null}</div><div className="cell-sub">{fmtDateTime(c.cree_le)} · {info.audiences[c.audience] || c.audience}</div></td>
                      <td className="hide-sm muted">{String(c.canaux).split(",").map((x) => (x === "sms" ? "SMS" : "E-mail")).join(" + ")}</td>
                      <td className="right num">{c.nb_destinataires}</td>
                      <td className="right num hide-sm">{c.nb_envoyes}{c.nb_echecs ? <span style={{ color: "var(--critical-solid)" }}> · {c.nb_echecs} échec(s)</span> : null}</td>
                      <td><span className="row" style={{ gap: 4 }}><Badge tone={c.statut === "envoyee" ? "success" : "info"} dot>{c.statut === "envoyee" ? "Envoyée" : "En cours"}</Badge>{c.simule ? <Badge tone="warning">Simulée</Badge> : null}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {mode === "api" && <CampagneModal open={!!compose} preset={compose} info={info} onClose={() => setCompose(null)} onLancee={charger} />}
      <PromotionModal open={promo} onClose={() => { setPromo(false); if (route.id) go("marketing"); }} onLancee={charger} />
      {mode === "api" && <CampagneDetailModal id={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

/* =====================================================================
   PAGE : Finances (investissements & rentabilité)
   ===================================================================== */
function PageFinances({ route }) {
  const { data, update, sync, go, toast, confirm } = useApp();
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState(null);
  const vs = useMemo(() => enrichVentes(data).filter(isValid), [data]);
  const ca = vs.reduce((s, v) => s + v.total, 0);
  const invest = data.investissements.reduce((s, i) => s + i.montant, 0);
  const benef = ca - invest;
  const roi = invest ? (benef / invest) * 100 : 0;
  const coutMarchandises = vs.reduce((s, v) => s + (v.pack?.cout ? v.pack.cout * v.qte : 0), 0);
  const margeBrute = ca - coutMarchandises;

  const months = useMemo(() => {
    const now = new Date();
    return [...Array(6)].map((_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      return {
        label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
        full: d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        values: [
          vs.filter((v) => v.date.startsWith(key)).reduce((s, v) => s + v.total, 0),
          data.investissements.filter((i) => i.date.startsWith(key)).reduce((s, i) => s + i.montant, 0),
        ],
      };
    });
  }, [vs, data.investissements]);

  const byCat = CATEGORIES.map((c) => ({ label: c.key, color: c.color, value: data.investissements.filter((i) => i.categorie === c.key).reduce((s, i) => s + i.montant, 0) })).filter((c) => c.value > 0);
  const rows = [...data.investissements].filter((i) => !cat || i.categorie === cat).sort((a, b) => b.date.localeCompare(a.date));
  const remove = async (i) => {
    if (!(await confirm({ title: "Supprimer cette dépense ?", message: `« ${i.libelle} » (${fmt(i.montant)}) sera supprimée.`, confirmLabel: "Supprimer", tone: "critical" }))) return;
    update((d) => ({ ...d, investissements: d.investissements.filter((x) => x.id !== i.id) }));
    sync(["DELETE", `/api/investissements/${i.id}`]);
    toast({ title: "Dépense supprimée" });
  };

  const kpis = [
    { label: "Chiffre d'affaires", value: ca, f: fmt, icon: TrendingUp, tint: 4 },
    { label: "Total investi", value: invest, f: fmt, icon: Wallet, tint: 3 },
    { label: "Bénéfice net", value: benef, f: fmt, icon: Landmark, tint: benef >= 0 ? 0 : 3, color: benef >= 0 ? "var(--success-dot)" : "var(--critical-solid)" },
    { label: "Retour sur investissement", value: roi, f: pct, icon: Sparkles, tint: 5, color: roi >= 0 ? "var(--success-dot)" : "var(--critical-solid)" },
  ];

  return (
    <>
      <PageHeader title="Finances" meta="Capital engagé, rentabilité et dépenses"
        actions={<Btn variant="primary" icon={Plus} onClick={() => go("finances", "nouveau")}>Enregistrer une dépense</Btn>} />
      <div className="kpi-grid stagger">
        {kpis.map((k, i) => (
          <div className="card kpi" key={k.label} style={{ "--i": i }}>
            <div className="kpi-label"><span className={cx("kpi-dot", `tint-${k.tint}`)}><k.icon size={13} /></span>{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}><CountUp value={k.value} format={k.f} /></div>
          </div>
        ))}
      </div>
      {coutMarchandises > 0 && (
        <div className="banner banner-info" style={{ marginBottom: 16 }}>
          <Info size={16} />
          <div>Marge brute sur ventes : <b className="num">{fmt(margeBrute)}</b> ({ca ? ((margeBrute / ca) * 100).toFixed(0) : 0} % du CA), calculée à partir du coût par article de vos produits.</div>
        </div>
      )}
      <div className="grid-main">
        <Card title="Ventes vs dépenses" sub="6 derniers mois">
          <div className="legend" style={{ marginBottom: 12, marginLeft: 0 }}>
            <span><i style={{ background: "var(--c-blue)", height: 10, width: 10 }} />Chiffre d'affaires</span>
            <span><i style={{ background: "var(--c-coral)", height: 10, width: 10 }} />Dépenses</span>
          </div>
          <GroupedBars groups={months} series={[{ label: "CA", color: "var(--c-blue)" }, { label: "Dépenses", color: "var(--c-coral)" }]} />
        </Card>
        <Card title="Répartition des dépenses">
          {byCat.length ? <Donut items={byCat} format={fmtShort} centerLabel="Investi" /> : <EmptyState icon={Wallet} title="Aucune dépense" />}
        </Card>
      </div>
      <Card title="Historique des dépenses" padded={false}
        actions={<Select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 170 }} aria-label="Catégorie"><option value="">Toutes catégories</option>{CATEGORIES.map((c) => <option key={c.key}>{c.key}</option>)}</Select>}>
        <div style={{ height: 12 }} />
        {rows.length === 0 ? <EmptyState icon={Wallet} title="Aucune dépense" action={<Btn variant="primary" icon={Plus} onClick={() => go("finances", "nouveau")}>Enregistrer une dépense</Btn>} /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Libellé</th><th className="hide-sm">Catégorie</th><th className="hide-sm">Date</th><th className="right">Montant</th><th style={{ width: 80 }} /></tr></thead>
              <tbody key={cat}>
                {rows.map((i, k) => (
                  <tr key={i.id} style={{ "--i": k }}>
                    <td className="wrap"><div className="cell-main" style={{ fontWeight: 550 }}>{i.libelle}</div><div className="cell-sub only-mobile">{i.categorie} · {fmtDate(i.date)}</div></td>
                    <td className="hide-sm"><span className="row"><span style={{ width: 8, height: 8, borderRadius: 3, background: catColor(i.categorie) }} />{i.categorie}</span></td>
                    <td className="hide-sm muted">{fmtDate(i.date)}</td>
                    <td className="right num strong" style={{ color: "var(--critical-solid)" }}>−{fmt(i.montant)}</td>
                    <td className="right"><span className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
                      <button className="icon-btn" onClick={() => setEditing(i)} aria-label="Modifier"><Pencil size={14} /></button>
                      <button className="icon-btn danger" onClick={() => remove(i)} aria-label="Supprimer"><Trash2 size={14} /></button>
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <InvestModal open={route.id === "nouveau" || !!editing} item={editing} onClose={() => { setEditing(null); if (route.id) go("finances"); }} />
    </>
  );
}

/* =====================================================================
   PAGE : Paramètres
   ===================================================================== */
/* ---------- Réglages de la boutique en ligne (site client) ---------- */
function CarteBoutiqueEnLigne({ estAdmin }) {
  const { data, update, sync, toast } = useApp();
  const CLES = ["boutique_ouverte", "slogan", "whatsapp", "frais_livraison", "livraison_gratuite_des", "zone_livraison", "momo_orange", "momo_mtn", "momo_moov", "momo_wave", "momo_titulaire", "lien_orange", "lien_mtn", "lien_moov", "lien_wave"];
  const depuis = () => Object.fromEntries(CLES.map((k) => [k, String(({ ...boutiqueParDefaut(), ...(data.boutique || {}) })[k] ?? "")]));
  const [f, setF] = useState(depuis);
  const [cinetpay, setCinetpay] = useState(null);
  const [mdpActuel, setMdpActuel] = useState("");
  const SENSIBLES = CLES.filter((k) => k.startsWith("momo_") || k.startsWith("lien_"));
  useEffect(() => { setF(depuis()); }, [JSON.stringify(data.boutique)]);
  useEffect(() => { apiFetch("GET", "/api/boutique/config").then((c) => setCinetpay(c.paiements)).catch(() => setCinetpay(null)); }, []);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const numeros = [["momo_wave", "Wave", "lien_wave"], ["momo_orange", "Orange Money", "lien_orange"], ["momo_mtn", "MTN MoMo", "lien_mtn"], ["momo_moov", "Moov Money", "lien_moov"]];
  const modifie = CLES.some((k) => f[k] !== depuis()[k]);
  const paiementModifie = SENSIBLES.some((k) => (f[k] || "").trim() !== (depuis()[k] || "").trim());
  const { mode } = useApp();
  const lien = location.origin + "/";
  const enregistrer = async () => {
    const mauvais = numeros.find(([, nom, l]) => f[l].trim() && !/^https:\/\/\S+\.\S+/.test(f[l].trim()));
    if (mauvais) return toast({ title: `Lien ${mauvais[1]} invalide`, desc: "Collez l'adresse complète, qui commence par https://", tone: "critical" });
    const b = { ...f, frais_livraison: String(Number(f.frais_livraison) || 0), livraison_gratuite_des: String(Number(f.livraison_gratuite_des) || 0) };
    if (paiementModifie && mode === "api" && !mdpActuel) return toast({ title: "Mot de passe requis", desc: "Saisissez votre mot de passe pour modifier les numéros ou liens de paiement.", tone: "critical" });
    update((d) => ({ ...d, boutique: { ...d.boutique, ...b } }));
    if (await sync(["PUT", "/api/parametres", paiementModifie ? { ...b, mot_de_passe_actuel: mdpActuel } : b])) {
      setMdpActuel("");
      toast({ title: "Boutique en ligne mise à jour" });
      apiFetch("GET", "/api/boutique/config").then((c) => setCinetpay(c.paiements)).catch(() => {});
    }
  };
  const ouverte = f.boutique_ouverte !== "0";
  return (
    <Card title="Boutique en ligne" sub="Le site où vos clients consultent le catalogue, commandent et paient.">
      <div className="stack">
        <div className="row-between" style={{ flexWrap: "wrap" }}>
          <div className="row" style={{ minWidth: 0 }}>
            <Badge tone={ouverte ? "success" : "neutral"} dot>{ouverte ? "Ouverte aux commandes" : "Fermée"}</Badge>
            <a className="link truncate" href={lien} target="_blank" rel="noopener">{lien}</a>
          </div>
          <div className="row">
            <Btn size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(lien).then(() => toast({ title: "Lien de la boutique copié" }))}>Copier le lien</Btn>
            {estAdmin && <Switch on={ouverte} onChange={(v) => set("boutique_ouverte", v ? "1" : "0")} label="Boutique ouverte" />}
          </div>
        </div>
        <div className="form-grid">
          <Field label="Slogan (page d'accueil)" optional className="full"><Input value={f.slogan} onChange={(e) => set("slogan", e.target.value)} placeholder="Ex : Des packs soignés, livrés chez vous à Abidjan" disabled={!estAdmin} /></Field>
          <Field label="WhatsApp de la boutique" optional help="Bouton « Nous écrire » sur le site."><Input icon={MessageSquare} value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="07 00 00 00 00" inputMode="tel" disabled={!estAdmin} /></Field>
          <Field label="Zone de livraison" optional><Input icon={MapPin} value={f.zone_livraison} onChange={(e) => set("zone_livraison", e.target.value)} placeholder="Ex : Abidjan et environs, 24 à 48 h" disabled={!estAdmin} /></Field>
          <Field label="Frais de livraison"><Input value={f.frais_livraison} onChange={(e) => set("frais_livraison", e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" disabled={!estAdmin} /></Field>
          <Field label="Livraison offerte dès" help="0 = jamais offerte."><Input value={f.livraison_gratuite_des} onChange={(e) => set("livraison_gratuite_des", e.target.value.replace(/[^\d]/g, ""))} suffix="FCFA" inputMode="numeric" disabled={!estAdmin} /></Field>
        </div>

        <div>
          <div className="strong" id="moyens-paiement" style={{ scrollMarginTop: 80 }}>Moyens de paiement : numéros et liens (Wave, Orange, MTN, Moov)</div>
          <p className="subtle" style={{ marginBottom: 10 }}>Pour chaque opérateur, indiquez votre numéro marchand et/ou votre lien de paiement. Le client paie par le lien ou sur le numéro, puis saisit l'ID de transaction ; vous confirmez la réception depuis la commande. Laissez vide pour ne pas proposer un opérateur.</p>
          <div className="operateurs-paiement">
            {numeros.map(([k, nom, l]) => (
              <div key={k} className="operateur-paiement">
                <div className="row"><ModePaiement mode={nom} taille={28} /><b>{nom}</b>{(f[k].trim() || f[l].trim()) ? <Badge tone="success" dot>Proposé aux clients</Badge> : <Badge>Non proposé</Badge>}</div>
                <div className="form-grid">
                  <Field label="Numéro marchand" optional><Input icon={Phone} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder="07 00 00 00 00" inputMode="tel" disabled={!estAdmin} /></Field>
                  <Field label="Lien de paiement" optional><Input icon={Link2} value={f[l]} onChange={(e) => set(l, e.target.value)} placeholder="https://…" inputMode="url" autoCapitalize="none" disabled={!estAdmin} /></Field>
                </div>
              </div>
            ))}
          </div>
          {paiementModifie && mode === "api" && (
            <div className="banner banner-warning" style={{ marginTop: 14, alignItems: "center", flexWrap: "wrap" }}><Lock size={16} />
              <div className="grow"><b>Sécurité :</b> ces numéros et liens décident où va l'argent de vos clients. Confirmez avec votre mot de passe.</div>
              <div style={{ minWidth: 220 }}><Input icon={KeyRound} type="password" value={mdpActuel} onChange={(e) => setMdpActuel(e.target.value)} placeholder="Votre mot de passe" autoComplete="current-password" /></div>
            </div>
          )}
          <div className="form-grid" style={{ marginTop: 14 }}>
            <Field label="Nom affiché du titulaire" optional className="full" help="Le nom que le client voit sur son téléphone au moment du transfert."><Input value={f.momo_titulaire} onChange={(e) => set("momo_titulaire", e.target.value)} placeholder={data.boutique?.nom} disabled={!estAdmin} /></Field>
          </div>
        </div>

        <div className="pay-recap">
          <ModePaiement mode="Paiement en ligne" taille={32} />
          <div className="grow">
            <div className="strong">Paiement en ligne CinetPay {cinetpay?.en_ligne ? <Badge tone={cinetpay.en_ligne_test ? "warning" : "success"}>{cinetpay.en_ligne_test ? "Actif (bac à sable)" : "Actif"}</Badge> : <Badge>Non configuré</Badge>}</div>
            <div className="subtle">
              {cinetpay?.en_ligne
                ? "Orange Money, MTN MoMo, Moov Money, Wave : le paiement est confirmé automatiquement."
                : "Ouvrez un compte marchand sur cinetpay.com puis renseignez CINETPAY_API_KEY et CINETPAY_API_PASSWORD dans backend/.env et redémarrez le serveur."}
            </div>
          </div>
        </div>

        {estAdmin && <div className="row" style={{ justifyContent: "flex-end" }}><Btn variant="primary" disabled={!modifie} onClick={enregistrer}>Enregistrer</Btn></div>}
      </div>
    </Card>
  );
}

function EquipeModal({ open, onClose }) {
  const { toast, rafraichir } = useApp();
  const [f, setF] = useState({ nom: "", tel: "", mdp: "", role: "vendeur" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ nom: "", tel: "", mdp: "", role: "vendeur" }); setErr(""); setBusy(false); } }, [open]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.nom.trim() || f.tel.replace(/\D/g, "").length < 8) return setErr("Nom et numéro de téléphone valides requis.");
    if (f.mdp.length < 6) return setErr("Le mot de passe doit contenir au moins 6 caractères.");
    setBusy(true);
    try {
      await apiFetch("POST", "/api/auth/inscription", { nom: f.nom.trim(), telephone: f.tel, mot_de_passe: f.mdp, role: f.role });
      toast({ title: "Compte créé", desc: `${f.nom.trim()} peut maintenant se connecter depuis « Mon espace ».` });
      rafraichir();
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Ajouter un vendeur" size="md"
      footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" loading={busy} onClick={save}>Créer le compte</Btn></>}>
      <div className="form-grid">
        <Field label="Nom complet" className="full"><Input value={f.nom} onChange={(e) => set("nom", e.target.value)} placeholder="Ex : Awa Bamba" /></Field>
        <Field label="Téléphone"><Input icon={Phone} value={f.tel} onChange={(e) => set("tel", e.target.value)} placeholder="07 00 00 00 00" inputMode="tel" /></Field>
        <Field label="Mot de passe provisoire" help="8 caractères minimum."><Input icon={Lock} type="password" value={f.mdp} onChange={(e) => set("mdp", e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Rôle" className="full">
          <Segmented full value={f.role} onChange={(v) => set("role", v)} options={[{ value: "vendeur", label: "Vendeur", icon: User }, { value: "admin", label: "Co-administrateur", icon: ShieldCheck }]} />
        </Field>
        <div className="full subtle">{f.role === "vendeur" ? "Le vendeur vend vos produits et ne voit que sa propre activité. Vous suivez ses ventes dans la page Vendeurs." : "Un co-administrateur partage VOTRE espace avec tous les droits. Pour un espace séparé, la personne doit créer son propre compte administrateur."}</div>
        {err && <div className="banner banner-critical full"><AlertCircle size={16} />{err}</div>}
      </div>
    </Modal>
  );
}

function PageParametres() {
  const { settings, setSettings, data, update, sync, remplacerTout, toast, confirm, logout, auth, mode, go } = useApp();
  const enLigne = mode === "api";
  const estAdmin = !enLigne || auth?.utilisateur?.role === "admin";
  const localDispo = enLigne && !!readJson(STORAGE_KEY);
  const [equipeOpen, setEquipeOpen] = useState(false);
  const [boutique, setBoutique] = useState(() => ({ ...boutiqueParDefaut(), ...(data.boutique || {}) }));
  useEffect(() => { setBoutique({ ...boutiqueParDefaut(), ...(data.boutique || {}) }); }, [JSON.stringify(data.boutique)]);
  const setB = (k, v) => setBoutique((b) => ({ ...b, [k]: v }));
  const CLES_INFOS = ["nom", "adresse", "telephone", "message"];
  const boutiqueModifiee = CLES_INFOS.some((k) => (boutique[k] || "") !== ({ ...boutiqueParDefaut(), ...(data.boutique || {}) })[k]);
  const enregistrerBoutique = async () => {
    const b = { nom: boutique.nom.trim(), adresse: boutique.adresse.trim(), telephone: boutique.telephone.trim(), message: boutique.message.trim() };
    update((d) => ({ ...d, boutique: { ...d.boutique, ...b } }));
    if (await sync(["PUT", "/api/parametres", b])) toast({ title: "Informations de la boutique enregistrées" });
  };
  const fileRef = useRef(null);
  const exporter = () => {
    downloadFile(`ivoire-shop-sauvegarde-${isoDate(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
    toast({ title: "Sauvegarde téléchargée" });
  };
  const importer = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.ventes)) throw new Error("format");
        if (!(await confirm({ title: "Restaurer cette sauvegarde ?", message: `Vos données actuelles seront remplacées par celles du fichier « ${file.name} » (${parsed.clients.length} clients, ${parsed.ventes.length} ventes).`, confirmLabel: "Restaurer" }))) return;
        if (await remplacerTout(migrate(parsed))) toast({ title: "Données restaurées" });
      } catch {
        toast({ title: "Fichier invalide", desc: "Choisissez une sauvegarde MILANA (.json).", tone: "critical" });
      }
    };
    reader.readAsText(file);
  };
  const reset = async () => {
    if (!(await confirm({ title: "Réinitialiser les données ?", message: "Toutes vos données seront remplacées par les données de démonstration. Pensez à exporter une sauvegarde avant.", confirmLabel: "Réinitialiser", tone: "critical" }))) return;
    if (await remplacerTout({ ...seedData(), boutique: data.boutique })) toast({ title: "Données de démonstration rechargées" });
  };
  const envoyerLocal = async () => {
    const local = migrate(readJson(STORAGE_KEY));
    if (!(await confirm({ title: "Envoyer les données de ce navigateur ?", message: `Les données du serveur seront remplacées par celles enregistrées dans ce navigateur (${local.clients.length} clients, ${local.ventes.length} ventes).`, confirmLabel: "Envoyer vers le serveur", tone: "critical" }))) return;
    if (await remplacerTout(local)) toast({ title: "Données envoyées sur le serveur" });
  };

  const Row = ({ title, sub, children }) => (
    <div className="card-section row-between" style={{ flexWrap: "wrap" }}>
      <div style={{ minWidth: 200, flex: 1 }}><div className="strong">{title}</div>{sub && <div className="subtle">{sub}</div>}</div>
      <div className="row" style={{ flexWrap: "wrap" }}>{children}</div>
    </div>
  );

  return (
    <div className="page-narrow" style={{ margin: "0 auto" }}>
      <PageHeader title="Paramètres" />
      {enLigne && estAdmin && (() => {
        const ops = [["Wave", "momo_wave", "lien_wave"], ["Orange Money", "momo_orange", "lien_orange"], ["MTN MoMo", "momo_mtn", "lien_mtn"], ["Moov Money", "momo_moov", "lien_moov"]];
        const b = data.boutique || {};
        return (
          <Card title="Moyens de paiement" sub="Vos numéros marchands et liens de paiement : proposés aux clients sur la boutique en ligne et affichés en QR code à la caisse." style={{ marginBottom: 16 }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {ops.map(([nom, n, l]) => <span key={nom} className="row" style={{ gap: 6 }}><ModePaiement mode={nom} taille={22} />{b[l] ? <Badge tone="success" dot>Lien</Badge> : null}{b[n] ? <Badge tone="info" dot>Numéro</Badge> : null}{!b[l] && !b[n] ? <Badge>Non réglé</Badge> : null}</span>)}
            </div>
            <div className="row" style={{ marginTop: 12 }}><Btn variant="primary" icon={Link2} onClick={() => document.getElementById("moyens-paiement")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Ajouter ou modifier un lien de paiement</Btn></div>
          </Card>
        );
      })()}
      <div className="stack">
        <Card title="Boutique" sub="Ces informations sont imprimées sur les tickets de caisse.">
          <div className="form-grid">
            <Field label="Nom de la boutique" className="full"><Input icon={Store} value={boutique.nom} onChange={(e) => setB("nom", e.target.value)} disabled={!estAdmin} /></Field>
            <Field label="Adresse" optional><Input icon={MapPin} value={boutique.adresse} onChange={(e) => setB("adresse", e.target.value)} placeholder="Ex : Cocody Angré, Abidjan" disabled={!estAdmin} /></Field>
            <Field label="Téléphone" optional><Input icon={Phone} value={boutique.telephone} onChange={(e) => setB("telephone", e.target.value)} placeholder="07 00 00 00 00" disabled={!estAdmin} /></Field>
            <Field label="Message en bas du ticket" optional className="full"><Input value={boutique.message} onChange={(e) => setB("message", e.target.value)} placeholder="Merci pour votre achat et à bientôt !" disabled={!estAdmin} /></Field>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            {!estAdmin && <span className="subtle grow">Modifiable par un administrateur.</span>}
            {estAdmin && <Btn variant="primary" disabled={!boutique.nom.trim() || !boutiqueModifiee} onClick={enregistrerBoutique}>Enregistrer</Btn>}
          </div>
        </Card>
        {enLigne && estAdmin && <CarteBoutiqueEnLigne estAdmin={estAdmin} />}
        <Card title="Apparence" padded={false}>
          <Row title="Thème" sub="Le mode système suit le réglage de votre appareil.">
            <Segmented value={settings.theme} onChange={(theme) => setSettings({ ...settings, theme })} options={[{ value: "systeme", label: "Système", icon: Monitor }, { value: "clair", label: "Clair", icon: Sun }, { value: "sombre", label: "Sombre", icon: Moon }]} />
          </Row>
        </Card>
        {estAdmin && <Card title="Connexion" padded={false}>
          <Row title={enLigne ? "Connecté au serveur" : "Mode démo (hors ligne)"} sub={enLigne ? `API : ${API_BASE || location.origin} · base de données partagée entre vos appareils` : "Les données restent dans ce navigateur. Démarrez le serveur (dossier backend) pour les partager."}>
            {enLigne ? <Badge tone="success" dot>En ligne</Badge> : <Btn icon={RotateCcw} onClick={() => window.location.reload()}>Rechercher le serveur</Btn>}
          </Row>
        </Card>}
        {enLigne && estAdmin && (
          <Card title="Équipe" padded={false}>
            <Row title="Vendeurs" sub="Créez les comptes de vos vendeurs et suivez leurs ventes."><Btn icon={UserCheck} onClick={() => go("vendeurs")}>Gérer mes vendeurs</Btn><Btn icon={UserPlus} onClick={() => setEquipeOpen(true)}>Ajouter</Btn></Row>
          </Card>
        )}
        <Card title="Données" sub={enLigne ? "Les données sont enregistrées sur le serveur." : "Les données sont enregistrées dans ce navigateur."} padded={false}>
          <Row title="Exporter une sauvegarde" sub={`${data.clients.length} clients · ${data.packs.length} produits · ${data.ventes.length} ventes`}><Btn icon={Download} onClick={exporter}>Télécharger (.json)</Btn></Row>
          {estAdmin ? <>
            <Row title="Restaurer une sauvegarde" sub="Remplace les données actuelles.">
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importer} />
              <Btn icon={Upload} onClick={() => fileRef.current?.click()}>Importer</Btn>
            </Row>
            {localDispo && <Row title="Données de ce navigateur" sub="Envoie sur le serveur les données saisies en mode démo."><Btn icon={Upload} onClick={envoyerLocal}>Envoyer vers le serveur</Btn></Row>}
            <Row title="Données de démonstration" sub="Recharge un jeu de données d'exemple."><Btn variant="critical-plain" icon={RotateCcw} onClick={reset}>Réinitialiser</Btn></Row>
          </> : <Row title="Restauration et réinitialisation" sub="Réservées aux administrateurs." />}
        </Card>
        <Card title="Compte" padded={false}>
          <Row title={auth?.utilisateur?.nom || "Connecté"} sub={[auth?.tel && `Téléphone : ${auth.tel}`, auth?.utilisateur?.role && (auth.utilisateur.role === "admin" ? "Administrateur" : "Vendeur")].filter(Boolean).join(" · ") || null}><Btn icon={LogOut} onClick={logout}>Se déconnecter</Btn></Row>
        </Card>
      </div>
      <EquipeModal open={equipeOpen} onClose={() => setEquipeOpen(false)} />
    </div>
  );
}

/* =====================================================================
   Squelette de chargement
   ===================================================================== */
function SkeletonPage() {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <div className="skeleton" style={{ width: 220, height: 26, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 320, height: 14, marginBottom: 24 }} />
      <div className="kpi-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="card kpi"><div className="skeleton" style={{ width: "60%", height: 12 }} /><div className="skeleton" style={{ width: "80%", height: 24, marginTop: 8 }} /><div className="skeleton" style={{ width: "40%", height: 12, marginTop: 8 }} /></div>)}</div>
      <div className="grid-main">
        <div className="card" style={{ padding: 16 }}><div className="skeleton" style={{ width: 160, height: 14 }} /><div className="skeleton" style={{ height: 240, marginTop: 16 }} /></div>
        <div className="card" style={{ padding: 16 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="row" style={{ marginBottom: 14 }}><div className="skeleton" style={{ width: 34, height: 34, borderRadius: 9 }} /><div className="grow"><div className="skeleton" style={{ height: 12, width: "70%" }} /><div className="skeleton" style={{ height: 10, width: "45%", marginTop: 6 }} /></div></div>)}</div>
      </div>
    </div>
  );
}

/* Sécurité : pendant 7 jours, rappelle que les numéros ou liens de paiement ont été modifiés */
function BandeauPaiementModifie() {
  const { data } = useApp();
  const m = data?.boutique?.paiement_modifie;
  if (!m?.le || Date.now() - new Date(m.le).getTime() > 7 * 864e5) return null;
  return (
    <div className="banner banner-warning" style={{ marginBottom: 16 }}><ShieldCheck size={16} />
      <div><b>Coordonnées de paiement modifiées</b> le {fmtDateTime(m.le)} par {m.par || "un administrateur"}. Si ce n'est pas vous, changez votre mot de passe tout de suite et vérifiez vos numéros dans Paramètres.</div>
    </div>
  );
}

/* =====================================================================
   Connexion (téléphone + mot de passe + code SMS)
   ===================================================================== */
function AuthScreen({ onSuccess, mode }) {
  const enLigne = mode === "api";
  // « Mon espace » de la page d'accueil : ?espace=vendeur | admin, ?creer=1 pour ouvrir un nouvel espace
  const params = new URLSearchParams(location.search);
  const espace = params.get("espace") === "vendeur" ? "vendeur" : "admin";
  const [etape, setEtape] = useState(enLigne && params.get("creer") ? "inscription" : "connexion"); // inscription | connexion
  const [nom, setNom] = useState("");
  const [boutique, setBoutique] = useState("");
  const [tel, setTel] = useState("");
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  const [codeRequis, setCodeRequis] = useState(false);
  const [code, setCode] = useState("");
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState("");
  const [errKey, setErrKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [comptesTest, setComptesTest] = useState([]);

  useEffect(() => {
    if (!enLigne) return;
    apiFetch("GET", "/api/auth/etat").then((r) => { setCodeRequis(!!r.code_invitation); setComptesTest(r.comptes_test || []); }).catch(() => {});
  }, []);

  const fail = (m) => { setErreur(m); setErrKey((k) => k + 1); };
  const inscription = etape === "inscription";
  const changer = (e) => { setEtape(e); setErreur(""); };

  // Compte de démonstration : connexion directe
  const entrer = async (c) => {
    setErreur(""); setBusy(true);
    try {
      const r = await apiFetch("POST", "/api/auth/connexion", { telephone: c.telephone, mot_de_passe: c.mot_de_passe });
      const a = { tel: c.telephone, jeton: r.jeton, utilisateur: r.utilisateur, boutique: r.boutique, connecteLe: new Date().toISOString() };
      writeJson(AUTH_KEY, a);
      if (location.search) history.replaceState(null, "", location.pathname + location.hash);
      onSuccess(a);
    } catch (err) { setBusy(false); fail(err.message); }
  };

  const valider = async (e) => {
    e.preventDefault();
    setErreur("");
    if (inscription && !nom.trim()) return fail("Indiquez votre nom.");
    if (inscription && boutique.trim().length < 2) return fail("Indiquez le nom de votre boutique.");
    if (tel.replace(/\D/g, "").length < 8) return fail("Entrez un numéro de téléphone valide.");
    const min = enLigne ? 8 : 4;
    if (mdp.length < min) return fail(`Le mot de passe doit contenir au moins ${min} caractères.`);
    if (inscription && mdp !== mdp2) return fail("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    if (!enLigne) {
      setTimeout(() => {
        const a = { tel, connecteLe: new Date().toISOString() };
        writeJson(AUTH_KEY, a);
        onSuccess(a);
      }, 500);
      return;
    }
    try {
      // Créer un compte administrateur ouvre un nouvel espace, réservé à cet identifiant
      const r = inscription
        ? await apiFetch("POST", "/api/auth/inscription", { nom: nom.trim(), boutique: boutique.trim(), telephone: tel, mot_de_passe: mdp, code_invitation: code.trim() })
        : await apiFetch("POST", "/api/auth/connexion", { telephone: tel, mot_de_passe: mdp });
      const a = { tel, jeton: r.jeton, utilisateur: r.utilisateur, boutique: r.boutique, connecteLe: new Date().toISOString() };
      writeJson(AUTH_KEY, a);
      if (location.search) history.replaceState(null, "", location.pathname + location.hash);
      onSuccess(a);
    } catch (err) {
      setBusy(false);
      fail(err.message);
    }
  };

  return (
    <div className="auth">
      <div className="auth-hero">
        <a className="brand" style={{ width: "auto" }} href="/"><span className="brand-mark"><ShoppingBag size={16} strokeWidth={2.4} /></span>MILANA</a>
        <div>
          <h1>Votre espace, <em>vos règles.</em></h1>
          <p>Chaque administrateur dispose de son propre espace : ses produits, ses stocks, ses clients, ses finances et ses vendeurs. Les produits publiés apparaissent sur la page d'accueil de la plateforme.</p>
          <div className="auth-feats">
            {[[Store, "Un espace privé par administrateur"], [UserCheck, "Vos vendeurs et le suivi de leurs ventes"], [Receipt, "Tickets de caisse, stocks, promotions, finances"]].map(([I, t], i) => (
              <div key={t} style={{ "--i": i }}><span><I size={14} /></span>{t}</div>
            ))}
          </div>
        </div>
        <div className="auth-float">
          <small>Chiffre d'affaires · 7 jours</small>
          <strong>1 245 000 FCFA</strong>
          <div className="mini-bars">{[40, 65, 35, 80, 55, 90, 72].map((h, i) => <i key={i} style={{ height: h + "%", "--i": i }} />)}</div>
        </div>
      </div>

      <div className="auth-side">
        <div className="card auth-card">
          <div className="card-body">
            <div className="auth-logo"><span className="brand-mark"><ShoppingBag size={16} strokeWidth={2.4} /></span>MILANA</div>
            <form onSubmit={valider} className="stack" key={etape} style={{ animation: "fadeUp .35s var(--ease-out)" }}>
              {inscription ? (
                <>
                  <div><h2>Créer mon espace administrateur</h2><p className="muted" style={{ marginTop: 4 }}>Votre boutique, vos produits et vos vendeurs, dans un espace qui n'appartient qu'à vous.</p></div>
                  <Field label="Votre nom"><Input size="lg" icon={User} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Aïcha Koné" autoComplete="name" autoFocus /></Field>
                  <Field label="Nom de votre boutique" help="Affiché aux clients sur la page d'accueil."><Input size="lg" icon={Store} value={boutique} onChange={(e) => setBoutique(e.target.value)} placeholder="Ex : Aïcha Mode" autoComplete="organization" /></Field>
                </>
              ) : (
                <div>
                  <h2>{espace === "vendeur" ? "Mon espace vendeur" : enLigne ? "Mon espace" : "Connexion"}</h2>
                  <p className="muted" style={{ marginTop: 4 }}>{espace === "vendeur" ? "Connectez-vous avec les identifiants remis par votre administrateur." : "Administrateur ou vendeur : connectez-vous pour accéder à votre tableau de bord."}</p>
                </div>
              )}
              <Field label="Numéro de téléphone"><Input size="lg" icon={Phone} value={tel} onChange={(e) => setTel(e.target.value)} placeholder="07 00 00 00 00" inputMode="tel" autoComplete="tel" autoFocus={!inscription} /></Field>
              <Field label="Mot de passe">
                <div className="input-wrap input-lg">
                  <Lock size={16} className="input-icon" />
                  <input className="input" type={voir ? "text" : "password"} value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="••••••••" autoComplete={inscription ? "new-password" : "current-password"} />
                  <button type="button" className="icon-btn" style={{ marginRight: 4 }} onClick={() => setVoir((v) => !v)} aria-label={voir ? "Masquer" : "Afficher"}>{voir ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </Field>
              {inscription && <Field label="Confirmez le mot de passe" help="6 caractères minimum."><Input size="lg" icon={Lock} type={voir ? "text" : "password"} value={mdp2} onChange={(e) => setMdp2(e.target.value)} placeholder="••••••••" autoComplete="new-password" /></Field>}
              {inscription && codeRequis && <Field label="Code d'invitation" help="Remis par le responsable de la plateforme."><Input size="lg" icon={ShieldCheck} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></Field>}
              {erreur && <div className="banner banner-critical" key={errKey}><AlertCircle size={16} />{erreur}</div>}
              <Btn type="submit" variant="primary" size="lg" full loading={busy}>{inscription ? "Créer mon espace" : "Se connecter"}</Btn>
              {enLigne && (inscription
                ? <p className="subtle" style={{ textAlign: "center" }}>Déjà un compte ? <button type="button" className="link" onClick={() => changer("connexion")}>Se connecter</button></p>
                : <p className="subtle" style={{ textAlign: "center" }}>{espace === "vendeur" ? "Vous vendez pour votre propre compte ? " : "Pas encore d'espace ? "}<button type="button" className="link" onClick={() => changer("inscription")}>Créer mon espace administrateur</button></p>)}
              {enLigne && !inscription && comptesTest.length > 0 && (
                <div className="comptes-test">
                  <div className="label">Comptes de test — entrer en un clic</div>
                  {[...comptesTest].sort((a, b) => (a.role === espace ? -1 : 0) - (b.role === espace ? -1 : 0)).map((c) => (
                    <button type="button" key={c.telephone} className="compte-test" disabled={busy} onClick={() => entrer(c)}>
                      <span className={cx("todo-icon", c.role === "admin" ? "tint-4" : "tint-0")}>{c.role === "admin" ? <ShieldCheck size={15} /> : <User size={15} />}</span>
                      <span className="grow"><b>{c.role === "admin" ? "Administrateur" : "Vendeur"} · {c.boutique}</b><small>{c.nom.replace(/ \(.*\)$/, "")} · {c.telephone}</small></span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
              )}
              {enLigne && <p className="subtle" style={{ textAlign: "center" }}><a className="link" href="/">← Retour à la page d'accueil</a></p>}
              {!enLigne && <div className="banner banner-warning"><AlertTriangle size={16} /><div>Mode démo hors ligne : les données restent dans ce navigateur.</div></div>}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   Ticket de caisse public (lien / QR code remis au client, sans connexion)
   ===================================================================== */
function PageRecuPublic({ jeton }) {
  const [t, setT] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    apiFetch("GET", `/api/recus/${encodeURIComponent(jeton || "")}`)
      .then((r) => setT({ ...r, lien: lienTicket(jeton) }))
      .catch((e) => setErr(e.statut === 404 ? "Ce ticket n'existe pas ou le lien est incomplet." : e.message));
  }, [jeton]);
  return (
    <div className="recu-public">
      <div className="recu-public-head">
        <span className="brand-mark"><Receipt size={16} strokeWidth={2.4} /></span>
        <div><strong>{t?.boutique?.nom || "Ticket de caisse"}</strong><div className="subtle">Ticket de caisse {t ? t.numero : ""}</div></div>
      </div>
      {err ? (
        <div className="card"><EmptyState icon={Receipt} title="Ticket introuvable">{err}</EmptyState></div>
      ) : !t ? (
        <div className="row" style={{ justifyContent: "center", padding: 60 }}><span className="spinner" /></div>
      ) : (
        <div className="stack" style={{ animation: "fadeUp .4s var(--ease-out)" }}>
          <p className="muted" style={{ textAlign: "center" }}>Merci pour votre achat ! Téléchargez ou imprimez votre ticket ci-dessous.</p>
          <TicketCaisse t={t} />
          <ActionsTicket t={t} />
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   Application
   ===================================================================== */
function useSettings() {
  const [settings, setSettingsState] = useState(() => ({ theme: "systeme", ...(readJson(SETTINGS_KEY) || {}) }));
  const setSettings = useCallback((s) => { setSettingsState(s); writeJson(SETTINGS_KEY, s); }, []);
  const [sysDark, setSysDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const f = (e) => setSysDark(e.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const effectiveTheme = settings.theme === "sombre" || (settings.theme === "systeme" && sysDark) ? "dark" : "light";
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effectiveTheme === "dark" ? "#0c0c0c" : "#1a1a1a");
  }, [effectiveTheme]);
  return { settings, setSettings, effectiveTheme };
}

/* Écran d'attente plein écran (recherche du serveur, chargement des données) */
function Splash({ texte }) {
  return (
    <div className="splash">
      <span className="brand-mark splash-mark"><ShoppingBag size={22} strokeWidth={2.4} /></span>
      <div className="strong">MILANA</div>
      <div className="row subtle"><span className="spinner" style={{ width: 14, height: 14 }} />{texte}</div>
    </div>
  );
}

/* Aucun serveur trouvé : réessayer ou continuer en mode démo local */
function ServeurIntrouvable({ onRetry, onDemo }) {
  return (
    <div className="splash">
      <div className="card" style={{ maxWidth: 460, width: "calc(100% - 32px)", animation: "fadeUp .4s var(--ease-out)" }}>
        <div className="card-body stack">
          <div className="row" style={{ gap: 12 }}>
            <span className="todo-icon tint-3" style={{ width: 44, height: 44, borderRadius: 12 }}><AlertTriangle size={22} /></span>
            <div><h2 style={{ fontSize: 18, fontWeight: 700 }}>Serveur introuvable</h2><p className="muted">L'API MILANA ne répond pas.</p></div>
          </div>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Démarrez le serveur depuis le dossier <b>backend</b> avec <code>npm start</code>, puis ouvrez <b>http://localhost:4000</b>.
            Vous pouvez aussi continuer en mode démo : les données resteront dans ce navigateur.
          </p>
          <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Btn onClick={onDemo}>Continuer en mode démo</Btn>
            <Btn variant="primary" icon={RotateCcw} onClick={onRetry}>Réessayer</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  // mode : null = recherche du serveur, "api" = connecté, "demo" = local, "hors-ligne" = serveur introuvable
  const [mode, setMode] = useState(null);
  const modeRef = useRef(null);
  modeRef.current = mode;
  const { data, update, replace } = useStore(mode);
  const { settings, setSettings, effectiveTheme } = useSettings();
  const [route, go] = useRoute();
  const [auth, setAuth] = useState(() => readJson(AUTH_KEY));
  const [booting, setBooting] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [sale, setSale] = useState({ open: false, preset: null });
  const [cmdk, setCmdk] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const mainRef = useRef(null);
  const pending = useRef(0);
  const refreshTimer = useRef(null);

  const toast = useCallback((t) => setToasts((s) => [...s.slice(-3), { ...t, id: uid() }]), []);
  const dismiss = useCallback((id) => setToasts((s) => s.filter((t) => t.id !== id)), []);
  const confirm = useCallback((opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve })), []);
  const doneConfirm = (ok) => { confirmState?.resolve(ok); setConfirmState(null); };
  const openSale = useCallback((preset = null) => setSale({ open: true, preset }), []);
  const openCmdk = useCallback(() => setCmdk(true), []);

  // Connecté au serveur, un jeton est obligatoire ; en démo, la session locale suffit
  const session = mode === "api" ? (auth?.jeton ? auth : null) : auth && !auth.jeton ? auth : null;

  const chercherServeur = useCallback(async () => {
    setMode(null);
    const base = await detecterServeur();
    if (base === null) { setMode("hors-ligne"); return; }
    API_BASE = base;
    setMode("api");
  }, []);
  useEffect(() => { chercherServeur(); }, []);

  const passerEnDemo = () => { setMode("demo"); replace(chargerLocal()); };

  /** Recharge toutes les données depuis le serveur. */
  const rafraichir = useCallback(async () => {
    if (modeRef.current !== "api" || !readJson(AUTH_KEY)?.jeton) return;
    try {
      replace(depuisServeur(await apiFetch("GET", "/api/donnees")));
    } catch (e) {
      if (e.statut !== 401) toast({ title: "Impossible de charger les données", desc: e.message, tone: "critical" });
    }
  }, []);

  /**
   * Envoie au serveur les requêtes correspondant à une modification déjà
   * appliquée localement (mise à jour optimiste). Renvoie les réponses, ou
   * null en cas d'échec : l'erreur est signalée et les données rechargées.
   * En mode démo, ne fait rien.
   */
  const sync = useCallback(async (...requetes) => {
    if (modeRef.current !== "api") return [];
    pending.current += 1;
    try {
      const res = [];
      for (const r of requetes) res.push(await apiFetch(...r));
      return res;
    } catch (e) {
      if (e.statut !== 401) toast({ title: "Modification non enregistrée", desc: e.message, tone: "critical" });
      return null;
    } finally {
      pending.current -= 1;
      clearTimeout(refreshTimer.current);
      // Resynchronise (numéros, stock…) une fois toutes les requêtes terminées
      refreshTimer.current = setTimeout(() => { if (pending.current === 0) rafraichir(); }, 400);
    }
  }, []);

  /** Remplace toutes les données (restauration, démo, import du navigateur). */
  const remplacerTout = useCallback(async (d) => {
    if (modeRef.current !== "api") { replace(d); return true; }
    try {
      await apiFetch("POST", "/api/donnees/import", versServeur(d));
      await rafraichir();
      return true;
    } catch (e) {
      toast({ title: "Import impossible", desc: e.message, tone: "critical" });
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    removeKey(AUTH_KEY);
    setAuth(null);
    if (modeRef.current === "api") replace(null);
    window.location.hash = "";
  }, []);

  // Chargement des données une fois connecté
  useEffect(() => {
    if (mode === "api" && session) { setBooting(true); rafraichir().finally(() => setBooting(false)); }
    if (mode === "demo") { const t = setTimeout(() => setBooting(false), 400); return () => clearTimeout(t); }
  }, [mode, session?.jeton]);

  // Session expirée (jeton refusé par le serveur)
  useEffect(() => {
    const h = () => {
      if (!readJson(AUTH_KEY)) return;
      logout();
      toast({ title: "Session expirée", desc: "Reconnectez-vous pour continuer.", tone: "info" });
    };
    window.addEventListener("mc-session-expiree", h);
    return () => window.removeEventListener("mc-session-expiree", h);
  }, []);

  // Retour sur l'onglet : on récupère les changements faits depuis un autre appareil
  useEffect(() => {
    const h = () => { if (document.visibilityState === "visible" && pending.current === 0) rafraichir(); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  const cycleTheme = useCallback(() => {
    const order = ["systeme", "clair", "sombre"];
    const next = order[(order.indexOf(settings.theme) + 1) % 3];
    setSettings({ ...settings, theme: next });
    toast({ title: `Thème : ${next === "systeme" ? "système" : next}`, tone: "info", duration: 1800 });
  }, [settings, setSettings, toast]);

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && document.querySelector(".app")) { e.preventDefault(); setCmdk((o) => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => { mainRef.current?.scrollTo({ top: 0, behavior: "instant" }); setDrawer(false); }, [route.page, route.page === "commandes" || route.page === "clients" ? route.id : null]);

  // Rôle : le serveur fait foi (data.role) ; en démo locale, tous les droits
  const estAdmin = mode !== "api" || (data?.role || session?.utilisateur?.role) === "admin";
  const ctx = { data, update, sync, replace, remplacerTout, rafraichir, mode, settings, setSettings, effectiveTheme, cycleTheme, route, go, toast, confirm, openSale, openCmdk, logout, auth: session, estAdmin };

  if (mode === null) return <Splash texte="Connexion au serveur…" />;
  if (mode === "hors-ligne") return <ServeurIntrouvable onRetry={chercherServeur} onDemo={passerEnDemo} />;

  // Ticket consulté par un client : aucune connexion requise
  if (route.page === "recu" && mode === "api") {
    return (
      <AppCtx.Provider value={ctx}>
        <PageRecuPublic jeton={route.id} />
        <Toasts items={toasts} onDismiss={dismiss} />
      </AppCtx.Provider>
    );
  }

  if (!session) {
    return (
      <AppCtx.Provider value={ctx}>
        <AuthScreen key={mode} mode={mode} onSuccess={(a) => { setAuth(a); toast({ title: `Bienvenue${a.utilisateur?.nom ? " " + a.utilisateur.nom.split(" ")[0] : ""} 👋`, desc: "Connexion réussie." }); }} />
        <Toasts items={toasts} onDismiss={dismiss} />
      </AppCtx.Provider>
    );
  }

  if (!data) {
    return (
      <AppCtx.Provider value={ctx}>
        <Splash texte="Chargement des données…" />
        <Toasts items={toasts} onDismiss={dismiss} />
      </AppCtx.Provider>
    );
  }

  const isDetail = (route.page === "commandes" || route.page === "clients") && route.id && route.id !== "nouveau";
  const pageKey = route.page + (isDetail ? "/" + route.id : "");
  let content;
  switch (route.page) {
    case "commandes": content = isDetail ? <PageCommande id={route.id} /> : <PageCommandes route={route} />; break;
    case "produits": content = estAdmin ? <PageProduits route={route} /> : <AccesReserve />; break;
    case "diagnostics": content = estAdmin ? <PageDiagnostics /> : <AccesReserve />; break;
    case "formations": content = estAdmin ? <PageFormations /> : <AccesReserve />; break;
    case "depenses": content = <PageDepenses />; break;
    case "clients": content = !estAdmin ? <AccesReserve /> : isDetail ? <PageClient id={route.id} /> : <PageClients route={route} />; break;
    case "ventes": content = <PageVentes />; break;
    case "stocks": content = estAdmin ? <PageStocks route={route} /> : <AccesReserve />; break;
    case "marketing": content = estAdmin ? <PageMarketing route={route} /> : <AccesReserve />; break;
    case "finances": content = estAdmin ? <PageFinances route={route} /> : <AccesReserve />; break;
    case "vendeurs": content = estAdmin ? <PageVendeurs /> : <AccesReserve />; break;
    case "tickets": content = <PageTickets route={route} />; break;
    case "livraisons": content = <PageLivraisons />; break;
    case "parametres": content = <PageParametres />; break;
    default: content = <PageAccueil />;
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <Topbar onMenu={() => setDrawer(true)} />
        <div className="shell">
          <aside className="sidebar"><SidebarNav /></aside>
          <main className="main" ref={mainRef}>
            <div className="page" key={booting ? "boot" : pageKey}>{booting ? <SkeletonPage /> : <>{estAdmin && <BandeauPaiementModifie />}{content}</>}</div>
          </main>
        </div>
        <BottomNav onMenu={() => setDrawer(true)} />
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)}><SidebarNav onNavigate={() => setDrawer(false)} /></Drawer>
      <SaleModal open={sale.open} preset={sale.preset} onClose={() => setSale((s) => ({ ...s, open: false }))} />
      <CommandPalette open={cmdk} onClose={() => setCmdk(false)} />
      <ConfirmDialog state={confirmState} onDone={doneConfirm} />
      <Toasts items={toasts} onDismiss={dismiss} />
    </AppCtx.Provider>
  );
}

/* =====================================================================
   Montage
   ===================================================================== */
createRoot(document.getElementById("root")).render(<App />);

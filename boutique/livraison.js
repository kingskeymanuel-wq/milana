/* Page du livreur : ouverte depuis le lien du colis (/livraison.html#<jeton>).
   La position est envoyée à l'ouverture puis toutes les 15 secondes tant que la page reste ouverte. */
(function () {
  const jeton = decodeURIComponent(location.hash.slice(1));
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ") + " FCFA";
  const api = async (m, chemin, corps) => {
    const r = await fetch("/api/boutique/livraison/" + encodeURIComponent(jeton) + chemin, { method: m, headers: { "Content-Type": "application/json" }, body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur || "Erreur " + r.status);
    return j;
  };
  const telInt = (t) => { const d = String(t || "").replace(/\D/g, ""); return d.length === 10 ? "225" + d : d; };
  let colis = null, position = null, dernierEnvoi = 0, premierEnvoi = true, carte = null, moi = null, dest = null, precisionCercle = null;

  const etat = (texte, classe) => { $("etat").textContent = texte; $("point").className = "point " + (classe || ""); };
  const message = (texte, type) => { $("message").innerHTML = texte ? `<div class="${type || "ok"}">${texte}</div>` : ""; };

  function initCarte() {
    if (!window.L || carte) return;
    carte = L.map("carte", { zoomControl: true }).setView([5.345, -4.024], 12); // Abidjan
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(carte);
  }
  function majCarte() {
    if (!carte) return;
    const pts = [];
    if (position) {
      const ll = [position.lat, position.lng];
      if (!moi) moi = L.circleMarker(ll, { radius: 9, color: "#fff", weight: 3, fillColor: "#1F7A45", fillOpacity: 1 }).addTo(carte).bindTooltip("Vous");
      else moi.setLatLng(ll);
      if (!precisionCercle) precisionCercle = L.circle(ll, { radius: position.precision || 30, color: "#1F7A45", weight: 1, fillOpacity: .08 }).addTo(carte);
      else precisionCercle.setLatLng(ll).setRadius(position.precision || 30);
      pts.push(ll);
    }
    if (colis?.destination) {
      const ll = [colis.destination.lat, colis.destination.lng];
      if (!dest) dest = L.circleMarker(ll, { radius: 9, color: "#fff", weight: 3, fillColor: "#B8862B", fillOpacity: 1 }).addTo(carte).bindTooltip("Client");
      pts.push(ll);
    }
    if (pts.length === 2) carte.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
    else if (pts.length === 1) carte.setView(pts[0], 15);
  }

  async function envoyer(force) {
    if (!colis || ["livree"].includes(colis.statut)) return;
    if (!force && Date.now() - dernierEnvoi < 15000) return;
    dernierEnvoi = Date.now();
    const corps = { ...(position || {}) };
    if (premierEnvoi) { corps.nom = $("nom").value.trim(); corps.telephone = $("tel").value.trim(); }
    try {
      const r = await api("POST", "/position", corps);
      premierEnvoi = false;
      if (position) etat(r.distance != null ? `Position partagée · client à ${r.distance < 1000 ? r.distance + " m" : (r.distance / 1000).toFixed(1) + " km"}` : "Position partagée avec la boutique", "on");
    } catch (e) { etat("Envoi impossible : " + e.message, "off"); }
  }

  function localiser() {
    if (!("geolocation" in navigator)) { etat("Ce téléphone ne permet pas la localisation", "off"); envoyer(true); return; }
    navigator.geolocation.watchPosition((p) => {
      const nouvelle = !position;
      position = { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy };
      majCarte();
      envoyer(nouvelle);
    }, (e) => {
      etat(e.code === 1 ? "Localisation refusée : autorisez-la dans le navigateur pour être suivi" : "Position indisponible (activez le GPS)", "off");
      if (premierEnvoi) envoyer(true); // la boutique sait au moins que le lien a été ouvert
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    setInterval(() => envoyer(false), 15000);
    if ("wakeLock" in navigator) navigator.wakeLock.request("screen").catch(() => {});
  }

  function afficher() {
    const c = colis;
    $("boutique").textContent = c.boutique.nom;
    $("titre").textContent = c.statut === "livree" ? "Colis livré ✓" : c.client.nom ? "Livraison pour " + c.client.nom : "Livraison";
    $("numero").textContent = c.numero ? "· " + c.numero : "";
    $("client").textContent = c.client.nom || "Client";
    $("ville").textContent = c.client.ville || "";
    $("adresse").textContent = c.client.adresse || "Adresse à préciser avec le client";
    $("appeler").href = "tel:" + (c.client.telephone || "");
    $("appeler").textContent = c.client.telephone ? "Appeler " + c.client.telephone : "Appeler";
    $("whatsapp").href = "https://wa.me/" + telInt(c.client.telephone);
    $("itineraire").href = c.destination
      ? `https://www.google.com/maps/dir/?api=1&destination=${c.destination.lat},${c.destination.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([c.client.adresse, c.client.ville, "Côte d'Ivoire"].filter(Boolean).join(", "))}`;
    $("articles").innerHTML = c.articles.map((a) => `<div class="ligne"><span>${a.nom.replace(/[<>&]/g, "")}</span><b>× ${a.quantite}</b></div>`).join("");
    $("encaisser").textContent = c.a_encaisser ? fmt(c.a_encaisser) : "Déjà payé";
    $("frais").textContent = c.frais_livraison ? `dont ${fmt(c.frais_livraison)} de livraison` : "";
    $("boutique-tel").textContent = c.boutique.telephone || "—";
    $("qui").hidden = c.deja_ouvert || Boolean(c.livreur);
    $("rappel-encaisser").textContent = c.a_encaisser ? ` et que vous avez encaissé ${fmt(c.a_encaisser)}` : "";
    const a = [];
    if (["en_attente", "confirmee"].includes(c.statut)) a.push(`<button class="btn or" data-a="depart">Je pars livrer</button>`);
    if (c.statut !== "livree") a.push(`<button class="btn" data-a="arrive">${c.arrive_le ? "Arrivé ✓" : "Je suis arrivé"}</button>`, `<button class="btn vert" data-a="remis">Remis au client</button>`);
    $("actions").innerHTML = a.join("");
    $("actions").style.gridTemplateColumns = a.length === 3 ? "1fr 1fr 1fr" : "1fr 1fr";
    if (c.statut === "livree") { message("Livraison terminée. Merci !"); etat("Livraison terminée", "on"); }
    else if (c.arrive_le) message(c.arrive_distance != null ? `Arrivée enregistrée à ${c.arrive_distance} m du point du client.` : "Arrivée enregistrée.");
  }

  async function charger() {
    try { colis = await api("GET", ""); afficher(); majCarte(); }
    catch (e) { $("titre").textContent = "Lien invalide"; etat(e.message, "off"); $("actions").innerHTML = ""; throw e; }
  }

  $("actions").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "remis") { $("confirmer").classList.add("ouvert"); $("actions").hidden = true; return; }
    b.disabled = true;
    try {
      const r = await api("POST", "/" + a, position || {});
      if (a === "arrive") message(r.distance != null ? `Arrivée enregistrée à ${r.distance} m du point du client.` : "Arrivée enregistrée.");
      await charger();
    } catch (err) { message(err.message, "alerte"); b.disabled = false; }
  });
  $("annuler").onclick = () => { $("confirmer").classList.remove("ouvert"); $("actions").hidden = false; };
  $("oui").onclick = async () => {
    try { await api("POST", "/remis", position || {}); $("confirmer").classList.remove("ouvert"); $("actions").hidden = false; await charger(); }
    catch (err) { message(err.message, "alerte"); }
  };
  $("enregistrer").onclick = async () => { premierEnvoi = true; dernierEnvoi = 0; await envoyer(true); $("qui").hidden = true; message("Merci, c'est noté."); };

  if (!jeton) { $("titre").textContent = "Lien incomplet"; etat("Ouvrez le lien complet reçu de la boutique", "off"); return; }
  initCarte();
  charger().then(localiser).catch(() => {});
  setInterval(() => charger().catch(() => {}), 60000);
})();

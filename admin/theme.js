// Applique le thème enregistré avant le premier rendu (évite le flash)
(function () {
  try {
    var s = JSON.parse(localStorage.getItem("moncommerce-reglages") || "{}");
    var t = s.theme || "systeme";
    var dark = t === "sombre" || (t === "systeme" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {}
})();

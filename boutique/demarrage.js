// Boutique toujours en thème sombre, puis application installable (service worker)
document.documentElement.setAttribute("data-theme", "dark");
if ("serviceWorker" in navigator) addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });

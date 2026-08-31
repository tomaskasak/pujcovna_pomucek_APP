import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PublicPage from "./PublicPage.jsx";

// Jednoduché routování bez knihovny: /verejny-prehled je samostatná stránka
// bez přihlášení, vše ostatní je chráněná appka pro obsluhu půjčovny.
const isPublicRoute = window.location.pathname.replace(/\/+$/, "") === "/verejny-prehled";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>{isPublicRoute ? <PublicPage /> : <App />}</React.StrictMode>
);

// Registrace service workeru — umožňuje appce nabídnout se na Androidu jako
// instalovatelná (ikona na ploše, spuštění bez adresního řádku prohlížeče).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // instalace jako PWA prostě nebude nabídnuta — appka funguje dál normálně v prohlížeči
    });
  });
}

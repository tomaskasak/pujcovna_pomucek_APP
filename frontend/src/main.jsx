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

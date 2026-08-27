import React, { useState, useEffect } from "react";
import { api } from "./api.js";
import { Style, PublicStockPage, Empty } from "./App.jsx";

// Samostatná, nepřihlášená stránka s dostupností pomůcek — určená pro klienty
// (např. odkaz na webu půjčovny). Nepotřebuje login, nepoužívá /api/state,
// ale samostatný veřejný endpoint bez cen a jmen klientů.
export default function PublicPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getPublicItems()
      .then(setItems)
      .catch((e) => setError(e.message || "Načtení dostupnosti se nezdařilo."));
  }, []);

  return (
    <div className="app">
      <Style />
      <main className="main" style={{ width: "100%" }}>
        <header className="topbar">
          <h1>Veřejný přehled — Půjčovna rehabilitačních pomůcek</h1>
        </header>
        <div className="content">
          {error && <Empty text={error} />}
          {!error && items === null && (
            <div className="loading-screen" style={{ minHeight: 200 }}>
              <div className="spinner" />
            </div>
          )}
          {!error && items !== null && <PublicStockPage items={items} standalone />}
        </div>
      </main>
    </div>
  );
}

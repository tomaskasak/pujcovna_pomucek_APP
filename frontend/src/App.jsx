import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Users, PackageSearch, CalendarClock, Wallet, Plus, X, Check, AlertTriangle, Search, Trash2, Globe } from "lucide-react";
import { api, onUnauthorized } from "./api.js";

const STATUS = {
  available: { label: "K dispozici", color: "#3F8D5E", bg: "#EAF4EE" },
  rented: { label: "Půjčeno", color: "#3B6E8F", bg: "#EAF1F6" },
  service: { label: "V servisu", color: "#8A6D3B", bg: "#F6F0E4" },
  overdue: { label: "Po termínu", color: "#B5482F", bg: "#FAECE7" },
};

// tiers: [{ days: 1, rate: 250 }, { days: 14, rate: 230 }, { days: 30, rate: 200 }]
// vrací sazbu platnou pro daný počet dní výpůjčky (bere nejvyšší práh <= days)
function effectiveRate(item, days) {
  const tiers = item.priceTiers && item.priceTiers.length ? item.priceTiers : [{ days: 1, rate: item.dailyRate || 0 }];
  const sorted = [...tiers].sort((a, b) => a.days - b.days);
  let rate = sorted[0].rate;
  for (const t of sorted) {
    if (days >= t.days) rate = t.rate;
  }
  return rate;
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
export const czk = (n) => (n || 0).toLocaleString("cs-CZ") + " Kč";

const emptyData = () => ({ clients: [], items: [], reservations: [], payments: [] });

function StampBadge({ status }) {
  const s = STATUS[status] || STATUS.available;
  return (
    <span
      className="stamp"
      style={{ color: s.color, borderColor: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={"modal" + (wide ? " modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Zavřít">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  // "checking" (ověřuje se přihlášení) | "guest" (přihlašovací obrazovka) | "authed"
  const [authState, setAuthState] = useState("checking");
  const [username, setUsername] = useState("");

  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // {type, id?}
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // pokud kdykoli server odpoví 401 (session vypršela), vrátíme se na přihlašovací obrazovku
  useEffect(() => {
    onUnauthorized(() => setAuthState("guest"));
  }, []);

  // ověření přihlášení při načtení appky (funguje díky trvalé cookie — appka si tě "pamatuje")
  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        if (res.authenticated) {
          setUsername(res.username);
          setAuthState("authed");
        } else {
          setAuthState("guest");
        }
      })
      .catch(() => setAuthState("guest"));
  }, []);

  // počáteční načtení dat z backend API (nahrazuje window.storage z prototypu)
  const loadState = useCallback(async () => {
    try {
      const state = await api.getState();
      setData({ ...emptyData(), ...state });
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message || "Načtení dat ze serveru se nezdařilo.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (authState === "authed") loadState();
  }, [authState, loadState]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // odhlásit se i kdyby request selhal — cookie na klientovi stejně přestaneme používat
    }
    setAuthState("guest");
    setLoaded(false);
    setData(emptyData());
  };

  // derived: item live status + stock, considering overdue and quantities
  const itemsWithStatus = useMemo(() => {
    const activeReservationsByItem = {};
    data.reservations.forEach((r) => {
      if (r.status === "active") {
        (activeReservationsByItem[r.itemId] = activeReservationsByItem[r.itemId] || []).push(r);
      }
    });
    return data.items.map((it) => {
      const total = Number(it.quantityTotal ?? 1);
      const activeList = activeReservationsByItem[it.id] || [];
      const rentedQty = activeList.reduce((s, r) => s + Number(r.quantity || 1), 0);
      const availableQty = Math.max(0, total - rentedQty);
      const hasOverdue = activeList.some((r) => r.endDate && r.endDate < todayISO());
      let status = "available";
      if (it.serviceFlag) status = "service";
      else if (availableQty <= 0 && hasOverdue) status = "overdue";
      else if (availableQty <= 0) status = "rented";
      return {
        ...it,
        quantityTotal: total,
        rentedQty,
        availableQty,
        status,
        hasOverdue,
        currentReservation: activeList[0],
        activeReservations: activeList,
      };
    });
  }, [data.items, data.reservations]);

  const clientById = (id) => data.clients.find((c) => c.id === id);
  const itemById = (id) => itemsWithStatus.find((i) => i.id === id);

  const stats = useMemo(() => {
    const totalItems = data.items.length;
    const rentedNow = itemsWithStatus.filter((i) => i.rentedQty > 0).length;
    const overdue = itemsWithStatus.filter((i) => i.hasOverdue).length;
    const monthStart = todayISO().slice(0, 7);
    const revenueThisMonth = data.payments
      .filter((p) => p.date && p.date.startsWith(monthStart))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    return { totalItems, rentedNow, overdue, revenueThisMonth, clients: data.clients.length };
  }, [data, itemsWithStatus]);

  // ---- CRUD helpery — volají backend API, lokální stav aktualizují podle odpovědi ----
  const addClient = async (c) => {
    try {
      const created = await api.createClient(c);
      setData((d) => ({ ...d, clients: [...d.clients, created] }));
      return true;
    } catch (e) {
      showToast(e.message);
      return false;
    }
  };
  const removeClient = async (id) => {
    try {
      await api.deleteClient(id);
      setData((d) => ({ ...d, clients: d.clients.filter((c) => c.id !== id) }));
    } catch (e) {
      showToast(e.message || "Klienta se nepodařilo smazat.");
    }
  };

  const addItem = async (it) => {
    try {
      const created = await api.createItem(it);
      setData((d) => ({ ...d, items: [...d.items, created] }));
      return true;
    } catch (e) {
      showToast(e.message);
      return false;
    }
  };
  const updateItem = async (id, patch) => {
    try {
      const updated = await api.updateItem(id, patch);
      setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? updated : i)) }));
      return true;
    } catch (e) {
      showToast(e.message);
      return false;
    }
  };
  const seedPriceList = async () => {
    try {
      const added = await api.seedPricelist();
      if (added.length === 0) {
        showToast("Ceník je už kompletní.");
        return;
      }
      setData((d) => ({ ...d, items: [...d.items, ...added] }));
      showToast("Ceník načten — doplňte prosím počty kusů skladem");
    } catch (e) {
      showToast(e.message || "Načtení ceníku se nezdařilo.");
    }
  };
  const removeItem = async (id) => {
    try {
      await api.deleteItem(id);
      setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
    } catch (e) {
      showToast(e.message || "Pomůcka má aktivní výpůjčku.");
    }
  };
  const setItemService = async (id, inService) => {
    try {
      const updated = await api.updateItem(id, { serviceFlag: inService });
      setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? updated : i)) }));
    } catch (e) {
      showToast(e.message);
    }
  };

  const addReservation = async (r) => {
    try {
      const created = await api.createReservation(r);
      setData((d) => ({ ...d, reservations: [...d.reservations, created] }));
      return true;
    } catch (e) {
      showToast(e.message);
      return false;
    }
  };
  const returnReservation = async (id) => {
    try {
      const updated = await api.returnReservation(id);
      setData((d) => ({ ...d, reservations: d.reservations.map((r) => (r.id === id ? updated : r)) }));
    } catch (e) {
      showToast(e.message);
    }
  };
  const setPaymentStatus = async (id, paymentStatus) => {
    try {
      const updated = await api.setPaymentStatus(id, paymentStatus);
      setData((d) => ({ ...d, reservations: d.reservations.map((r) => (r.id === id ? updated : r)) }));
    } catch (e) {
      showToast(e.message);
    }
  };

  const addPayment = async (p) => {
    try {
      const created = await api.createPayment(p);
      setData((d) => ({ ...d, payments: [...d.payments, created] }));
      return true;
    } catch (e) {
      showToast(e.message);
      return false;
    }
  };
  const removePayment = async (id) => {
    try {
      await api.deletePayment(id);
      setData((d) => ({ ...d, payments: d.payments.filter((p) => p.id !== id) }));
    } catch (e) {
      showToast(e.message);
    }
  };

  const exportPaymentsCSV = () => {
    const header = ["Datum", "Klient", "Castka", "Zpusob", "Variabilni symbol", "Poznamka"];
    const rows = data.payments.map((p) => [
      p.date || "",
      (clientById(p.clientId)?.name || "").replace(/;/g, ","),
      p.amount || 0,
      p.method || "",
      p.variableSymbol || "",
      (p.note || "").replace(/;/g, ","),
    ]);
    const csv = [header, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `platby-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const q = query.trim().toLowerCase();
  const filteredClients = data.clients.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
  const filteredItems = itemsWithStatus.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q));
  const sortedReservations = [...data.reservations].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));

  if (authState === "checking") {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <Style />
      </div>
    );
  }

  if (authState === "guest") {
    return <LoginScreen onLoggedIn={(u) => { setUsername(u); setAuthState("authed"); }} />;
  }

  if (!loaded) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <Style />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="loading-screen">
        <div style={{ textAlign: "center" }}>
          <p style={{ marginBottom: 12 }}>{loadError}</p>
          <button className="btn btn-primary" onClick={loadState}>
            Zkusit znovu
          </button>
        </div>
        <Style />
      </div>
    );
  }

  return (
    <div className="app">
      <Style />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <div className="brand-title">Půjčovna</div>
            <div className="brand-sub">rehabilitační pomůcky</div>
          </div>
        </div>
        <nav className="nav">
          <NavBtn icon={<CalendarClock size={18} />} label="Přehled" active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
          <NavBtn icon={<Users size={18} />} label="Klienti" active={tab === "clients"} onClick={() => setTab("clients")} />
          <NavBtn icon={<PackageSearch size={18} />} label="Pomůcky" active={tab === "items"} onClick={() => setTab("items")} />
          <NavBtn icon={<CalendarClock size={18} />} label="Výpůjčky" active={tab === "reservations"} onClick={() => setTab("reservations")} />
          <NavBtn icon={<Wallet size={18} />} label="Platby" active={tab === "payments"} onClick={() => setTab("payments")} />
          <div className="nav-divider" />
          <NavBtn icon={<Globe size={18} />} label="Veřejný přehled" active={tab === "public"} onClick={() => setTab("public")} />
        </nav>
        <div className="sidebar-foot">
          Přihlášen: {username}
          <br />
          <button className="logout-link" onClick={handleLogout}>
            Odhlásit se
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{titleFor(tab)}</h1>
          {tab !== "dashboard" && tab !== "public" && (
            <div className="topbar-actions">
              <div className="search">
                <Search size={16} />
                <input placeholder="Hledat…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {tab === "clients" && (
                <button className="btn btn-primary" onClick={() => setModal({ type: "client" })}>
                  <Plus size={16} /> Klient
                </button>
              )}
              {tab === "items" && (
                <>
                  <button className="btn btn-ghost" onClick={seedPriceList}>
                    Načíst ceník z webu
                  </button>
                  <button className="btn btn-primary" onClick={() => setModal({ type: "item" })}>
                    <Plus size={16} /> Pomůcka
                  </button>
                </>
              )}
              {tab === "reservations" && (
                <button className="btn btn-primary" onClick={() => setModal({ type: "reservation" })}>
                  <Plus size={16} /> Výpůjčka
                </button>
              )}
              {tab === "payments" && (
                <>
                  <button className="btn btn-ghost" onClick={exportPaymentsCSV}>
                    Export CSV
                  </button>
                  <button className="btn btn-primary" onClick={() => setModal({ type: "payment" })}>
                    <Plus size={16} /> Platba
                  </button>
                </>
              )}
            </div>
          )}
        </header>

        <div className="content">
          {tab === "dashboard" && (
            <Dashboard stats={stats} items={itemsWithStatus} clients={data.clients} onGoto={setTab} />
          )}

          {tab === "clients" && (
            <div className="grid-cards">
              {filteredClients.length === 0 && <Empty text="Zatím žádní klienti. Přidejte prvního." />}
              {filteredClients.map((c) => {
                const active = data.reservations.filter((r) => r.clientId === c.id && r.status === "active").length;
                return (
                  <div className="card" key={c.id}>
                    <div className="card-row">
                      <div className="avatar">{initials(c.name)}</div>
                      <div className="grow">
                        <div className="card-title">{c.name}</div>
                        <div className="card-sub mono">{c.phone || "bez telefonu"}</div>
                      </div>
                      <button className="icon-btn danger" onClick={() => removeClient(c.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {c.address && <div className="card-line">{c.address}</div>}
                    {c.note && <div className="card-note">{c.note}</div>}
                    <div className="card-foot">{active > 0 ? `${active} aktivní výpůjčka/y` : "žádná aktivní výpůjčka"}</div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "items" && (
            <div className="grid-cards">
              {filteredItems.length === 0 && <Empty text="Zatím žádné pomůcky. Přidejte první kus." />}
              {filteredItems.map((it) => (
                <div className="card item-card" key={it.id}>
                  <div className="card-row">
                    <div className="grow">
                      <div className="card-title">{it.name}</div>
                      <div className="card-sub">{it.category || "bez kategorie"}</div>
                    </div>
                    <StampBadge status={it.status} />
                  </div>
                  <div className="card-line mono">
                    {czk(it.dailyRate)} / den
                    {it.priceTiers && it.priceTiers.length > 1 && (
                      <span className="tier-hint"> · {it.priceTiers.slice(1).map((t) => `${t.days}+ dní: ${t.rate} Kč`).join(", ")}</span>
                    )}
                  </div>
                  <div className="stock-row">
                    <span className="stock-pill">Skladem: {it.quantityTotal}</span>
                    <span className={"stock-pill" + (it.availableQty === 0 ? " stock-empty" : "")}>Volno: {it.availableQty}</span>
                    {it.rentedQty > 0 && <span className="stock-pill">Půjčeno: {it.rentedQty}</span>}
                  </div>
                  {it.activeReservations && it.activeReservations.length > 0 && (
                    <div className="mini-list">
                      {it.activeReservations.map((r) => {
                        const overdue = r.endDate && r.endDate < todayISO();
                        return (
                          <div key={r.id} className={"card-note" + (overdue ? " warn" : "")}>
                            {clientById(r.clientId)?.name || "neznámý klient"} · {r.quantity || 1}× · do {fmtDate(r.endDate)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="card-foot-actions">
                    <button className="link-btn" onClick={() => setModal({ type: "item", editId: it.id })}>
                      Upravit
                    </button>
                    <button className="link-btn" onClick={() => setItemService(it.id, !it.serviceFlag)}>
                      {it.serviceFlag ? "Vrátit do nabídky" : "K servisu"}
                    </button>
                    <button className="icon-btn danger" onClick={() => removeItem(it.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "reservations" && (
            <div className="table-wrap">
              {sortedReservations.length === 0 && <Empty text="Zatím žádné výpůjčky." />}
              {sortedReservations.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Klient</th>
                      <th>Pomůcka</th>
                      <th>Od</th>
                      <th>Do</th>
                      <th>Cena</th>
                      <th>Úhrada</th>
                      <th>Stav</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedReservations.map((r) => {
                      const item = data.items.find((i) => i.id === r.itemId);
                      const client = clientById(r.clientId);
                      const overdue = r.status === "active" && r.endDate && r.endDate < todayISO();
                      const st = r.status === "returned" ? "returned" : overdue ? "overdue" : "rented";
                      return (
                        <tr key={r.id}>
                          <td>{client?.name || "—"}</td>
                          <td>{item?.name || "—"}{r.quantity > 1 ? ` ×${r.quantity}` : ""}</td>
                          <td className="mono">{fmtDate(r.startDate)}</td>
                          <td className="mono">{fmtDate(r.endDate)}</td>
                          <td className="mono">{czk(r.price)}</td>
                          <td>
                            <select
                              className={"pay-select pay-" + (r.paymentStatus || "nezaplaceno")}
                              value={r.paymentStatus || "nezaplaceno"}
                              onChange={(e) => setPaymentStatus(r.id, e.target.value)}
                            >
                              <option value="nezaplaceno">Nezaplaceno</option>
                              <option value="zaloha">Záloha</option>
                              <option value="zaplaceno">Zaplaceno</option>
                            </select>
                          </td>
                          <td>
                            {r.status === "returned" ? (
                              <span className="stamp" style={{ color: "#6B6555", borderColor: "#6B6555", background: "#F1ECD8" }}>
                                Vráceno {fmtDate(r.returnedAt)}
                              </span>
                            ) : (
                              <StampBadge status={st} />
                            )}
                          </td>
                          <td>
                            {r.status === "active" && (
                              <button className="link-btn" onClick={() => returnReservation(r.id)}>
                                <Check size={14} /> Vrátit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "payments" && (
            <div className="table-wrap">
              {data.payments.length === 0 && <Empty text="Zatím žádné platby." />}
              {data.payments.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Klient</th>
                      <th>Částka</th>
                      <th>Způsob</th>
                      <th>VS</th>
                      <th>Poznámka</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.payments]
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                      .map((p) => (
                        <tr key={p.id}>
                          <td className="mono">{fmtDate(p.date)}</td>
                          <td>{clientById(p.clientId)?.name || "—"}</td>
                          <td className="mono">{czk(p.amount)}</td>
                          <td>{p.method}</td>
                          <td className="mono">{p.variableSymbol || "—"}</td>
                          <td>{p.note}</td>
                          <td>
                            <button className="icon-btn danger" onClick={() => removePayment(p.id)}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {tab === "public" && <PublicStockPage items={itemsWithStatus} />}
        </div>
      </main>

      {toast && <div className="toast">{toast}</div>}

      {modal?.type === "client" && (
        <ClientModal
          onClose={() => setModal(null)}
          onSave={async (c) => {
            const ok = await addClient(c);
            if (ok) {
              setModal(null);
              showToast("Klient přidán");
            }
          }}
        />
      )}
      {modal?.type === "item" && (
        <ItemModal
          initial={modal.editId ? data.items.find((i) => i.id === modal.editId) : null}
          onClose={() => setModal(null)}
          onSave={async (it) => {
            let ok;
            if (modal.editId) {
              ok = await updateItem(modal.editId, it);
              if (ok) showToast("Pomůcka upravena");
            } else {
              ok = await addItem(it);
              if (ok) showToast("Pomůcka přidána");
            }
            if (ok) setModal(null);
          }}
        />
      )}
      {modal?.type === "reservation" && (
        <ReservationModal
          clients={data.clients}
          items={itemsWithStatus.filter((i) => i.status === "available")}
          onClose={() => setModal(null)}
          onSave={async (r) => {
            const ok = await addReservation(r);
            if (ok) {
              setModal(null);
              showToast("Výpůjčka vytvořena");
            }
          }}
        />
      )}
      {modal?.type === "payment" && (
        <PaymentModal
          clients={data.clients}
          onClose={() => setModal(null)}
          onSave={async (p) => {
            const ok = await addPayment(p);
            if (ok) {
              setModal(null);
              showToast("Platba zaznamenána");
            }
          }}
        />
      )}
    </div>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [usernames, setUsernames] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getUsers()
      .then((list) => {
        setUsernames(list);
        if (list.length > 0) setUsername(list[0]);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.login(username, password);
      onLoggedIn(username);
    } catch (e) {
      setError(e.message || "Přihlášení se nezdařilo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="loading-screen">
      <Style />
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="brand-mark">R</div>
          <div>
            <div className="brand-title" style={{ color: "#20281F" }}>Půjčovna</div>
            <div className="card-sub">rehabilitační pomůcky</div>
          </div>
        </div>

        <Field label="Uživatel">
          {usernames.length > 0 ? (
            <select value={username} onChange={(e) => setUsername(e.target.value)}>
              {usernames.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          ) : (
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Uživatelské jméno" />
          )}
        </Field>
        <Field label="Heslo">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        {error && <div className="login-error">{error}</div>}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={submitting || !username || !password}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {submitting ? "Přihlašuji…" : "Přihlásit se"}
        </button>
      </form>
    </div>
  );
}

function titleFor(tab) {
  return { dashboard: "Přehled", clients: "Klienti", items: "Pomůcky", reservations: "Výpůjčky", payments: "Platby", public: "Veřejný přehled" }[tab];
}

export function PublicStockPage({ items, standalone }) {
  const visible = items.filter((i) => !i.serviceFlag);
  const byCategory = {};
  visible.forEach((it) => {
    const cat = it.category || "Ostatní";
    (byCategory[cat] = byCategory[cat] || []).push(it);
  });
  const categories = Object.keys(byCategory).sort();

  return (
    <div className="public-page">
      <div className="public-note">
        <Globe size={14} />{" "}
        {standalone ? (
          "Tato stránka je veřejně dostupná bez přihlášení — odkaz na ni můžeš sdílet s klienty. Jména klientů se zde nezobrazují."
        ) : (
          <>Takhle vidí dostupnost klienti na veřejném odkazu <span className="mono">/verejny-prehled</span> — bez přihlášení, bez jmen klientů.</>
        )}
      </div>
      <div className="public-hero">
        <h2>Aktuální dostupnost pomůcek</h2>
        <p>Přehled se aktualizuje automaticky podle skladu.</p>
      </div>
      {categories.length === 0 && <Empty text="Zatím žádné pomůcky k zobrazení." />}
      {categories.map((cat) => (
        <div key={cat} className="public-section">
          <div className="public-cat-title">{cat}</div>
          <div className="grid-cards">
            {byCategory[cat].map((it) => (
              <div className="card public-card" key={it.id}>
                <div className="card-title">{it.name}</div>
                <div className="card-line mono">{czk(it.dailyRate)} / den</div>
                {it.availableQty > 0 ? (
                  <span className="stock-pill public-ok">Skladem {it.availableQty} ks</span>
                ) : (
                  <span className="stock-pill stock-empty">Momentálně vyprodáno</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

function NavBtn({ icon, label, active, onClick }) {
  return (
    <button className={"nav-btn" + (active ? " active" : "")} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

function Dashboard({ stats, items, clients, onGoto }) {
  const overdueItems = items.filter((i) => i.hasOverdue);
  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-num">{stats.totalItems}</div>
          <div className="stat-label">Pomůcek celkem</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.rentedNow}</div>
          <div className="stat-label">Aktuálně půjčeno</div>
        </div>
        <div className="stat-card accent-danger">
          <div className="stat-num">{stats.overdue}</div>
          <div className="stat-label">Po termínu</div>
        </div>
        <div className="stat-card accent-primary">
          <div className="stat-num mono">{czk(stats.revenueThisMonth)}</div>
          <div className="stat-label">Tržby tento měsíc</div>
        </div>
      </div>

      <div className="section-title">Po termínu vrácení</div>
      {overdueItems.length === 0 ? (
        <Empty text="Nic není po termínu. Dobrá práce." />
      ) : (
        <div className="grid-cards">
          {overdueItems.map((it) => {
            const res = it.activeReservations.find((r) => r.endDate && r.endDate < todayISO()) || it.currentReservation;
            return (
              <div className="card" key={it.id}>
                <div className="card-row">
                  <AlertTriangle size={16} color="#B5482F" />
                  <div className="grow">
                    <div className="card-title">{it.name}</div>
                    <div className="card-sub">
                      {clients.find((c) => c.id === res?.clientId)?.name} · mělo být vráceno {fmtDate(res?.endDate)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="quick-links">
        <button className="btn btn-ghost" onClick={() => onGoto("clients")}><Users size={16} /> Klienti ({stats.clients})</button>
        <button className="btn btn-ghost" onClick={() => onGoto("items")}><PackageSearch size={16} /> Pomůcky</button>
        <button className="btn btn-ghost" onClick={() => onGoto("reservations")}><CalendarClock size={16} /> Výpůjčky</button>
        <button className="btn btn-ghost" onClick={() => onGoto("payments")}><Wallet size={16} /> Platby</button>
      </div>
    </div>
  );
}

function ClientModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="Nový klient" onClose={onClose}>
      <Field label="Jméno a příjmení *">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Jana Nováková" />
      </Field>
      <Field label="Telefon">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+420 601 123 456" />
      </Field>
      <Field label="Adresa">
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ulice 12, Praha" />
      </Field>
      <Field label="Poznámka">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
      <div className="modal-actions">
        <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), phone, address, note })}>
          Uložit klienta
        </button>
      </div>
    </Modal>
  );
}

function ItemModal({ onClose, onSave, initial }) {
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [quantityTotal, setQuantityTotal] = useState(String(initial?.quantityTotal ?? "1"));
  const [tiers, setTiers] = useState(
    initial?.priceTiers && initial.priceTiers.length
      ? initial.priceTiers.map((t) => ({ days: String(t.days), rate: String(t.rate) }))
      : [{ days: "1", rate: initial?.dailyRate ? String(initial.dailyRate) : "" }]
  );

  const updateTier = (idx, field, value) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value.replace(/\D/g, "") } : t)));
  };
  const addTier = () => setTiers((prev) => [...prev, { days: "", rate: "" }]);
  const removeTier = (idx) => setTiers((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const baseRate = Number(tiers[0]?.rate) || 0;
  const canSave = name.trim() && baseRate > 0;

  return (
    <Modal title={initial ? "Upravit pomůcku" : "Nová pomůcka"} onClose={onClose}>
      <Field label="Název *">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Invalidní vozík odlehčený" />
      </Field>
      <Field label="Kategorie">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Vozíky / Chodítka / Lůžka…" />
      </Field>
      <Field label="Počet kusů skladem *">
        <input inputMode="numeric" value={quantityTotal} onChange={(e) => setQuantityTotal(e.target.value.replace(/\D/g, ""))} placeholder="3" />
      </Field>

      <div className="field-label" style={{ marginTop: 4 }}>Cenové úrovně (Kč / den)</div>
      <div className="tiers-box">
        {tiers.map((t, idx) => (
          <div className="tier-row" key={idx}>
            <span className="tier-from">
              {idx === 0 ? "od 1. dne" : (
                <>od <input className="tier-days" inputMode="numeric" value={t.days} onChange={(e) => updateTier(idx, "days", e.target.value)} placeholder="14" /> dní</>
              )}
            </span>
            <input className="tier-rate" inputMode="numeric" value={t.rate} onChange={(e) => updateTier(idx, "rate", e.target.value)} placeholder="Kč/den" />
            {idx > 0 && (
              <button className="icon-btn danger" onClick={() => removeTier(idx)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <button className="link-btn" onClick={addTier}>+ Přidat zvýhodněnou sazbu od X dní</button>
      </div>

      <div className="modal-actions">
        <button
          className="btn btn-primary"
          disabled={!canSave}
          onClick={() => {
            const cleanTiers = tiers
              .map((t) => ({ days: Number(t.days) || 1, rate: Number(t.rate) || 0 }))
              .filter((t) => t.rate > 0);
            onSave({
              name: name.trim(),
              category,
              quantityTotal: Math.max(1, Number(quantityTotal) || 1),
              dailyRate: cleanTiers[0]?.rate || baseRate,
              priceTiers: cleanTiers.length ? cleanTiers : [{ days: 1, rate: baseRate }],
            });
          }}
        >
          {initial ? "Uložit změny" : "Uložit pomůcku"}
        </button>
      </div>
    </Modal>
  );
}

function ReservationModal({ clients, items, onClose, onSave }) {
  const rentable = items.filter((i) => i.availableQty > 0 && !i.serviceFlag);
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [itemId, setItemId] = useState(rentable[0]?.id || "");
  const [quantity, setQuantity] = useState("1");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [deposit, setDeposit] = useState("");

  const selectedItem = rentable.find((i) => i.id === itemId);
  const qtyNum = Math.max(1, Number(quantity) || 1);
  const days = Math.max(1, daysBetween(startDate, endDate) + 1); // inclusive
  const rate = selectedItem ? effectiveRate(selectedItem, days) : 0;
  const price = selectedItem ? days * qtyNum * rate : 0;

  const canSave = clientId && itemId && startDate && endDate && endDate >= startDate && qtyNum <= (selectedItem?.availableQty || 0);

  return (
    <Modal title="Nová výpůjčka" onClose={onClose}>
      {clients.length === 0 || rentable.length === 0 ? (
        <div className="empty">
          {clients.length === 0 ? "Nejprve přidejte klienta." : "Žádná pomůcka není momentálně k dispozici skladem."}
        </div>
      ) : (
        <>
          <Field label="Klient *">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="field-row">
            <Field label="Pomůcka *">
              <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {rentable.map((i) => <option key={i.id} value={i.id}>{i.name} (volno {i.availableQty})</option>)}
              </select>
            </Field>
            <Field label="Počet kusů">
              <input
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Od *">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="Do *">
              <input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Kauce (Kč)">
            <input inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ""))} placeholder="500" />
          </Field>

          {selectedItem && (
            <div className="price-box">
              <div className="price-row">{days} {days === 1 ? "den" : days < 5 ? "dny" : "dní"} × {qtyNum} ks × {czk(rate)}/den</div>
              {selectedItem.priceTiers && selectedItem.priceTiers.length > 1 && (
                <div className="price-row tier-applied">použita sazba pro {days}+ dní ({czk(rate)}/den)</div>
              )}
              <div className="price-total">Celkem: <span className="mono">{czk(price)}</span></div>
              {qtyNum > selectedItem.availableQty && (
                <div className="price-warn">K dispozici je jen {selectedItem.availableQty} ks.</div>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button
              className="btn btn-primary"
              disabled={!canSave}
              onClick={() =>
                onSave({
                  clientId,
                  itemId,
                  quantity: qtyNum,
                  startDate,
                  endDate,
                  deposit: Number(deposit) || 0,
                  price,
                })
              }
            >
              Vytvořit výpůjčku
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function PaymentModal({ clients, onClose, onSave }) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Hotově");
  const [variableSymbol, setVariableSymbol] = useState("");
  const [note, setNote] = useState("");
  return (
    <Modal title="Nová platba" onClose={onClose}>
      {clients.length === 0 ? (
        <div className="empty">Nejprve přidejte klienta.</div>
      ) : (
        <>
          <Field label="Klient *">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="field-row">
            <Field label="Částka (Kč) *">
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="300" />
            </Field>
            <Field label="Způsob platby">
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option>Hotově</option>
                <option>Kartou</option>
                <option>Převodem</option>
              </select>
            </Field>
          </div>
          <Field label="Variabilní symbol">
            <input inputMode="numeric" value={variableSymbol} onChange={(e) => setVariableSymbol(e.target.value.replace(/\D/g, ""))} placeholder="např. telefon nebo číslo výpůjčky" />
          </Field>
          <Field label="Poznámka">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kauce za vozík" />
          </Field>
          <div className="modal-actions">
            <button
              className="btn btn-primary"
              disabled={!clientId || !amount}
              onClick={() => onSave({ clientId, amount: Number(amount), method, variableSymbol, note })}
            >
              Uložit platbu
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function Style() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      .app, .loading-screen {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #20281F;
        background: #F7F2E4;
        min-height: 100vh;
        color-scheme: light;
      }
      .mono { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
      .serif { font-family: Georgia, 'Times New Roman', serif; }

      .loading-screen { display:flex; align-items:center; justify-content:center; }
      .spinner { width:28px; height:28px; border-radius:50%; border:3px solid #E3DCC5; border-top-color:#2F5D3F; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .app { display: flex; }

      .sidebar {
        width: 220px;
        flex-shrink: 0;
        background: #2F5D3F;
        color: #F3EFDC;
        display: flex;
        flex-direction: column;
        padding: 20px 14px;
        min-height: 100vh;
      }
      .brand { display:flex; align-items:center; gap:10px; padding: 4px 8px 22px; }
      .brand-mark {
        width:34px; height:34px; border-radius:8px; background:#E0A343; color:#2F5D3F;
        display:flex; align-items:center; justify-content:center; font-family: Georgia, 'Times New Roman', serif; font-weight:600; font-size:18px;
      }
      .brand-title { font-family: Georgia, 'Times New Roman', serif; font-weight:600; font-size:15px; line-height:1.2; }
      .brand-sub { font-size:11px; color:#C7D9C0; letter-spacing:.02em; }

      .nav { display:flex; flex-direction:column; gap:2px; flex:1; }
      .nav-btn {
        display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:8px;
        background:transparent; border:none; color:#D7E5CE; font-size:13.5px; cursor:pointer; text-align:left;
      }
      .nav-btn:hover { background: rgba(255,255,255,0.06); color:#fff; }
      .nav-btn.active { background:#24492D; color:#fff; }
      .sidebar-foot { font-size:10.5px; color:#8FAA8A; padding: 10px 8px 0; border-top: 1px solid rgba(255,255,255,0.08); margin-top: 12px; }
      .logout-link { background:none; border:none; color:#C7D9C0; font-size:10.5px; text-decoration:underline; cursor:pointer; padding:2px 0 0; }
      .logout-link:hover { color:#fff; }

      .main { flex:1; min-width:0; }
      .topbar {
        display:flex; align-items:center; justify-content:space-between; gap:16px;
        padding: 20px 28px; border-bottom: 1px solid #E8E0C8; flex-wrap: wrap;
      }
      .topbar h1 { font-family: Georgia, 'Times New Roman', serif; font-weight:600; font-size:22px; margin:0; }
      .topbar-actions { display:flex; align-items:center; gap:10px; }

      .search { display:flex; align-items:center; gap:6px; background:#fff; border:1px solid #DDD3B8; border-radius:8px; padding:7px 10px; color:#6B6555; }
      .search input { border:none; outline:none; font-size:13px; background:transparent; width: 140px; }

      .btn { display:inline-flex; align-items:center; gap:6px; border:none; border-radius:8px; padding:9px 14px; font-size:13.5px; font-weight:500; cursor:pointer; }
      .btn-primary { background:#2F5D3F; color:#fff; }
      .btn-primary:disabled { opacity:.4; cursor:not-allowed; }
      .btn-ghost { background:#fff; color:#2F5D3F; border:1px solid #DDD3B8; }

      .content { padding: 24px 28px 60px; }

      .stat-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap:14px; margin-bottom: 30px; }
      .stat-card { background:#fff; border:1px solid #E8E0C8; border-radius:12px; padding:16px 18px; }
      .stat-num { font-family: Georgia, 'Times New Roman', serif; font-size:26px; font-weight:600; }
      .stat-label { font-size:12px; color:#6B6555; margin-top:2px; }
      .accent-danger .stat-num { color:#B5482F; }
      .accent-primary { background:#2F5D3F; }
      .accent-primary .stat-num, .accent-primary .stat-label { color:#F3EFDC; }

      .section-title { font-family: Georgia, 'Times New Roman', serif; font-size:15px; font-weight:600; margin: 8px 0 12px; }

      .grid-cards { display:grid; grid-template-columns: repeat(auto-fill, minmax(240px,1fr)); gap:14px; }
      .card { background:#fff; border:1px solid #E8E0C8; border-radius:12px; padding:16px; position:relative; }
      .card-row { display:flex; align-items:flex-start; gap:10px; }
      .grow { flex:1; min-width:0; }
      .card-title { font-weight:600; font-size:14.5px; }
      .card-sub { font-size:12px; color:#6B6555; margin-top:1px; }
      .card-line { font-size:12.5px; color:#2E3A2C; margin-top:10px; }
      .card-note { font-size:12px; color:#6B6555; margin-top:8px; background:#F7F2E4; padding:6px 8px; border-radius:6px; }
      .card-note.warn { background:#FAECE7; color:#B5482F; }
      .card-foot { font-size:11.5px; color:#8C8470; margin-top:10px; border-top:1px dashed #E8E0C8; padding-top:8px; }
      .card-foot-actions { display:flex; align-items:center; justify-content:space-between; margin-top:10px; border-top:1px dashed #E8E0C8; padding-top:8px; }

      .avatar { width:32px; height:32px; border-radius:50%; background:#EAF1F6; color:#3B6E8F; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; flex-shrink:0; }

      .stamp {
        display:inline-block; font-family:'IBM Plex Mono', monospace; font-size:10.5px; font-weight:500;
        padding:3px 8px; border-radius:5px; border:1.5px dashed currentColor; letter-spacing:.02em;
        transform: rotate(-1.5deg); white-space:nowrap;
      }

      .link-btn { display:inline-flex; align-items:center; gap:4px; background:none; border:none; color:#2F5D3F; font-size:12.5px; font-weight:500; cursor:pointer; text-decoration:underline; padding:0; }
      .link-btn:disabled { color:#B4BEBB; cursor:not-allowed; text-decoration:none; }

      .icon-btn { background:none; border:none; color:#8C8470; cursor:pointer; padding:4px; border-radius:6px; display:flex; }
      .icon-btn:hover { background:#F1ECD8; }
      .icon-btn.danger:hover { background:#FAECE7; color:#B5482F; }

      .empty { color:#8C8470; font-size:13.5px; padding: 30px 0; text-align:center; border: 1px dashed #DDD3B8; border-radius: 10px; }

      .table-wrap { background:#fff; border:1px solid #E8E0C8; border-radius:12px; overflow:hidden; }
      .table { width:100%; border-collapse:collapse; font-size:13px; }
      .table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#8C8470; padding:10px 14px; border-bottom:1px solid #E8E0C8; }
      .table td { padding:11px 14px; border-bottom:1px solid #F1ECD8; }
      .table tr:last-child td { border-bottom:none; }

      .quick-links { display:flex; flex-wrap:wrap; gap:10px; margin-top: 26px; }

      .modal-backdrop { position:fixed; inset:0; background:rgba(20,30,28,0.45); display:flex; align-items:center; justify-content:center; z-index:50; padding: 16px; }
      .modal { background:#fff; color:#20281F; border-radius:14px; width: 100%; max-width: 380px; max-height: 88vh; overflow-y:auto; color-scheme: light; }
      .modal-wide { max-width: 520px; }
      .modal-head { display:flex; align-items:center; justify-content:space-between; padding: 16px 18px; border-bottom:1px solid #E8E0C8; }
      .modal-head h3 { font-family: Georgia, 'Times New Roman', serif; font-size:16px; margin:0; font-weight:600; }
      .modal-body { padding: 16px 18px 20px; }
      .modal-actions { margin-top: 6px; }
      .modal-actions .btn { width:100%; justify-content:center; }

      .field { display:block; margin-bottom: 12px; }
      .field-label { display:block; font-size:12px; color:#6B6555; margin-bottom:5px; }
      .field-row { display:flex; gap:10px; }
      .field-row .field { flex:1; }
      .field input, .field select, .field textarea {
        width:100%; border:1px solid #DDD3B8; border-radius:8px; padding:9px 10px; font-size:13.5px; font-family:inherit; outline:none;
        background:#fff; color:#20281F; color-scheme: light;
      }
      .field input:focus, .field select:focus, .field textarea:focus { border-color:#2F5D3F; }
      .field input::placeholder, .field textarea::placeholder { color:#9AA6A3; opacity:1; }

      .stock-row { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
      .stock-pill { font-family:'IBM Plex Mono', monospace; font-size:10.5px; background:#F7F2E4; color:#2E3A2C; padding:3px 8px; border-radius:20px; border:1px solid #E8E0C8; }
      .stock-pill.stock-empty { background:#FAECE7; color:#B5482F; border-color:#F0CFC4; }
      .mini-list { display:flex; flex-direction:column; gap:5px; margin-top:8px; }

      .price-box { background:#F7F2E4; border:1px solid #E8E0C8; border-radius:10px; padding:12px 14px; margin: 4px 0 14px; }
      .price-row { font-size:12px; color:#6B6555; }
      .price-total { font-family: Georgia, 'Times New Roman', serif; font-size:18px; font-weight:600; margin-top:4px; }
      .price-warn { font-size:12px; color:#B5482F; margin-top:6px; }
      .tier-applied { color:#2F5D3F; font-weight:600; margin-top:2px; }
      .tier-hint { color:#8C8470; font-weight:400; }

      .tiers-box { background:#F7F2E4; border:1px solid #E8E0C8; border-radius:10px; padding:10px 12px; margin-bottom:14px; }
      .tier-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
      .tier-from { font-size:12.5px; color:#6B6555; display:flex; align-items:center; gap:5px; flex-shrink:0; }
      .tier-days { width:44px; border:1px solid #DDD3B8; border-radius:6px; padding:4px 6px; font-size:12.5px; text-align:center; background:#fff; color:#20281F; }
      .tier-rate { flex:1; border:1px solid #DDD3B8; border-radius:6px; padding:6px 8px; font-size:13px; background:#fff; color:#20281F; }

      .pay-select {
        font-size:11.5px; border-radius:20px; padding:3px 8px; border:1px solid; font-family:inherit; cursor:pointer;
      }
      .pay-nezaplaceno { background:#FAECE7; color:#B5482F; border-color:#F0CFC4; }
      .pay-zaloha { background:#F6F0E4; color:#8A6D3B; border-color:#EADFC4; }
      .pay-zaplaceno { background:#EAF4EE; color:#3F8D5E; border-color:#CDE7D8; }

      .nav-divider { height:1px; background:rgba(255,255,255,0.1); margin: 10px 6px; }

      .public-page { max-width: 900px; }
      .public-note {
        display:flex; align-items:center; gap:8px; font-size:12px; color:#8A6D3B;
        background:#F6F0E4; border:1px solid #EADFC4; border-radius:8px; padding:8px 12px; margin-bottom:20px;
      }
      .public-hero { margin-bottom: 24px; }
      .public-hero h2 { font-family: Georgia, 'Times New Roman', serif; font-size:22px; margin:0 0 4px; }
      .public-hero p { font-size:13px; color:#6B6555; margin:0; }
      .public-section { margin-bottom: 26px; }
      .public-cat-title { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#8C8470; margin-bottom:10px; font-weight:600; }
      .public-card { display:flex; flex-direction:column; gap:8px; }
      .public-ok { background:#EAF4EE; color:#3F8D5E; border-color:#CDE7D8; align-self:flex-start; }

      .login-card {
        background:#fff; border:1px solid #E8E0C8; border-radius:14px; padding:28px 26px;
        width:100%; max-width:340px; color-scheme:light;
      }
      .login-brand { display:flex; align-items:center; gap:10px; margin-bottom:22px; }
      .login-error {
        font-size:12.5px; color:#B5482F; background:#FAECE7; border:1px solid #F0CFC4;
        border-radius:8px; padding:8px 10px; margin-bottom:12px;
      }

      .toast {
        position:fixed; bottom: 22px; left:50%; transform:translateX(-50%);
        background:#2F5D3F; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px; z-index:60;
      }

      @media (max-width: 720px) {
        .app { flex-direction:column; }
        .sidebar { width:100%; min-height:auto; flex-direction:row; align-items:center; padding: 12px 14px; }
        .brand { padding: 0; }
        .brand-sub { display:none; }
        .nav { flex-direction:row; flex:none; margin-left:auto; }
        .nav-btn span { display:none; }
        .sidebar-foot { display:none; }
        .content { padding: 18px 16px 50px; }
        .topbar { padding: 16px; }
      }
    `}</style>
  );
}

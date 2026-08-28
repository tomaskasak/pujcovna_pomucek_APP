import React, { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { api } from "./api.js";
import {
  Style,
  PublicStockPage,
  Empty,
  Modal,
  Field,
  czk,
  todayISO,
  daysBetween,
  effectiveRate,
} from "./App.jsx";

// Samostatná, nepřihlášená stránka s dostupností pomůcek — určená pro klienty
// (např. odkaz na webu půjčovny). Nepotřebuje login, nepoužívá /api/state,
// ale samostatný veřejný endpoint bez cen a jmen klientů.
export default function PublicPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [reserveItem, setReserveItem] = useState(null); // pomůcka vybraná k rezervaci

  const loadItems = () => {
    api
      .getPublicItems()
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((e) => setError(e.message || "Načtení dostupnosti se nezdařilo."));
  };

  useEffect(() => {
    loadItems();
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
          {!error && items !== null && (
            <PublicStockPage items={items} standalone onReserve={setReserveItem} />
          )}
        </div>
      </main>

      {reserveItem && (
        <ReservationRequestModal
          item={reserveItem}
          onClose={() => setReserveItem(null)}
          onSubmitted={loadItems}
        />
      )}
    </div>
  );
}

function ReservationRequestModal({ item, onClose, onSubmitted }) {
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [quantity, setQuantity] = useState("1");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const qtyNum = Math.max(1, Number(quantity) || 1);
  const days = Math.max(1, daysBetween(startDate, endDate) + 1);
  const rate = effectiveRate(item, days);
  const price = days * qtyNum * rate;

  const canSubmit =
    clientName.trim() && clientPhone.trim() && startDate && endDate && endDate >= startDate && qtyNum <= item.availableQty;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.submitPublicReservation({
        itemId: item.id,
        quantity: qtyNum,
        startDate,
        endDate,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
      });
      setDone(true);
      onSubmitted();
    } catch (e) {
      setError(e.message || "Žádost se nepodařilo odeslat.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Modal title="Žádost odeslána" onClose={onClose}>
        <div className="reservation-success">
          <Check size={32} color="#3F8D5E" />
          <p>
            Děkujeme! Žádost o rezervaci pomůcky <strong>{item.name}</strong> jsme přijali.
            Ozveme se vám na telefon {clientPhone} a domluvíme podrobnosti.
          </p>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={onClose}>
            Zavřít
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Rezervace: ${item.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <Field label="Od *">
            <input type="date" min={todayISO()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Do *">
            <input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        {item.availableQty > 1 && (
          <Field label={`Počet kusů (skladem ${item.availableQty})`}>
            <input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        <Field label="Jméno a příjmení *">
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Jana Nováková" />
        </Field>
        <Field label="Telefon *">
          <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+420 601 123 456" />
        </Field>

        <div className="price-box">
          <div className="price-row">
            {days} {days === 1 ? "den" : days < 5 ? "dny" : "dní"} × {qtyNum} ks × {czk(rate)}/den
          </div>
          <div className="price-total">
            Orientační cena: <span className="mono">{czk(price)}</span>
          </div>
          {qtyNum > item.availableQty && <div className="price-warn">K dispozici je jen {item.availableQty} ks.</div>}
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-primary" type="submit" disabled={!canSubmit || submitting}>
            {submitting ? "Odesílám…" : "Odeslat žádost o rezervaci"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#8C8470", marginTop: 10 }}>
          Nejde o závaznou rezervaci — obsluha půjčovny žádost potvrdí telefonicky.
        </p>
      </form>
    </Modal>
  );
}

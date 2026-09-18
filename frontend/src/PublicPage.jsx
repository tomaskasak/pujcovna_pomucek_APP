import React, { useState, useEffect } from "react";
import { Check, ChevronLeft, ChevronRight, Phone, Mail } from "lucide-react";
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
          <h1>REHARENT Krkonoše — Půjčovna rehabilitačních pomůcek a motodlah</h1>
          <div className="public-contact">
            <a className="public-contact-link" href="tel:+420705919580">
              <Phone size={15} /> +420 705 919 580
            </a>
            <a className="public-contact-link" href="mailto:info@reharentkrkonose.cz">
              <Mail size={15} /> info@reharentkrkonose.cz
            </a>
          </div>
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

const MONTH_NAMES = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];
const DOW_LABELS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function pad2(n) {
  return String(n).padStart(2, "0");
}
function isoOf(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}
// den v týdnu s pondělím jako prvním (0=Po ... 6=Ne)
function mondayFirstDow(y, m, d) {
  return (new Date(y, m, d).getDay() + 6) % 7;
}
function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}
// stav dne podle obsazených termínů: 'booked' = jistě obsazeno, 'open' = flexibilní
// výpůjčka bez známého konce (může být obsazeno déle, není jisté), 'free' = volno
function dayStatus(iso, ranges) {
  let open = false;
  for (const r of ranges) {
    if (iso < r.start) continue;
    if (!r.end) {
      open = true;
      continue;
    }
    if (iso <= r.end) return "booked";
  }
  return open ? "open" : "free";
}

// Kalendář dostupnosti — vizuálně ukáže, které dny jsou u pomůcky obsazené,
// a kliknutím na volný den v budoucnu jde nastavit datum "od".
function AvailabilityCalendar({ bookedRanges, selectedDate, onSelectDate }) {
  const today = todayISO();
  const base = selectedDate && selectedDate >= today ? selectedDate : today;
  const [viewY, setViewY] = useState(Number(base.slice(0, 4)));
  const [viewM, setViewM] = useState(Number(base.slice(5, 7)) - 1); // 0-indexed

  const isCurrentMonth = isoOf(viewY, viewM, 1).slice(0, 7) === today.slice(0, 7);
  const leadBlanks = mondayFirstDow(viewY, viewM, 1);
  const total = daysInMonth(viewY, viewM);
  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  const goPrev = () => {
    if (isCurrentMonth) return;
    if (viewM === 0) { setViewY((y) => y - 1); setViewM(11); } else { setViewM((m) => m - 1); }
  };
  const goNext = () => {
    if (viewM === 11) { setViewY((y) => y + 1); setViewM(0); } else { setViewM((m) => m + 1); }
  };

  return (
    <div className="avail-cal">
      <div className="avail-cal-head">
        <button type="button" className="avail-cal-nav" onClick={goPrev} disabled={isCurrentMonth} aria-label="Předchozí měsíc">
          <ChevronLeft size={15} />
        </button>
        <div className="avail-cal-head-title">{MONTH_NAMES[viewM]} {viewY}</div>
        <button type="button" className="avail-cal-nav" onClick={goNext} aria-label="Další měsíc">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="avail-cal-grid">
        {DOW_LABELS.map((d) => <div className="avail-cal-dow" key={d}>{d}</div>)}
        {cells.map((d, idx) => {
          if (d === null) return <div key={`b${idx}`} className="avail-day avail-day-blank" />;
          const iso = isoOf(viewY, viewM, d);
          const isPast = iso < today;
          const status = isPast ? "past" : dayStatus(iso, bookedRanges);
          const clickable = !isPast && status !== "booked";
          const cls = ["avail-day", `avail-day-${status}`, iso === selectedDate ? "avail-day-selected" : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              type="button"
              key={iso}
              className={cls}
              disabled={!clickable}
              onClick={() => clickable && onSelectDate(iso)}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="avail-legend">
        <div className="avail-legend-item"><span className="avail-legend-dot" style={{ background: "#EAF4EE" }} /> volno</div>
        <div className="avail-legend-item"><span className="avail-legend-dot" style={{ background: "#FAECE7" }} /> obsazeno</div>
        <div className="avail-legend-item"><span className="avail-legend-dot" style={{ background: "#EADFC4" }} /> nejisté (flexibilní výpůjčka)</div>
      </div>
    </div>
  );
}

function ReservationRequestModal({ item, onClose, onSubmitted }) {
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  // klient často předem neví, kdy pomůcku vrátí — pak se datum "Do" nevyplňuje
  const [openEnded, setOpenEnded] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const qtyNum = Math.max(1, Number(quantity) || 1);
  const days = Math.max(1, daysBetween(startDate, openEnded ? startDate : endDate) + 1);
  const rate = effectiveRate(item, days);
  const price = days * qtyNum * rate;
  const notAvailableNow = qtyNum > item.availableQty;

  const canSubmit =
    clientName.trim() &&
    clientPhone.trim() &&
    startDate &&
    (openEnded || (endDate && endDate >= startDate)) &&
    qtyNum <= item.quantityTotal;

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
        endDate: openEnded ? null : endDate,
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
            {notAvailableNow
              ? " Pomůcka je teď půjčená — ozveme se vám na telefon, jakmile se uvolní."
              : ` Ozveme se vám na telefon ${clientPhone} a domluvíme podrobnosti.`}
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
        <AvailabilityCalendar
          bookedRanges={item.bookedRanges || []}
          selectedDate={startDate}
          onSelectDate={(iso) => {
            setStartDate(iso);
            if (!openEnded && endDate < iso) setEndDate(iso);
          }}
        />
        <div className="field-row">
          <Field label="Od *">
            <input type="date" min={todayISO()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Do *">
            <input
              type="date"
              min={startDate}
              value={endDate}
              disabled={openEnded}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} />
          Datum vrácení zatím nevím
        </label>
        <Field label={`Počet kusů${item.quantityTotal > 1 ? ` (celkem máme ${item.quantityTotal})` : ""}`}>
          <input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Jméno a příjmení *">
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Jana Nováková" />
        </Field>
        <Field label="Telefon *">
          <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+420 601 123 456" />
        </Field>

        <div className="price-box">
          {openEnded ? (
            <div className="price-row tier-applied">cena bude upřesněna podle skutečné doby zápůjčky</div>
          ) : (
            <>
              <div className="price-row">
                {days} {days === 1 ? "den" : days < 5 ? "dny" : "dní"} × {qtyNum} ks × {czk(rate)}/den
              </div>
              <div className="price-total">
                Orientační cena: <span className="mono">{czk(price)}</span>
              </div>
            </>
          )}
          {notAvailableNow && (
            <div className="price-warn">
              Pomůcka je teď půjčená (volno {item.availableQty} z {item.quantityTotal} ks) — žádost i tak
              odešleme, ozveme se, jakmile bude volná.
            </div>
          )}
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-primary" type="submit" disabled={!canSubmit || submitting}>
            {submitting ? "Odesílám…" : notAvailableNow ? "Odeslat rezervaci na později" : "Odeslat žádost o rezervaci"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#8C8470", marginTop: 10 }}>
          Nejde o závaznou rezervaci — obsluha půjčovny žádost potvrdí telefonicky.
        </p>
      </form>
    </Modal>
  );
}

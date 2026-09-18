import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapReservation, mapService } from "../mappers.js";
import { effectiveRate, daysBetween } from "../pricing.js";
import { notifyNewReservationRequest } from "../mailer.js";

const router = Router();

// Bez přihlášení — jen název, kategorie, cena/den, dostupnost a obsazené
// termíny (bez jmen klientů, jen pro kalendář).
router.get(
  "/items",
  asyncHandler(async (req, res) => {
    const [items, agg, ranges] = await Promise.all([
      pool.query(`SELECT * FROM items ORDER BY name`),
      pool.query(
        `SELECT item_id, COALESCE(SUM(quantity), 0) AS rented
         FROM reservations WHERE status IN ('active', 'pending') GROUP BY item_id`
      ),
      // Termíny (bez jmen klientů) pro kalendář dostupnosti na veřejné stránce —
      // end_date NULL = flexibilní výpůjčka bez známého konce, kalendář to ukáže
      // jako "možná stále obsazeno" až do konce zobrazeného měsíce.
      pool.query(
        `SELECT item_id, start_date, end_date FROM reservations
         WHERE status IN ('active', 'pending') ORDER BY start_date`
      ),
    ]);
    const rentedByItem = Object.fromEntries(agg.rows.map((r) => [r.item_id, Number(r.rented)]));
    const rangesByItem = {};
    ranges.rows.forEach((r) => {
      (rangesByItem[r.item_id] = rangesByItem[r.item_id] || []).push({ start: r.start_date, end: r.end_date });
    });

    const result = items.rows
      .filter((it) => !it.service_flag)
      .map((it) => {
        const availableQty = Math.max(0, it.quantity_total - (rentedByItem[it.id] || 0));
        return {
          id: it.id,
          name: it.name,
          category: it.category || "",
          dailyRate: it.daily_rate,
          priceTiers: it.price_tiers || [],
          quantityTotal: it.quantity_total,
          availableQty,
          bookedRanges: rangesByItem[it.id] || [],
        };
      });

    res.json(result);
  })
);

// Doplňkové služby (doprava, montáž apod.) pro zobrazení na veřejné stránce.
router.get(
  "/services",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM services ORDER BY sort_order`);
    res.json(rows.map(mapService));
  })
);

// Odeslání žádosti o rezervaci z veřejné stránky. Vytvoří se jako "pending" —
// nezapíše se rovnou jako závazná výpůjčka, obsluha ji musí schválit v appce.
// Jde odeslat i na pomůcku, která je zrovna celá půjčená (nezávazná rezervace
// do fronty — obsluha ji schválí, až se pomůcka uvolní), a i bez data konce
// (klient si termín vrácení zatím není jistý).
router.post(
  "/reservations",
  asyncHandler(async (req, res) => {
    const { itemId, quantity, startDate, endDate, clientName, clientPhone } = req.body || {};

    if (!itemId || !startDate || (endDate && endDate < startDate)) {
      return res.status(400).json({ error: "Vyplňte prosím platné datum." });
    }
    if (!clientName || !clientName.trim() || !clientPhone || !clientPhone.trim()) {
      return res.status(400).json({ error: "Vyplňte prosím jméno a telefon." });
    }

    const { rows: itemRows } = await pool.query(`SELECT * FROM items WHERE id = $1 AND service_flag = false`, [itemId]);
    if (itemRows.length === 0) {
      return res.status(404).json({ error: "Pomůcka nenalezena." });
    }
    const item = itemRows[0];
    // appka eviduje max tolik kusů, kolik jich fyzicky vlastníš — víc smysl nedává ani ve frontě
    const qty = Math.min(item.quantity_total, Math.max(1, Number(quantity) || 1));

    // najít existujícího klienta podle telefonu, jinak založit nového
    let clientId;
    const { rows: existingClient } = await pool.query(`SELECT id FROM clients WHERE phone = $1 LIMIT 1`, [
      clientPhone.trim(),
    ]);
    if (existingClient.length > 0) {
      clientId = existingClient[0].id;
    } else {
      const { rows: newClient } = await pool.query(`INSERT INTO clients (name, phone) VALUES ($1, $2) RETURNING id`, [
        clientName.trim(),
        clientPhone.trim(),
      ]);
      clientId = newClient[0].id;
    }

    // bez data konce (klient neví, kdy vrátí) appka cenu zatím neumí spočítat —
    // obsluha ji doplní/upraví při schválení, až bude znát skutečnou dobu
    let price = 0;
    if (endDate) {
      const days = Math.max(1, daysBetween(startDate, endDate) + 1);
      const rate = effectiveRate(item.price_tiers, item.daily_rate, days);
      price = days * qty * rate;
    }

    const { rows } = await pool.query(
      `INSERT INTO reservations (client_id, item_id, quantity, start_date, end_date, deposit, price, status, payment_status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, 'pending', 'nezaplaceno') RETURNING *`,
      [clientId, itemId, qty, startDate, endDate || null, price]
    );
    res.status(201).json(mapReservation(rows[0]));

    // Notifikace mailem se posílá až po odpovědi klientovi — nesmí zpomalit ani
    // shodit odeslání žádosti, pokud by e-mail selhal.
    notifyNewReservationRequest({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      itemName: item.name,
      startDate,
      endDate,
      quantity: qty,
    });
  })
);

export default router;

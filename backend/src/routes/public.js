import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapReservation } from "../mappers.js";
import { effectiveRate, daysBetween } from "../pricing.js";
import { notifyNewReservationRequest } from "../mailer.js";

const router = Router();

// Bez přihlášení — jen název, kategorie, cena/den a dostupnost. Žádná jména klientů.
// Do "obsazeno" počítáme i nevyřízené (pending) žádosti, aby dva zákazníci nemohli
// najednou žádat o poslední kus téže pomůcky.
router.get(
  "/items",
  asyncHandler(async (req, res) => {
    const [items, agg] = await Promise.all([
      pool.query(`SELECT * FROM items ORDER BY name`),
      pool.query(
        `SELECT item_id, COALESCE(SUM(quantity), 0) AS rented
         FROM reservations WHERE status IN ('active', 'pending') GROUP BY item_id`
      ),
    ]);
    const rentedByItem = Object.fromEntries(agg.rows.map((r) => [r.item_id, Number(r.rented)]));

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
          availableQty,
        };
      });

    res.json(result);
  })
);

// Odeslání žádosti o rezervaci z veřejné stránky. Vytvoří se jako "pending" —
// nezapíše se rovnou jako závazná výpůjčka, obsluha ji musí schválit v appce.
router.post(
  "/reservations",
  asyncHandler(async (req, res) => {
    const { itemId, quantity, startDate, endDate, clientName, clientPhone } = req.body || {};

    if (!itemId || !startDate || !endDate || endDate < startDate) {
      return res.status(400).json({ error: "Vyplňte prosím platné datum od–do." });
    }
    if (!clientName || !clientName.trim() || !clientPhone || !clientPhone.trim()) {
      return res.status(400).json({ error: "Vyplňte prosím jméno a telefon." });
    }
    const qty = Math.max(1, Number(quantity) || 1);

    const { rows: itemRows } = await pool.query(`SELECT * FROM items WHERE id = $1 AND service_flag = false`, [itemId]);
    if (itemRows.length === 0) {
      return res.status(404).json({ error: "Pomůcka nenalezena." });
    }
    const item = itemRows[0];

    const { rows: reservedRows } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS reserved FROM reservations WHERE item_id = $1 AND status IN ('active', 'pending')`,
      [itemId]
    );
    const availableQty = item.quantity_total - Number(reservedRows[0].reserved);
    if (qty > availableQty) {
      return res.status(409).json({ error: `Bohužel je momentálně k dispozici jen ${availableQty} ks.` });
    }

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

    const days = Math.max(1, daysBetween(startDate, endDate) + 1);
    const rate = effectiveRate(item.price_tiers, item.daily_rate, days);
    const price = days * qty * rate;

    const { rows } = await pool.query(
      `INSERT INTO reservations (client_id, item_id, quantity, start_date, end_date, deposit, price, status, payment_status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, 'pending', 'nezaplaceno') RETURNING *`,
      [clientId, itemId, qty, startDate, endDate, price]
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

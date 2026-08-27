import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapReservation } from "../mappers.js";

const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { clientId, itemId, quantity, startDate, endDate, deposit, price } = req.body || {};
    if (!clientId || !itemId || !startDate || !endDate || endDate < startDate) {
      return res.status(400).json({ error: "Chybí povinné údaje výpůjčky." });
    }

    const { rows: itemRows } = await pool.query(`SELECT quantity_total FROM items WHERE id = $1`, [itemId]);
    if (itemRows.length === 0) {
      return res.status(404).json({ error: "Pomůcka nenalezena." });
    }
    const { rows: activeRows } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS rented FROM reservations WHERE item_id = $1 AND status = 'active'`,
      [itemId]
    );
    const availableQty = itemRows[0].quantity_total - Number(activeRows[0].rented);
    const qty = Math.max(1, Number(quantity) || 1);
    if (qty > availableQty) {
      return res.status(409).json({ error: `K dispozici je jen ${availableQty} ks.` });
    }

    const { rows } = await pool.query(
      `INSERT INTO reservations (client_id, item_id, quantity, start_date, end_date, deposit, price, status, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'nezaplaceno') RETURNING *`,
      [clientId, itemId, qty, startDate, endDate, Number(deposit) || 0, Number(price) || 0]
    );
    res.status(201).json(mapReservation(rows[0]));
  })
);

router.put(
  "/:id/return",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE reservations SET status = 'returned', returned_at = CURRENT_DATE WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Výpůjčka nenalezena." });
    }
    res.json(mapReservation(rows[0]));
  })
);

router.put(
  "/:id/payment-status",
  asyncHandler(async (req, res) => {
    const { paymentStatus } = req.body || {};
    if (!["nezaplaceno", "zaloha", "zaplaceno"].includes(paymentStatus)) {
      return res.status(400).json({ error: "Neplatný stav platby." });
    }
    const { rows } = await pool.query(`UPDATE reservations SET payment_status = $1 WHERE id = $2 RETURNING *`, [
      paymentStatus,
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Výpůjčka nenalezena." });
    }
    res.json(mapReservation(rows[0]));
  })
);

export default router;

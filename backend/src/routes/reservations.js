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

// Úprava existující výpůjčky/žádosti (termín, počet kusů, kauce, cena).
// Klient ani pomůcka se tu nemění — jen skutečné parametry výpůjčky.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(`SELECT * FROM reservations WHERE id = $1`, [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Výpůjčka nenalezena." });
    }
    const existing = existingRows[0];
    const patch = req.body || {};

    const quantity = patch.quantity !== undefined ? Math.max(1, Number(patch.quantity) || 1) : existing.quantity;
    const startDate = patch.startDate !== undefined ? patch.startDate : existing.start_date;
    const endDate = patch.endDate !== undefined ? patch.endDate : existing.end_date;
    const deposit = patch.deposit !== undefined ? Number(patch.deposit) || 0 : existing.deposit;
    const price = patch.price !== undefined ? Number(patch.price) || 0 : existing.price;

    if (!startDate || !endDate || endDate < startDate) {
      return res.status(400).json({ error: "Datum konce nesmí být před datem začátku." });
    }

    // mění-li se množství u aktivní/nevyřízené výpůjčky, ověřit dostupnost (bez počítání sebe sama)
    if (quantity !== existing.quantity && (existing.status === "active" || existing.status === "pending")) {
      const { rows: itemRows } = await pool.query(`SELECT quantity_total FROM items WHERE id = $1`, [existing.item_id]);
      if (itemRows.length > 0) {
        const { rows: otherRows } = await pool.query(
          `SELECT COALESCE(SUM(quantity), 0) AS rented FROM reservations
           WHERE item_id = $1 AND status IN ('active', 'pending') AND id != $2`,
          [existing.item_id, req.params.id]
        );
        const availableQty = itemRows[0].quantity_total - Number(otherRows[0].rented);
        if (quantity > availableQty) {
          return res.status(409).json({ error: `K dispozici je jen ${availableQty} ks.` });
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE reservations SET quantity = $1, start_date = $2, end_date = $3, deposit = $4, price = $5 WHERE id = $6 RETURNING *`,
      [quantity, startDate, endDate, deposit, price, req.params.id]
    );
    res.json(mapReservation(rows[0]));
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

// Vrátit omylem/předčasně vrácenou výpůjčku zpět mezi aktivní.
router.put(
  "/:id/unreturn",
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(`SELECT * FROM reservations WHERE id = $1`, [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Výpůjčka nenalezena." });
    }
    const reservation = existingRows[0];
    if (reservation.status !== "returned") {
      return res.status(409).json({ error: "Tuto výpůjčku nelze vrátit zpět — není vedená jako vrácená." });
    }

    // bezpečnostní kontrola dostupnosti — mezitím mohl pomůcku dostat jiný aktivní zápis
    if (reservation.item_id) {
      const { rows: itemRows } = await pool.query(`SELECT quantity_total FROM items WHERE id = $1`, [reservation.item_id]);
      if (itemRows.length > 0) {
        const { rows: activeRows } = await pool.query(
          `SELECT COALESCE(SUM(quantity), 0) AS rented FROM reservations WHERE item_id = $1 AND status = 'active'`,
          [reservation.item_id]
        );
        const availableQty = itemRows[0].quantity_total - Number(activeRows[0].rented);
        if (reservation.quantity > availableQty) {
          return res.status(409).json({ error: `Nelze vrátit zpět — k dispozici je jen ${availableQty} ks.` });
        }
      }
    }

    const { rows } = await pool.query(
      `UPDATE reservations SET status = 'active', returned_at = NULL WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(mapReservation(rows[0]));
  })
);

// Schválení žádosti podané z veřejné stránky — stane se z ní normální aktivní výpůjčka.
router.put(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(`SELECT * FROM reservations WHERE id = $1`, [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Žádost nenalezena." });
    }
    const reservation = existingRows[0];
    if (reservation.status !== "pending") {
      return res.status(409).json({ error: "Tuto žádost už nelze schválit." });
    }

    // bezpečnostní kontrola dostupnosti — mezitím mohla vzniknout jiná aktivní výpůjčka
    const { rows: itemRows } = await pool.query(`SELECT quantity_total FROM items WHERE id = $1`, [reservation.item_id]);
    if (itemRows.length === 0) {
      return res.status(404).json({ error: "Pomůcka nenalezena." });
    }
    const { rows: activeRows } = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS rented FROM reservations WHERE item_id = $1 AND status = 'active'`,
      [reservation.item_id]
    );
    const availableQty = itemRows[0].quantity_total - Number(activeRows[0].rented);
    if (reservation.quantity > availableQty) {
      return res.status(409).json({ error: `Nelze schválit — k dispozici je jen ${availableQty} ks.` });
    }

    const { rows } = await pool.query(`UPDATE reservations SET status = 'active' WHERE id = $1 RETURNING *`, [req.params.id]);
    res.json(mapReservation(rows[0]));
  })
);

router.put(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE reservations SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Žádost nenalezena nebo už byla vyřízena." });
    }
    res.json(mapReservation(rows[0]));
  })
);

// Smazání výpůjčky/žádosti — pro opravu omylů (nesprávně vytvořená výpůjčka apod.).
// Záměrně bez omezení na stav: frontend si před smazáním vyžádá potvrzení.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`DELETE FROM reservations WHERE id = $1 RETURNING id`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Výpůjčka nenalezena." });
    }
    res.status(204).end();
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

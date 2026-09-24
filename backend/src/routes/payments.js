import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapPayment } from "../mappers.js";

const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { clientId, reservationId, amount, method, variableSymbol, note } = req.body || {};
    if (!clientId || !(Number(amount) > 0)) {
      return res.status(400).json({ error: "Klient a částka jsou povinné." });
    }
    const { rows } = await pool.query(
      `INSERT INTO payments (client_id, reservation_id, date, amount, method, variable_symbol, note)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6) RETURNING *`,
      [clientId, reservationId || null, Number(amount) || 0, method || null, variableSymbol || null, note || null]
    );
    res.status(201).json(mapPayment(rows[0]));
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rows: existingRows } = await pool.query(`SELECT * FROM payments WHERE id = $1`, [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Platba nenalezena." });
    }
    const existing = existingRows[0];
    const patch = req.body || {};

    const date = patch.date !== undefined ? patch.date : existing.date;
    const amount = patch.amount !== undefined ? Number(patch.amount) || 0 : existing.amount;
    const method = patch.method !== undefined ? patch.method || null : existing.method;
    const variableSymbol = patch.variableSymbol !== undefined ? patch.variableSymbol || null : existing.variable_symbol;
    const note = patch.note !== undefined ? patch.note || null : existing.note;

    if (!(amount > 0)) {
      return res.status(400).json({ error: "Částka musí být kladná." });
    }

    const { rows } = await pool.query(
      `UPDATE payments SET date = $1, amount = $2, method = $3, variable_symbol = $4, note = $5 WHERE id = $6 RETURNING *`,
      [date, amount, method, variableSymbol, note, id]
    );
    res.json(mapPayment(rows[0]));
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await pool.query(`DELETE FROM payments WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  })
);

export default router;

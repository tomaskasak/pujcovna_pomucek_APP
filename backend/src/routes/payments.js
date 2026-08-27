import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapPayment } from "../mappers.js";

const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { clientId, amount, method, variableSymbol, note } = req.body || {};
    if (!clientId || !(Number(amount) > 0)) {
      return res.status(400).json({ error: "Klient a částka jsou povinné." });
    }
    const { rows } = await pool.query(
      `INSERT INTO payments (client_id, date, amount, method, variable_symbol, note)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5) RETURNING *`,
      [clientId, Number(amount) || 0, method || null, variableSymbol || null, note || null]
    );
    res.status(201).json(mapPayment(rows[0]));
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

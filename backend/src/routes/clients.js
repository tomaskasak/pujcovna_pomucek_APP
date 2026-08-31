import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapClient } from "../mappers.js";

const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, phone, address, note } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Jméno klienta je povinné." });
    }
    const { rows } = await pool.query(
      `INSERT INTO clients (name, phone, address, note) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), phone || null, address || null, note || null]
    );
    res.status(201).json(mapClient(rows[0]));
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rows: existingRows } = await pool.query(`SELECT * FROM clients WHERE id = $1`, [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Klient nenalezen." });
    }
    const existing = existingRows[0];
    const patch = req.body || {};

    const name = patch.name !== undefined ? String(patch.name).trim() : existing.name;
    if (!name) {
      return res.status(400).json({ error: "Jméno klienta je povinné." });
    }
    const phone = patch.phone !== undefined ? patch.phone : existing.phone;
    const address = patch.address !== undefined ? patch.address : existing.address;
    const note = patch.note !== undefined ? patch.note : existing.note;

    const { rows } = await pool.query(
      `UPDATE clients SET name = $1, phone = $2, address = $3, note = $4 WHERE id = $5 RETURNING *`,
      [name, phone || null, address || null, note || null, id]
    );
    res.json(mapClient(rows[0]));
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    // stejné pravidlo jako v prototypu: klienta s jakoukoli výpůjčkou (i historickou) nelze smazat
    const { rows: refs } = await pool.query(`SELECT 1 FROM reservations WHERE client_id = $1 LIMIT 1`, [id]);
    if (refs.length > 0) {
      return res.status(409).json({ error: "Klient má výpůjčky, nelze smazat." });
    }
    const { rowCount } = await pool.query(`DELETE FROM clients WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Klient nenalezen." });
    }
    res.status(204).end();
  })
);

export default router;

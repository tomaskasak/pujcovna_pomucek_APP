import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapItem } from "../mappers.js";

const router = Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, category, quantityTotal, dailyRate, priceTiers } = req.body || {};
    if (!name || !name.trim() || !(Number(dailyRate) > 0)) {
      return res.status(400).json({ error: "Název a cena jsou povinné." });
    }
    const { rows } = await pool.query(
      `INSERT INTO items (name, category, quantity_total, daily_rate, price_tiers, service_flag)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
      [
        name.trim(),
        category || null,
        Math.max(1, Number(quantityTotal) || 1),
        Number(dailyRate) || 0,
        JSON.stringify(priceTiers && priceTiers.length ? priceTiers : [{ days: 1, rate: Number(dailyRate) || 0 }]),
      ]
    );
    res.status(201).json(mapItem(rows[0]));
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rows: existingRows } = await pool.query(`SELECT * FROM items WHERE id = $1`, [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Pomůcka nenalezena." });
    }
    const existing = existingRows[0];
    const patch = req.body || {};

    const name = patch.name !== undefined ? String(patch.name).trim() : existing.name;
    const category = patch.category !== undefined ? patch.category : existing.category;
    const quantityTotal =
      patch.quantityTotal !== undefined ? Math.max(1, Number(patch.quantityTotal) || 1) : existing.quantity_total;
    const dailyRate = patch.dailyRate !== undefined ? Number(patch.dailyRate) || 0 : existing.daily_rate;
    const priceTiers = patch.priceTiers !== undefined ? patch.priceTiers : existing.price_tiers;
    const serviceFlag = patch.serviceFlag !== undefined ? !!patch.serviceFlag : existing.service_flag;

    const { rows } = await pool.query(
      `UPDATE items SET name = $1, category = $2, quantity_total = $3, daily_rate = $4, price_tiers = $5, service_flag = $6
       WHERE id = $7 RETURNING *`,
      [name, category, quantityTotal, dailyRate, JSON.stringify(priceTiers), serviceFlag, id]
    );
    res.json(mapItem(rows[0]));
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    // stejné pravidlo jako v prototypu: blokovat smazání jen při AKTIVNÍ výpůjčce
    const { rows: active } = await pool.query(
      `SELECT 1 FROM reservations WHERE item_id = $1 AND status = 'active' LIMIT 1`,
      [id]
    );
    if (active.length > 0) {
      return res.status(409).json({ error: "Pomůcka má aktivní výpůjčku." });
    }
    const { rowCount } = await pool.query(`DELETE FROM items WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Pomůcka nenalezena." });
    }
    res.status(204).end();
  })
);

// Nahrání fotky k pomůcce — appka posílá už zmenšený/zkomprimovaný obrázek
// jako base64 (frontend to zmenší přes canvas před odesláním).
router.post(
  "/:id/photos",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data, contentType } = req.body || {};
    if (!data || !contentType) {
      return res.status(400).json({ error: "Chybí data fotky." });
    }
    const { rows: existing } = await pool.query(`SELECT 1 FROM items WHERE id = $1`, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Pomůcka nenalezena." });
    }
    const { rows: countRows } = await pool.query(`SELECT count(*)::int AS n FROM item_photos WHERE item_id = $1`, [id]);
    const buffer = Buffer.from(data, "base64");
    const { rows } = await pool.query(
      `INSERT INTO item_photos (item_id, data, content_type, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
      [id, buffer, contentType, countRows[0].n]
    );
    res.status(201).json({ id: rows[0].id });
  })
);

router.delete(
  "/:id/photos/:photoId",
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(`DELETE FROM item_photos WHERE id = $1 AND item_id = $2`, [
      req.params.photoId,
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Fotka nenalezena." });
    }
    res.status(204).end();
  })
);

export default router;

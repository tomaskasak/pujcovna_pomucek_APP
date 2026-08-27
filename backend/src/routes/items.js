import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapItem } from "../mappers.js";
import { OFFICIAL_PRICELIST } from "../pricelist.js";

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

// Doplní do databáze položky z oficiálního ceníku, které tam ještě nejsou (podle názvu).
router.post(
  "/seed-pricelist",
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(`SELECT name FROM items`);
    const existingNames = new Set(existingRows.map((r) => r.name.toLowerCase()));
    const toAdd = OFFICIAL_PRICELIST.filter((p) => !existingNames.has(p.name.toLowerCase()));

    const added = [];
    for (const p of toAdd) {
      const priceTiers = p.priceTiers && p.priceTiers.length ? p.priceTiers : [{ days: 1, rate: p.dailyRate }];
      const { rows } = await pool.query(
        `INSERT INTO items (name, category, quantity_total, daily_rate, price_tiers, service_flag)
         VALUES ($1, $2, 1, $3, $4, false) RETURNING *`,
        [p.name, p.category, p.dailyRate, JSON.stringify(priceTiers)]
      );
      added.push(mapItem(rows[0]));
    }
    res.status(201).json(added);
  })
);

export default router;

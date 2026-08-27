import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

// Bez přihlášení — jen název, kategorie, cena/den a dostupnost. Žádná jména klientů.
router.get(
  "/items",
  asyncHandler(async (req, res) => {
    const [items, activeAgg] = await Promise.all([
      pool.query(`SELECT * FROM items ORDER BY name`),
      pool.query(
        `SELECT item_id, COALESCE(SUM(quantity), 0) AS rented
         FROM reservations WHERE status = 'active' GROUP BY item_id`
      ),
    ]);
    const rentedByItem = Object.fromEntries(activeAgg.rows.map((r) => [r.item_id, Number(r.rented)]));

    const result = items.rows
      .filter((it) => !it.service_flag)
      .map((it) => {
        const availableQty = Math.max(0, it.quantity_total - (rentedByItem[it.id] || 0));
        return {
          id: it.id,
          name: it.name,
          category: it.category || "",
          dailyRate: it.daily_rate,
          availableQty,
        };
      });

    res.json(result);
  })
);

export default router;

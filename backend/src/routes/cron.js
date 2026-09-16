import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { sendWeeklySummary } from "../mailer.js";

// Bez přihlášení (volá to zvenčí naplánovaná GitHub Actions úloha, ne
// přihlášený člověk) — chráněno tajným tokenem v CRON_SECRET. Slouží ke
// dvěma věcem najednou:
//  1) drží databázi "aktivní" — bezplatný Supabase projekt se po týdnu
//     bez jakéhokoli požadavku sám pozastaví, tenhle dotaz tomu zabrání
//  2) s ?notify=1 navíc pošle mailem pravidelný přehled (viz README)
const router = Router();

router.get(
  "/keep-alive",
  asyncHandler(async (req, res) => {
    if (!process.env.CRON_SECRET || req.query.secret !== process.env.CRON_SECRET) {
      return res.status(403).json({ error: "Neplatný nebo chybějící token." });
    }

    const [totalItemsRes, activeRes, overdueRes, revenueRes, pendingRes] = await Promise.all([
      pool.query(`SELECT count(*)::int AS n FROM items`),
      pool.query(`SELECT count(*)::int AS n FROM reservations WHERE status = 'active'`),
      pool.query(
        `SELECT count(*)::int AS n FROM reservations WHERE status = 'active' AND end_date IS NOT NULL AND end_date < CURRENT_DATE`
      ),
      pool.query(`SELECT COALESCE(sum(amount), 0)::int AS n FROM payments WHERE date >= date_trunc('month', CURRENT_DATE)`),
      pool.query(`SELECT count(*)::int AS n FROM reservations WHERE status = 'pending'`),
    ]);

    const stats = {
      totalItems: totalItemsRes.rows[0].n,
      activeReservations: activeRes.rows[0].n,
      overdue: overdueRes.rows[0].n,
      revenueThisMonth: revenueRes.rows[0].n,
      pendingRequests: pendingRes.rows[0].n,
    };

    const notified = req.query.notify === "1";
    if (notified) {
      await sendWeeklySummary(stats);
    }

    res.json({ ok: true, stats, notified });
  })
);

// Appka na Renderu je při přímém dotazu na web blokovaná ochranou
// WEDOS.protection (funguje jen z jiných sítí, např. GitHub Actions).
// Aktuální ceny proto jednou týdně stáhne a rozparsuje GitHub Actions
// úloha (viz scripts/sync-pricelist.py) a pošle je sem — tenhle route je
// jen přijme a promítne do databáze. Chráněno stejným CRON_SECRET.
router.post(
  "/sync-pricelist",
  asyncHandler(async (req, res) => {
    if (!process.env.CRON_SECRET || req.query.secret !== process.env.CRON_SECRET) {
      return res.status(403).json({ error: "Neplatný nebo chybějící token." });
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const { rows: existingRows } = await pool.query(`SELECT id, name FROM items`);
    const existingByName = new Map(existingRows.map((r) => [r.name.toLowerCase(), r.id]));

    const updated = [];
    const added = [];
    for (const p of items) {
      if (!p.name || !(Number(p.dailyRate) > 0)) continue;
      const priceTiers =
        p.priceTiers && p.priceTiers.length ? p.priceTiers : [{ days: 1, rate: Number(p.dailyRate) }];
      const existingId = existingByName.get(p.name.toLowerCase());
      if (existingId) {
        await pool.query(`UPDATE items SET daily_rate = $1, price_tiers = $2 WHERE id = $3`, [
          Number(p.dailyRate),
          JSON.stringify(priceTiers),
          existingId,
        ]);
        updated.push(p.name);
      } else {
        await pool.query(
          `INSERT INTO items (name, category, quantity_total, daily_rate, price_tiers, service_flag)
           VALUES ($1, $2, 1, $3, $4, false)`,
          [p.name, p.category || null, Number(p.dailyRate), JSON.stringify(priceTiers)]
        );
        added.push(p.name);
      }
    }

    res.json({ ok: true, updated, added });
  })
);

export default router;

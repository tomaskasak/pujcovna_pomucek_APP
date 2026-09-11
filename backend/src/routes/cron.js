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
    if (!process.env.CRON_SECRET) {
      return res.status(400).json({ error: "CRON_SECRET není na serveru vůbec nastavený — ulož ho v Render Environment." });
    }
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(403).json({
        error: "Zadaný token nesedí s hodnotou uloženou na serveru.",
        hint: `Server má token dlouhý ${process.env.CRON_SECRET.length} znaků, začínající na "${process.env.CRON_SECRET.slice(0, 4)}".`,
      });
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

export default router;

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

// DOČASNÉ — appka na Renderu se na veřejný web dostane (na rozdíl od
// vývojového sandboxu), takhle si přes ni jde ověřit, jak reálně vypadá HTML
// stránky s ceníkem, aby šlo napsat skutečný parser. Po dokončení se má
// tenhle route zase odstranit.
router.get(
  "/inspect-pricelist",
  asyncHandler(async (req, res) => {
    if (!process.env.CRON_SECRET || req.query.secret !== process.env.CRON_SECRET) {
      return res.status(403).json({ error: "Neplatný nebo chybějící token." });
    }
    const url = "https://reharentkrkonose.cz/cenik-sluzeb-pujcovna-rehabilitacnich-pomucek/";
    const pageRes = await fetch(url);
    const html = await pageRes.text();
    // odstranit script/style a nechat jen text + zachovat základní strukturu tabulek/seznamů
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(tr|li|p|h[1-6]|div)>/gi, "\n")
      .replace(/<td[^>]*>/gi, " | ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
    res.json({ ok: true, status: pageRes.status, textLength: text.length, text: text.slice(0, 15000) });
  })
);

export default router;

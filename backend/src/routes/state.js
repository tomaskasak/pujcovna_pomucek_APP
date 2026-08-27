import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapClient, mapItem, mapReservation, mapPayment } from "../mappers.js";

const router = Router();

// Souhrnný stav celé aplikace — používá se pro počáteční načtení dat na frontendu.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [clients, items, reservations, payments] = await Promise.all([
      pool.query(`SELECT * FROM clients ORDER BY created_at`),
      pool.query(`SELECT * FROM items ORDER BY created_at`),
      pool.query(`SELECT * FROM reservations ORDER BY created_at`),
      pool.query(`SELECT * FROM payments ORDER BY created_at`),
    ]);

    res.json({
      clients: clients.rows.map(mapClient),
      items: items.rows.map(mapItem),
      reservations: reservations.rows.map(mapReservation),
      payments: payments.rows.map(mapPayment),
    });
  })
);

export default router;

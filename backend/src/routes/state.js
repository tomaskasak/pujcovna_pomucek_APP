import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapClient, mapItem, mapReservation, mapPayment, mapService } from "../mappers.js";

const router = Router();

// Souhrnný stav celé aplikace — používá se pro počáteční načtení dat na frontendu.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [clients, items, reservations, payments, services, photos] = await Promise.all([
      pool.query(`SELECT * FROM clients ORDER BY created_at`),
      pool.query(`SELECT * FROM items ORDER BY created_at`),
      pool.query(`SELECT * FROM reservations ORDER BY created_at`),
      pool.query(`SELECT * FROM payments ORDER BY created_at`),
      pool.query(`SELECT * FROM services ORDER BY sort_order`),
      pool.query(`SELECT id, item_id FROM item_photos ORDER BY sort_order`),
    ]);
    const photoIdsByItem = {};
    photos.rows.forEach((p) => {
      (photoIdsByItem[p.item_id] = photoIdsByItem[p.item_id] || []).push(p.id);
    });

    res.json({
      clients: clients.rows.map(mapClient),
      items: items.rows.map((row) => ({ ...mapItem(row), photoIds: photoIdsByItem[row.id] || [] })),
      reservations: reservations.rows.map(mapReservation),
      payments: payments.rows.map(mapPayment),
      services: services.rows.map(mapService),
    });
  })
);

export default router;

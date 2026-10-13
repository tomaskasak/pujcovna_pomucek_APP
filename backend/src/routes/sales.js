import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { mapSale, mapItem, mapReservation, mapPayment } from "../mappers.js";

const router = Router();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Prodej kusu z půjčovny. Vše v jedné transakci: případné ukončení výpůjčky,
// ubrání prodaných kusů ze skladu, zápis prodeje a případně i platby.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { clientId, itemId, itemName, quantity, price, date, note, paidNow, method, reservationId, rentalPrice } =
      req.body || {};
    const manualName = (itemName || "").trim();
    const qty = Math.max(1, Number(quantity) || 1);
    const salePrice = Number(price) || 0;
    const saleDate = date || null;
    // bez itemId = ručně zadané zboží mimo půjčovnu (sklad se nemění)
    if (!clientId || (!itemId && !manualName)) {
      return res.status(400).json({ error: "Klient a zboží jsou povinné." });
    }
    if (!itemId && reservationId) {
      return res.status(400).json({ error: "Prodej z výpůjčky musí mít pomůcku." });
    }
    if (salePrice < 0) {
      return res.status(400).json({ error: "Cena nesmí být záporná." });
    }

    const db = await pool.connect();
    try {
      await db.query("BEGIN");

      let item = null;
      if (itemId) {
        const { rows: itemRows } = await db.query(`SELECT * FROM items WHERE id = $1 FOR UPDATE`, [itemId]);
        if (itemRows.length === 0) throw new HttpError(404, "Pomůcka nenalezena.");
        item = itemRows[0];
      }
      const name = item ? item.name : manualName;

      let reservation = null;
      if (reservationId) {
        const { rows: resRows } = await db.query(`SELECT * FROM reservations WHERE id = $1`, [reservationId]);
        if (resRows.length === 0) throw new HttpError(404, "Výpůjčka nenalezena.");
        const existing = resRows[0];
        if (existing.status !== "active") throw new HttpError(409, "Prodat jde jen pomůcku z aktivní výpůjčky.");
        if (existing.item_id !== itemId) throw new HttpError(400, "Pomůcka neodpovídá výpůjčce.");
        // u výpůjčky bez pevného data vrácení se nájem uzavře ke dni prodeje
        // a zafixuje se cena poslaná z frontendu (jako při běžném vrácení)
        const finalPrice = !existing.end_date && rentalPrice !== undefined ? Number(rentalPrice) || 0 : existing.price;
        const { rows: updated } = await db.query(
          `UPDATE reservations
           SET status = 'returned', returned_at = COALESCE($1::date, CURRENT_DATE),
               end_date = COALESCE(end_date, $1::date, CURRENT_DATE), price = $2
           WHERE id = $3 RETURNING *`,
          [saleDate, finalPrice, reservationId]
        );
        reservation = updated[0];
      }

      let itemUpdated = null;
      if (item) {
        const { rows: activeRows } = await db.query(
          `SELECT COALESCE(SUM(quantity), 0) AS rented FROM reservations WHERE item_id = $1 AND status = 'active'`,
          [itemId]
        );
        const availableQty = item.quantity_total - Number(activeRows[0].rented);
        if (qty > availableQty) {
          throw new HttpError(409, `K prodeji je teď volných jen ${Math.max(0, availableQty)} ks.`);
        }
        const { rows } = await db.query(
          `UPDATE items SET quantity_total = quantity_total - $1 WHERE id = $2 RETURNING *`,
          [qty, itemId]
        );
        itemUpdated = rows[0];
      }

      const { rows: saleRows } = await db.query(
        `INSERT INTO sales (client_id, item_id, item_name, reservation_id, quantity, price, date, note)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8) RETURNING *`,
        [clientId, itemId || null, name, reservationId || null, qty, salePrice, saleDate, note || null]
      );
      const sale = saleRows[0];

      let payment = null;
      if (paidNow && salePrice > 0) {
        const { rows: payRows } = await db.query(
          `INSERT INTO payments (client_id, sale_id, date, amount, method, note)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [clientId, sale.id, sale.date, salePrice, method || null, `Prodej: ${name}${qty > 1 ? ` ×${qty}` : ""}`]
        );
        payment = payRows[0];
      }

      await db.query("COMMIT");
      res.status(201).json({
        sale: mapSale(sale),
        item: itemUpdated ? mapItem(itemUpdated) : null,
        reservation: reservation ? mapReservation(reservation) : null,
        payment: payment ? mapPayment(payment) : null,
      });
    } catch (err) {
      await db.query("ROLLBACK");
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      throw err;
    } finally {
      db.release();
    }
  })
);

// Smazání omylem zapsaného prodeje — prodané kusy se vrátí do skladu,
// navázané platby se smažou spolu s ním (ON DELETE CASCADE).
// Případně ukončenou výpůjčku to znovu neotvírá.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { rows: saleRows } = await db.query(`SELECT * FROM sales WHERE id = $1`, [req.params.id]);
      if (saleRows.length === 0) {
        await db.query("ROLLBACK");
        return res.status(404).json({ error: "Prodej nenalezen." });
      }
      const sale = saleRows[0];
      let item = null;
      if (sale.item_id) {
        const { rows } = await db.query(
          `UPDATE items SET quantity_total = quantity_total + $1 WHERE id = $2 RETURNING *`,
          [sale.quantity, sale.item_id]
        );
        item = rows[0] || null;
      }
      await db.query(`DELETE FROM sales WHERE id = $1`, [sale.id]);
      await db.query("COMMIT");
      res.json({ item: item ? mapItem(item) : null });
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
  })
);

export default router;

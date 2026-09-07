import { Router } from "express";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

// DOČASNÁ, jednorázová cesta pro přesun dat ze staré (Render) databáze na
// novou (Supabase) — chráněná přihlášením (mountuje se za requireAuth v
// server.js) i tajným tokenem navíc. Po dokončení přesunu se má tenhle
// soubor i jeho napojení v server.js zase odstranit.
const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// pořadí respektuje cizí klíče: reservations/payments odkazují na clients/items
const TABLES = ["users", "clients", "items", "reservations", "payments"];

router.get(
  "/migrate-to-supabase",
  asyncHandler(async (req, res) => {
    if (!process.env.MIGRATION_SECRET || req.query.secret !== process.env.MIGRATION_SECRET) {
      return res.status(403).json({ error: "Neplatný nebo chybějící token (secret)." });
    }
    if (!process.env.SUPABASE_DATABASE_URL) {
      return res.status(400).json({ error: "Proměnná SUPABASE_DATABASE_URL není na serveru nastavená." });
    }

    // sslmode=disable v connection stringu vypne SSL (jen pro lokální testování
    // proti obyčejné PostgreSQL bez SSL) — Supabase v produkci SSL vyžaduje
    const useSSL = !/sslmode=disable/.test(process.env.SUPABASE_DATABASE_URL);
    const targetPool = new pg.Pool({
      connectionString: process.env.SUPABASE_DATABASE_URL,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    });

    try {
      // 1) připravit stejné schéma v cílové databázi (idempotentní, jde spustit opakovaně)
      const schemaSql = fs.readFileSync(path.join(__dirname, "../schema.sql"), "utf-8");
      await targetPool.query(schemaSql);

      // 2) zkopírovat data tabulku po tabulce, řádek po řádku (včetně původních ID,
      // aby zůstaly zachované vazby mezi klienty/pomůckami/výpůjčkami/platbami)
      const summary = {};
      for (const table of TABLES) {
        const { rows } = await pool.query(`SELECT * FROM ${table}`);
        for (const row of rows) {
          const columns = Object.keys(row);
          // JSONB sloupce (např. price_tiers) čte pg-node jako už rozparsovaný JS
          // objekt/pole — při zápisu je potřeba je zpátky serializovat na text,
          // jinak si je driver splete s (chybným) zápisem SQL pole
          const values = columns.map((c) => {
            const v = row[c];
            return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
          });
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
          const updateSet = columns
            .filter((c) => c !== "id")
            .map((c) => `${c} = EXCLUDED.${c}`)
            .join(", ");
          await targetPool.query(
            `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
            values
          );
        }
        summary[table] = rows.length;
      }

      res.json({ ok: true, summary });
    } finally {
      await targetPool.end();
    }
  })
);

export default router;

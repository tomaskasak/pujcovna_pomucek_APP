import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Sloupce typu DATE (OID 1082) vracet jako čistý řetězec 'YYYY-MM-DD',
// ne jako JS Date objekt — frontend s daty pracuje jako s ISO řetězci.
pg.types.setTypeParser(1082, (val) => val);

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // pg defaultně čeká na spojení donekonečna (connectionTimeoutMillis: 0) —
  // když je Supabase dočasně nedostupná/pozastavená, appka by se jinak při
  // startu (migrace) i za běhu navěky zasekla místo rychlého selhání.
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Neočekávaná chyba PostgreSQL poolu:", err);
});

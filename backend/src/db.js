import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Sloupce typu DATE (OID 1082) vracet jako čistý řetězec 'YYYY-MM-DD',
// ne jako JS Date objekt — frontend s daty pracuje jako s ISO řetězci.
pg.types.setTypeParser(1082, (val) => val);

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Neočekávaná chyba PostgreSQL poolu:", err);
});

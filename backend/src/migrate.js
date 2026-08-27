import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import { hashPassword } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
  console.log("Databázové schéma je připraveno.");
}

// Založí první uživatelský účet z proměnných prostředí ADMIN_USERNAME / ADMIN_PASSWORD,
// pokud ještě žádný účet s tímto jménem neexistuje. Umožňuje nastavit přístupové údaje
// jen přes prostředí (Render / .env) bez nutnosti registračního formuláře v appce.
async function seedAdminUser() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.log("ADMIN_USERNAME/ADMIN_PASSWORD nejsou nastaveny — zakládání účtu přeskočeno.");
    return;
  }
  const { rows } = await pool.query(`SELECT id FROM users WHERE username = $1`, [username]);
  if (rows.length > 0) {
    console.log(`Uživatel "${username}" už existuje, přeskočeno.`);
    return;
  }
  const passwordHash = await hashPassword(password);
  await pool.query(`INSERT INTO users (username, password_hash) VALUES ($1, $2)`, [username, passwordHash]);
  console.log(`Vytvořen uživatelský účet "${username}".`);
}

migrate()
  .then(() => seedAdminUser())
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migrace databáze selhala:", err);
    process.exit(1);
  });

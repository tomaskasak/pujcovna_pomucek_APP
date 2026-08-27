import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { hashPassword, verifyPassword, signSession, verifySession, cookieOptions, SESSION_COOKIE } from "../auth.js";

const router = Router();

// Veřejné (bez přihlášení) — seznam uživatelských jmen pro výběr na přihlašovací obrazovce.
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`SELECT username FROM users ORDER BY username`);
    res.json(rows.map((r) => r.username));
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Zadejte uživatelské jméno a heslo." });
    }
    const { rows } = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: "Nesprávné jméno nebo heslo." });
    }
    const token = signSession(user);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.json({ username: user.username });
  })
);

router.post("/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

// Vždy vrací 200 (nikdy 401) — je to jen dotaz "jsem přihlášen?", ne chráněná routa.
router.get("/me", (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const payload = token && verifySession(token);
  if (!payload) {
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, username: payload.username });
});

export default router;

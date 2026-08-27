import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Pokud není JWT_SECRET nastaven (např. v lokálním rychlém vyzkoušení), vygeneruje se
// dočasný klíč platný jen do restartu serveru — po restartu budou všichni odhlášeni.
// V produkci (Render) je JWT_SECRET nastaven automaticky (render.yaml → generateValue).
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.JWT_SECRET) {
  console.warn(
    "JWT_SECRET není nastaven — používá se dočasný klíč vygenerovaný při startu serveru. " +
      "Nastavte JWT_SECRET v .env pro produkční provoz."
  );
}

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 180 dní — appka si tě "pamatuje"

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signSession(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

export function verifySession(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  };
}

// Middleware chránící ostatní /api/* routy — vyžaduje platnou přihlašovací cookie.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const payload = token && verifySession(token);
  if (!payload) {
    return res.status(401).json({ error: "Přihlášení vypršelo nebo nejste přihlášeni." });
  }
  req.user = { id: payload.sub, username: payload.username };
  next();
}

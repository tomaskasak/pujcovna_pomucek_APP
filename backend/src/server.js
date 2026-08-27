import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { requireAuth } from "./auth.js";
import authRouter from "./routes/auth.js";
import publicRouter from "./routes/public.js";
import stateRouter from "./routes/state.js";
import clientsRouter from "./routes/clients.js";
import itemsRouter from "./routes/items.js";
import reservationsRouter from "./routes/reservations.js";
import paymentsRouter from "./routes/payments.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Bez přihlášení: přihlašovací obrazovka a veřejný přehled dostupnosti pro klienty.
app.use("/api/auth", authRouter);
app.use("/api/public", publicRouter);

// Od téhle řádky dál už je vše za přihlášením.
app.use("/api", requireAuth);

app.use("/api/state", stateRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/items", itemsRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/payments", paymentsRouter);

// V produkci (po `npm run build` ve frontendu) servírujeme hotový build ze stejného originu.
const frontendDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: "Nenalezeno." });
});

// centrální zpracování chyb
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Interní chyba serveru." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend Půjčovny běží na portu ${PORT}`);
});

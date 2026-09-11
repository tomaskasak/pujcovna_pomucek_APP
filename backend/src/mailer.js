import nodemailer from "nodemailer";

// E-mailové notifikace jsou volitelné — appka funguje normálně i bez nich.
// Aktivují se až vyplněním SMTP_* proměnných v .env / na Renderu (viz README).
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, NOTIFY_EMAIL_TO } = process.env;

const isConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && NOTIFY_EMAIL_TO);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465, // 465 = SSL rovnou, 587/25 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000, // ať appka na nedostupný/špatně zadaný SMTP server nečeká minuty
  });
} else {
  console.log(
    "E-mailové notifikace nejsou nastavené (chybí SMTP_HOST/SMTP_USER/SMTP_PASS/NOTIFY_EMAIL_TO) — appka poběží dál, jen bez upozornění mailem."
  );
}

// Nikdy nesmí shodit request, který notifikaci spouští (např. odeslání žádosti
// o rezervaci z veřejné stránky) — chyba při odesílání mailu se jen zaloguje.
async function sendMail({ subject, text }) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: NOTIFY_EMAIL_TO,
      subject,
      text,
    });
  } catch (err) {
    console.error("Odeslání e-mailové notifikace se nezdařilo:", err.message);
  }
}

export function sendWeeklySummary({ totalItems, activeReservations, overdue, revenueThisMonth, pendingRequests }) {
  const link = process.env.APP_URL ? `\n\nOtevřít appku: ${process.env.APP_URL}` : "";
  return sendMail({
    subject: "Týdenní přehled půjčovny",
    text: `Automatický týdenní přehled appky.

Pomůcek celkem: ${totalItems}
Aktuálně půjčeno: ${activeReservations}
Po termínu: ${overdue}
Tržby tento měsíc: ${revenueThisMonth} Kč
Čeká na schválení: ${pendingRequests}${link}`,
  });
}

export function notifyNewReservationRequest({ clientName, clientPhone, itemName, startDate, endDate, quantity }) {
  return sendMail({
    subject: `Nová žádost o rezervaci — ${itemName}`,
    text: `Na veřejné stránce přišla nová žádost o rezervaci.

Pomůcka: ${itemName} (${quantity} ks)
Termín: ${startDate} – ${endDate}
Klient: ${clientName}
Telefon: ${clientPhone}

Žádost čeká na schválení nebo zamítnutí v appce (záložka Výpůjčky).`,
  });
}

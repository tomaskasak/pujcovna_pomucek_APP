// E-mailové notifikace jsou volitelné — appka funguje normálně i bez nich.
// Posílají se přes Resend (HTTPS API, ne SMTP) — cloudoví poskytovatelé jako
// Render odchozí SMTP porty běžně blokují kvůli ochraně proti spamu, HTTPS
// ale ne. Návod na nastavení je v README.
const { RESEND_API_KEY, RESEND_FROM, NOTIFY_EMAIL_TO } = process.env;

const isConfigured = Boolean(RESEND_API_KEY && NOTIFY_EMAIL_TO);

if (!isConfigured) {
  console.log(
    "E-mailové notifikace nejsou nastavené (chybí RESEND_API_KEY/NOTIFY_EMAIL_TO) — appka poběží dál, jen bez upozornění mailem."
  );
}

// Nikdy nesmí shodit request, který notifikaci spouští (např. odeslání žádosti
// o rezervaci z veřejné stránky) — chyba při odesílání mailu se jen zaloguje.
async function sendMail({ subject, text }) {
  if (!isConfigured) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM || "Půjčovna <onboarding@resend.dev>",
        to: [NOTIFY_EMAIL_TO],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend vrátil chybu ${res.status}: ${body}`);
    }
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

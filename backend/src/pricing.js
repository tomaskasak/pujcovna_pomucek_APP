// Stejná logika jako effectiveRate()/daysBetween() na frontendu (frontend/src/App.jsx) —
// zde běží server-side pro veřejné (nepřihlášené) žádosti o rezervaci, kde cenu nelze
// nechat spočítat/poslat klientem.

// priceTiers: [{ days: 1, rate: 250 }, { days: 14, rate: 230 }, { days: 30, rate: 200 }]
// vrací sazbu platnou pro daný počet dní výpůjčky (bere nejvyšší práh <= days)
export function effectiveRate(priceTiers, dailyRate, days) {
  const tiers = priceTiers && priceTiers.length ? priceTiers : [{ days: 1, rate: dailyRate || 0 }];
  const sorted = [...tiers].sort((a, b) => a.days - b.days);
  let rate = sorted[0].rate;
  for (const t of sorted) {
    if (days >= t.days) rate = t.rate;
  }
  return rate;
}

export function daysBetween(startISO, endISO) {
  return Math.round((new Date(endISO) - new Date(startISO)) / 86400000);
}

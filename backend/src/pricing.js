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

// Od kolika dní se u pomůcky s měsíční sazbou počítá po měsících.
export const MONTHLY_FROM_DAYS = 28;

function addMonthsISO(startISO, k) {
  const [y, m, d] = startISO.split("-").map(Number);
  const total = m - 1 + k;
  const ny = y + Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// počet započatých měsíců výpůjčky (konec včetně): 1. 10.–31. 10. = 1, 1. 10.–1. 11. = 2
export function startedMonths(startISO, endISO) {
  let n = 0;
  while (addMonthsISO(startISO, n + 1) <= endISO) n++;
  return n + 1;
}

export function rentalPrice({ priceTiers, dailyRate, monthlyRate }, startISO, endISO, quantity = 1) {
  const days = Math.max(1, daysBetween(startISO, endISO) + 1);
  if (monthlyRate > 0 && days >= MONTHLY_FROM_DAYS) {
    const months = startedMonths(startISO, endISO);
    return months * quantity * monthlyRate;
  }
  return days * quantity * effectiveRate(priceTiers, dailyRate, days);
}

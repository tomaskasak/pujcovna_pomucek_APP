// Minimální service worker — jeho jediný účel je splnit podmínku pro instalovatelnost
// PWA (Android/Chrome vyžaduje registrovaný service worker s fetch handlerem, aby
// nabídl "Přidat na plochu" / "Instalovat aplikaci"). Záměrně nic necachuje, appka
// pracuje s citlivými/živými daty a vždy má načítat čerstvý obsah ze serveru.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // žádné cachování — necháváme prohlížeč požadavek vyřídit normálně
});

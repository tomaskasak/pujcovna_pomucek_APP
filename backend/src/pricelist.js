// Oficiální ceník z reharentkrkonose.cz/cenik-sluzeb-pujcovna-rehabilitacnich-pomucek/
// Používá se pro tlačítko "Načíst ceník z webu" v sekci Pomůcky.
export const OFFICIAL_PRICELIST = [
  { name: "Berle", category: "Hole a berle", dailyRate: 5 },
  { name: "Francouzské hole", category: "Hole a berle", dailyRate: 5 },
  { name: "Chodítko (s kolečky/bez)", category: "Chodítka", dailyRate: 10 },
  { name: "Vysoké chodítko", category: "Chodítka", dailyRate: 20 },
  { name: "Invalidní vozík (základní)", category: "Vozíky", dailyRate: 20 },
  { name: "Toaletní křeslo", category: "Toaletní křesla", dailyRate: 15 },
  { name: "Zvedák pro přesun osob", category: "Zvedáky", dailyRate: 30 },
  { name: "Antidekubitní matrace (nafukovací s kompresorem)", category: "Matrace", dailyRate: 15 },
  { name: "Elektrický vozík", category: "Vozíky", dailyRate: 80 },
  { name: "Schodolez pásový", category: "Schodolezy", dailyRate: 30 },
  {
    name: "Motodlaha",
    category: "Motodlahy",
    dailyRate: 250,
    priceTiers: [
      { days: 1, rate: 250 },
      { days: 14, rate: 230 },
      { days: 30, rate: 200 },
    ],
  },
  // Polohovací postele — dle ceníku pouze měsíční sazba (min. doba zápůjčky 1 měsíc), zde přepočteno na den
  { name: "Elektrická polohovací postel", category: "Polohovací postele", dailyRate: 40 },
  { name: "Hrazda k posteli", category: "Polohovací postele", dailyRate: 5 },
  { name: "Antidekubitní matrace (k posteli)", category: "Polohovací postele", dailyRate: 15 },
  { name: "BALÍČEK: Postel + matrace + hrazda", category: "Polohovací postele", dailyRate: 50 },
];

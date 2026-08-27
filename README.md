# Půjčovna rehabilitačních pomůcek

Aplikace pro správu půjčovny rehabilitačních pomůcek — klienti, sklad pomůcek,
výpůjčky s cenovými úrovněmi podle délky zápůjčky, platby a veřejný přehled
dostupnosti.

Vychází z původního React prototypu (persistence jen v prohlížeči). Vzhled,
chování a ceník jsou zachovány beze změny — přibyl pouze skutečný backend
a databáze, takže data zůstávají uložená trvale a sdílená mezi zařízeními.

## Architektura

- **frontend/** — React (Vite), stejné UI jako původní prototyp
- **backend/** — Node.js + Express REST API
- **PostgreSQL** — trvalé úložiště dat (klienti, pomůcky, výpůjčky, platby)

```
frontend  --/api-->  backend (Express)  -->  PostgreSQL
```

## Spuštění přes Docker Compose (nejrychlejší)

Vyžaduje nainstalovaný Docker a Docker Compose.

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api
- PostgreSQL: localhost:5432 (uživatel/heslo/db: `pujcovna`/`pujcovna`/`pujcovna`)

Databázové schéma se při startu backendu automaticky vytvoří (migrace je
idempotentní, lze spouštět opakovaně).

## Spuštění bez Dockeru (lokální vývoj)

### 1. PostgreSQL

Potřebuješ běžící PostgreSQL databázi. Buď lokální instalaci, nebo jen kontejner:

```bash
docker run -d --name pujcovna-db \
  -e POSTGRES_USER=pujcovna -e POSTGRES_PASSWORD=pujcovna -e POSTGRES_DB=pujcovna \
  -p 5432:5432 postgres:16-alpine
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # uprav DATABASE_URL, pokud je potřeba
npm install
npm run migrate        # vytvoří tabulky
npm run dev             # spustí server na http://localhost:4000
```

### 3. Frontend

V novém terminálu:

```bash
cd frontend
npm install
npm run dev             # spustí Vite dev server na http://localhost:5173
```

Vite dev server automaticky přeposílá volání `/api/*` na backend
(`http://localhost:4000`), takže appka funguje bez dalšího nastavení.

## Nasazení do cloudu zdarma (Render.com)

Nejjednodušší způsob, jak appku vyzkoušet na telefonu/tabletu nebo ukázat
někomu jinému bez instalace čehokoli — appka poběží na veřejné adrese.

1. Založ si účet na https://render.com (jde přes GitHub, zdarma, karta se
   nevyžaduje).
2. V Render dashboardu klikni **New +** → **Blueprint**.
3. Připoj tenhle GitHub repozitář (`tomaskasak/pujcovna_pomucek_APP`) —
   Render sám najde soubor `render.yaml` v kořeni repozitáře a podle něj
   založí web službu i PostgreSQL databázi najednou.
4. Klikni **Apply** a počkej, než doběhne build (pár minut).
5. Až je hotovo, Render appce přidělí veřejnou adresu tvaru
   `https://pujcovna-backend-xxxx.onrender.com` — tu si otevři v prohlížeči.

**Na co pamatovat u bezplatného tieru:**
- Web služba po ~15 minutách bez provozu „usne" a první další request ji
  pár desítek sekund budí — to je normální, ne chyba.
- Bezplatná PostgreSQL databáze má na Renderu časově omezenou životnost
  (řádově týdny/měsíce dle aktuálních podmínek Render) — pro dlouhodobý
  ostrý provoz bude časem potřeba přejít na placený tier nebo databázi
  jinam přenést.

## Produkční nasazení (jeden server)

```bash
cd frontend && npm install && npm run build   # vytvoří frontend/dist
cd ../backend && npm install
npm run migrate
npm start
```

Backend automaticky servíruje sestavený frontend z `frontend/dist`, takže
celá appka běží na jednom portu (`PORT` z `.env`, výchozí 4000).

## Funkce aplikace

- **Přehled** — souhrnné statistiky, upozornění na výpůjčky po termínu
- **Klienti** — evidence klientů, nelze smazat klienta s (i historickou) výpůjčkou
- **Pomůcky** — sklad s počty kusů, cenové úrovně dle délky zápůjčky (např.
  motodlaha: 250 Kč/den do 14 dnů, 230 Kč/den od 14 dnů, 200 Kč/den od 30 dnů),
  označení „v servisu", tlačítko pro načtení oficiálního ceníku
- **Výpůjčky** — vytvoření/vrácení výpůjčky s automatickým výpočtem ceny,
  stav úhrady (nezaplaceno/záloha/zaplaceno)
- **Platby** — evidence plateb, export do CSV
- **Veřejný přehled** — read-only náhled dostupnosti pomůcek bez cen klientů

## Poznámky k dalšímu rozvoji

Aplikace zatím nemá přihlašování (stejně jako původní prototyp) — kdokoli
s přístupem k adrese může spravovat data. Pro provoz mimo důvěryhodnou síť
doporučuji doplnit autentizaci (např. jednoduché přihlášení pro obsluhu
půjčovny) a oddělit veřejný přehled na samostatnou neautentizovanou trasu.

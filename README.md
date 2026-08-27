# Půjčovna rehabilitačních pomůcek

Aplikace pro správu půjčovny rehabilitačních pomůcek — klienti, sklad pomůcek,
výpůjčky s cenovými úrovněmi podle délky zápůjčky, platby a veřejný přehled
dostupnosti.

Vychází z původního React prototypu (persistence jen v prohlížeči). Vzhled,
chování a ceník jsou zachovány beze změny — přibyl skutečný backend, databáze
a přihlašování, takže appka je chráněná heslem a data zůstávají uložená
trvale a sdílená mezi zařízeními.

Appka je za přihlášením (uživatelské jméno + heslo). Výjimkou je stránka
**„Veřejný přehled"** na `/verejny-prehled`, která je záměrně přístupná bez
přihlášení — je určená ke sdílení s klienty, ukazuje jen dostupnost pomůcek
a ceny, žádná jména klientů.

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
- Přihlašovací účet (nastaven v `docker-compose.yml`): `admin` / `admin123`
  — v produkci si ho **nezapomeň změnit** (viz proměnné níže).

Databázové schéma se při startu backendu automaticky vytvoří (migrace je
idempotentní, lze spouštět opakovaně) a zároveň se založí první přihlašovací
účet podle `ADMIN_USERNAME` / `ADMIN_PASSWORD`, pokud ještě neexistuje.

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
4. Render se při zakládání zeptá na hodnoty `ADMIN_USERNAME` a
   `ADMIN_PASSWORD` (přihlašovací účet pro obsluhu půjčovny) — vyplň si
   vlastní jméno a silné heslo. `JWT_SECRET` se vygeneruje automaticky.
5. Klikni **Apply** a počkej, než doběhne build (pár minut).
6. Až je hotovo, Render appce přidělí veřejnou adresu tvaru
   `https://pujcovna-backend-xxxx.onrender.com` — tu si otevři v prohlížeči
   a přihlas se účtem z kroku 4.

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

- **Přihlašování** — appka je za jménem a heslem, session vydrží 180 dní
  (prohlížeč tě "pamatuje", nemusíš se přihlašovat pokaždé)
- **Přehled** — souhrnné statistiky, upozornění na výpůjčky po termínu
- **Klienti** — evidence klientů, nelze smazat klienta s (i historickou) výpůjčkou
- **Pomůcky** — sklad s počty kusů, cenové úrovně dle délky zápůjčky (např.
  motodlaha: 250 Kč/den do 14 dnů, 230 Kč/den od 14 dnů, 200 Kč/den od 30 dnů),
  označení „v servisu", tlačítko pro načtení oficiálního ceníku
- **Výpůjčky** — vytvoření/vrácení výpůjčky s automatickým výpočtem ceny,
  stav úhrady (nezaplaceno/záloha/zaplaceno)
- **Platby** — evidence plateb, export do CSV
- **Veřejný přehled** — read-only náhled dostupnosti pomůcek bez cen klientů

## Přihlašování — jak přidat další účet

Appka zatím nemá formulář pro registraci nových účtů (aby se zbytečně
nerozšiřoval prostor pro útok). První účet se založí automaticky z
`ADMIN_USERNAME`/`ADMIN_PASSWORD` při migraci. Pro přidání dalšího účtu
zatím stačí spustit v databázi (nebo si o to říct, ať appku o jednoduchou
správu uživatelů rozšířím):

```sql
-- heslo je potřeba předem zahashovat přes bcrypt (10 kol), appka ho
-- v databázi nikdy neukládá v čitelné podobě
INSERT INTO users (username, password_hash) VALUES ('jmeno', '$2a$10$...');
```

## Poznámky k dalšímu rozvoji

Zatím existuje jen jedna úroveň přístupu (kdokoli přihlášený vidí a upravuje
vše). Pokud budeš v budoucnu potřebovat rozlišit role (např. jen čtení pro
brigádníky), řekni si a doplníme to.

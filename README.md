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
a ceny, žádná jména klientů. Klienti si přes ni mohou u volné pomůcky rovnou
poslat **žádost o rezervaci** (jméno, telefon, termín od–do) — nejde o
závaznou rezervaci, objeví se v appce ke schválení nebo zamítnutí.

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

Databáze běží na **Supabase** (bezplatně, natrvalo — bez časového omezení),
appka samotná na **Render** (bezplatná web služba). `render.yaml` už proto
sám PostgreSQL databázi nezakládá — je potřeba mít vlastní Supabase projekt.

1. Založ si zdarma účet a nový projekt na https://supabase.com — u
   zakládání projektu si ulož **heslo databáze**.
2. V projektu jdi na **Project Settings → Database → Connection Pooling**
   a zkopíruj **Session pooler** connection string (tvaru
   `postgresql://postgres.xxxx:[HESLO]@aws-0-region.pooler.supabase.com:6543/postgres`).
   Přímé připojení (`db.xxxx.supabase.co`) na Renderu **nefunguje** — jede
   jen přes IPv6, který Render nepodporuje, proto je potřeba právě tenhle
   pooler.
3. Založ si účet na https://render.com (jde přes GitHub, zdarma, karta se
   nevyžaduje).
4. V Render dashboardu klikni **New +** → **Blueprint**.
5. Připoj tenhle GitHub repozitář (`tomaskasak/pujcovna_pomucek_APP`) —
   Render sám najde soubor `render.yaml` v kořeni repozitáře a podle něj
   založí web službu.
6. Render se při zakládání zeptá na hodnoty proměnných — vyplň:
   - `DATABASE_URL` — connection string ze Supabase (krok 2)
   - `ADMIN_USERNAME` a `ADMIN_PASSWORD` — přihlašovací účet pro obsluhu
     půjčovny, vlastní jméno a silné heslo (`JWT_SECRET` se vygeneruje sám)
7. Klikni **Apply** a počkej, než doběhne build (pár minut).
8. Až je hotovo, Render appce přidělí veřejnou adresu tvaru
   `https://pujcovna-backend-xxxx.onrender.com` — tu si otevři v prohlížeči
   a přihlas se účtem z kroku 6.

**Na co pamatovat u bezplatného tieru:**
- Web služba na Renderu po ~15 minutách bez provozu „usne" a první další
  request ji pár desítek sekund budí — to je normální, ne chyba.
- Supabase bezplatný projekt se po ~týdnu úplné neaktivity (žádný požadavek
  na appku) sám pozastaví — stačí ho v Supabase dashboardu jedním kliknutím
  znovu spustit (**Restore project**), data se tím nijak neztrácí.

## Produkční nasazení (jeden server)

```bash
cd frontend && npm install && npm run build   # vytvoří frontend/dist
cd ../backend && npm install
npm run migrate
npm start
```

Backend automaticky servíruje sestavený frontend z `frontend/dist`, takže
celá appka běží na jednom portu (`PORT` z `.env`, výchozí 4000).

## Přidání ikony na plochu (Android)

Appka je nastavená jako instalovatelná PWA (manifest + ikony + service
worker), takže si ji lze přidat na plochu telefonu jako normální appku —
spustí se bez adresního řádku prohlížeče.

1. Otevři appku v Chromu na Androidu
2. Klepni na nabídku (tři tečky vpravo nahoře)
3. Zvol **„Přidat na plochu"** nebo **„Instalovat aplikaci"** (Chrome to
   někdy nabídne i sám automaticky bannerem dole)
4. Potvrď — na ploše přibude ikonka s logem REHARENT Krkonoše (hory
   a ikony lůžka a vozíku)

Totéž funguje i pro veřejnou stránku `/verejny-prehled` — pokud si ji
klient přidá na plochu, otevře se mu rovnou přehled dostupnosti.

## Funkce aplikace

- **Přihlašování** — appka je za jménem a heslem, session vydrží 180 dní
  (prohlížeč tě "pamatuje", nemusíš se přihlašovat pokaždé)
- **Přehled** — souhrnné statistiky, upozornění na výpůjčky po termínu
- **Klienti** — evidence klientů, editace údajů, nelze smazat klienta s (i historickou) výpůjčkou
- **Pomůcky** — sklad s počty kusů, cenové úrovně dle délky zápůjčky (např.
  motodlaha: 250 Kč/den do 14 dnů, 230 Kč/den od 14 dnů, 200 Kč/den od 30 dnů),
  označení „v servisu", tlačítko pro načtení oficiálního ceníku
- **Výpůjčky** — vytvoření/vrácení výpůjčky s automatickým výpočtem ceny
  podle ceníku, kterou ale jde kdykoli ručně přepsat (např. při domluvené
  slevě s klientem) — appka nabídne i tlačítko pro návrat k ceníkové ceně.
  Vrácenou výpůjčku lze tlačítkem „Vrátit zpět" vrátit mezi aktivní (pro
  případ omylu). Dále stav úhrady (nezaplaceno/záloha/zaplaceno), editace
  termínu/počtu kusů/kauce/ceny u aktivní nebo čekající výpůjčky a smazání
  výpůjčky v jakémkoli stavu (s potvrzením, pro opravu chybně založených
  záznamů). Pokud klient předem neví, kdy pomůcku vrátí, jde datum „Do"
  nechat prázdné („Datum vrácení zatím neznámé") — appka pak v tabulce
  průběžně počítá dny od začátku a odhaduje cenu k dnešnímu dni. Až se
  pomůcka skutečně vrátí, tlačítko „Vrátit" u takové výpůjčky otevře dialog
  na doplnění skutečného data vrácení a potvrzení (nebo ruční úpravy)
  finální ceny.
- **Žádosti o rezervaci z veřejné stránky** — klient si na `/verejny-prehled`
  u volné pomůcky vybere termín a pošle žádost (jméno, telefon). V appce se
  objeví v „Nové žádosti o rezervaci" na Přehledu a v tabulce Výpůjček
  (s odznakem u položky Výpůjčky v menu) ke schválení nebo zamítnutí.
  Schválená žádost se stane normální aktivní výpůjčkou. Dokud žádost čeká
  na vyřízení, pomůcka se na veřejné stránce zobrazuje jako nedostupná
  (aby ji nemohl žádat víc lidí najednou). Volitelně appka na každou novou
  žádost pošle i upozornění e-mailem (viz níže).
- **Platby** — evidence plateb, export do CSV
- **Veřejný přehled** — read-only náhled dostupnosti pomůcek bez cen klientů,
  s možností poslat žádost o rezervaci

## E-mailové upozornění na novou žádost o rezervaci

Appka umí při každé nové žádosti o rezervaci z veřejné stránky poslat
upozorňovací e-mail. Je to **volitelné** — bez vyplnění appka funguje úplně
stejně, jen notifikaci neposílá (a odeslání žádosti to nijak nezpomalí ani
nezablokuje, i kdyby mail selhal).

Zapíná se vyplněním proměnných v `.env` (lokálně) nebo v **Render → služba
`pujcovna-backend` → Environment** (na ostrém provozu):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tvoje-adresa@gmail.com
SMTP_PASS=heslo-aplikace       # NE běžné heslo do Gmailu, viz níže
SMTP_FROM=tvoje-adresa@gmail.com
NOTIFY_EMAIL_TO=kam-chces-posilat-upozorneni@gmail.com
```

**Nejjednodušší cesta — poslat přes Gmail:**

1. Na [myaccount.google.com/security](https://myaccount.google.com/security)
   zapni **dvoufázové ověření** (bez něj aplikační hesla nejdou vytvořit).
2. Na [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   vytvoř nové **heslo aplikace** (App password) — zadej libovolný název
   (např. „Půjčovna"), Google ti vygeneruje 16místné heslo.
3. Toto heslo (ne svoje běžné heslo do Gmailu!) vyplň do `SMTP_PASS`.
4. `SMTP_USER` i `SMTP_FROM` je tvá gmailová adresa, `NOTIFY_EMAIL_TO` adresa,
   kam se mají upozornění posílat (klidně stejná).

**Alternativa — poslat přes schránku na Wedosu:** SMTP údaje (server, port)
najdeš ve Wedos klientské zóně u dané domény/e-mailu (obvykle
`smtp.wedos.net`, port `587`), `SMTP_USER`/`SMTP_PASS` jsou přihlašovací
údaje té schránky.

Po vyplnění na Renderu appku není potřeba znovu nasazovat — nové proměnné se
projeví při příštím restartu služby (Render to po uložení udělá sám).

## Týdenní přehled mailem (a proč appka nikdy neusne úplně)

Appka jednou týdně (v pondělí) automaticky pošle mailem krátký přehled —
kolik je pomůcek, kolik jich je půjčeno, kolik je po termínu, tržby za
tento měsíc a kolik čeká nevyřízených žádostí. Zároveň to má vedlejší
užitečný efekt: bezplatný Supabase projekt (databáze appky) se sám
pozastaví, pokud na appku **týden** nikdo/nic vůbec nesáhne — tahle úloha
(plus druhé, tiché zavolání ve čtvrtek pro bezpečnou rezervu) appku i
databázi pravidelně "probouzí", takže se to nikdy nestane.

Zařizuje to naplánovaná úloha na GitHubu (`.github/workflows/keep-alive.yml`),
běží zdarma a nezávisle na appce i na tobě. Aby fungovala, potřebuje:

1. V **Render → služba `pujcovna-backend` → Environment** nastavit proměnnou
   `CRON_SECRET` na libovolný dlouhý náhodný řetězec (tajný token).
2. Ve **stejném GitHub repozitáři** (`github.com/tomaskasak/pujcovna_pomucek_APP`)
   jít do **Settings → Secrets and variables → Actions → New repository
   secret**, vytvořit tajemství jménem `CRON_SECRET` a vložit **stejnou**
   hodnotu jako v kroku 1.
3. Volitelně nastavit i `APP_URL` (adresa appky) — přidá se pak jako odkaz
   do těla přehledového mailu.

Bez tohohle nastavení appka funguje úplně normálně, jen bez týdenního
mailu a bez automatického probouzení — po týdnu nečinnosti by pak bylo
potřeba databázi ručně obnovit v Supabase dashboardu (**Restore project**,
data se tím neztratí).

Průběh té naplánované úlohy jde kdykoli zkontrolovat na GitHubu v záložce
**Actions**, a jde ji tam i ručně spustit tlačítkem "Run workflow" (pro
vyzkoušení, není potřeba čekat na pondělí/čtvrtek).

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

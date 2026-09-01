-- Databázové schéma pro Půjčovnu rehabilitačních pomůcek
-- Skript je idempotentní (lze spustit opakovaně).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  quantity_total INTEGER NOT NULL DEFAULT 1,
  daily_rate INTEGER NOT NULL DEFAULT 0,
  -- cenové úrovně dle počtu dní výpůjčky, např. [{"days":1,"rate":250},{"days":14,"rate":230}]
  price_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_flag BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- klient se nesmí smazat, pokud má na sebe navázanou (i historickou) výpůjčku
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  -- pomůcku lze smazat i s historickými výpůjčkami (jen ne s aktivní) — proto SET NULL
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  -- NULL = datum vrácení zatím není známé (flexibilní výpůjčka) — cena se do
  -- ukončení počítá odhadem podle dní k dnešnímu dni, viz frontend
  end_date DATE,
  deposit INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL DEFAULT 0,
  -- pending/rejected = žádost podaná z veřejné stránky, čeká na vyřízení obsluhou
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'returned', 'rejected')),
  payment_status TEXT NOT NULL DEFAULT 'nezaplaceno' CHECK (payment_status IN ('nezaplaceno', 'zaloha', 'zaplaceno')),
  returned_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rozšíření CHECK na status o 'pending'/'rejected' i pro databázi založenou před touto verzí
-- (constraint bez explicitního jména dostal od PostgreSQL výchozí název reservations_status_check).
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check CHECK (status IN ('pending', 'active', 'returned', 'rejected'));

-- Umožnit flexibilní výpůjčky bez pevného data vrácení i v databázi založené
-- před touto verzí (end_date původně NOT NULL).
ALTER TABLE reservations ALTER COLUMN end_date DROP NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount INTEGER NOT NULL DEFAULT 0,
  method TEXT,
  variable_symbol TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_client ON reservations(client_id);
CREATE INDEX IF NOT EXISTS idx_reservations_item ON reservations(item_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);

-- Databázové schéma pro Půjčovnu rehabilitačních pomůcek
-- Skript je idempotentní (lze spustit opakovaně).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  end_date DATE NOT NULL,
  deposit INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
  payment_status TEXT NOT NULL DEFAULT 'nezaplaceno' CHECK (payment_status IN ('nezaplaceno', 'zaloha', 'zaplaceno')),
  returned_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

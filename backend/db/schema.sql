CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  phone         TEXT,
  nic           TEXT,
  email         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  balance       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated', 'deleted')),
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade path for databases created before authentication was reworked.
-- password_hash is nullable here; init.js fills it from the legacy plaintext column and then enforces NOT NULL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated', 'deleted'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nic TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Existing and seeded accounts have no contact details; uniqueness only applies where they are set.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_nic_key ON users (upper(nic)) WHERE nic IS NOT NULL;

CREATE TABLE IF NOT EXISTS routes (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  stations  TEXT NOT NULL,
  base_fare NUMERIC(10,2) NOT NULL,
  per_km    NUMERIC(10,2) NOT NULL,
  total_km  NUMERIC(8,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  title      TEXT NOT NULL,
  amount     NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_id_id_idx ON transactions (user_id, id DESC);

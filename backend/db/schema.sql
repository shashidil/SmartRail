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

-- Routes & Pricing: one fixed trip fare per route. base_fare / per_km / total_km / stations are legacy.
ALTER TABLE routes ADD COLUMN IF NOT EXISTS fare NUMERIC(10,2) CHECK (fare >= 0);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
ALTER TABLE routes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE routes ALTER COLUMN stations DROP NOT NULL;
ALTER TABLE routes ALTER COLUMN base_fare DROP NOT NULL;
ALTER TABLE routes ALTER COLUMN per_km DROP NOT NULL;
ALTER TABLE routes ALTER COLUMN total_km DROP NOT NULL;

CREATE TABLE IF NOT EXISTS stations (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS stations_name_key ON stations (lower(name));

CREATE TABLE IF NOT EXISTS route_stations (
  route_id   INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  position   INTEGER NOT NULL,
  PRIMARY KEY (route_id, position),
  UNIQUE (route_id, station_id)
);

CREATE TABLE IF NOT EXISTS trips (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  route_id         INTEGER NOT NULL REFERENCES routes(id),
  start_station_id INTEGER NOT NULL REFERENCES stations(id),
  end_station_id   INTEGER REFERENCES stations(id),
  fare             NUMERIC(10,2) NOT NULL CHECK (fare >= 0),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  transaction_id   BIGINT REFERENCES transactions(id),
  cancelled_by     INTEGER REFERENCES users(id),
  cancel_reason    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_open_per_user ON trips (user_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS trips_status_started_idx ON trips (status, started_at DESC);
CREATE INDEX IF NOT EXISTS trips_user_id_id_idx ON trips (user_id, id DESC);

CREATE TABLE IF NOT EXISTS route_audit (
  id         BIGSERIAL PRIMARY KEY,
  route_id   INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  admin_id   INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS route_audit_route_idx ON route_audit (route_id, id DESC);

CREATE TABLE IF NOT EXISTS train_positions (
  train_no    TEXT PRIMARY KEY,
  train_name  TEXT,
  route_id    INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  latitude    NUMERIC(9,6) NOT NULL,
  longitude   NUMERIC(9,6) NOT NULL,
  speed_kmh   NUMERIC(6,1),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

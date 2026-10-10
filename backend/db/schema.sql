CREATE TABLE IF NOT EXISTS users (
  id       SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role     TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  balance  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0)
);

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

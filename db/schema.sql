CREATE TABLE IF NOT EXISTS users (
  id         BIGINT PRIMARY KEY,   -- shard key; app-generated, never SERIAL
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  country    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
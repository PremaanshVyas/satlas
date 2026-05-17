CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  latitude   FLOAT NOT NULL,
  longitude  FLOAT NOT NULL,
  norad_id   TEXT NOT NULL DEFAULT '25544',
  min_elev   INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now()
);

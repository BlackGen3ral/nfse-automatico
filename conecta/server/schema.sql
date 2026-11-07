CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, pc_hash TEXT NOT NULL, mobile_hash TEXT, pair_code TEXT UNIQUE, pair_expires INTEGER, last_seen INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id), payload TEXT, state TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, cancel_requested INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(device_id) WHERE state IN ('queued','claimed','running');
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
-- Databases created before cancellation support also run migrations/001-cancellation.sql.

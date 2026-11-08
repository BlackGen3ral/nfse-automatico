CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, pc_hash TEXT NOT NULL, mobile_hash TEXT, pair_code TEXT UNIQUE, pair_expires INTEGER, last_seen INTEGER NOT NULL DEFAULT 0, parallel_ready INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id), payload TEXT, state TEXT NOT NULL, message TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, cancel_requested INTEGER NOT NULL DEFAULT 0, batch_id TEXT);
CREATE TRIGGER IF NOT EXISTS max_five_active_jobs BEFORE INSERT ON jobs WHEN (SELECT COUNT(*) FROM jobs WHERE device_id=NEW.device_id AND state IN('queued','claimed','running'))>=5 BEGIN SELECT RAISE(ABORT,'maximum active jobs'); END;
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
-- Databases created before cancellation support also run migrations/001-cancellation.sql.

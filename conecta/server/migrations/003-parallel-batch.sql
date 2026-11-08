ALTER TABLE jobs ADD COLUMN batch_id TEXT;
DROP INDEX IF EXISTS one_active_job;
CREATE TRIGGER IF NOT EXISTS max_five_active_jobs BEFORE INSERT ON jobs WHEN (SELECT COUNT(*) FROM jobs WHERE device_id=NEW.device_id AND state IN('queued','claimed','running'))>=5 BEGIN SELECT RAISE(ABORT,'maximum active jobs'); END;

ALTER TABLE devices ADD COLUMN parallel_ready INTEGER NOT NULL DEFAULT 0;

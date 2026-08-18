CREATE TABLE IF NOT EXISTS rescue_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_saved INTEGER NOT NULL DEFAULT 0 CHECK (total_saved >= 0),
  reports INTEGER NOT NULL DEFAULT 0 CHECK (reports >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO rescue_stats (id, total_saved, reports) VALUES (1, 0, 0);

CREATE TABLE IF NOT EXISTS rescue_events (
  event_id TEXT PRIMARY KEY,
  saved INTEGER NOT NULL CHECK (saved BETWEEN 1 AND 30),
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submission_limits (
  client_hash TEXT NOT NULL,
  minute_bucket INTEGER NOT NULL,
  submissions INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (client_hash, minute_bucket)
);

CREATE INDEX IF NOT EXISTS rescue_events_created_at ON rescue_events(created_at);
CREATE INDEX IF NOT EXISTS submission_limits_bucket ON submission_limits(minute_bucket);

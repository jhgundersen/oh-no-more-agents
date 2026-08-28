-- The reports outgrew the constraint that checks them.
--
-- 0001 was written when a report was one finished level, and the biggest colony
-- is eighteen, so `saved BETWEEN 1 AND 30` was a generous bound. Batching then
-- changed a report into up to five levels — MAX_SAVED_PER_REPORT is 90 in
-- src/counter.js — and this line was not changed with it.
--
-- The Worker validated the new bound and the database kept the old one, so
-- every report of more than thirty rescues was accepted by one and refused by
-- the other: the INSERT raised a CHECK violation, the D1 batch is one
-- transaction so the whole thing rolled back, and the client saw a failure and
-- queued the report to try again forever. In 7,712 rows the largest `saved`
-- ever stored was 29. Any player finishing three or more levels between
-- reports had those rescues silently refused for as long as they kept playing.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt around it.
-- The data is copied rather than dropped: those rows are the counter's history
-- and the event ids in them are what makes a retry idempotent.

CREATE TABLE IF NOT EXISTS rescue_events_rebuilt (
  event_id TEXT PRIMARY KEY,
  saved INTEGER NOT NULL CHECK (saved BETWEEN 1 AND 90),
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO rescue_events_rebuilt (event_id, saved, applied, created_at)
  SELECT event_id, saved, applied, created_at FROM rescue_events;

DROP TABLE rescue_events;

ALTER TABLE rescue_events_rebuilt RENAME TO rescue_events;

-- Dropping the table dropped its index with it.
CREATE INDEX IF NOT EXISTS rescue_events_created_at ON rescue_events(created_at);

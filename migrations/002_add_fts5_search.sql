-- Full-text search virtual table for events
-- Uses FTS5 for fast content search across thread messages

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  content,
  thread_id UNINDEXED,
  content='events',
  content_rowid='id'
);

-- Populate FTS5 table from existing events
-- Extract text content from JSON payload
INSERT INTO events_fts(rowid, content, thread_id)
SELECT id, json_extract(payload, '$.message.text'), thread_id
FROM events
WHERE json_extract(payload, '$.message.text') IS NOT NULL;

-- Trigger to keep FTS5 in sync on INSERT
CREATE TRIGGER IF NOT EXISTS events_fts_insert AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, content, thread_id)
  SELECT NEW.id, json_extract(NEW.payload, '$.message.text'), NEW.thread_id
  WHERE json_extract(NEW.payload, '$.message.text') IS NOT NULL;
END;

-- Trigger to keep FTS5 in sync on UPDATE
CREATE TRIGGER IF NOT EXISTS events_fts_update AFTER UPDATE ON events BEGIN
  DELETE FROM events_fts WHERE rowid = OLD.id;
  INSERT INTO events_fts(rowid, content, thread_id)
  SELECT NEW.id, json_extract(NEW.payload, '$.message.text'), NEW.thread_id
  WHERE json_extract(NEW.payload, '$.message.text') IS NOT NULL;
END;

-- Trigger to keep FTS5 in sync on DELETE
CREATE TRIGGER IF NOT EXISTS events_fts_delete AFTER DELETE ON events BEGIN
  DELETE FROM events_fts WHERE rowid = OLD.id;
END;

-- Add archived flag support (soft-delete for threads)
-- We'll track this in a new table to avoid schema changes to events
CREATE TABLE IF NOT EXISTS thread_metadata (
  thread_id TEXT PRIMARY KEY,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_metadata_archived ON thread_metadata(archived, archived_at);

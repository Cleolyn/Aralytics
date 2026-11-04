CREATE TABLE IF NOT EXISTS upload_chunks (
  object_key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (object_key, chunk_index)
) WITHOUT ROWID;

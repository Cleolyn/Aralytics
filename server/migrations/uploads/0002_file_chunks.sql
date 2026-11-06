-- Binary file chunks (about 1 MiB each). Rowid table on purpose; every shard shares this migration.
CREATE TABLE IF NOT EXISTS file_chunks (
  object_key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (object_key, chunk_index)
);

CREATE TABLE IF NOT EXISTS confessions (
  id TEXT PRIMARY KEY,
  confession TEXT NOT NULL,
  agent_name TEXT,
  created_at TEXT NOT NULL
);

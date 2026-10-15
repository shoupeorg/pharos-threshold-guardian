CREATE TABLE IF NOT EXISTS action_records (
  action_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_records_created_at
  ON action_records(created_at DESC);


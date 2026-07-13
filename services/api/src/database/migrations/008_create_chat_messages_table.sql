-- Migration 008: Chat Messages
-- GAP-11a: This table has a TypeORM entity but no SQL migration.
-- Without this file, chat is broken on any clean deployment (synchronize=false).

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name   VARCHAR(255) NOT NULL,
  message     TEXT         NOT NULL,
  timestamp   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id  ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp   ON chat_messages(session_id, timestamp DESC);

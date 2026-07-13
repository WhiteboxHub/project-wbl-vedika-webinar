-- Migration 010: Questions (Q&A feature)
-- GAP-11c: Q&A entities exist but no SQL migration — broken on clean deploys.

CREATE TABLE IF NOT EXISTS questions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name   VARCHAR(255) NOT NULL,
  text        TEXT         NOT NULL,
  status      VARCHAR(50)  NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | answered
  upvotes     INTEGER      NOT NULL DEFAULT 0,
  answer      TEXT,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_session_id ON questions(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_status     ON questions(session_id, status);

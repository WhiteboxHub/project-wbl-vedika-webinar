-- Migration 009: Polls, Poll Options, Poll Votes
-- GAP-11b: Three related tables for the polling feature.
-- Without these, poll creation crashes with "relation does not exist" on clean deploys.

CREATE TABLE IF NOT EXISTS polls (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID      NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question    TEXT      NOT NULL,
  is_active   BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_options (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id  UUID    NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  text     VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    UUID      NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id  UUID      NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, user_id)  -- one vote per poll per user
);

CREATE INDEX IF NOT EXISTS idx_polls_session_id       ON polls(session_id);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id   ON poll_options(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id     ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option_id   ON poll_votes(option_id);

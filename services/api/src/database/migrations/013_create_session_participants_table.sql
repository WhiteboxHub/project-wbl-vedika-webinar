-- Migration 013: Session Participants (Enterprise Role Model)
-- GAP-11f: SessionParticipantEntity has a migration in 007 for the participant framework
-- but the actual session_participants table with all enterprise columns is missing.
-- This migration creates it with all columns defined in the entity.

CREATE TABLE IF NOT EXISTS session_participants (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name        VARCHAR(255) NOT NULL DEFAULT '',
  role                VARCHAR(32)  NOT NULL DEFAULT 'attendee',
  can_publish_audio   BOOLEAN      NOT NULL DEFAULT FALSE,
  can_publish_video   BOOLEAN      NOT NULL DEFAULT FALSE,
  can_share_screen    BOOLEAN      NOT NULL DEFAULT FALSE,
  joined_at           TIMESTAMPTZ,
  left_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user    ON session_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_role    ON session_participants(session_id, role);

-- Migration 011: Waiting Room Entries
-- GAP-11d: WaitingRoomEntryEntity exists but no SQL migration.
-- The waiting room state machine crashes on clean deploys without this table.

CREATE TABLE IF NOT EXISTS waiting_room_entries (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  VARCHAR(255) NOT NULL,
  state         VARCHAR(50)  NOT NULL DEFAULT 'waiting',  -- waiting | admitted | left
  joined_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  admitted_at   TIMESTAMP,
  left_at       TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waiting_room_session  ON waiting_room_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_waiting_room_state    ON waiting_room_entries(session_id, state);
-- Only one active waiting entry per user per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_waiting_room_unique ON waiting_room_entries(session_id, user_id)
  WHERE state NOT IN ('left');

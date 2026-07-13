-- Migration 012: Email Verifications
-- GAP-11e: EmailVerificationEntity exists but no SQL migration.
-- Email verification (register-by-slug flow) crashes on clean deploys without this table.

CREATE TABLE IF NOT EXISTS email_verifications (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex of the raw token
  expires_at   TIMESTAMP NOT NULL,
  verified_at  TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_token_hash ON email_verifications(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id    ON email_verifications(user_id);
-- Enforce one pending verification per user at a time (verified_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_email_verifications_pending    ON email_verifications(user_id)
  WHERE verified_at IS NULL;

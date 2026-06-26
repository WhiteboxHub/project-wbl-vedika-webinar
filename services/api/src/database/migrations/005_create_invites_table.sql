-- Create invites table
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invites_session_id ON invites(session_id);
CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_expires_at ON invites(expires_at);

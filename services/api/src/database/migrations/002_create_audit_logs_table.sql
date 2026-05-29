-- Create audit logs table
CREATE TYPE audit_action AS ENUM (
  'recording_start',
  'recording_stop',
  'recording_processing_success',
  'recording_processing_failure'
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action audit_action NOT NULL,
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  recording_id UUID,
  metadata JSONB,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_recording_id ON audit_logs(recording_id);
CREATE INDEX idx_audit_logs_session_id ON audit_logs(session_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

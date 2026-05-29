-- Create recordings table
CREATE TYPE recording_status AS ENUM (
  'recording_starting',
  'recording_active',
  'processing_queued',
  'processing',
  'ready',
  'failed'
);

CREATE TYPE recording_resolution AS ENUM ('1080p', '720p');

CREATE TABLE recordings (
  id UUID PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  status recording_status NOT NULL DEFAULT 'recording_starting',
  egress_id VARCHAR(255),
  raw_path TEXT,
  final_path TEXT,
  duration INTEGER,
  file_size BIGINT,
  resolution recording_resolution,
  error TEXT,
  ffmpeg_logs TEXT,
  started_at TIMESTAMP NOT NULL,
  stopped_at TIMESTAMP,
  processed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recordings_session_id ON recordings(session_id);
CREATE INDEX idx_recordings_status ON recordings(status);
CREATE INDEX idx_recordings_created_at ON recordings(created_at DESC);

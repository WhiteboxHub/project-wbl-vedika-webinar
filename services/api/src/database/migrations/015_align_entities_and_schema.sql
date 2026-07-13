-- Migration 015: Align Database Schema with TypeORM Entities
-- Add missing columns to sessions, chat_messages, and questions tables.

-- 1. Align sessions table with SessionEntity
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS slug VARCHAR(50) UNIQUE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMP;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMP;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS timezone VARCHAR(100);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auto_start BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recurring_pattern VARCHAR(50);

-- 2. Align chat_messages table with ChatMessageEntity
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'chat_messages'::regclass AND attname = 'timestamp') AND
     NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'chat_messages'::regclass AND attname = 'created_at') THEN
    ALTER TABLE chat_messages RENAME COLUMN timestamp TO created_at;
  END IF;
END $$;

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_moderated BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Align questions table with QuestionEntity
ALTER TABLE questions ADD COLUMN IF NOT EXISTS upvoted_by TEXT;

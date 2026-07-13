-- Migration 014: Add email_verified column to users table
-- The users table was created in migration 003 without this column,
-- but the UserEntity has had it since the email verification feature was added.
-- Without this column, registerBySlug crashes with "column email_verified does not exist".

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

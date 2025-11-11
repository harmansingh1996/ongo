-- Database Schema Template for Youware Backend
-- Copy this file to: backend/schema.sql
-- Update this file whenever you modify database structure

-- Users table (optional - if storing user info)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encrypted_yw_id TEXT NOT NULL UNIQUE,
  stripe_connect_account_id TEXT,
  display_name TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_users_encrypted_yw_id ON users(encrypted_yw_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_connect_account_id
  ON users(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

-- Example: User data table
CREATE TABLE IF NOT EXISTS user_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,  -- Use encrypted_yw_id from headers
  content TEXT,
  file_path TEXT,  -- For R2 file paths (not URLs)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_data_created_at ON user_data(created_at DESC);

-- Example: Posts table
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  image_path TEXT,  -- R2 file path
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Example: Leaderboard/Scores table
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  metadata TEXT,  -- JSON string for additional data
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_scores_score_desc ON scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores(user_id);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,
  user_id TEXT NOT NULL,
  rider_id TEXT,
  driver_id TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CAD',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL,
  payment_method_id TEXT,
  payment_intent_id TEXT,
  authorization_id TEXT,
  transaction_id TEXT,
  refund_id TEXT,
  refund_reason TEXT,
  payment_data JSON,
  expires_at TEXT,
  captured_at TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);

-- Migration: If payments table already exists without refund_reason column, uncomment and run:
-- ALTER TABLE payments ADD COLUMN refund_reason TEXT;

-- =========================================================================
-- HABIT KINGDOM - SUPABASE DATABASE SCHEMA
-- =========================================================================
-- This script mirrors the local SQLite/Drizzle tables to PostgreSQL.
-- Execute this script in your Supabase SQL Editor (https://supabase.com/dashboard).

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
DROP TABLE IF EXISTS wallet CASCADE;
DROP TABLE IF EXISTS redemptions CASCADE;
DROP TABLE IF EXISTS completions CASCADE;
DROP TABLE IF EXISTS rewards CASCADE;
DROP TABLE IF EXISTS habits CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 1. PROFILES TABLE
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('child', 'parent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. HABITS TABLE
CREATE TABLE habits (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    coin_reward INTEGER NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    frequency TEXT DEFAULT 'once' CHECK (frequency IN ('once', 'daily', 'weekly', 'monthly')),
    scheduled_time TEXT,
    days_of_week TEXT, -- JSON-stringified array
    day_of_month INTEGER,
    is_paused BOOLEAN DEFAULT FALSE NOT NULL,
    pause_until TIMESTAMP WITH TIME ZONE,
    notifications_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    notification_time TEXT,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 3. REWARDS TABLE
CREATE TABLE rewards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    cost INTEGER NOT NULL,
    color TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 4. COMPLETIONS TABLE
CREATE TABLE completions (
    id TEXT PRIMARY KEY,
    habit_id TEXT REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
    habit_name TEXT NOT NULL,
    coin_reward INTEGER NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL
);

-- 5. REDEMPTIONS TABLE
CREATE TABLE redemptions (
    id TEXT PRIMARY KEY,
    reward_id TEXT REFERENCES rewards(id) ON DELETE CASCADE NOT NULL,
    reward_name TEXT NOT NULL,
    cost INTEGER NOT NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL
);

-- 6. WALLET TABLE
CREATE TABLE wallet (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    balance INTEGER DEFAULT 0 NOT NULL
);

-- 7. ACHIEVEMENTS TABLE
CREATE TABLE achievements (
    id TEXT PRIMARY KEY,
    trophy_id TEXT NOT NULL,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL
);

-- 8. USER STATS TABLE
CREATE TABLE user_stats (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    total_completions INTEGER DEFAULT 0 NOT NULL,
    longest_streak INTEGER DEFAULT 0 NOT NULL,
    longest_single_habit_streak INTEGER DEFAULT 0 NOT NULL,
    longest_single_habit_id TEXT
);

-- Create indexes for performance optimization
CREATE INDEX idx_profiles_type ON profiles(type);
CREATE INDEX idx_habits_profile_id ON habits(profile_id);
CREATE INDEX idx_habits_deleted_at ON habits(deleted_at);
CREATE INDEX idx_rewards_profile_id ON rewards(profile_id);
CREATE INDEX idx_rewards_deleted_at ON rewards(deleted_at);
CREATE INDEX idx_completions_profile_id ON completions(profile_id);
CREATE INDEX idx_completions_habit_id ON completions(habit_id);
CREATE INDEX idx_completions_profile_completed ON completions(profile_id, completed_at);
CREATE INDEX idx_redemptions_profile_id ON redemptions(profile_id);
CREATE INDEX idx_redemptions_reward_id ON redemptions(reward_id);
CREATE INDEX idx_achievements_profile_id ON achievements(profile_id);
CREATE INDEX idx_achievements_trophy_id ON achievements(trophy_id);

-- Enable Row-Level Security (optional, for simple integration we keep it open or manage it via Anon)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Simple public read/write access policies (for development/anonymous syncing)
CREATE POLICY "Public Read/Write Profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write Habits" ON habits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write Rewards" ON rewards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write Completions" ON completions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write Redemptions" ON redemptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write Wallet" ON wallet FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write Achievements" ON achievements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Read/Write User Stats" ON user_stats FOR ALL USING (true) WITH CHECK (true);

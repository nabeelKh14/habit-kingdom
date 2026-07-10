-- =========================================================================
-- HABIT KINGDOM - PERFECTED SUPABASE DATABASE SCHEMA WITH ROBUST SECURITY
-- =========================================================================
-- This script configures a highly secure, automated PostgreSQL database
-- with strict Row-Level Security (RLS) linked directly to Supabase Auth.

-- Drop existing tables to ensure a clean slate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TABLE IF EXISTS user_stats CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
DROP TABLE IF EXISTS wallet CASCADE;
DROP TABLE IF EXISTS redemptions CASCADE;
DROP TABLE IF EXISTS completions CASCADE;
DROP TABLE IF EXISTS rewards CASCADE;
DROP TABLE IF EXISTS habits CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 1. PROFILES TABLE (Linked directly to Supabase Auth Users)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('child', 'parent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. HABITS TABLE
CREATE TABLE habits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    coin_reward INTEGER NOT NULL CHECK (coin_reward >= 0),
    color TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('once', 'daily', 'weekly', 'monthly')),
    scheduled_time TEXT,
    days_of_week TEXT, -- JSON-stringified array of days (e.g. "[1,3,5]")
    day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
    is_paused BOOLEAN DEFAULT FALSE NOT NULL,
    pause_until TIMESTAMP WITH TIME ZONE,
    notifications_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    notification_time TEXT,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 3. REWARDS TABLE
CREATE TABLE rewards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    cost INTEGER NOT NULL CHECK (cost >= 0),
    color TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 4. COMPLETIONS TABLE
CREATE TABLE completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
    habit_name TEXT NOT NULL,
    coin_reward INTEGER NOT NULL CHECK (coin_reward >= 0),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL
);

-- 5. REDEMPTIONS TABLE
CREATE TABLE redemptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reward_id UUID REFERENCES rewards(id) ON DELETE CASCADE NOT NULL,
    reward_name TEXT NOT NULL,
    cost INTEGER NOT NULL CHECK (cost >= 0),
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL
);

-- 6. WALLET TABLE
CREATE TABLE wallet (
    profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    balance INTEGER DEFAULT 0 NOT NULL CHECK (balance >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. ACHIEVEMENTS TABLE
CREATE TABLE achievements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trophy_id TEXT NOT NULL,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL
);

-- 8. USER STATS TABLE
CREATE TABLE user_stats (
    profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    total_completions INTEGER DEFAULT 0 NOT NULL CHECK (total_completions >= 0),
    longest_streak INTEGER DEFAULT 0 NOT NULL CHECK (longest_streak >= 0),
    longest_single_habit_streak INTEGER DEFAULT 0 NOT NULL CHECK (longest_single_habit_streak >= 0),
    longest_single_habit_id UUID,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 9. PUSH TOKENS TABLE (Expo Push Notification tokens)
CREATE TABLE push_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    is_valid BOOLEAN DEFAULT TRUE NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_error TEXT,
    -- One token per platform per profile
    UNIQUE(profile_id, token)
);

-- 10. NOTIFICATION SETTINGS TABLE (per-profile reminder preferences)
CREATE TABLE notification_settings (
    profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    midday_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    midday_time TEXT DEFAULT '12:00' NOT NULL,
    night_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    night_time TEXT DEFAULT '21:00' NOT NULL,
    timezone TEXT DEFAULT 'UTC' NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create performance optimization indexes
CREATE INDEX idx_profiles_type ON profiles(type);
CREATE INDEX idx_push_tokens_profile_id ON push_tokens(profile_id);
CREATE INDEX idx_push_tokens_token ON push_tokens(token);
CREATE INDEX idx_push_tokens_platform ON push_tokens(platform);
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

-- Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_habits_updated_at BEFORE UPDATE ON habits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rewards_updated_at BEFORE UPDATE ON rewards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_completions_updated_at BEFORE UPDATE ON completions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_redemptions_updated_at BEFORE UPDATE ON redemptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallet_updated_at BEFORE UPDATE ON wallet FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_achievements_updated_at BEFORE UPDATE ON achievements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON user_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_push_tokens_updated_at BEFORE UPDATE ON push_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON notification_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row-Level Security (RLS) globally on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Create ultra-secure RLS policies bound strictly to authenticated user ID (auth.uid())
CREATE POLICY "Users can only read/write their own profile" 
    ON profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can only read/write their own habits" 
    ON habits FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can only read/write their own rewards" 
    ON rewards FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can only read/write their own completions" 
    ON completions FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can only read/write their own redemptions" 
    ON redemptions FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can only read/write their own wallet" 
    ON wallet FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can only read/write their own achievements" 
    ON achievements FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can only read/write their own stats" 
    ON user_stats FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can only read/write their own push tokens" 
    ON push_tokens FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can only read/write their own notification settings" 
    ON notification_settings FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);


-- ==================== AUTOMATED USER PROVISIONING TRIGGER ====================
-- This trigger automatically handles safe, secure default data creation
-- on Supabase Auth Phone / OTP signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    -- 1. Create Profile row
    INSERT INTO public.profiles (id, name, type, created_at, updated_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', 'Habit Hero'),
        COALESCE(new.raw_user_meta_data->>'type', 'child'),
        NOW(),
        NOW()
    );

    -- 2. Initialize Wallet
    INSERT INTO public.wallet (profile_id, balance, updated_at)
    VALUES (new.id, 0, NOW());

    -- 3. Initialize User Stats
    INSERT INTO public.user_stats (profile_id, total_completions, longest_streak, longest_single_habit_streak, updated_at)
    VALUES (new.id, 0, 0, 0, NOW());

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

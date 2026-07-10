-- =========================================================================
-- HABIT KINGDOM — SERVER DOMAIN TABLES (Migration 0004)
-- =========================================================================
-- Authoritative server-side store for all domain entities, keyed on
-- server_users.id (the server's own bcrypt auth). Prefixed "server_" to avoid
-- colliding with the Supabase-auth schema tables in 0001 (which are keyed on
-- profiles/id and owned by GoTrue). These tables are the Express server's
-- durable store; they mirror shared/schema.ts column shapes so the mobile
-- app's sync layer can push/pull 1:1. Each has a real updated_at cursor.

-- Drop any stale no-op-created tables from the first (colliding) 0004 attempt
DROP TABLE IF EXISTS public.habits, public.rewards, public.completions, public.redemptions, public.wallet, public.user_stats, public.achievements, public.purchased_skills;

-- ---- server_habits ----
CREATE TABLE IF NOT EXISTS public.server_habits (
  id text PRIMARY KEY,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'star',
  coin_reward integer NOT NULL DEFAULT 10,
  color text NOT NULL DEFAULT '#4A90D9',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  frequency text NOT NULL DEFAULT 'once' CHECK (frequency IN ('once','daily','weekly','monthly')),
  scheduled_time text,
  days_of_week text,
  day_of_month integer,
  is_paused boolean NOT NULL DEFAULT false,
  pause_until text,
  notifications_enabled boolean NOT NULL DEFAULT false,
  notification_time text,
  profile_id text NOT NULL REFERENCES public.server_users(id) ON DELETE CASCADE,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_server_habits_profile_id ON public.server_habits (profile_id);
CREATE INDEX IF NOT EXISTS idx_server_habits_deleted_at ON public.server_habits (deleted_at);

-- ---- server_rewards ----
CREATE TABLE IF NOT EXISTS public.server_rewards (
  id text PRIMARY KEY,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'gift',
  cost integer NOT NULL DEFAULT 100,
  color text NOT NULL DEFAULT '#8B5CF6',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  profile_id text NOT NULL REFERENCES public.server_users(id) ON DELETE CASCADE,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_server_rewards_profile_id ON public.server_rewards (profile_id);
CREATE INDEX IF NOT EXISTS idx_server_rewards_deleted_at ON public.server_rewards (deleted_at);

-- ---- server_completions ----
CREATE TABLE IF NOT EXISTS public.server_completions (
  id text PRIMARY KEY,
  habit_id text NOT NULL,
  habit_name text NOT NULL,
  coin_reward integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  profile_id text NOT NULL REFERENCES public.server_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_server_completions_profile_id ON public.server_completions (profile_id);
CREATE INDEX IF NOT EXISTS idx_server_completions_habit_id ON public.server_completions (habit_id);

-- ---- server_redemptions ----
CREATE TABLE IF NOT EXISTS public.server_redemptions (
  id text PRIMARY KEY,
  reward_id text NOT NULL,
  reward_name text NOT NULL,
  cost integer NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  profile_id text NOT NULL REFERENCES public.server_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_server_redemptions_profile_id ON public.server_redemptions (profile_id);

-- ---- server_wallet ----
CREATE TABLE IF NOT EXISTS public.server_wallet (
  profile_id text PRIMARY KEY REFERENCES public.server_users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---- server_user_stats ----
CREATE TABLE IF NOT EXISTS public.server_user_stats (
  profile_id text PRIMARY KEY REFERENCES public.server_users(id) ON DELETE CASCADE,
  total_completions integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  longest_single_habit_streak integer NOT NULL DEFAULT 0,
  longest_single_habit_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---- server_achievements ----
CREATE TABLE IF NOT EXISTS public.server_achievements (
  id text PRIMARY KEY,
  trophy_id text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  profile_id text NOT NULL REFERENCES public.server_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_server_achievements_profile_id ON public.server_achievements (profile_id);

-- ---- server_purchased_skills ----
CREATE TABLE IF NOT EXISTS public.server_purchased_skills (
  id text PRIMARY KEY,
  skill_id text NOT NULL,
  profile_id text NOT NULL REFERENCES public.server_users(id) ON DELETE CASCADE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_server_purchased_skills_profile_id ON public.server_purchased_skills (profile_id);

-- ---- shared updated_at trigger ----
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'server_habits','server_rewards','server_completions','server_redemptions',
    'server_wallet','server_user_stats','server_achievements','server_purchased_skills'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at_on_%1$I ON public.%1$I;
       CREATE TRIGGER set_updated_at_on_%1$I
         BEFORE UPDATE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t
    );
  END LOOP;
END
$$;

-- ---- grants ----
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- =========================================================================
-- HABIT KINGDOM — FAMILY RELATIONSHIP LAYER (Migration 0002)
-- =========================================================================
-- Adds the missing glue that makes the real product model work:
--   1 parent OR 2 parents  <->  N children
--   each child = its own profile with own habits / rewards / points / avatar
--
-- The base schema (0001) had NO parent<->child link and RLS was strictly
-- auth.uid() = profile_id, so a parent literally could not query their
-- children's rows. This migration adds families + family_members and rewrites
-- RLS so a parent can read/write the rows of every child in their family.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. FAMILIES TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.families (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'My Family',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- -------------------------------------------------------------------------
-- 2. FAMILY_MEMBERS (junction: who belongs to which family, in what role)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_members (
    family_id UUID REFERENCES public.families(id) ON DELETE CASCADE NOT NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
    -- exactly one parent per family is the "primary" (the one who set it up);
    -- the second parent (if any) is is_primary_parent = false.
    is_primary_parent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (family_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_profile ON public.family_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_family_members_family ON public.family_members(family_id);

-- -------------------------------------------------------------------------
-- 3. ENFORCE "1 OR 2 PARENTS" PER FAMILY (children are unlimited)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_family_parent_count()
RETURNS TRIGGER AS $$
DECLARE
    parent_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO parent_count
    FROM public.family_members
    WHERE family_id = NEW.family_id AND role = 'parent';

    IF parent_count > 2 THEN
        RAISE EXCEPTION 'A family may have at most 2 parents (got %)', parent_count;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_family_parent_count ON public.family_members;
CREATE TRIGGER trg_check_family_parent_count
    AFTER INSERT OR UPDATE ON public.family_members
    FOR EACH ROW EXECUTE FUNCTION public.check_family_parent_count();

-- Ensure at most ONE primary parent per family
CREATE UNIQUE INDEX IF NOT EXISTS uniq_primary_parent_per_family
    ON public.family_members (family_id)
    WHERE role = 'parent' AND is_primary_parent = TRUE;

-- -------------------------------------------------------------------------
-- 4. HELPER FUNCTIONS FOR RLS
-- -------------------------------------------------------------------------
-- True if the calling auth user is a member of the same family as profile_id.
CREATE OR REPLACE FUNCTION public.same_family_as(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.family_members fm_caller
        JOIN public.family_members fm_target
          ON fm_caller.family_id = fm_target.family_id
        WHERE fm_caller.profile_id = auth.uid()
          AND fm_target.profile_id = same_family_as.profile_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- True if the calling auth user is a PARENT in the same family as profile_id.
-- Used so parents can manage (write) their children's rows, but children
-- cannot manage a sibling's or a parent's rows.
CREATE OR REPLACE FUNCTION public.is_parent_of(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.family_members fm_caller
        JOIN public.family_members fm_target
          ON fm_caller.family_id = fm_target.family_id
        WHERE fm_caller.profile_id = auth.uid()
          AND fm_caller.role = 'parent'
          AND fm_target.profile_id = is_parent_of.profile_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -------------------------------------------------------------------------
-- 5. REWRITE RLS: own rows ALWAYS; children's rows if you're their parent
-- -------------------------------------------------------------------------
-- Drop the overly-strict per-table policies from 0001 and replace with
-- policies that allow: (a) the profile itself, and (b) a parent in the same
-- family (read for all; write only for children, never for another parent).

-- profiles: a user can read any profile in their family (to show the family
-- switcher / avatars), but only update their own.
DROP POLICY IF EXISTS "Users can only read/write their own profile" ON public.profiles;
CREATE POLICY "profiles_self_all" ON public.profiles
    FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_family_read" ON public.profiles
    FOR SELECT USING (public.same_family_as(id));

-- habits / rewards / completions / redemptions / wallet / achievements /
-- user_stats / push_tokens / notification_settings:
--   SELECT: self OR a parent in the family
--   INSERT/UPDATE/DELETE: self OR a parent in the family (parent manages kids)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY[
            'habits','rewards','completions','redemptions',
            'wallet','achievements','user_stats','push_tokens','notification_settings'
        ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Users can only read/write their own %1$I" ON public.%1$I;', t);
        EXECUTE format(
            'CREATE POLICY "%1$I_family_access" ON public.%1$I
               FOR ALL
               USING (auth.uid() = profile_id OR public.is_parent_of(profile_id))
               WITH CHECK (auth.uid() = profile_id OR public.is_parent_of(profile_id));',
            t
        );
    END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- 6. ONBOARDING: new auth user gets a default solo family + membership
-- -------------------------------------------------------------------------
-- The 0001 trigger only created profile/wallet/stats. We now also create a
-- family for the new user and add them as a member (parent by default; the
-- app can pass type='child' in user metadata for a kid profile). The family
-- acts as the anchor the other parent / children get linked into later.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    new_family_id UUID;
    user_type TEXT;
BEGIN
    user_type := COALESCE(new.raw_user_meta_data->>'type', 'child');

    -- 1. Profile row
    INSERT INTO public.profiles (id, name, type, created_at, updated_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', 'Habit Hero'),
        user_type,
        NOW(),
        NOW()
    );

    -- 2. Create a default family for this user
    INSERT INTO public.families (name, created_at, updated_at)
    VALUES ('My Family', NOW(), NOW())
    RETURNING id INTO new_family_id;

    -- 3. Link user to that family
    INSERT INTO public.family_members (family_id, profile_id, role, is_primary_parent, created_at)
    VALUES (
        new_family_id,
        new.id,
        CASE WHEN user_type = 'parent' THEN 'parent' ELSE 'child' END,
        CASE WHEN user_type = 'parent' THEN TRUE ELSE FALSE END,
        NOW()
    );

    -- 4. Initialize Wallet
    INSERT INTO public.wallet (profile_id, balance, updated_at)
    VALUES (new.id, 0, NOW());

    -- 5. Initialize User Stats
    INSERT INTO public.user_stats (profile_id, total_completions, longest_streak, longest_single_habit_streak, updated_at)
    VALUES (new.id, 0, 0, 0, NOW());

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (The on_auth_user_created trigger from 0001 is reused; it just now calls
--  the updated function above.)

-- updated_at trigger for families
CREATE TRIGGER update_families_updated_at
    BEFORE UPDATE ON public.families
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------
-- 7. GRANTS so the Supabase API roles (anon / authenticated) can reach tables
--    (the base schema 0001 omitted these; without them the API gets
--    "permission denied". RLS still governs what rows are visible.)
-- -------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

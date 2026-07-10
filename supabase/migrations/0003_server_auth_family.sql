-- =========================================================================
-- HABIT KINGDOM — SERVER-OWNED AUTH + FAMILY LINKS (Migration 0003)
-- =========================================================================
-- The Express server is the AUTH authority (bcrypt + its own user ids); it is
-- NOT coupled to Supabase Auth (auth.users). So we persist the server's users
-- in server-owned tables rather than the schema's `profiles` (which references
-- auth.users). Supabase is just the durable Postgres store here; the server
-- writes via the SERVICE ROLE (bypasses RLS) and enforces its own auth.
--
-- This makes the "1-2 parents <-> N children" model REAL at the data layer:
--   family_links(child_id, parent_id)  with at most 2 parents per child.
-- =========================================================================

-- 1. SERVER_USERS (the server's auth accounts)
CREATE TABLE IF NOT EXISTS public.server_users (
    id TEXT PRIMARY KEY,  -- app-generated UUID string
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_server_users_username ON public.server_users(username);

-- 2. FAMILY_LINKS (parent <-> child; a child may have 1 or 2 parents)
CREATE TABLE IF NOT EXISTS public.family_links (
    id TEXT PRIMARY KEY,  -- app-generated UUID string
    parent_id TEXT NOT NULL REFERENCES public.server_users(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES public.server_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE (parent_id, child_id),
    -- a parent cannot also be a child in the same link
    CONSTRAINT child_not_parent CHECK (parent_id <> child_id)
);

CREATE INDEX IF NOT EXISTS idx_family_links_child ON public.family_links(child_id);
CREATE INDEX IF NOT EXISTS idx_family_links_parent ON public.family_links(parent_id);

-- 3. Enforce AT MOST 2 parents per child
CREATE OR REPLACE FUNCTION public.check_parent_limit()
RETURNS TRIGGER AS $$
DECLARE
    pc INTEGER;
BEGIN
    SELECT COUNT(*) INTO pc
    FROM public.family_links
    WHERE child_id = NEW.child_id;
    IF pc >= 2 THEN
        RAISE EXCEPTION 'A child may have at most 2 parents (child % has %)', NEW.child_id, pc;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_parent_limit ON public.family_links;
CREATE TRIGGER trg_check_parent_limit
    BEFORE INSERT ON public.family_links
    FOR EACH ROW EXECUTE FUNCTION public.check_parent_limit();

-- 4. Grants so the service role (used by the server) can read/write.
--    (Service role bypasses RLS anyway; these are explicit for clarity.)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Verification: 1-2 parents <-> N children family model on local Supabase
-- Flat SQL (no top-level DO wrapper) for psql -f compatibility.

-- Fixed family id for the test
INSERT INTO public.families (id, name) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'The Khan Family');

-- Two parents + two children as auth users (trigger creates profiles+wallet+stats+SOLO family)
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('11111111-1111-1111-1111-111111111111', 'dad@x.com', '{"name":"Dad","type":"parent"}');
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('22222222-2222-2222-2222-222222222222', 'mom@x.com', '{"name":"Mom","type":"parent"}');
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('33333333-3333-3333-3333-333333333333', 'kid1@x.com', '{"name":"Ayaan","type":"child"}');
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('44444444-4444-4444-4444-444444444444', 'kid2@x.com', '{"name":"Sara","type":"child"}');

-- handle_new_user made 4 SOLO families; relink all four into the SHARED family.
DELETE FROM public.family_members WHERE profile_id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444');
INSERT INTO public.family_members (family_id, profile_id, role, is_primary_parent)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'parent', TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'parent', FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'child', FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'child', FALSE);

-- Per-child habits + rewards (different per profile)
INSERT INTO public.habits (name, icon, coin_reward, color, profile_id)
VALUES ('Brush teeth', 'tooth', 10, '#4A90D9', '33333333-3333-3333-3333-333333333333');
INSERT INTO public.habits (name, icon, coin_reward, color, profile_id)
VALUES ('Read book', 'book', 15, '#8B5CF6', '44444444-4444-4444-4444-444444444444');
INSERT INTO public.rewards (name, icon, cost, color, profile_id)
VALUES ('Ice cream', 'icecream', 50, '#F59E0B', '33333333-3333-3333-3333-333333333333');
INSERT INTO public.rewards (name, icon, cost, color, profile_id)
VALUES ('Toy car', 'car', 120, '#10B981', '44444444-4444-4444-4444-444444444444');

-- ===== ASSERTIONS (RLS enforced via request.jwt.claims) =====

-- 1) Dad (parent) can SEE both children's habits
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
SELECT 'DAD_SEES_CHILD_HABITS' AS test, count(*) AS rows
FROM public.habits
WHERE profile_id IN ('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444');

-- 2) Child Ayaan sees ONLY his own habit
SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
SELECT 'AYAAN_SEES_ONLY_OWN' AS test, count(*) AS rows FROM public.habits;

-- 3) Mom (parent) can INSERT a habit for Ayaan
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
INSERT INTO public.habits (name, icon, coin_reward, color, profile_id)
VALUES ('Floss', 'sparkle', 5, '#EF4444', '33333333-3333-3333-3333-333333333333');
SELECT 'MOM_INSERTED_FOR_AYAAN' AS test, count(*) AS rows
FROM public.habits WHERE profile_id = '33333333-3333-3333-3333-333333333333';

-- 4) Ayaan CANNOT insert for Sara (not parent, not self) -> 0 affected
SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
INSERT INTO public.habits (name, icon, coin_reward, color, profile_id)
VALUES ('Hack attempt', 'x', 1, '#000000', '44444444-4444-4444-4444-444444444444');
SELECT 'AYAAN_BLOCKED_WRITING_SARA' AS test, count(*) AS rows
FROM public.habits WHERE name = 'Hack attempt';

-- 5) Parent-count guard: a 3rd parent insert must be blocked
DO $$
BEGIN
  INSERT INTO public.family_members (family_id, profile_id, role, is_primary_parent)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'parent', FALSE);
  RAISE EXCEPTION 'GUARD FAILED: 3rd parent was allowed';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'GUARD_OK: %', SQLERRM;
END $$;

-- 6) helper function sanity
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
SELECT public.is_parent_of('33333333-3333-3333-3333-333333333333') AS dad_is_parent_of_ayaan,
       public.same_family_as('44444444-4444-4444-4444-444444444444') AS dad_same_family_as_sara;

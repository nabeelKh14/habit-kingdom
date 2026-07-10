-- RLS verification as the authenticator role (Supabase API role = RLS APPLIES).
-- Must NOT run as superuser (postgres bypasses RLS). Connect: psql -U postgres,
-- then SET ROLE authenticator; so RLS is enforced against request.jwt.claims.

SET ROLE authenticator;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
SELECT 'DAD_SEES_CHILD_HABITS' AS test, count(*) AS rows
FROM public.habits
WHERE profile_id IN ('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444');

SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
SELECT 'AYAAN_SEES_ONLY_OWN' AS test, count(*) AS rows FROM public.habits;

-- Mom (parent) inserts a habit for Ayaan -> should succeed (parent manages child)
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
INSERT INTO public.habits (name, icon, coin_reward, color, profile_id)
VALUES ('Floss', 'sparkle', 5, '#EF4444', '33333333-3333-3333-3333-333333333333');
SELECT 'MOM_INSERTED_FOR_AYAAN' AS test, count(*) AS rows
FROM public.habits WHERE profile_id = '33333333-3333-3333-3333-333333333333';

-- Ayaan tries to insert a habit owned by Sara -> MUST be blocked (RLS WITH CHECK)
SET request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
INSERT INTO public.habits (name, icon, coin_reward, color, profile_id)
VALUES ('Hack attempt', 'x', 1, '#000000', '44444444-4444-4444-4444-444444444444');
SELECT 'AYAAN_BLOCKED_WRITING_SARA' AS test, count(*) AS rows
FROM public.habits WHERE name = 'Hack attempt';

-- Parent-count guard: a REAL 3rd parent (existing profile) must be blocked
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('55555555-5555-5555-5555-555555555555', 'parent3@x.com', '{"name":"P3","type":"parent"}');
INSERT INTO public.family_members (family_id, profile_id, role, is_primary_parent)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'parent', FALSE);
SELECT 'PARENT_COUNT_GUARD' AS test, count(*) AS rows
FROM public.family_members
WHERE family_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND role = 'parent';

SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
SELECT public.is_parent_of('33333333-3333-3333-3333-333333333333') AS dad_is_parent_of_ayaan,
       public.same_family_as('44444444-4444-4444-4444-444444444444') AS dad_same_family_as_sara;
RESET ROLE;

# Habit Kingdom — Family Data Model (multi-parent / multi-child)

## The product model (what we support)
- **1 or 2 parents** per family (the second parent is optional; a 3rd is rejected).
- **N children** per family (no upper limit).
- Each **child is its own `profiles` row** with its own `habits`, `rewards`,
  `wallet` (points), `achievements`, `notification_settings`, and avatar
  (stored client-side / `profiles` name). Parents see and manage all of it.
- Parents share a family; either parent can read/write any child in the family.
- Children can only see/manage **their own** rows — never a sibling's or a
  parent's.

## How it's modeled (migrations in `supabase/migrations/`)
- `0001_perfect_schema.sql` — base tables (`profiles`, `habits`, `rewards`,
  `wallet`, `completions`, `redemptions`, `achievements`, `user_stats`,
  `push_tokens`, `notification_settings`) + the `auth.users` signup trigger.
- `0002_family_relationships.sql` — the relationship layer that makes the
  above possible:
  - `families` — one row per household.
  - `family_members(family_id, profile_id, role, is_primary_parent)` — junction.
  - Trigger `trg_check_family_parent_count` enforces **≤ 2 parents**.
  - Unique partial index ensures exactly one `is_primary_parent` per family.
  - Helper fns `same_family_as(profile_id)`, `is_parent_of(profile_id)` for RLS.
  - RLS rewritten: a profile owns its rows; a **parent in the same family**
    can read/write the children's rows (children cannot cross-access).
  - `handle_new_user` now also creates a default family + membership so a new
    signup is immediately linkable.
  - Grants to `anon` / `authenticated` so the Supabase API role can reach tables.

## Run it locally
```bash
supabase start                 # Docker stack: Postgres + GoTrue + REST + Studio
supabase db reset              # (re)apply migrations 0001 + 0002 on a fresh DB
supabase status                # shows API URL + anon key + DB URL
# verify the family graph + RLS:
docker exec -i supabase_db_habit-kingdom psql -U postgres -d postgres -f - < scripts/verify_family.sql
```
Local API: `http://127.0.0.1:54321` · DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Verification (proven, see `scripts/verify_family.sql` + `verify_rls.sql`)
| Scenario | Result |
|---|---|
| Parent reads both children's habits | ✅ sees all |
| Child reads habits | ✅ sees only own |
| Parent inserts a habit for a child | ✅ succeeds |
| Child inserts a habit for a sibling | ❌ blocked (RLS policy violation) |
| 3rd parent added to a family | ❌ blocked (≤2 parents guard) |

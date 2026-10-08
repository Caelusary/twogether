-- Closes direct-insert paths that bypass pairing. Creating and joining a
-- pair only ever goes through create_or_join_pair / join_pair, which are
-- security definer and enforce the invite code and the 2-member cap, so
-- these client-facing insert policies are never needed. Left in place,
-- "profiles: insert own" let a user with no profile insert themselves into
-- any pair whose id they knew.

drop policy if exists "profiles: insert own" on profiles;
drop policy if exists "pairs: insert any authenticated" on pairs;

-- Members may only change the anniversary date, not the invite code.
revoke update on pairs from authenticated, anon;
grant update (since_date) on pairs to authenticated;

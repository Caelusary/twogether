-- Account management RPCs: removing a partner and deleting your own
-- account. Both are security definer because they touch rows the caller
-- can't reach through RLS (the partner's profile, auth.users).

-- Remove partner: moves the other member into a fresh solo pair. The
-- caller keeps the pair (since_date, gallery). The invite code is rotated
-- so the removed partner can't just rejoin with the old one.
create or replace function remove_partner()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair_id uuid := auth_pair_id();
  v_partner_id uuid;
  v_new_pair_id uuid;
begin
  if v_pair_id is null then
    raise exception 'You are not in a pair';
  end if;

  select user_id into v_partner_id from profiles
    where pair_id = v_pair_id and user_id <> auth.uid();
  if v_partner_id is null then
    raise exception 'No partner to remove';
  end if;

  insert into pairs default values returning id into v_new_pair_id;
  update profiles set pair_id = v_new_pair_id where user_id = v_partner_id;
  update pairs set invite_code = upper(substr(md5(random()::text), 1, 6)) where id = v_pair_id;
end;
$$;

-- Delete account: removes the caller from auth.users (profile and mood
-- cascade). If nobody is left in the pair, the pair goes too. Gallery
-- files are cleared client-side first via the Storage API, since
-- storage.objects rows can't be deleted from SQL.
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_id uuid := auth_pair_id();
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  delete from auth.users where id = v_uid;

  if v_pair_id is not null and not exists (select 1 from profiles where pair_id = v_pair_id) then
    delete from upload_log where pair_id = v_pair_id;
    delete from pairs where id = v_pair_id;
  end if;
end;
$$;

revoke execute on function remove_partner() from public, anon;
revoke execute on function delete_my_account() from public, anon;
grant execute on function remove_partner() to authenticated;
grant execute on function delete_my_account() to authenticated;

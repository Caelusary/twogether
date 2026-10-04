-- Joining a partner from inside the app, and editing your display name.

-- Display name editing: users may update their own profile row, and only
-- the display_name column (pair_id stays under RPC control).
drop policy if exists "profiles: update own" on profiles;
create policy "profiles: update own" on profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on profiles from authenticated, anon;
grant update (display_name) on profiles to authenticated;

alter table profiles drop constraint if exists profiles_display_name_len;
alter table profiles add constraint profiles_display_name_len
  check (char_length(btrim(display_name)) between 1 and 40) not valid;

-- Join pair: an unpaired user moves into the pair that owns the code, and
-- their old solo pair is deleted. Call with p_dry_run = true first to
-- validate the code and get the partner's name for the confirm dialog;
-- the client clears the old gallery files between the two calls, since
-- storage.objects rows can't be deleted from SQL.
create or replace function join_pair(p_invite_code text, p_dry_run boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old_pair_id uuid := auth_pair_id();
  v_target_pair_id uuid;
  v_member_count int;
  v_partner_name text;
begin
  if v_old_pair_id is null then
    raise exception 'Your account is not set up yet';
  end if;
  if exists (select 1 from profiles where pair_id = v_old_pair_id and user_id <> v_uid) then
    raise exception 'You already have a partner';
  end if;

  select id into v_target_pair_id from pairs where invite_code = upper(btrim(p_invite_code));
  if v_target_pair_id is null then
    raise exception 'That code doesn''t match anyone';
  end if;
  if v_target_pair_id = v_old_pair_id then
    raise exception 'That''s your own code';
  end if;

  select count(*), max(display_name) into v_member_count, v_partner_name
    from profiles where pair_id = v_target_pair_id;
  if v_member_count = 0 then
    raise exception 'That code doesn''t match anyone';
  end if;
  if v_member_count >= 2 then
    raise exception 'That pair is already full';
  end if;

  if p_dry_run then
    return v_partner_name;
  end if;

  update profiles set pair_id = v_target_pair_id where user_id = v_uid;
  delete from upload_log where pair_id = v_old_pair_id;
  delete from pairs where id = v_old_pair_id;
  return v_partner_name;
end;
$$;

revoke execute on function join_pair(text, boolean) from public, anon;
grant execute on function join_pair(text, boolean) to authenticated;

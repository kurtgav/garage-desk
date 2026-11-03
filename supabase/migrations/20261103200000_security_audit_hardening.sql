-- Security audit hardening (D-109 … D-111), 3 Nov.
-- 1. Data access ends with the session: "sign out everywhere", a password reset or a deleted session stop
--    PostgREST access at once, not when the access token expires (up to 1 h).
-- 2. Two-step sign-in: once a staff member has a verified authenticator factor, data needs an aal2 session.
-- 3. Staff names: no "Customer" and no look-alike of a colleague's name (Cyrillic/Latin homoglyphs, invisible
--    characters, doubled spaces), so nobody can pose as the customer or a colleague on the timeline.
-- 4. Link decisions record who shared the link, so a link opened by staff (signed out) is visible (D-067).
-- Backward compatible with the code already running: no column the app writes is removed or renamed.

-- ---------------------------------------------------------------------------
-- 1 + 2. Role of the signed-in user (null = no staff access)
-- ---------------------------------------------------------------------------

create or replace function private.staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active
    -- The token's session still exists (D-109).
    and exists (
      select 1 from auth.sessions s
      where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid and s.user_id = p.id
    )
    -- Enrolled in two-step sign-in → only a session that passed it (D-110).
    and (
      (select auth.jwt()) ->> 'aal' = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
    )
$$;

-- ---------------------------------------------------------------------------
-- 3. Staff names (D-111)
-- ---------------------------------------------------------------------------

-- Comparison key: Cyrillic letters that look Latin become Latin, invisible characters go, spaces collapse,
-- case is ignored. Only used to compare names; the name is stored as typed.
create function private.name_key(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(regexp_replace(btrim(translate(p,
    'АВЕКМНОРСТУХаеорсухкіјѕІЈЅ' || chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279) || chr(173),
    'ABEKMHOPCTYXaeopcyxkijsIJS')), '\s+', ' ', 'g'))
$$;

grant execute on function private.name_key(text) to authenticated, service_role;

drop index public.profiles_full_name_unique;
create unique index profiles_full_name_unique on public.profiles (private.name_key(full_name));

-- The timeline calls the customer "Customer": no staff member may use that name.
alter table public.profiles
  add constraint profiles_full_name_reserved check (private.name_key(full_name) <> 'customer');

-- ---------------------------------------------------------------------------
-- 4. Who shared the link a customer decision came through (D-111)
-- ---------------------------------------------------------------------------

alter table public.job_events add column link_shared_by text;

-- Still derives actor_name exactly as before. For link decisions it also snapshots the name of whoever created
-- the active link: transition_job verified that link and holds the job row lock, and link creation/revocation
-- take the same lock, so the active link is the one the customer used.
create or replace function private.job_events_actor_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actor_name := case
    when new.actor_id is null then 'Customer'
    else (select p.full_name from public.profiles p where p.id = new.actor_id)
  end;
  new.link_shared_by := case
    when new.channel = 'link' then (
      select p.full_name
      from public.job_links l
      join public.profiles p on p.id = l.created_by
      where l.job_id = new.job_id and l.revoked_at is null
      order by l.created_at desc
      limit 1
    )
  end;
  return new;
end;
$$;

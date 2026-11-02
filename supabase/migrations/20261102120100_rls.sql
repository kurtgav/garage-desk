-- RLS helpers, policies and privileges (PRD FR1, D-009, D-018, D-020).
-- Helpers are security definer (they read profiles/jobs without recursing into RLS) and are
-- used in policies as `(select private.fn())` so Postgres evaluates them once per statement.

-- ---------------------------------------------------------------------------
-- Helpers (schema private, not exposed by the API)
-- ---------------------------------------------------------------------------

-- Role of the signed-in user; null when signed out, without a profile, or inactive.
create function private.staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active
$$;

create function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.staff_role() = 'owner', false)
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.staff_role() is not null
$$;

-- Owner, or the active mechanic assigned to the job.
create function private.can_access_job(p_job_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.staff_role()
    when 'owner' then true
    when 'mechanic' then exists (
      select 1 from public.jobs j where j.id = p_job_id and j.assigned_mechanic_id = (select auth.uid())
    )
    else false
  end
$$;

-- Vehicles / customers on the current mechanic's assigned jobs (empty for anyone else).
create function private.my_vehicle_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select j.vehicle_id from public.jobs j
  where j.assigned_mechanic_id = (select auth.uid()) and (select private.staff_role()) = 'mechanic'
$$;

create function private.my_customer_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select v.customer_id from public.jobs j join public.vehicles v on v.id = j.vehicle_id
  where j.assigned_mechanic_id = (select auth.uid()) and (select private.staff_role()) = 'mechanic'
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security (one permissive policy per table and action)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_line_items enable row level security;
alter table public.job_events enable row level security;
alter table public.job_links enable row level security;
alter table public.rate_limits enable row level security; -- no policies: service role only

-- D-018: active staff can read colleagues' names for timelines. Writes via service role only.
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.is_staff()));

create policy settings_select on public.settings for select to authenticated
  using ((select private.is_owner()));
create policy settings_update on public.settings for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

create policy customers_select on public.customers for select to authenticated
  using ((select private.is_owner()) or id in (select private.my_customer_ids()));
create policy customers_insert on public.customers for insert to authenticated
  with check ((select private.is_owner()));
create policy customers_update on public.customers for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy customers_delete on public.customers for delete to authenticated
  using ((select private.is_owner()));

create policy vehicles_select on public.vehicles for select to authenticated
  using ((select private.is_owner()) or id in (select private.my_vehicle_ids()));
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check ((select private.is_owner()));
create policy vehicles_update on public.vehicles for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy vehicles_delete on public.vehicles for delete to authenticated
  using ((select private.is_owner()));

create policy jobs_select on public.jobs for select to authenticated
  using (
    (select private.is_owner())
    or (assigned_mechanic_id = (select auth.uid()) and (select private.staff_role()) = 'mechanic')
  );
create policy jobs_insert on public.jobs for insert to authenticated
  with check ((select private.is_owner()));
create policy jobs_update on public.jobs for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));

create policy job_line_items_select on public.job_line_items for select to authenticated
  using (private.can_access_job(job_id));
create policy job_line_items_insert on public.job_line_items for insert to authenticated
  with check (private.can_access_job(job_id));
create policy job_line_items_update on public.job_line_items for update to authenticated
  using (private.can_access_job(job_id)) with check (private.can_access_job(job_id));
create policy job_line_items_delete on public.job_line_items for delete to authenticated
  using (private.can_access_job(job_id));

-- Events and links are written only by security definer functions.
create policy job_events_select on public.job_events for select to authenticated
  using (private.can_access_job(job_id));
create policy job_links_select on public.job_links for select to authenticated
  using (private.can_access_job(job_id));

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; minimal, column-level where it matters for authenticated.
-- status, quoted_*, approved_*, collected_at, vat_bps, created_by are never client-writable (D-009).
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles to authenticated;

grant select on public.settings to authenticated;
grant update (garage_name, garage_address, garage_phone, hourly_rate_cents, vat_bps) on public.settings to authenticated;

grant select, insert, update, delete on public.customers, public.vehicles to authenticated;

grant select on public.jobs to authenticated;
grant insert (vehicle_id, assigned_mechanic_id, description) on public.jobs to authenticated;
grant update (description, assigned_mechanic_id) on public.jobs to authenticated;
grant usage on sequence public.job_ref_seq to authenticated; -- jobs.ref default

grant select, delete on public.job_line_items to authenticated;
grant insert (job_id, kind, description, quantity, unit_price_cents) on public.job_line_items to authenticated;
grant update (description, quantity, unit_price_cents) on public.job_line_items to authenticated;

grant select on public.job_events to authenticated;

-- token_hash is never readable by clients.
grant select (id, job_id, created_by, created_at, revoked_at, last_viewed_at) on public.job_links to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function
  private.staff_role(),
  private.is_owner(),
  private.is_staff(),
  private.can_access_job(uuid),
  private.my_vehicle_ids(),
  private.my_customer_ids()
to authenticated;

-- Future objects in public are not auto-granted to anon. PUBLIC's EXECUTE on new functions is a
-- global default that a per-schema rule cannot remove, hence the schema-less line (D-029).
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges revoke execute on functions from public;

-- Phase 1 security review fixes (D-037..D-041).
-- 1. transition_job: customer approval is bound to the total the customer saw (quote_changed).
-- 2. transition_job: the caller is checked before the job is read or locked.
-- 3. revoke_job_link: staff can switch off a customer link in any status.
-- 4. next_job_ref moves to schema private (not callable through the API).
-- 5. Future objects in public are not auto-granted to authenticated.

-- ---------------------------------------------------------------------------
-- 1 + 2. State machine (FR5, D-009, D-010, D-037, D-038). The only writer of jobs.status.
-- ---------------------------------------------------------------------------

drop function public.transition_job(uuid, public.job_status, text, text);

create function public.transition_job(
  p_job_id uuid,
  p_to_status public.job_status,
  p_note text default null,
  p_link_token_hash text default null,
  p_expected_total_cents bigint default null
) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
  v_from public.job_status;
  v_role public.staff_role; -- stays null for customers
  v_actor_id uuid; -- stays null for customers
  v_note text := nullif(left(btrim(p_note), 500), '');
begin
  -- Who is calling, decided before the job is read or locked (D-038).
  if p_link_token_hash is not null then
    -- Customer mode: server-side only (D-015).
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'forbidden';
    end if;
  else
    -- Staff mode: owner or the assigned mechanic.
    v_role := private.staff_role();
    v_actor_id := auth.uid();
    if v_role is null then
      raise exception 'forbidden';
    end if;
  end if;

  if p_to_status is null then
    raise exception 'invalid_transition';
  end if;

  -- FR1: another mechanic's job looks missing, and is never locked.
  select * into v_job from public.jobs j
  where j.id = p_job_id and (v_role is distinct from 'mechanic' or j.assigned_mechanic_id = v_actor_id)
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  v_from := v_job.status;

  if p_link_token_hash is not null then
    -- An active, unexpired link of this job.
    if not exists (
      select 1 from public.job_links l
      where l.job_id = p_job_id and l.token_hash = p_link_token_hash and l.revoked_at is null
    ) or v_job.collected_at < now() - interval '30 days' then
      raise exception 'not_found';
    end if;
    -- Idempotent replays (double tap, back button): current job, no event.
    if (p_to_status = 'approved' and v_from in ('approved', 'in_progress', 'ready', 'collected'))
       or (p_to_status = 'new' and v_from = 'new') then
      return v_job;
    end if;
    if v_from <> 'quoted' or p_to_status not in ('approved', 'new') then
      raise exception 'invalid_transition';
    end if;
    -- The customer approves the total they were shown, not one re-quoted since (D-037).
    if p_to_status = 'approved' and p_expected_total_cents is distinct from v_job.quoted_total_cents then
      raise exception 'quote_changed';
    end if;
  else
    if v_from::text || '>' || p_to_status::text not in
       ('new>quoted', 'quoted>new', 'approved>in_progress', 'in_progress>ready', 'ready>collected') then
      raise exception 'invalid_transition';
    end if;
  end if;

  case p_to_status
    when 'quoted' then
      if not exists (select 1 from public.job_line_items li where li.job_id = p_job_id) then
        raise exception 'no_line_items';
      end if;
      update public.jobs j
      set status = 'quoted',
          quoted_subtotal_cents = t.subtotal_cents,
          quoted_vat_cents = t.vat_cents,
          quoted_total_cents = t.total_cents,
          quoted_at = now()
      from public.compute_job_totals(p_job_id) t
      where j.id = p_job_id
      returning j.* into v_job;
    when 'new' then
      -- D-010: frozen totals are stale once the quote is reopened.
      update public.jobs j
      set status = 'new', quoted_subtotal_cents = null, quoted_vat_cents = null,
          quoted_total_cents = null, quoted_at = null
      where j.id = p_job_id
      returning j.* into v_job;
    when 'approved' then
      update public.jobs j
      set status = 'approved', approved_total_cents = j.quoted_total_cents, approved_at = now()
      where j.id = p_job_id
      returning j.* into v_job;
    when 'collected' then
      update public.jobs j
      set status = 'collected', collected_at = now()
      where j.id = p_job_id
      returning j.* into v_job;
    else
      update public.jobs j
      set status = p_to_status
      where j.id = p_job_id
      returning j.* into v_job;
  end case;

  insert into public.job_events (job_id, from_status, to_status, actor_type, actor_id, note)
  values (
    p_job_id, v_from, p_to_status,
    case when p_link_token_hash is null then 'staff' else 'customer' end::public.actor_type,
    v_actor_id, v_note
  );

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Revoke the active customer link, in any status (D-039). Same caller checks as create_job_link.
-- ---------------------------------------------------------------------------

create function public.revoke_job_link(p_job_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_revoked integer;
begin
  if private.staff_role() is null then
    raise exception 'forbidden';
  end if;
  if not private.can_access_job(p_job_id) then
    raise exception 'not_found';
  end if;

  -- Serialises with create_job_link on the same job.
  perform 1 from public.jobs j where j.id = p_job_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  update public.job_links l set revoked_at = now() where l.job_id = p_job_id and l.revoked_at is null;
  get diagnostics v_revoked = row_count;
  return v_revoked > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. jobs.ref default lives in private (D-040). Same body as the original.
-- ---------------------------------------------------------------------------

create function private.next_job_ref() returns text
language sql volatile set search_path = ''
as $$ select 'GD-' || case when v < 10000 then lpad(v::text, 4, '0') else v::text end
          from (select nextval('public.job_ref_seq') as v) s $$;

alter table public.jobs alter column ref set default private.next_job_ref();
drop function public.next_job_ref();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.transition_job(uuid, public.job_status, text, text, bigint) from public, anon, authenticated;
grant execute on function public.transition_job(uuid, public.job_status, text, text, bigint) to authenticated, service_role;

revoke all on function public.revoke_job_link(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoke_job_link(uuid) to authenticated;

-- Callers of the jobs.ref default: staff (RLS client) and the service role (seed, tests).
revoke all on function private.next_job_ref() from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.next_job_ref() to authenticated, service_role;

-- 5. Future objects in public are not auto-granted to authenticated either (D-041, extends D-029).
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public revoke all on functions from authenticated;

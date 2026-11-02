-- Security review fixes (D-067…D-070): column grants, decisions priced from the quote row,
-- no re-quote for no-op line updates, length limits matching the app's validation.

-- ---------------------------------------------------------------------------
-- Column grants (D-069): authenticated writes only the columns the app sends.
-- create_customer is security invoker, so its inserts use exactly these grants.
-- ---------------------------------------------------------------------------

revoke insert, update on public.customers, public.vehicles from authenticated;
grant insert (full_name, phone, email), update (full_name, phone, email) on public.customers to authenticated;
grant insert (customer_id, plate, make, model, year) on public.vehicles to authenticated;
grant update (plate, make, model, year) on public.vehicles to authenticated;

-- ---------------------------------------------------------------------------
-- transition_job: approval and decision events copy the job_quotes row of p_expected_version (D-068).
-- Otherwise unchanged from 20261102150100_client_answers.sql.
-- ---------------------------------------------------------------------------

create or replace function public.transition_job(
  p_job_id uuid,
  p_to_status public.job_status,
  p_note text default null,
  p_link_token_hash text default null,
  p_expected_version integer default null
) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
  v_from public.job_status;
  v_customer boolean := p_link_token_hash is not null;
  v_role public.staff_role; -- stays null for customers
  v_actor_id uuid; -- stays null for customers
  v_channel public.approval_channel;
  v_quote public.job_quotes; -- the version being approved/declined (D-068)
  v_note text := nullif(left(btrim(p_note), 500), '');
begin
  -- Who is calling, decided before the job is read or locked (D-038).
  if v_customer then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'forbidden';
    end if;
  else
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

  if v_customer then
    -- An active link of this job; links never expire (D-053).
    if not exists (
      select 1 from public.job_links l
      where l.job_id = p_job_id and l.token_hash = p_link_token_hash and l.revoked_at is null
    ) then
      raise exception 'not_found';
    end if;
    if p_to_status not in ('approved', 'declined') then
      raise exception 'invalid_transition';
    end if;
    -- Replays of a decision already taken on this version (double tap): current job, no event.
    if (p_to_status = 'approved' and v_from in ('approved', 'in_progress', 'ready', 'collected'))
       or (p_to_status = 'declined' and v_from = 'declined') then
      if p_expected_version is distinct from v_job.quote_version then
        raise exception 'quote_changed';
      end if;
      return v_job;
    end if;
    if v_from <> 'quoted' then
      raise exception 'invalid_transition';
    end if;
    -- The customer decides on the version their page showed (D-049).
    if p_expected_version is distinct from v_job.quote_version then
      raise exception 'quote_changed';
    end if;
    v_channel := 'link';
  else
    if p_to_status in ('approved', 'cancelled') and v_role <> 'owner' then
      raise exception 'forbidden'; -- phone approval and cancel are owner only (D-051, D-052)
    end if;
    if v_from::text || '>' || p_to_status::text not in (
         'new>quoted', 'declined>quoted', 'quoted>approved', 'approved>in_progress',
         'in_progress>ready', 'ready>in_progress', 'ready>collected')
       and not (p_to_status = 'cancelled' and v_from not in ('collected', 'cancelled')) then
      raise exception 'invalid_transition';
    end if;
    if p_to_status in ('approved', 'cancelled') and v_note is null then
      raise exception 'note_required';
    end if;
    if p_to_status = 'approved' then
      if p_expected_version is distinct from v_job.quote_version then
        raise exception 'quote_changed';
      end if;
      v_channel := 'phone';
    end if;
    -- Never charged for a total the customer did not approve.
    if p_to_status in ('in_progress', 'ready', 'collected')
       and v_job.approved_quote_version is distinct from v_job.quote_version then
      raise exception 'invalid_transition';
    end if;
    if p_to_status = 'quoted' then
      return private.quote_job(p_job_id, v_from, v_actor_id, v_note);
    end if;
  end if;

  -- Decisions take their figures from the frozen quote row the decider saw, never from jobs.quoted_*.
  if p_to_status in ('approved', 'declined') then
    select * into v_quote from public.job_quotes q where q.job_id = p_job_id and q.version = p_expected_version;
    if not found then
      raise exception 'quote_changed';
    end if;
  end if;

  case p_to_status
    when 'approved' then
      update public.jobs j
      set status = 'approved',
          approved_quote_version = v_quote.version,
          approved_subtotal_cents = v_quote.subtotal_cents,
          approved_vat_cents = v_quote.vat_cents,
          approved_total_cents = v_quote.total_cents,
          approved_at = now()
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

  insert into public.job_events (job_id, from_status, to_status, actor_type, actor_id, channel, quote_version, total_cents, note)
  values (
    p_job_id, v_from, p_to_status,
    case when v_customer then 'customer' else 'staff' end::public.actor_type,
    v_actor_id, v_channel,
    v_quote.version,
    v_quote.total_cents,
    v_note
  );

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- Re-quote only when a line actually changed (D-070).
-- ---------------------------------------------------------------------------

create or replace function private.line_items_requote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_job_ids uuid[];
  v_job record;
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct o.job_id) into v_job_ids from old_lines o;
  elsif tg_op = 'UPDATE' then
    -- A save with identical values (labour price is pinned by the guard) is not a new quote.
    select array_agg(distinct n.job_id) into v_job_ids
    from new_lines n join old_lines o on o.id = n.id
    where (n.description, n.quantity, n.unit_price_cents) is distinct from (o.description, o.quantity, o.unit_price_cents);
  else
    select array_agg(distinct n.job_id) into v_job_ids from new_lines n; -- job_id is not updatable
  end if;

  for v_job in
    select j.id, j.status from public.jobs j
    where j.id = any (v_job_ids) and j.status in ('quoted', 'approved', 'in_progress')
    order by j.id
    for update
  loop
    -- The new version needs a staff author; the service role edits lines only before a quote (D-057).
    if private.staff_role() is null then
      raise exception 'forbidden';
    end if;
    perform private.quote_job(v_job.id, v_job.status, auth.uid(), 'Lines changed — new quote');
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Length limits = the server-action zod limits (D-070). job_events.note is already <= 500.
-- ---------------------------------------------------------------------------

alter table public.customers
  add constraint customers_full_name_length check (char_length(full_name) <= 200),
  add constraint customers_phone_length check (char_length(phone) between 6 and 15),
  add constraint customers_email_length check (char_length(email) <= 200);

alter table public.vehicles
  add constraint vehicles_plate_length check (char_length(plate) between 2 and 10),
  add constraint vehicles_make_length check (char_length(make) <= 60),
  add constraint vehicles_model_length check (char_length(model) <= 60);

alter table public.jobs
  add constraint jobs_description_length check (char_length(description) <= 2000);

alter table public.job_line_items
  add constraint job_line_items_description_length check (char_length(description) <= 500);

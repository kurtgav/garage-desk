-- Public functions (PLAN "Shared contracts"; D-009..D-015, D-021, D-023).
-- Stable error messages for the app: invalid_transition, forbidden, no_line_items, job_locked,
-- not_found (+ invalid_mechanic, kind_immutable, not_linkable, invalid_token_hash, D-025).

-- ---------------------------------------------------------------------------
-- Money: the only arithmetic (FR4, D-011). VAT once on the subtotal, half away from zero.
-- ---------------------------------------------------------------------------

create function public.compute_job_totals(p_job_id uuid)
returns table (subtotal_cents bigint, vat_cents bigint, total_cents bigint)
language sql stable set search_path = '' as $$
  select t.subtotal, t.vat, t.subtotal + t.vat
  from public.jobs j
  cross join lateral (
    select s.subtotal, round(s.subtotal * j.vat_bps / 10000.0)::bigint as vat
    from (
      select coalesce(sum(li.line_total_cents), 0)::bigint as subtotal
      from public.job_line_items li
      where li.job_id = j.id
    ) s
  ) t
  where j.id = p_job_id
$$;

create view public.job_totals with (security_invoker = true) as
select j.id as job_id, t.subtotal_cents, t.vat_cents, t.total_cents
from public.jobs j
cross join lateral public.compute_job_totals(j.id) t;

-- ---------------------------------------------------------------------------
-- State machine (FR5, D-009, D-010). The only writer of jobs.status.
-- ---------------------------------------------------------------------------

create function public.transition_job(
  p_job_id uuid,
  p_to_status public.job_status,
  p_note text default null,
  p_link_token_hash text default null
) returns public.jobs
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
  v_from public.job_status;
  v_role public.staff_role;
  v_actor_id uuid; -- stays null for customers
  v_note text := nullif(left(btrim(p_note), 500), '');
begin
  if p_to_status is null then
    raise exception 'invalid_transition';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  v_from := v_job.status;

  if p_link_token_hash is not null then
    -- Customer mode: server-side only, with an active, unexpired link of this job (D-015).
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'forbidden';
    end if;
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
  else
    -- Staff mode: owner or the assigned mechanic.
    v_role := private.staff_role();
    v_actor_id := auth.uid();
    if v_role is null then
      raise exception 'forbidden';
    end if;
    if v_role = 'mechanic' and v_job.assigned_mechanic_id <> v_actor_id then
      raise exception 'not_found'; -- FR1: another mechanic's job looks missing
    end if;
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
-- Customer link (D-013, D-015): one active hash per job, regenerate revokes atomically.
-- ---------------------------------------------------------------------------

create function public.create_job_link(p_job_id uuid, p_token_hash text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.job_status;
  v_created_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token_hash';
  end if;
  if private.staff_role() is null then
    raise exception 'forbidden';
  end if;
  if not private.can_access_job(p_job_id) then
    raise exception 'not_found';
  end if;

  select j.status into v_status from public.jobs j where j.id = p_job_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status not in ('quoted', 'approved', 'in_progress', 'ready') then
    raise exception 'not_linkable';
  end if;

  update public.job_links l set revoked_at = now() where l.job_id = p_job_id and l.revoked_at is null;
  insert into public.job_links (job_id, token_hash, created_by)
  values (p_job_id, p_token_hash, auth.uid())
  returning created_at into v_created_at;
  return v_created_at;
end;
$$;

-- Whitelisted DTO for the public page (FR6, D-014, D-021, D-023). Keys must equal
-- PUBLIC_JOB_KEYS in src/lib/public-job.ts. Unknown, revoked or expired -> null.
create function public.public_job_by_token_hash(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_link_id uuid;
  v_job public.jobs;
  v_revising boolean;
begin
  select l.id into v_link_id
  from public.job_links l
  where l.token_hash = p_token_hash and l.revoked_at is null;
  if v_link_id is null then
    return null;
  end if;

  select j.* into v_job from public.jobs j join public.job_links l on l.job_id = j.id where l.id = v_link_id;
  if v_job.collected_at < now() - interval '30 days' then
    return null;
  end if;

  update public.job_links set last_viewed_at = now() where id = v_link_id;
  v_revising := v_job.status = 'new';

  return jsonb_build_object(
    'garage', (
      select jsonb_build_object('name', s.garage_name, 'address', s.garage_address, 'phone', s.garage_phone)
      from public.settings s where s.id = 1
    ),
    'job', jsonb_build_object('ref', v_job.ref, 'status', v_job.status),
    'vehicle', (
      select jsonb_build_object('make', v.make, 'model', v.model, 'plate', v.plate)
      from public.vehicles v where v.id = v_job.vehicle_id
    ),
    'customer', (
      select jsonb_build_object('first_name', split_part(btrim(c.full_name), ' ', 1))
      from public.vehicles v join public.customers c on c.id = v.customer_id
      where v.id = v_job.vehicle_id
    ),
    'lines', case when v_revising then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'description', li.description,
          'quantity', li.quantity::text, -- numeric(10,2) -> '1.50'
          'unit_price_cents', li.unit_price_cents,
          'line_total_cents', li.line_total_cents
        ) order by li.created_at, li.id)
      from public.job_line_items li where li.job_id = v_job.id
    ), '[]'::jsonb) end,
    'totals', case when v_revising then null else jsonb_build_object(
      'subtotal_cents', v_job.quoted_subtotal_cents,
      'vat_cents', v_job.quoted_vat_cents,
      'total_cents', v_job.quoted_total_cents,
      'vat_bps', v_job.vat_bps
    ) end,
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at) order by e.created_at, e.id)
      from public.job_events e where e.job_id = v_job.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (D-012): fixed window, true when over the limit.
-- ---------------------------------------------------------------------------

create function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer) returns boolean
language plpgsql set search_path = '' as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  -- Windows are capped at 1h so anything older than 1h is stale for every key (D-030).
  if p_key is null or p_max is null or p_window_seconds is null or p_window_seconds not between 1 and 3600 then
    raise exception 'invalid_argument';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  delete from public.rate_limits r where r.window_start < now() - interval '1 hour';

  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  return v_count > p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner dashboard (FR8). Month bounds in settings.timezone; p_now fixes the clock in tests.
-- ---------------------------------------------------------------------------

create function public.get_dashboard(p_now timestamptz default now()) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_tz text;
  v_local_month timestamp;
  v_month_start timestamptz;
  v_month_end timestamptz; -- exclusive: first instant of next month (D-027)
  v_today date;
begin
  if not private.is_owner() then
    raise exception 'forbidden';
  end if;

  select s.timezone into v_tz from public.settings s where s.id = 1;
  v_local_month := date_trunc('month', p_now at time zone v_tz);
  v_month_start := v_local_month at time zone v_tz;
  v_month_end := (v_local_month + interval '1 month') at time zone v_tz;
  v_today := (p_now at time zone v_tz)::date;

  return jsonb_build_object(
    'counts_by_status', (
      select jsonb_object_agg(st.s::text, (select count(*) from public.jobs j where j.status = st.s))
      from unnest(enum_range(null::public.job_status)) as st(s)
    ),
    'revenue', (
      select jsonb_build_object(
        'excl_vat_cents', coalesce(sum(j.quoted_subtotal_cents), 0),
        'incl_vat_cents', coalesce(sum(j.quoted_total_cents), 0),
        'jobs_count', count(*),
        'month_start', v_month_start,
        'month_end', v_month_end
      )
      from public.jobs j
      where j.collected_at >= v_month_start and j.collected_at < v_month_end
    ),
    'ready_jobs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id,
        'ref', j.ref,
        'customer_name', c.full_name,
        'plate', v.plate,
        'total_cents', j.quoted_total_cents,
        'ready_since', r.ready_since,
        'days_waiting', v_today - (r.ready_since at time zone v_tz)::date
      ) order by r.ready_since, j.ref), '[]'::jsonb)
      from public.jobs j
      join public.vehicles v on v.id = j.vehicle_id
      join public.customers c on c.id = v.customer_id
      cross join lateral (
        select max(e.created_at) as ready_since
        from public.job_events e
        where e.job_id = j.id and e.to_status = 'ready'
      ) r
      where j.status = 'ready'
    ),
    'workload', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'mechanic_id', p.id,
        'mechanic_name', p.full_name,
        'total_open', (
          select count(*) from public.jobs j
          where j.assigned_mechanic_id = p.id and j.status <> 'collected'
        ),
        'by_status', (
          select jsonb_object_agg(st.s::text, (
            select count(*) from public.jobs j where j.assigned_mechanic_id = p.id and j.status = st.s
          ))
          from unnest(enum_range(null::public.job_status)) as st(s)
          where st.s <> 'collected'
        )
      ) order by p.full_name), '[]'::jsonb)
      from public.profiles p
      where p.role = 'mechanic' and p.active
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer search (FR2, D-017). Security invoker: RLS decides what is visible.
-- Empty query matches every visible customer.
-- ---------------------------------------------------------------------------

create function public.search_customers(p_query text)
returns table (id uuid, full_name text, phone text, email text, vehicles jsonb)
language sql stable set search_path = '' as $$
  with q as (
    select
      '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as name_pattern,
      regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as digits,
      replace(replace(upper(regexp_replace(coalesce(p_query, ''), '[\s-]', '', 'g')), '%', '\%'), '_', '\_') as plate
  )
  select
    c.id,
    c.full_name,
    c.phone,
    c.email,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'plate', v.plate, 'make', v.make, 'model', v.model, 'year', v.year)
                       order by v.plate)
      from public.vehicles v where v.customer_id = c.id
    ), '[]'::jsonb)
  from public.customers c, q
  where c.full_name ilike q.name_pattern
     or (length(q.digits) >= 3 and c.phone like '%' || q.digits || '%')
     or (q.plate <> '' and exists (
           select 1 from public.vehicles v
           where v.customer_id = c.id and v.plate like '%' || q.plate || '%'
         ))
  order by c.full_name, c.id
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.job_totals from anon, authenticated;
grant select on public.job_totals to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.next_job_ref() to authenticated, service_role; -- jobs.ref default
grant execute on function public.compute_job_totals(uuid) to authenticated;
grant execute on function public.transition_job(uuid, public.job_status, text, text) to authenticated, service_role;
grant execute on function public.create_job_link(uuid, text) to authenticated;
grant execute on function public.get_dashboard(timestamptz) to authenticated;
grant execute on function public.search_customers(text) to authenticated;
-- Service role only (server-side, after hashing / IP keying).
grant execute on function public.public_job_by_token_hash(text) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
